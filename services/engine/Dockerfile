# ==============================================================================
# Build & Run Stage
# ==============================================================================
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (needed for compiling hiredis if no wheel)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Create non-root user
RUN useradd -m obscura && chown -R obscura:obscura /app
USER obscura

# Expose FastAPI port
EXPOSE 8000

# Run the API and the Engine loop (Using uvicorn programmatically or running a combined script)
# For now, we will run the API which will span the engine loop as a background task.
CMD ["python", "-m", "api.fastapi_app"]
