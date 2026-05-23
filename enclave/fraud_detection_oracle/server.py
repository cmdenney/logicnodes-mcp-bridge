"""
LogicNodes Nitro Enclave — vsock server
Runs INSIDE the enclave. No network. No storage. Talks only via vsock.
Parent EC2 instance sends JSON in, gets signed result back.
"""
import socket
import json
import hashlib
import cbor2
import base64

# ── copy of fraud_detection_oracle logic (self-contained, no imports from hub) ──
def run_fraud_detection(params: dict) -> dict:
    amount = float(params.get("amount_usd", 0))
    tx_1h = int(params.get("transactions_last_1h", 1))
    avg_amt = float(params.get("avg_transaction_amount", 100))
    country_mismatch = bool(params.get("country_mismatch", False))
    new_device = bool(params.get("new_device", False))
    hour = int(params.get("hour_of_day", 12))
    category = params.get("merchant_category", "retail")

    score = 0
    flags = []

    if tx_1h > 5:   score += 30; flags.append(f"High velocity: {tx_1h} tx/hr")
    elif tx_1h > 3: score += 10
    if avg_amt > 0 and amount > avg_amt * 5:
        score += 25; flags.append(f"Amount {amount:.0f} is {amount/avg_amt:.1f}x avg")
    if country_mismatch: score += 20; flags.append("Country mismatch")
    if new_device:       score += 15; flags.append("New device")
    if hour in [1, 2, 3, 4]: score += 10; flags.append(f"Unusual hour: {hour}:00")
    if category in ["casino", "crypto", "wire_transfer"]:
        score += 10; flags.append(f"High-risk category: {category}")

    score = min(100, score)
    decision = "BLOCK" if score >= 75 else ("REVIEW" if score >= 45 else "APPROVE")

    result = {"fraud_score": score, "decision": decision, "flags": flags, "amount": amount}
    result["_v"] = {
        "hash": hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()
    }
    return result

# ── vsock listener ──
VSOCK_PORT = 5000
CID_ANY = socket.VMADDR_CID_ANY if hasattr(socket, "VMADDR_CID_ANY") else 0xFFFFFFFF

def get_attestation_doc(nonce: bytes = b"logicnodes") -> bytes:
    """
    Request attestation document from the Nitro Secure Module (NSM).
    Returns raw CBOR-encoded attestation doc.
    Only works inside a real enclave — returns empty bytes otherwise.
    """
    try:
        import nsm
        return nsm.get_attestation_doc(nonce=nonce)
    except Exception:
        return b""  # not in enclave / dev mode

def main():
    print(f"[enclave] LogicNodes fraud_detection_oracle vsock server starting on port {VSOCK_PORT}")

    with socket.socket(socket.AF_VSOCK, socket.SOCK_STREAM) as srv:
        srv.bind((CID_ANY, VSOCK_PORT))
        srv.listen(5)
        print("[enclave] Listening...")

        while True:
            conn, addr = srv.accept()
            with conn:
                raw = b""
                while True:
                    chunk = conn.recv(4096)
                    if not chunk:
                        break
                    raw += chunk
                    if raw.endswith(b"\n"):
                        break

                try:
                    request = json.loads(raw.decode())
                    nonce = request.get("nonce", "logicnodes").encode()
                    params = request.get("params", {})

                    result = run_fraud_detection(params)
                    attest = get_attestation_doc(nonce)

                    response = {
                        "result": result,
                        "attestation": base64.b64encode(attest).decode() if attest else None,
                        "attested": bool(attest),
                    }
                except Exception as e:
                    response = {"error": str(e), "attested": False}

                conn.sendall((json.dumps(response) + "\n").encode())

if __name__ == "__main__":
    main()
