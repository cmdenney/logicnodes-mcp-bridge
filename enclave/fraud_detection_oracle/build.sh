#!/bin/bash
set -e
echo "[build] Building Docker image..."
docker build -t logicnodes-fraud-enclave .

echo "[build] Converting to Enclave Image Format (.eif)..."
nitro-cli build-enclave \
  --docker-uri logicnodes-fraud-enclave \
  --output-file fraud_detection_oracle.eif | tee build_output.json

echo "[build] Done. PCR values:"
cat build_output.json | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"  PCR0 (image):  {data['Measurements']['PCR0']}\")
print(f\"  PCR1 (kernel): {data['Measurements']['PCR1']}\")
print(f\"  PCR2 (app):    {data['Measurements']['PCR2']}\")
print()
print(\"Save these PCR values — they are your proof of determinism.\")
"
