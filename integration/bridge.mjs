import http from 'node:http';
import { pathToFileURL } from 'node:url';

export function normalize(input) {
  if (!input || typeof input !== 'object') throw Error('Expected JSON object');
  const agentId = String(input.agentId ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!agentId) throw Error('agentId required');
  const allowed = new Set(['start','thinking','working','waiting','idle','stop']);
  const type = allowed.has(input.type) ? input.type : 'working';
  const tool = String(input.tool ?? 'terminal').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return { agentId, type, tool };
}

export function createBridge({forward = async () => {}, port = 3211} = {}) {
  return http.createServer(async (req,res) => {
    if (req.method !== 'POST' || req.url !== '/events') { res.writeHead(404).end(); return; }
    let raw = '';
    try {
      for await (const chunk of req) { raw += chunk; if (raw.length > 8192) throw Error('Event too large'); }
      const event = normalize(JSON.parse(raw));
      await forward(event);
      res.writeHead(202, {'content-type':'application/json'}).end(JSON.stringify({accepted:true,event}));
    } catch (error) { res.writeHead(400).end(String(error.message)); }
  }).listen(port, '127.0.0.1');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createBridge({forward: async event => { console.log('Received sanitized event:',event); }});
  console.log('Agent bridge listening on 127.0.0.1:3211 (dry-run; does not modify agent state)');
}
