# Deploying FinanceFlow: Docker, Artifact Registry, and Cloud Run

This document outlines the exact, battle-tested steps required to package the FinanceFlow application into a Docker container, compile it using Google's cloud infrastructure, and manually deploy it to Google Cloud Run. 

This process fundamentally bypasses the Google Cloud Run "Continuous Deployment" Git integration, which is prone to silent Service Account permission errors and stale caching.

## 1. The Multi-Stage Dockerfile
The core of the deployment is our `/Dockerfile`. Because FinanceFlow has a React frontend and a FastAPI backend, the Dockerfile uses a "multi-stage build" to compile both separately and merge them into one lightweight image.

Key features of this Dockerfile:
1. **Frontend Stage:** Uses `node:20-alpine` to run `npm ci` and `npm run build`, outputting the compiled static Javascript to the `dist/` folder.
2. **Backend Stage:** Uses `python:3.13-slim` and the hyper-fast `uv` package manager. 
3. **Dependency Injection:** It strictly installs dependencies mapped explicitly in `pyproject.toml` using `RUN uv pip install --system .`. This ensures Google Cloud Run doesn't silently prune sub-packages at runtime and trigger a `ModuleNotFoundError`.
4. **Volume Merging:** It uses `COPY --from=frontend-build /app/frontend/dist ./dist` to pull the compiled React code into the Python folder.
5. **Gunicorn Boot:** It boots the server using Gunicorn and binds to Google Cloud Run's dynamic `$PORT` environment variable.

## 2. Setting Up Google Cloud Artifact Registry (One-Time Setup)
Before you can deploy an image, Google Cloud needs a secure folder to hold it. 

**A. Create the Registry:**
Create a Docker registry named `cashflow-images` in your desired region (e.g., `europe-west4`):
```bash
gcloud artifacts repositories create cashflow-images \
    --repository-format=docker \
    --location=europe-west4 \
    --description="Docker repository for personal finance app"
```

**B. Authenticate Docker:**
Securely configure your local Docker environment to talk to your new registry:
```bash
gcloud auth configure-docker europe-west4-docker.pkg.dev
```

## 3. Building and Pushing the Image
There are two ways to push the image to your Artifact Registry. Method B is generally preferred as it bypasses local `sudo` authentication headaches.

### Method A: Local Machine Build (Slower, Requires sudo auth)
Your laptop does the compiling, and then uploads the massive 700MB image to Google.
```bash
# 1. Build using the exact Google Cloud destination tag
sudo docker build -t europe-west4-docker.pkg.dev/[PROJECT_ID]/cashflow-images/cashflow-eu:latest .

# 2. Authenticate the Root user to Google Cloud (Important for Linux Pop!_OS)
gcloud auth print-access-token | sudo docker login -u oauth2accesstoken --password-stdin https://europe-west4-docker.pkg.dev

# 3. Upload the image directly
sudo docker push europe-west4-docker.pkg.dev/[PROJECT_ID]/cashflow-images/cashflow-eu:latest
```

### Method B: Google Cloud Build (Faster, No local compiling)
Instead of building it locally, you command a Google supercomputer to temporarily download your code, build the image natively in the cloud, and inject it directly into the Artifact Registry.
```bash
gcloud builds submit --tag europe-west4-docker.pkg.dev/[PROJECT_ID]/cashflow-images/cashflow-eu:latest .
```
*(This is the easiest, most reliable method).*

## 4. Deploying the Image to Cloud Run
Once the image successfully lands in your Artifact Registry (at 100%), you physically turn it into a live website:

1. Open the **Google Cloud Run** web console.
2. Click **+ Create Service**.
3. Select the option: **Deploy one revision from an existing container image**.
4. Click the **Select** link.
5. Navigate through your Artifact Registry: `europe-west4` -> `cashflow-images` -> `cashflow-eu` -> `latest` -> **Select**.
6. Check **Allow unauthenticated invocations** (so you don't get a 403 Forbidden screen).
7. Scroll to the bottom and click **Create**.

Your application will instantly boot up within milliseconds. Because it is an explicitly tagged image, there is zero risk of deploying "stale" or corrupted compilation setups.

## 5. Google Auth (Supabase) Callbacks
When deploying a new Cloud Run URL, your Supabase Google OAuth provider will instantly break and redirect logins back to `localhost` unless you update it.

**To fix the redirect:**
1. Open the **Supabase Dashboard**.
2. Go to **Authentication** -> **URL Configuration**.
3. Change the **Site URL** strictly to your *new* live Cloud Run URL (e.g., `https://cashflow-eu-XXXXXXXXX.run.app`).
4. Add `http://localhost:3000/*` and `http://localhost:3001/*` to the **Redirect URLs** list below it so your laptop development server still functions perfectly.
