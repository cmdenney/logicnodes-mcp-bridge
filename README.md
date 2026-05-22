# @logicnodes/mcp-bridge

Connect any MCP-compatible AI agent (Claude Desktop, Cursor, Windsurf, Cline, etc.) to the **LogicNodes x402 marketplace** — 365+ pay-per-call deterministic microservices.

## Install

```bash
npx -y @logicnodes/mcp-bridge
```

## Claude Desktop config

```json
{
  "mcpServers": {
    "logicnodes": {
      "command": "npx",
      "args": ["-y", "@logicnodes/mcp-bridge"],
      "env": {
        "LOGICNODES_API_KEY": "your-key-here"
      }
    }
  }
}
```

## What's included

- **365+ services** across Finance, DeFi, Crypto, Geospatial, Utility, AI
- **Live data** from CoinGecko, DefiLlama, DexScreener, Alchemy, Helius
- **8 chains** — Base, Solana, Arc, Arbitrum, Optimism, Polygon, Ethereum, World Chain
- **4 pricing tiers** — Micro $0.001 · Basic $0.05 · Standard $0.15 · Premium $0.50 USDC
- **Circle Agent Stack** — nanopayments, EURC support, paymaster-sponsored gas
- **x402 protocol** — no signup, no subscription, pay per call

## Docs

https://logicnodes.io/agent-guide
