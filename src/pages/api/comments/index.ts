import type { APIRoute } from 'astro';
import { kv } from '@vercel/kv';

export const prerender = false;

// Comment item type
interface CommentItem {
  id: string;
  path: string;
  author: string;
  content: string;
  createdAt: number;
}

// In-memory fallback for local dev (when KV is not configured)
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
  const env = import.meta.env as Record<string, unknown>;
  return Boolean(env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL);
}

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const path = normalizePath(url.searchParams.get('path') || '/');
  const isKV = hasKV();

  if (isKV) {
    try {
      const key = `comments:${path}`;
      const raw = await kv.lrange<string>(key, 0, 49);
      const parsed = (raw || [])
        .map((s) => {
          try { return JSON.parse(String(s)) as CommentItem; } catch { return null; }
        })
        .filter(Boolean) as CommentItem[];
      return json({ comments: parsed }, 200);
    } catch {
      return json({ comments: [] }, 200);
    }
  } else {
    const list = memory.comments.get(path) || [];
    return json({ comments: list.slice(0, 50) }, 200);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const isKV = hasKV();
  const body = await safeJson(request);
  const path = normalizePath(String(body.path || '/'));
  const visitorId = String(body.visitorId || '').slice(0, 128);

  let author = String(body.author || '').trim();
  let content = String(body.content || '').trim();
  if (!author || !content) return json({ error: 'Invalid payload' }, 400);
  if (author.length > 32) author = author.slice(0, 32);
  if (content.length > 1000) content = content.slice(0, 1000);

  const rlKey = `ratelimit:${path}:${visitorId || getIP(request)}`;
  if (isKV) {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: @vercel/kv 的 set 选项联合类型较复杂，此处保持与 Vercel 运行时一致
      const ok = await kv.set(rlKey, '1', { nx: true, ex: 300 } as any);
      if (ok === null) return json({ error: 'Too Many Requests' }, 429);
    } catch {
      // ignore kv failures for rate limit
    }
  } else {
    const now = Date.now();
    const last = memory.rateLimit.get(rlKey) || 0;
    if (now - last < 300_000) return json({ error: 'Too Many Requests' }, 429);
    memory.rateLimit.set(rlKey, now);
  }

  const item: CommentItem = {
    id: (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) + '-' + Date.now(),
    path,
    author,
    content,
    createdAt: Date.now(),
  };

  if (isKV) {
    try {
      const key = `comments:${path}`;
      await kv.lpush(key, JSON.stringify(item));
      try {
        await (kv as unknown as { ltrim?: (k: string, start: number, stop: number) => Promise<unknown> }).ltrim?.(key, 0, 199);
      } catch {}
    } catch {}
  } else {
    const list = memory.comments.get(path) || [];
    list.unshift(item);
    memory.comments.set(path, list);
  }

  return json({ ok: true }, 201);
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders,
    },
  });
}

async function safeJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getIP(request: Request): string {
  try {
    const fwd = request.headers.get('x-forwarded-for') || '';
    const ip = fwd.split(',')[0]?.trim();
    return ip || '';
  } catch {
    return '';
  }
}
