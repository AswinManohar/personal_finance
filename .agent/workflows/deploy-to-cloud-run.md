---
description: Deploy Docker Image to Google Cloud Run via Artifact Registry
---

# Cloud Run Deployment Workflow

This workflow explicitly builds the application's multi-stage Docker container natively in the cloud via Google Cloud Build, uploads it to the Artifact Registry, and manually triggers a Cloud Run deployment of the compiled image. Doing this safely bypasses the built-in gcloud `--source` deployment which is prone to silent workspace caching issues.

// turbo-all

### 1. Identify Google Cloud Project
Retrieve the current project ID dynamically so that the Artifact Registry path resolves correctly.
```bash
PROJECT_ID=$(gcloud config get-value project)
echo "Targeting deployment for Google Cloud Project: $PROJECT_ID"
```

### 2. Build and Push via Google Cloud Build
Submit the local codebase directly to Google Cloud Build. This safely avoids local `sudo docker` permission issues and ensures a fresh build without local cached artifacts.
```bash
PROJECT_ID=$(gcloud config get-value project)
gcloud builds submit --tag europe-west4-docker.pkg.dev/${PROJECT_ID}/cashflow-images/cashflow-eu:latest .
```

### 3. Deploy the Compiled Image to Cloud Run
Route Cloud Run explicitly to the pushed Docker image rather than relying on an auto-builder.
```bash
PROJECT_ID=$(gcloud config get-value project)
gcloud run deploy cashflow-eu \
    --image europe-west4-docker.pkg.dev/${PROJECT_ID}/cashflow-images/cashflow-eu:latest \
    --region europe-west4 \
    --allow-unauthenticated \
    --quiet
```
