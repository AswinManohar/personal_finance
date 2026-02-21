# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend

# Install dependencies first for better caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the frontend code and build
COPY . .
RUN npm run build


# Stage 2: Build the Python FastAPI backend and serve the app
FROM python:3.13-slim AS backend

# Set environment variables for Python
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install uv for fast python dependency management
RUN pip install --no-cache-dir uv


# Copy the dependency definitions
COPY pyproject.toml .

# Install dependencies using uv into the system python (since we are in a container)
RUN uv pip install --system fastapi uvicorn gunicorn python-dotenv fastapi-mcp fastmcp pypdf supabase

# Copy the python application code
COPY api/ ./api/

# Copy the built React artifacts from Stage 1 into the backend container
COPY --from=frontend-build /app/frontend/dist ./dist

# Support running Python modules directly by explicitly including the working directory in the PYTHONPATH
ENV PYTHONPATH=/app

# Run the FastAPI server using Gunicorn as a process manager with Uvicorn workers
# This is Google Cloud Run's official recommended architecture for Python deployments
# We use `exec` here to ensure Gunicorn replaces the shell process and natively catches OS signals
CMD ["sh", "-c", "exec gunicorn api.main:app --workers 1 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:${PORT:-8080}"]
