FROM python:3.11-slim

# No network access inside enclave — all deps must be baked in
RUN pip install --no-cache-dir cbor2

WORKDIR /app
COPY server.py .

# Enclave entry point
CMD ["python3", "-u", "server.py"]
