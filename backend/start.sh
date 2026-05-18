#!/bin/bash
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting server..."
# Production: no --reload flag
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
