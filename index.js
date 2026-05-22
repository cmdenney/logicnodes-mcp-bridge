#!/usr/bin/env node
// @logicnodes/mcp-bridge
// Connects AI agents (Claude, Cursor, Windsurf, etc.) to the LogicNodes x402 marketplace.
// Pay per call with USDC on Base, Arc, Arbitrum, Optimism, Polygon, Solana.

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const https = require('https');
const http = require('http');

const LOGICNODES_BASE = process.env.LOGICNODES_URL || 'https://logicnodes.io';
const API_KEY = process.env.LOGICNODES_API_KEY || '';

// Fetch service catalog from live hub
async function fetchServices() {
  return new Promise((resolve) => {
    const url = new URL(LOGICNODES_BASE + '/mcp-config');
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(url.toString(), (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.services || []);
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(8000, () => { req.destroy(); resolve([]); });
  });
}

// Call a service on the hub
async function callService(serviceName, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params || {});
    const url = new URL(LOGICNODES_BASE + '/call/' + serviceName);
    const lib = url.protocol === 'https:' ? https : http;
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(API_KEY ? { 'X-Api-Key': API_KEY } : {})
      }
    };
    const req = lib.request(url.toString(), options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 402) {
            resolve({ 
              payment_required: true, 
              instructions: json.detail,
              message: 'Service requires USDC payment via x402. See instructions for payment details.'
            });
          } else {
            resolve(json);
          }
        } catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function main() {
  const server = new Server(
    { name: 'logicnodes', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  // Discover tools from live catalog
  let serviceCache = [];
  let lastFetch = 0;

  async function getServices() {
    if (Date.now() - lastFetch > 300000 || serviceCache.length === 0) {
      serviceCache = await fetchServices();
      lastFetch = Date.now();
    }
    return serviceCache;
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const services = await getServices();
    const tools = services.slice(0, 200).map(svc => ({
      name: svc.name || svc.service_name || 'unknown',
      description: (svc.description || 'LogicNodes microservice') + ' | Pay: USDC via x402 on Base/Arc/Arbitrum',
      inputSchema: svc.input_schema || {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Input for this service' }
        }
      }
    }));
    // Always include a discovery tool
    tools.unshift({
      name: 'logicnodes_discover',
      description: 'Search and discover available LogicNodes services. Returns service names, descriptions, and pricing.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (e.g. "token price", "sentiment", "defi tvl")' }
        }
      }
    });
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'logicnodes_discover') {
      const services = await getServices();
      const q = (args?.query || '').toLowerCase();
      const matches = q
        ? services.filter(s => 
            (s.name || '').toLowerCase().includes(q) || 
            (s.description || '').toLowerCase().includes(q)
          ).slice(0, 20)
        : services.slice(0, 20);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ 
            total_services: services.length,
            matches: matches.map(s => ({ name: s.name, description: s.description, tier: s.tier, execution_url: s.execution_url }))
          }, null, 2)
        }]
      };
    }

    try {
      const result = await callService(name, args || {});
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }],
        isError: true
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('LogicNodes MCP Bridge running — ' + LOGICNODES_BASE + '\n');
}

main().catch(err => {
  process.stderr.write('Fatal: ' + err.message + '\n');
  process.exit(1);
});
