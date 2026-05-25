<img src="https://logicnodes.io/logo-black.jpg" alt="LogicNodes" width="80" />

# @logicnodez/mcp-bridge

Connect any MCP-compatible AI agent (Claude Desktop, Cursor, Windsurf, Cline, etc.) to the **LogicNodes x402 marketplace** — 619 pay-per-call deterministic microservices.

## Install

### Node / MCP
```bash
npx -y @logicnodez/mcp-bridge
```

### Python SDK
```bash
pip install logicnodes-m2m
```

```python
from logicnodes_sdk import LogicNodesClient

client = LogicNodesClient()
result = await client.call_worker("fraud_detection_oracle", {
    "amount_usd": 9500,
    "transactions_last_1h": 7,
    "country_mismatch": True
})
```

No API key needed. The bridge uses the **x402 protocol** — your agent's wallet pays per call automatically.

## Claude Desktop config

### No-account mode (default)

No signup, no API key required. Your agent pays directly on-chain via x402:

```json
{
  "mcpServers": {
    "logicnodes": {
      "command": "npx",
      "args": ["-y", "@logicnodez/mcp-bridge"]
    }
  }
}
```

### With API key (optional — prepay / volume discounts)

```json
{
  "mcpServers": {
    "logicnodes": {
      "command": "npx",
      "args": ["-y", "@logicnodez/mcp-bridge"],
      "env": {
        "LOGICNODES_API_KEY": "your-key-here"
      }
    }
  }
}
```

Get an optional API key at [logicnodes.io](https://logicnodes.io) if you prefer prepay billing.

## What's included

- **619 services** across Finance, DeFi, Crypto, Healthcare, Legal, Real Estate, Energy, HR, Supply Chain, and more
- **Live data** from CoinGecko, DefiLlama, DexScreener, Alchemy, Helius, EIA, and more
- **8 chains** — Base, Solana, Arc, Arbitrum, Optimism, Polygon, Ethereum, World Chain
- **4 pricing tiers** — Micro $0.001 · Basic $0.05 · Standard $0.15 · Premium $0.50 USDC
- **Circle Agent Stack** — nanopayments, EURC support, paymaster-sponsored gas
- **x402 protocol** — no signup, no subscription, pay per call

## How payment works

LogicNodes uses the [x402 payment protocol](https://x402.org). When your agent calls a service:

1. The hub returns HTTP 402 with a payment requirement
2. The MCP bridge pays the exact micro-amount on-chain (Base USDC by default)
3. The call completes — no accounts, no subscriptions, no prepay required

No account is ever required. The API key is purely optional for users who prefer a prepay balance.

## Attested Execution (coming soon)

Select LogicNodes workers run inside **AWS Nitro Enclaves** — isolated VMs with no network, no storage, and no SSH access. Every response includes a cryptographically signed attestation document from the AWS Nitro Secure Module, proving:

- The exact code that produced the result (PCR2 hash)
- The exact kernel it ran on (PCR1 hash)
- The exact enclave image (PCR0 hash)
- A timestamp and nonce binding the attestation to your specific request

PCR measurements are published on-chain (Base mainnet) after each deployment, so anyone can verify without trusting LogicNodes.

This is the infrastructure behind the "mathematically unhackable" claim — not marketing, just math.

## Docs

https://logicnodes.io/agent-guide
