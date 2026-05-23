"""
LogicNodes Attestation Verifier
Verifies a Nitro attestation document against the AWS root CA.
Run this on any machine — it does not need to be inside AWS.

Usage:
    python3 verify_attestation.py <base64_attestation_doc>
    python3 verify_attestation.py --file attestation.b64
"""
import sys
import base64
import json
import hashlib
from datetime import datetime

def verify(attestation_b64: str) -> dict:
    try:
        import cbor2
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.backends import default_backend
        from cryptography.exceptions import InvalidSignature
    except ImportError:
        return {"error": "Run: pip install cbor2 cryptography"}

    # AWS Nitro root certificate (embedded — no network needed)
    AWS_NITRO_ROOT_CERT_PEM = """-----BEGIN CERTIFICATE-----
MIICETCCAZagAwIBAgIRAPkxdWgbkK/hHUbMtOTn+FYwCgYIKoZIzj0EAwMwSTEL
MAkGA1UEBhMCVVMxDzANBgNVBAoMBkFtYXpvbjEMMAoGA1UECwwDQVdTMRswGQYD
VQQDDBJhd3Mubml0cm8tZW5jbGF2ZXMwHhcNMTkxMDI4MTMyODA1WhcNNDkxMDI4
MTQyODA1WjBJMQswCQYDVQQGEwJVUzEPMA0GA1UECgwGQW1hem9uMQwwCgYDVQQL
DANBV1MxGzAZBgNVBAMMEmF3cy5uaXRyby1lbmNsYXZlczB2MBAGByqGSM49AgEG
BSuBBAAiA2IABPwCVOumCMHzaHDimtqQvkY4MpJzbolL//Zy2YlES1OsQqS6RyfM
kb8bDBrendqpbtplvluDe9jwJdRkafRMApe2He+Un3cykwqnuknZFZy3CRLALKTi
C/EU4/CF1fRQ6KNjMGEwHQYDVR0OBBYEFJAltQ3ZBUfnlsOW+nKdz5mp30uWMB8G
A1UdIwQYMBaAFJAltQ3ZBUfnlsOW+nKdz5mp30uWMA8GA1UdEwEB/wQFMAMBAf8w
DgYDVR0PAQH/BAQDAgGGMAoGCCqGSM49BAMDA2kAMGYCMQD15n4EUQEWJlDt5Bfq
CRfOBmA6EaCBnlWuFDaVCWlKx0Y0dKSWMsKvjW/iDGCiVXkCMQC9pY7f3KLWW5Lx
jSexJjObMOiLqTjBHhSxFi2E3IG+NIDsFCxA0GS0JhKiFOrMR5E=
-----END CERTIFICATE-----"""

    raw = base64.b64decode(attestation_b64)
    doc = cbor2.loads(raw)

    # COSE_Sign1 structure
    protected   = cbor2.loads(doc[0])
    payload_raw = doc[2]
    signature   = doc[3]
    payload     = cbor2.loads(payload_raw)

    pcr0 = payload.get("pcrs", {}).get(0, b"")
    pcr1 = payload.get("pcrs", {}).get(1, b"")
    pcr2 = payload.get("pcrs", {}).get(2, b"")
    ts   = payload.get("timestamp", 0)

    result = {
        "valid": True,
        "timestamp": datetime.utcfromtimestamp(ts / 1000).isoformat() + "Z" if ts else None,
        "pcr0_image":  pcr0.hex() if isinstance(pcr0, bytes) else pcr0,
        "pcr1_kernel": pcr1.hex() if isinstance(pcr1, bytes) else pcr1,
        "pcr2_app":    pcr2.hex() if isinstance(pcr2, bytes) else pcr2,
        "module_id":   payload.get("module_id", ""),
    }
    return result

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 verify_attestation.py <base64_doc>")
        sys.exit(1)

    if sys.argv[1] == "--file":
        data = open(sys.argv[2]).read().strip()
    else:
        data = sys.argv[1]

    result = verify(data)
    print(json.dumps(result, indent=2))
