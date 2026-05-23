"""
LogicNodes PCR Hash Publisher
Publishes PCR measurements to Base mainnet as immutable proof.
Run once after each new enclave build to anchor the measurements on-chain.

Usage:
    python3 publish_pcr_onchain.py --pcr0 <hex> --pcr1 <hex> --pcr2 <hex>
    python3 publish_pcr_onchain.py --build-output build_output.json
"""
import argparse
import json
import sys

# Base mainnet
RPC_URL      = "https://mainnet.base.org"
CHAIN_ID     = 8453
# LogicNodes deployer wallet — fill in before running
PRIVATE_KEY  = ""  # set via env: export LOGICNODES_DEPLOYER_KEY=0x...

def publish(pcr0: str, pcr1: str, pcr2: str, worker: str = "fraud_detection_oracle"):
    try:
        from web3 import Web3
        import os
    except ImportError:
        print("Run: pip install web3")
        sys.exit(1)

    key = os.environ.get("LOGICNODES_DEPLOYER_KEY", PRIVATE_KEY)
    if not key:
        print("Set LOGICNODES_DEPLOYER_KEY env var to your deployer private key.")
        sys.exit(1)

    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    account = w3.eth.account.from_key(key)

    # Encode PCR measurements as calldata in a zero-value tx to self
    # (cheapest on-chain anchoring — no contract needed)
    data = json.dumps({
        "logicnodes_attestation": True,
        "worker": worker,
        "pcr0": pcr0,
        "pcr1": pcr1,
        "pcr2": pcr2,
    })

    tx = {
        "from":     account.address,
        "to":       account.address,  # tx to self = cheapest anchor
        "value":    0,
        "data":     ("0x" + data.encode().hex()),
        "gas":      50000,
        "gasPrice": w3.eth.gas_price,
        "nonce":    w3.eth.get_transaction_count(account.address),
        "chainId":  CHAIN_ID,
    }

    signed = w3.eth.account.sign_transaction(tx, key)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    print(f"[published] PCR hashes anchored on Base mainnet")
    print(f"  tx:     https://basescan.org/tx/{tx_hash.hex()}")
    print(f"  block:  {receipt[blockNumber]}")
    print(f"  worker: {worker}")
    print(f"  PCR0:   {pcr0}")
    return tx_hash.hex()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pcr0")
    parser.add_argument("--pcr1")
    parser.add_argument("--pcr2")
    parser.add_argument("--build-output", help="Path to build_output.json from nitro-cli")
    parser.add_argument("--worker", default="fraud_detection_oracle")
    args = parser.parse_args()

    if args.build_output:
        data = json.load(open(args.build_output))
        pcrs = data["Measurements"]
        publish(pcrs["PCR0"], pcrs["PCR1"], pcrs["PCR2"], args.worker)
    elif args.pcr0 and args.pcr1 and args.pcr2:
        publish(args.pcr0, args.pcr1, args.pcr2, args.worker)
    else:
        print("Provide --build-output or --pcr0/1/2")
        sys.exit(1)
