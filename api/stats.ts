/*
  Vercel Serverless Function: /api/stats
  - POST { path, visitorId } => increments PV and UV, returns { pv, uv }
  - GET  ?path=/xxx          => returns { pv, uv } without increment
*/
import { kv } from '@vercel/kv';

// In-memory fallback for local (when KV is not configured)
const memory = {
  pv: new Map<string, number>(),
  uvCount: new Map<string, number>(),
  uvSet: new Map<string, Set<string>>()
};

function normalizePath(input?: string) {
  let p = input || '/';
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

async function getKV<T = unknown>(key: string): Promise<T | null> {
  try { return await kv.get<T>(key); } catch { return null; }
}
async function setKV(key: string, value: unknown, opts?: { ex?: number }) {
  try { await kv.set(key, value as any, opts as any); } catch {}
}
async function incrKV(key: string): Promise<number> {
  try { return await kv.incr(key); } catch { return -1; }
}

function hasKV() {
  // Heuristic: presence of URL/token envs
  const env = (globalThis as any)?.process?.env ?? {};
  return !!(env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL);
}

type Req = {
  method?: string;
  query?: Record<string, unknown>;
  body?: unknown;
};
type Res = {
  status: (code: number) => Res;
  setHeader: (name: string, value: string) => void;
  send: (body?: string) => void;
  end: () => void;
};

export default async function handler(req: Req, res: Res) {
  try {
    const method = (req.method || 'GET').toUpperCase();
    const isKV = hasKV();

    if (method === 'OPTIONS') {
      res.status(204).setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type');
      return res.end();
    }

    let path = '';
    let visitorId = '';

    if (method === 'GET') {
      const q = (req.query ?? {}) as Record<string, unknown>;
      const qp = q.path;
      const qpStr = typeof qp === 'string' ? qp : Array.isArray(qp) ? String(qp[0] ?? '/') : '/';
      path = normalizePath(qpStr);
    } else if (method === 'POST') {
      const raw = req.body;
      let obj: Record<string, unknown> = {};
      if (typeof raw === 'string') {
        try { obj = JSON.parse(raw) as Record<string, unknown>; } catch { obj = {}; }
      } else if (raw && typeof raw === 'object') {
        obj = raw as Record<string, unknown>;
      }
      const bPath = obj.path;
      const bVid = obj.visitorId;
      path = normalizePath(typeof bPath === 'string' ? bPath : '/');
      visitorId = typeof bVid === 'string' ? bVid.slice(0, 128) : '';
    } else {
      return json(res, { error: 'Method Not Allowed' }, 405);
    }

    const pvKey = `stats:pv:${path}`;
    const uvKey = (vid: string) => `stats:uv:${path}:${vid}`;
    const uvCountKey = `stats:uvcount:${path}`;

    let pv = 0;
    let uv = 0;

    if (method === 'POST') {
      if (isKV) {
        pv = await incrKV(pvKey);
        if (pv < 0) pv = 0; // fallback safe guard

        // UV: naive approach with per-visitor key + TTL
        if (visitorId) {
          const existed = await getKV<string>(uvKey(visitorId));
          if (!existed) {
            await setKV(uvKey(visitorId), '1', { ex: 60 * 60 * 24 * 30 }); // 30 days
            const uvRes = await incrKV(uvCountKey);
            uv = uvRes < 0 ? 0 : uvRes;
          } else {
            const v = await getKV<number>(uvCountKey);
            uv = typeof v === 'number' ? v : 0;
          }
        } else {
          const v = await getKV<number>(uvCountKey);
          uv = typeof v === 'number' ? v : 0;
        }
      } else {
        // Memory fallback
        pv = (memory.pv.get(path) || 0) + 1;
        memory.pv.set(path, pv);
        if (visitorId) {
          const set = memory.uvSet.get(path) || new Set<string>();
          const before = set.size;
          set.add(visitorId);
          memory.uvSet.set(path, set);
          if (set.size !== before) {
            const count = (memory.uvCount.get(path) || 0) + 1;
            memory.uvCount.set(path, count);
          }
        }
        uv = memory.uvCount.get(path) || 0;
      }
    } else {
      if (isKV) {
        const [pvRes, uvRes] = await Promise.all([
          getKV<number>(pvKey),
          getKV<number>(uvCountKey),
        ]);
        pv = typeof pvRes === 'number' ? pvRes : 0;
        uv = typeof uvRes === 'number' ? uvRes : 0;
      } else {
        pv = memory.pv.get(path) || 0;
        uv = memory.uvCount.get(path) || 0;
      }
    }

    return json(res, { path, pv, uv });
  } catch (_e) {
    return json(res, { error: 'Internal Error' }, 500);
  }
}

function json(res: Res, data: unknown, status = 200) {
  res.status(status);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.send(JSON.stringify(data));
}
