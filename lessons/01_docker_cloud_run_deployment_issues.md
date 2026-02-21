# Docker & Google Cloud Run: Networking & Startup idiosyncrasies

This document captures key transferable lessons learned when containerizing a React + FastAPI application and deploying it to Google Cloud Run. It focuses on networking quirks, port mapping, and startup health check timeouts.

---

## 1. Docker Port Mapping: Internal vs. External

When running a Docker container locally, you must explicitly bridge the container's isolated network to your host machine's network.

**The Command:**
```bash
docker run -p [HOST_PORT]:[CONTAINER_PORT] my-app
```
Example: `docker run -p 3000:8080 my-app`

**The Concept:**
* **`CONTAINER_PORT` (Right side):** The port your application *thinks* it's running on inside the container. If your FastAPI app logs `Uvicorn running on http://0.0.0.0:8080`, this is the `CONTAINER_PORT`.
* **`HOST_PORT` (Left side):** The port exposed on your actual laptop (or server) that routes traffic *into* the container. 

**The Trap:**
If you run `docker run -p 3000:8080 my-app` and see Uvicorn log `http://0.0.0.0:8080`, you cannot visit `localhost:8080` in your browser. Nothing on your laptop is listening on `8080`. You **must** visit `localhost:3000`, which Docker will invisibly forward to `8080` inside the container.

**Why this matters for Security/OAuth:**
Google OAuth strictly validates the origin URL. If your Google Cloud OAuth whitelist only permits `http://localhost:3000`, you *must* map your Docker container to Host Port 3000 (`-p 3000:8080`) when testing locally, otherwise the Google Auth popup will throw a `redirect_uri_mismatch` error.

---

## 2. Google Cloud Run: The `$PORT` Environment Variable

Unlike local Docker where you can statically bind to a port, Google Cloud Run dynamically assigns a port to your container at runtime. 

**The Concept:**
Cloud Run injects an environment variable named `$PORT` (typically 8080, but subject to change) into your container. Your web server **must** bind to this exact port, and it **must** bind to the all-interfaces IP address `0.0.0.0`.

**The Trap (Hardcoding):**
If you hardcode your Dockerfile with `CMD ["uvicorn", "api.main:app", "--port", "8080"]`, your deployment will fail if Google assigns a different port.

**The Fix (Dynamic Binding):**
Your application code should dynamically read the port from the environment:
```python
if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8080)) # Fallback to 8080 locally
    uvicorn.run("api.main:app", host="0.0.0.0", port=port)
```

---

## 3. The "Failed to start and listen" Timeout Error

This is the most common Cloud Run deployment error. It means Google's load balancer pinged your container to check if it was healthy, but never got a response.

### Cause A: Shell-Form `CMD` vs Exec-Form `CMD`
Docker allows two ways to define the startup command:
* **Shell-Form:** `CMD python api/main.py`
* **Exec-Form (JSON Array):** `CMD ["python", "api/main.py"]`

**The Trap:** 
If you use the Shell-Form, Docker wraps your command inside `/bin/sh -c`. When Google Cloud Run sends OS signals (like `SIGTERM` to gracefully shut down, or health pings), the `/bin/sh` shell "swallows" the signal and fails to pass it down to your Python process. This causes Uvicorn to hang, and Cloud Run throws the timeout error.

**The Fix:**
*Always* use the Exec-Form JSON array (`CMD ["python", "api/main.py"]`). This makes Python Process ID 1 (PID 1), ensuring it natively receives and handles all OS signals from Google Cloud correctly.

### Cause B: Hidden Startup Crashes
If your Python code requires an environment variable (e.g., `SUPABASE_KEY`) to boot, and raises an error if it's missing:
```python
# BAD: Will crash the container instantly during Cloud Run deployment
if not os.getenv("SUPABASE_KEY"):
    raise RuntimeError("Missing Supabase Key!")
```
During the initial staging phase of a deployment, Cloud Run sometimes boots the container to verify port bindings *before* injecting all the production environment variables. If your code crashes immediately, Cloud Run assumes the container is broken and throws the "failed to start and listen" error.

**The Fix:**
Use "Lazy Initialization". Instead of crashing the whole server on boot, let the server start successfully, but raise HTTP 500 errors *only* when an incoming API request attempts to use the missing credentials. This allows the container to pass Google's startup health checks.

### Cause C: Cloud Run Reverse Proxy / Load Balancer blocking health checks
Even if your port is correctly bound natively, if you are running Uvicorn, Google Cloud Run places a reverse proxy load balancer in front of your container. This load balancer terminates SSL and forwards the HTTP traffic natively. 

**The Trap:**
When the Google Load Balancer sends its automated health checks, the headers identify it as forwarded traffic from a proxy. By default, **Uvicorn ignores forwarded proxy traffic for security reasons**. Since Uvicorn ignores the health checks, Google assumes the server is dead and shuts it down.

**The Fix:**
You must explicitly configure Uvicorn to trust forwarded traffic from the Cloud Run proxy network by adding `proxy_headers=True` and `forwarded_allow_ips="*"`.
```python
uvicorn.run("api.main:app", host="0.0.0.0", port=port, proxy_headers=True, forwarded_allow_ips="*")
```

---

## 4. History of our Cloud Run Port Debugging

We ran into these exact timeouts and traversed through several Dockerfile architectures to find the solution.

### Trial 1: Strict Uvicorn array (Local Dev mode)
`CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8080"]`
* **Why it failed:** Hardcoded to `8080`. While Cloud Run often uses 8080 by default, if it dynamically assigns anything else, the rigid `8080` here breaks the health check.

### Trial 2: Shell execution with dynamic parsing
`CMD uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8080}`
* **Why it failed:** This evaluates `$PORT`, but Docker runs it via `/bin/sh -c`. Shells swallow the `SIGTERM` signals and OS health checks, resulting in silent Cloud Run timeouts.

### Trial 3: Exec-form shell wrapper
`CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8080}"]`
* **Why it failed:** This cleanly evaluates `$PORT` and passes signals better than Trial 2. However, gVisor (Google's Cloud Run sandbox) and Uvicorn sometimes still failed to bind sequentially depending on worker initialization when wrapped in `sh`.

### Trial 4: The Final Fix - Native Python Execution
`CMD ["python", "api/main.py"]` (coupled with `--env PYTHONPATH=/app` and fetching `PORT` natively inside python via `os.environ.get("PORT", 8080)`).
* **Why it worked:** It completely eliminates Docker shell layers, makes Python PID 1 (which catches signals instantly), dynamically evaluates the actual port injected by Cloud Run directly in the application code, and handles both local testing and cloud deployments identically.
