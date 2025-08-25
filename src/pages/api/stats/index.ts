import type { APIRoute } from 'astro';
import { kv } from '@vercel/kv';

export const prerender = false;

// In-memory fallback for local dev (when KV is not configured)
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

function hasKV() {
  const env = import.meta.env as Record<string, unknown>;
  return Boolean(env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL);
}

async function getKV<T = unknown>(key: string): Promise<T | null> {
  try { return await kv.get<T>(key); } catch { return null; }
}

async function setKV(key: string, value: unknown, opts?: { ex?: number }) {
  try { 
    // biome-ignore lint/suspicious/noExplicitAny: @vercel/kv 的 set 选项联合类型较复杂
    await kv.set(key, value as any, opts as any); 
  } catch {}
}

async function incrKV(key: string): Promise<number> {
  try { return await kv.incr(key); } catch { return -1; }
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
  
  const pvKey = `stats:pv:${path}`;
  const uvCountKey = `stats:uvcount:${path}`;
  
  let pv = 0;
  let uv = 0;
  
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
  
  return json({ path, pv, uv });
};

export const POST: APIRoute = async ({ request }) => {
  const isKV = hasKV();
  const body = await safeJson(request);
  const path = normalizePath(String(body.path || '/'));
  const visitorId = String(body.visitorId || '').slice(0, 128);
  
  const pvKey = `stats:pv:${path}`;
  const uvKey = (vid: string) => `stats:uv:${path}:${vid}`;
  const uvCountKey = `stats:uvcount:${path}`;
  
  let pv = 0;
  let uv = 0;
  
  if (isKV) {
    pv = await incrKV(pvKey);
    if (pv < 0) pv = 0;
    
    // UV tracking with per-visitor key + TTL
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
  
  return json({ path, pv, uv });
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
