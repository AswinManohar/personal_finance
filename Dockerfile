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
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

# Install uv for fast python dependency management
RUN pip install --no-cache-dir uv


# Copy the dependency definitions
COPY pyproject.toml .

# Install dependencies using uv into the system python (since we are in a container)
RUN uv pip install --system fastapi uvicorn python-dotenv fastapi-mcp fastmcp pypdf supabase

# Copy the python application code
COPY api/ ./api/

# Copy the built React artifacts from Stage 1 into the backend container
COPY --from=frontend-build /app/frontend/dist ./dist

# Expose the port Cloud Run uses
EXPOSE 8080

# Run the FastAPI server using Uvicorn with the dynamically injected $PORT
CMD uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8080}
