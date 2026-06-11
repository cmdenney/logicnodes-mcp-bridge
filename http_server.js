#!/usr/bin/env node
/**
 * LogicNodes MCP HTTP Server — Streamable HTTP + SSE dual transport
 * Port 8098
 * Smithery-compatible: supports both legacy SSE and new Streamable HTTP
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";

const PORT = process.env.PORT || 8098;
const LOGICNODES_BASE = process.env.LOGICNODES_HUB_URL || "http://localhost:8089";
const ESCROW_BASE = process.env.LOGICNODES_ESCROW_URL || "http://localhost:8093";
const API_KEY = process.env.LOGICNODES_API_KEY || "";

async function callEndpoint(path, body) {
  const res = await fetch(LOGICNODES_BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "X-API-Key": API_KEY } : {})
    },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(15000)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text;
}

// General hub/escrow request helper: GET or POST, optional Bearer auth + extra headers.
async function hubRequest(method, path, { body, bearer, headers, base, timeout } = {}) {
  const h = { "Content-Type": "application/json", ...(headers || {}) };
  if (bearer) h["Authorization"] = `Bearer ${bearer}`;
  else if (API_KEY) h["X-API-Key"] = API_KEY;
  const res = await fetch((base || LOGICNODES_BASE) + path, {
    method,
    headers: h,
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
    signal: AbortSignal.timeout(timeout || 30000)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text;
}

// ── Marketplace tools — discover / evaluate / invoke any listed agent ─────────
const MARKET_TOOLS = [
  {
    name: "search_agents",
    description: "Search the LogicNodes agent marketplace for verified, escrow-backed agents to hire. Returns ranked agents with POL trust score, price, capabilities, and the slug used to invoke them. Free, no auth required.",
    inputSchema: { type: "object", properties: {
      q: { type: "string", description: "keyword / natural-language capability query" },
      capability: { type: "string", description: "filter by a specific capability tag" },
      category: { type: "string", description: "filter by category" },
      max_price: { type: "number", description: "max price_per_job in USDC" },
      min_score: { type: "integer", description: "minimum POL score (0-1000)" },
      limit: { type: "integer", description: "max results (default 10)", default: 10 }
    }, required: [] },
    handler: async (a) => {
      const qs = new URLSearchParams();
      for (const k of ["q", "capability", "category", "max_price", "min_score", "limit"])
        if (a[k] !== undefined && a[k] !== null) qs.set(k, String(a[k]));
      return hubRequest("GET", "/agents/search?" + qs.toString());
    }
  },
  {
    name: "get_agent",
    description: "Get the full profile for one marketplace agent by slug — POL trust score breakdown, pricing, input/output schemas, settlement history, and invocation details. Free, no auth required.",
    inputSchema: { type: "object", properties: {
      slug: { type: "string", description: "the agent's slug (from search_agents)" }
    }, required: ["slug"] },
    handler: async (a) => hubRequest("GET", `/agents/${encodeURIComponent(a.slug)}`)
  },
  {
    name: "invoke_agent",
    description: "Hire and run a marketplace agent in a single call. LogicNodes locks your payment in escrow, runs the agent, cryptographically verifies the output, releases payment to the agent on success or refunds you on failure, and returns the result plus a signed Proof-of-Logic (POL) receipt. Requires your LogicNodes prepaid API key (sk_ln_...). Cost: the agent's price_per_job in USDC.",
    inputSchema: { type: "object", properties: {
      slug: { type: "string", description: "the agent's slug to hire" },
      input: { type: "object", description: "the input payload for the agent" },
      api_key: { type: "string", description: "your LogicNodes prepaid API key (sk_ln_...). Omit to use the server-configured key." },
      max_amount_usdc: { type: "number", description: "refuse if price exceeds this (spend cap)" },
      idempotency_key: { type: "string", description: "optional — safe-retry key; a repeat returns the first result without double-charging" }
    }, required: ["slug"] },
    handler: async (a) => {
      const bearer = a.api_key || API_KEY;
      if (!bearer) throw new Error("api_key required: pass your LogicNodes key (sk_ln_...) or configure LOGICNODES_API_KEY");
      const headers = {};
      if (a.idempotency_key) headers["Idempotency-Key"] = a.idempotency_key;
      const body = { input: a.input || {} };
      if (a.max_amount_usdc !== undefined) body.max_amount_usdc = a.max_amount_usdc;
      return hubRequest("POST", `/agents/${encodeURIComponent(a.slug)}/invoke`, { body, bearer, headers });
    }
  },
  {
    name: "check_task",
    description: "Check the status and settlement of a previous invocation by escrow_id — returns escrow status (OPEN/RELEASED/REFUNDED/SLASHED), verification verdict, and POL receipt. Use for auditing or async flows. Free.",
    inputSchema: { type: "object", properties: {
      escrow_id: { type: "string", description: "the escrow_id returned by invoke_agent" }
    }, required: ["escrow_id"] },
    handler: async (a) => hubRequest("GET", `/escrow/${encodeURIComponent(a.escrow_id)}`, { base: ESCROW_BASE })
  },
  {
    name: "verify_receipt",
    description: "Independently verify a LogicNodes Proof-of-Logic (POL) receipt. Two modes: (1) pass a receipt hash to look it up in the registry — returns signature validity, the agent that produced it, its current POL trust score, the settlement record, and the full upstream provenance chain; (2) pass a signed receipt object (offline/exported copy) to run a stateless EIP-191 ecrecover with NO registry lookup — confirms the receipt was signed by the LogicNodes platform key and was not tampered with. Use this to trust an agent's output before relying on it. Free, no auth required.",
    inputSchema: { type: "object", properties: {
      receipt_hash: { type: "string", description: "a POL receipt hash (0x...) to look up in the registry, with provenance chain. Use this OR `signed_receipt`." },
      signed_receipt: { type: "object", description: "a full signed receipt object (must contain the EIP-191 `signature`/`signed` attestation, and optionally the original `payload`) to verify statelessly without a registry lookup. Use this OR `receipt_hash`." },
      signature: { type: "object", description: "alternative to signed_receipt: just the EIP-191 attestation object {standard, signer, payload_hash, signature}." },
      payload: { type: "object", description: "optional original signed payload, supplied alongside signature/signed_receipt to additionally detect tampering." }
    }, required: [] },
    handler: async (a) => {
      // Mode 1: registry lookup + provenance walk by receipt hash.
      if (a.receipt_hash) {
        return hubRequest("GET", `/agents/verify/${encodeURIComponent(a.receipt_hash)}`);
      }
      // Mode 2: stateless cryptographic verification of a handed-in receipt.
      const sig = a.signature
        || (a.signed_receipt && (a.signed_receipt.signature || a.signed_receipt.pol_signature || a.signed_receipt.signed));
      if (!sig && !a.signed_receipt)
        throw new Error("Provide either `receipt_hash` (registry lookup) or a signed receipt via `signed_receipt`/`signature`.");
      const body = {};
      if (a.signature) body.signature = a.signature;
      if (a.signed_receipt) body.receipt = a.signed_receipt;
      if (a.payload) body.payload = a.payload;
      return hubRequest("POST", "/agents/verify", { body });
    }
  }
];

const TOOLS = [
  { name: "logicnodes_gas_oracle", description: "Real-time gas price oracle for Base and other EVM chains. Returns base_fee_gwei, priority_fee_gwei, total_gwei, and latency_ms. Cost: $0.001 USDC per call.", inputSchema: { type: "object", properties: { chain: { type: "string", description: "base|arbitrum|optimism|ethereum|polygon (default: base)", default: "base" } }, required: [] }, endpoint: "/call/gas_oracle" },
  { name: "logicnodes_sig_verify", description: "EIP-712 domain readiness check for EVM chains. Confirms chain connectivity, chain ID, and EIP-712 domain availability. Returns chain_id_verified and block info. Cost: $0.001 USDC per call.", inputSchema: { type: "object", properties: { chain: { type: "string", description: "base|arbitrum|optimism|ethereum|polygon (default: base)", default: "base" } }, required: [] }, endpoint: "/call/sig_verify" },
  { name: "logicnodes_peg_monitor", description: "USDC circulating supply and peg status monitor for EVM chains. Returns peg_ok and usdc_supply_millions. Cost: $0.001 USDC per call.", inputSchema: { type: "object", properties: { chain: { type: "string", description: "base|arbitrum|optimism|ethereum|polygon (default: base)", default: "base" } }, required: [] }, endpoint: "/call/peg_monitor" },
  { name: "logicnodes_escrow_verifier", description: "Autonomous escrow: lock USDC, verify machine job completion via on-chain condition, release payment. Conditions: hash_match, gas_below, peg_held, block_after, multi. Cost: $0.01 USDC per call.", inputSchema: { type: "object", properties: { action: { type: "string", description: "create|settle|status|discover" }, escrow_id: { type: "string" }, hiring_agent: { type: "string" }, target_agent: { type: "string" }, amount_usdc: { type: "number" }, condition_type: { type: "string" }, condition_params: { type: "object" }, deadline_hours: { type: "number" }, output_hash: { type: "string" } }, required: ["action"] }, endpoint: "/call/escrow_verifier" },
  { name: "logicnodes_identity_register", description: "Register an autonomous system (AI agent, robot, IoT, DAO) in the LogicNodes identity registry. Returns a registration_hash. Cost: $0.01 USDC per registration.", inputSchema: { type: "object", properties: { agent_address: { type: "string" }, capabilities: { type: "array", items: { type: "string" } }, metadata_uri: { type: "string" }, system_type: { type: "string", description: "agent|robot|iot|dao|vehicle|drone" } }, required: ["agent_address","capabilities"] }, endpoint: "/call/identity_register" },
  { name: "logicnodes_inference_attest", description: "Attest an AI inference output via signed SHA256 hash commitment (input_hash + output_hash + context). Standard/premium tiers anchor to Base mainnet via POLAnchor. Cost: $0.01–$0.10 USDC per attestation.", inputSchema: { type: "object", properties: { input_hash: { type: "string" }, output_hash: { type: "string" }, context: { type: "string" }, circuit_id: { type: "string" }, tier: { type: "string", description: "basic|standard|premium (default: basic)" } }, required: ["input_hash","output_hash","context"] }, endpoint: "/call/inference_attest" },
  { name: "logicnodes_compliance_sentry", description: "Rule-based compliance attestation for autonomous systems. Checks MiCA, EU AI Act (Annex III), US EO 14110, and FinCEN Travel Rule. Returns pass/fail per rule with ARAL attestation ID. Cost: $0.01 USDC per check.", inputSchema: { type: "object", properties: { action_type: { type: "string", description: "action being attested (e.g. 'transfer', 'inference', 'data_processing')" }, jurisdiction: { type: "string", description: "mica|euaiact|us_eo|fincen|all (default: all)" }, amount_usd: { type: "number" }, agent_id: { type: "string" } }, required: ["action_type"] }, endpoint: "/call/compliance_sentry" },
  { name: "logicnodes_zk_compute_attest", description: "Attest a computation via signed SHA256 hash commitment (input + output binding) anchored on Base mainnet. Note: uses hash-binding commitment, not a ZK circuit. Cost: $0.01–$0.10 USDC.", inputSchema: { type: "object", properties: { computation_hash: { type: "string" }, output_hash: { type: "string" }, context: { type: "string" }, circuit_id: { type: "string" }, public_inputs: { type: "array", items: { type: "string" } }, tier: { type: "string", description: "basic|standard|premium (default: basic)" } }, required: ["computation_hash","output_hash","context"] }, endpoint: "/call/zk_compute_attest" }
];

function buildMcpServer() {
  const mcpServer = new Server(
    { name: "logicnodes", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...MARKET_TOOLS, ...TOOLS].map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
  }));
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    // Marketplace tools (custom handlers: GET/POST, bearer auth)
    const market = MARKET_TOOLS.find(t => t.name === name);
    if (market) {
      try {
        const result = await market.handler(args || {});
        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
    // Fixed deterministic-service tools (POST /call/{slug})
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    try {
      const result = await callEndpoint(tool.endpoint, args || {});
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  });
  return mcpServer;
}

const app = express();
app.use(cors({ origin: "*", methods: ["GET","POST","OPTIONS"], allowedHeaders: ["Content-Type","Authorization","Mcp-Session-Id"] }));
app.use(express.json());

// Server card
app.get("/.well-known/mcp/server-card.json", (req, res) => {
  res.json({
    name: "logicnodes",
    displayName: "LogicNodes — Agent Infrastructure",
    version: "1.0.0",
    description: "Agent-to-agent payment, identity, and compliance infrastructure for autonomous AI on Base. 9 deterministic services payable via x402 USDC.",
    author: "DENNEYTRADINGCO LLC",
    homepage: "https://logicnodes.io",
    transport: ["streamable-http", "sse"],
    tools: [...MARKET_TOOLS, ...TOOLS].map(t => ({ name: t.name, description: t.description }))
  });
});

// Health
app.get("/health", (req, res) => res.json({ status: "ok", service: "logicnodes-mcp", tools: MARKET_TOOLS.length + TOOLS.length, marketplace_tools: MARKET_TOOLS.length, transports: ["streamable-http","sse"] }));

// ── Streamable HTTP transport (new standard, Smithery preferred) ───────────
const streamableSessions = {};

app.all("/mcp", async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
      return res.status(204).end();
    }
    const sessionId = req.headers["mcp-session-id"];
    let transport;

    if (req.method === "POST" && isInitializeRequest(req.body)) {
      // New session
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (sid) => { streamableSessions[sid] = transport; }
      });
      transport.onclose = () => {
        if (transport.sessionId) delete streamableSessions[transport.sessionId];
      };
      const srv = buildMcpServer();
      await srv.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } else if (sessionId && streamableSessions[sessionId]) {
      transport = streamableSessions[sessionId];
      await transport.handleRequest(req, res, req.body);
    } else {
      res.status(400).json({ error: "No session. Send initialize first." });
    }
  } catch (err) {
    console.error("Streamable HTTP error:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── Legacy SSE transport ───────────────────────────────────────────────────
const sseSessions = {};

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  sseSessions[transport.sessionId] = transport;
  const srv = buildMcpServer();
  res.on("close", () => { delete sseSessions[transport.sessionId]; });
  await srv.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = sseSessions[sessionId];
  if (!transport) return res.status(404).json({ error: "Session not found" });
  await transport.handlePostMessage(req, res);
});

// OPTIONS preflight for /messages
app.options("/messages", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`LogicNodes MCP HTTP server on port ${PORT}`);
  console.log(`Streamable HTTP: http://localhost:${PORT}/mcp`);
  console.log(`SSE: http://localhost:${PORT}/sse`);
});
