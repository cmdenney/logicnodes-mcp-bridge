"""
LogicNodes vsock client — runs on the PARENT EC2 instance (not inside enclave).
Sends params to the enclave, gets back result + attestation doc.
"""
import socket
import json
import base64
import sys

ENCLAVE_CID = 16    # matches --enclave-cid in run.sh
VSOCK_PORT  = 5000

def call_enclave(params: dict, nonce: str = "logicnodes") -> dict:
    request = json.dumps({"params": params, "nonce": nonce}) + "\n"

    with socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM) as s:
        s.connect((ENCLAVE_CID, VSOCK_PORT))
        s.sendall(request.encode())

        raw = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            raw += chunk
            if raw.endswith(b"\n"):
                break

    return json.loads(raw.decode())

if __name__ == "__main__":
    # Example call
    params = {
        "amount_usd": 9500,
        "transactions_last_1h": 7,
        "avg_transaction_amount": 120,
        "country_mismatch": True,
        "new_device": True,
        "hour_of_day": 3,
        "merchant_category": "crypto"
    }

    print("[client] Calling enclave...")
    response = call_enclave(params)

    print(f"\n[result]")
    print(json.dumps(response["result"], indent=2))
    print(f"\n[attested]: {response[attested]}")

    if response.get("attestation"):
        raw = base64.b64decode(response["attestation"])
        print(f"[attestation doc]: {len(raw)} bytes (CBOR-encoded, AWS-signed)")
        print("Run verify_attestation.py to verify against AWS root CA.")
