/*
  Vercel Serverless Function: /api/comments
  - GET  ?path=/xxx                => returns { comments: CommentItem[] }
  - POST { path, author, content, visitorId } => rate-limited creation, returns { ok: true }
*/
import { kv } from '@vercel/kv';

type CommentItem = {
  id: string;
  path: string;
  author: string;
  content: string;
  createdAt: number;
};

// In-memory fallback for local (when KV is not configured)
const memory = {
  comments: new Map<string, CommentItem[]>(),
  rateLimit: new Map<string, number>(),
};

function normalizePath(input?: string) {
  let s = input || '/';
  if (!s.startsWith('/')) s = '/' + s;
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

function hasKV() {
  const g = globalThis as unknown as { process?: { env?: Record<string, unknown> } };
  const env = g.process?.env ?? {};
  return Boolean((env as Record<string, unknown>).KV_REST_API_URL || (env as Record<string, unknown>).UPSTASH_REDIS_REST_URL);
}

type Req = {
  method?: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};
type Res = {
  status: (code: number) => Res;
  setHeader: (name: string, value: string) => void;
  send: (body?: string) => void;
  end: () => void;
};

function cors(res: Res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
}

function getIP(req: Req): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  const xf = Array.isArray(forwarded) ? forwarded[0] : forwarded || '';
  const ip = (xf as string).split(',')[0]?.trim() || (req.socket?.remoteAddress || '');
  return ip || 'unknown';
}

function json(res: Res, data: unknown, status = 200) {
  res.status(status);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.send(JSON.stringify(data));
}

export default async function handler(req: Req, res: Res) {
  const method = (req.method || 'GET').toUpperCase();
  cors(res);

  if (method === 'OPTIONS') {
    res.status(204);
    return res.end();
  }

  const isKV = hasKV();

  if (method === 'GET') {
    const q = (req.query ?? {}) as { path?: string };
    const path = normalizePath(q.path || '/');
    if (isKV) {
      try {
        const key = `comments:${path}`;
        const raw = await kv.lrange<string>(key, 0, 49);
        const parsed = (raw || []).map((s) => {
          try { return JSON.parse(String(s)) as CommentItem; } catch { return null; }
        }).filter(Boolean) as CommentItem[];
        return json(res, { comments: parsed }, 200);
      } catch {
        return json(res, { comments: [] }, 200);
      }
    } else {
      const list = memory.comments.get(path) || [];
      return json(res, { comments: list.slice(0, 50) }, 200);
    }
  }

  if (method === 'POST') {
    const body = (req.body || {}) as { path?: string; author?: string; content?: string; visitorId?: string };
    const path = normalizePath(body.path || '/');
    const visitorId = String(body.visitorId || '').slice(0, 128);
    const ip = getIP(req);

    let author = String(body.author || '').trim();
    let content = String(body.content || '').trim();

    if (!author || !content) return json(res, { error: 'Invalid payload' }, 400);
    if (author.length > 32) author = author.slice(0, 32);
    if (content.length > 1000) content = content.slice(0, 1000);

    // Rate limit: 5m per (path + visitor)
    const rlKey = `ratelimit:${path}:${visitorId || ip}`;
    if (isKV) {
      try {
        // NX means only set when not exists; ex 300s TTL
        const opts: { nx?: boolean; ex?: number } = { nx: true, ex: 300 };
        const ok = await kv.set(rlKey, '1', opts as any);
        if (ok === null) return json(res, { error: 'Too Many Requests' }, 429);
      } catch {
        // if KV fails, do not block but continue
      }
    } else {
      const now = Date.now();
      const last = memory.rateLimit.get(rlKey) || 0;
      if (now - last < 300_000) return json(res, { error: 'Too Many Requests' }, 429);
      memory.rateLimit.set(rlKey, now);
    }

    const item: CommentItem = {
      id: ((globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.())
        || Math.random().toString(36).slice(2) + '-' + Date.now(),
      path,
      author,
      content,
      createdAt: Date.now(),
    };

    if (isKV) {
      try {
        const key = `comments:${path}`;
        await kv.lpush(key, JSON.stringify(item));
        // Trim to max 200
        try {
          await (kv as unknown as { ltrim?: (k: string, start: number, stop: number) => Promise<unknown> }).ltrim?.(key, 0, 199);
        } catch {}
      } catch {}
    } else {
      const list = memory.comments.get(path) || [];
      list.unshift(item);
      memory.comments.set(path, list);
    }

    return json(res, { ok: true }, 201);
  }

  return json(res, { error: 'Method Not Allowed' }, 405);
}
