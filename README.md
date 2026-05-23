# @logicnodez/mcp-bridge

Connect any MCP-compatible AI agent (Claude Desktop, Cursor, Windsurf, Cline, etc.) to the **LogicNodes x402 marketplace** — 619 pay-per-call deterministic microservices.

## Install

```bash
npx -y @logicnodez/mcp-bridge
```

No API key needed. The bridge uses the **x402 protocol** — your agent's wallet pays per call automatically. Just install and go.

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

If you have a LogicNodes API key (for prepay balance or volume pricing), pass it via env:

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

## Docs

https://logicnodes.io/agent-guide
