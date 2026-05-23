#!/bin/bash
set -e

EIF_PATH="./fraud_detection_oracle.eif"
CPU_COUNT=2
MEMORY_MB=512

echo "[run] Starting enclave..."
nitro-cli run-enclave \
  --cpu-count $CPU_COUNT \
  --memory $MEMORY_MB \
  --eif-path $EIF_PATH \
  --enclave-cid 16

echo "[run] Enclave is running. CID=16, Port=5000"
echo "[run] Use vsock_client.py to call it."
