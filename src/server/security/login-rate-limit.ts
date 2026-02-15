import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { internal } from "@/server/api/errors";

type RateLimitRecord = { count: number; resetAt: number };

const memoryRateLimit = new Map<string, RateLimitRecord>();

type LoginRateLimitResult = {
	ok: boolean;
	remaining: number;
	resetAt: number;
};

let cachedRatelimit: Ratelimit | null = null;

function getIsProductionRuntime(): boolean {
	return import.meta.env.PROD || process.env.NODE_ENV === "production";
}

function getUpstashConfig(): { url: string; token: string } | null {
	const url = String(
		process.env.KV_REST_API_URL || import.meta.env.KV_REST_API_URL || "",
	).trim();
	const token = String(
		process.env.KV_REST_API_TOKEN ||
			import.meta.env.KV_REST_API_TOKEN ||
			"",
	).trim();

	if (!url || !token) {
		return null;
	}
	return { url, token };
}

function getRatelimit(limit: number, windowMs: number): Ratelimit {
	if (cachedRatelimit) {
		return cachedRatelimit;
	}

	const config = getUpstashConfig();
	if (!config) {
		throw internal("Upstash 限流服务未配置");
	}

	const redis = new Redis({
		url: config.url,
		token: config.token,
	});

	const seconds = Math.max(1, Math.floor(windowMs / 1000));
	cachedRatelimit = new Ratelimit({
		redis,
		limiter: Ratelimit.slidingWindow(limit, `${seconds} s`),
		analytics: false,
		prefix: "dacapo:auth:login",
	});

	return cachedRatelimit;
}

function fallbackMemoryRateLimit(
	ip: string,
	limit: number,
	windowMs: number,
): LoginRateLimitResult {
	const now = Date.now();
	const existing = memoryRateLimit.get(ip);
	if (!existing || existing.resetAt <= now) {
		memoryRateLimit.set(ip, { count: 1, resetAt: now + windowMs });
		return {
			ok: true,
			remaining: Math.max(0, limit - 1),
			resetAt: now + windowMs,
		};
	}
	if (existing.count >= limit) {
		return { ok: false, remaining: 0, resetAt: existing.resetAt };
	}

	existing.count += 1;
	memoryRateLimit.set(ip, existing);
	return {
		ok: true,
		remaining: Math.max(0, limit - existing.count),
		resetAt: existing.resetAt,
	};
}

export async function checkLoginRateLimitDistributed(
	ip: string,
	options?: { limit?: number; windowMs?: number },
): Promise<LoginRateLimitResult> {
	const cleanIp = String(ip || "unknown").trim() || "unknown";
	const limit = options?.limit ?? 10;
	const windowMs = options?.windowMs ?? 5 * 60 * 1000;
	const hasUpstash = Boolean(getUpstashConfig());
	const isProduction = getIsProductionRuntime();

	if (!hasUpstash) {
		if (isProduction) {
			throw internal("Upstash 限流服务未配置");
		}
		return fallbackMemoryRateLimit(cleanIp, limit, windowMs);
	}

	const ratelimit = getRatelimit(limit, windowMs);
	const result = await ratelimit.limit(`ip:${cleanIp}`);
	const resetAt =
		typeof result.reset === "number" ? result.reset : Date.now() + windowMs;

	return {
		ok: Boolean(result.success),
		remaining: Number(result.remaining ?? 0),
		resetAt,
	};
}
