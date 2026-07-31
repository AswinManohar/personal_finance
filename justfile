# List available recipes
default:
    @just --list

# Start the FastAPI backend on :8000
api:
    uv run uvicorn api.main:app --reload --port 8000

# Start the Vite frontend on :5173
web:
    npm run dev

# Start backend and frontend together (Ctrl-C stops both)
start:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill 0' EXIT
    uv run uvicorn api.main:app --reload --port 8000 &
    npm run dev &
    wait
