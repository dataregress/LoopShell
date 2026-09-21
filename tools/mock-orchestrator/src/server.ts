import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { AttentionDecision } from '../../../contracts/schemas/attention';
import { AskSubmitRequest } from '../../../contracts/schemas/ipc';
import { LedgerEventType, LedgerScope } from '../../../contracts/schemas/ledger';
import { Realtime } from './realtime';
import { startScenario, trigger } from './scenarios';
import { State } from './state';

const PORT = Number(process.env.MOCK_PORT ?? 8787);
const HOST = process.env.MOCK_HOST ?? '127.0.0.1';

const realtime = new Realtime();
const state = new State(realtime);

const Knobs = z.object({
  latencyMs: z.number().int().min(0).max(60_000).optional(),
  failNextAsk: z.boolean().optional(),
  conflictNextDecision: z.boolean().optional(),
  dropRealtime: z.boolean().optional(),
});

function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    'content-type': 'application/json',
    'x-correlation-id': `mock-${Date.now().toString(36)}`,
    ...headers,
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

function error(res: ServerResponse, status: number, code: string, message: string, retryable = false): void {
  send(res, status, { code, message, retryable });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? (JSON.parse(text) as unknown) : {};
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';
  if (process.env.MOCK_QUIET !== '1') {
    console.log(`[mock] ${new Date().toISOString().slice(11, 23)} ${method} ${path}${url.search}`);
  }

  // Simulated network latency on every API call (not on dev endpoints).
  if (!path.startsWith('/dev/') && state.knobs.latencyMs > 0) await sleep(Math.min(state.knobs.latencyMs, 1500) / 3);

  if (method === 'GET' && path === '/health') return send(res, 200, { ok: true, clients: realtime.clientCount });
  if (method === 'GET' && path === '/session') return send(res, 200, state.session());
  if (method === 'GET' && path === '/negotiate') {
    if (realtime.dropped) return error(res, 503, 'offline', 'Realtime is unavailable (mock knob).', true);
    return send(res, 200, { url: `ws://${HOST}:${PORT}/ws` });
  }

  if (method === 'POST' && path === '/ask') {
    const parsed = AskSubmitRequest.safeParse(await readJson(req));
    if (!parsed.success) return error(res, 400, 'invalid', z.prettifyError(parsed.error));
    const run = state.createJourney(parsed.data.text, parsed.data.journeyId);
    // Respond first, then stream task states over realtime.
    send(res, 200, { journeyId: run.thread.journeyId, taskId: run.taskId });
    setTimeout(() => startScenario(state, run, parsed.data.text), 50);
    return;
  }
  const cancel = /^\/ask\/([^/]+)\/cancel$/.exec(path);
  if (method === 'POST' && cancel) {
    const ok = state.cancel(decodeURIComponent(cancel[1]!));
    return ok ? send(res, 204) : error(res, 404, 'invalid', 'Unknown task.');
  }

  if (method === 'GET' && path === '/attention') return send(res, 200, state.openAttention());
  const decide = /^\/attention\/([^/]+)\/decide$/.exec(path);
  if (method === 'POST' && decide) {
    const parsed = AttentionDecision.safeParse(await readJson(req));
    if (!parsed.success) return error(res, 400, 'invalid', z.prettifyError(parsed.error));
    const d = parsed.data;
    const outcome = state.decide(d.attentionId, d.decision, d.freeText, d.idempotencyKey);
    if (outcome === 'not_found') return error(res, 404, 'invalid', 'Unknown attention item.');
    if (outcome === 'conflict') return error(res, 409, 'conflict', 'Already decided elsewhere.');
    return send(res, 200, { accepted: true });
  }

  if (method === 'GET' && path === '/ledger') {
    const platforms = url.searchParams.get('platform')?.split(',').filter(Boolean) ?? [];
    const statuses = z.array(LedgerEventType).safeParse(url.searchParams.get('status')?.split(',').filter(Boolean) ?? []);
    const scope = LedgerScope.safeParse(url.searchParams.get('scope') ?? 'all');
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 100)));
    return send(
      res,
      200,
      state.queryLedger(
        { platforms, statuses: statuses.success ? statuses.data : [], scope: scope.success ? scope.data : 'all' },
        url.searchParams.get('cursor') ?? undefined,
        limit,
      ),
    );
  }

  const journey = /^\/journey\/([^/]+)$/.exec(path);
  if (method === 'GET' && journey) {
    const j = state.journey(decodeURIComponent(journey[1]!));
    return j ? send(res, 200, j) : error(res, 404, 'invalid', 'Unknown journey.');
  }

  // ---- Dev knobs (browser harness) ----------------------------------------
  if (path === '/dev/knobs') {
    if (method === 'POST') {
      const parsed = Knobs.safeParse(await readJson(req));
      if (!parsed.success) return error(res, 400, 'invalid', z.prettifyError(parsed.error));
      Object.assign(state.knobs, parsed.data);
      if (parsed.data.dropRealtime !== undefined) realtime.setDropped(parsed.data.dropRealtime);
    }
    return send(res, 200, state.knobs);
  }
  const trig = /^\/dev\/trigger\/([^/]+)$/.exec(path);
  if (method === 'POST' && trig) {
    return trigger(state, decodeURIComponent(trig[1]!)) ? send(res, 204) : error(res, 404, 'invalid', 'Unknown scenario.');
  }

  error(res, 404, 'invalid', `No route for ${method} ${path}`);
}

const server = createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-expose-headers', 'x-correlation-id');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  route(req, res).catch((err) => {
    console.error('[mock]', err);
    if (!res.headersSent) error(res, 500, 'internal', 'Mock orchestrator error.', true);
  });
});

server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/ws')) realtime.handleUpgrade(req, socket, head);
  else socket.destroy();
});

server.listen(PORT, HOST, () => {
  console.log(`[mock] Loop mock orchestrator on http://${HOST}:${PORT}  (ws://${HOST}:${PORT}/ws)`);
  console.log(`[mock] ${state.ledger.length.toLocaleString()} ledger rows · ${state.attention.size} attention items · ${state.journeys.size} journeys`);
});
