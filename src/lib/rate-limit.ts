import { getPool } from "./db";

/**
 * Distributed fixed-window rate limiter. Uses Upstash Redis (REST) when
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set; otherwise falls
 * back to an atomic Postgres counter so the limit is still enforced across
 * serverless instances. Fails open on infrastructure errors: a rate-limit
 * outage should not take down scoring.
 */

type LimitOptions = {
  max?: number;
  windowSeconds?: number;
};

const DEFAULT_MAX = 10;
const DEFAULT_WINDOW_S = 60;

async function upstashCount(
  key: string,
  windowSeconds: number
): Promise<number | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(windowSeconds), "NX"],
    ]),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash pipeline failed: ${res.status}`);
  const results = (await res.json()) as { result?: unknown; error?: string }[];
  const count = results[0]?.result;
  if (typeof count !== "number") {
    throw new Error(`Upstash INCR returned ${JSON.stringify(results[0])}`);
  }
  return count;
}

async function postgresCount(
  key: string,
  windowSeconds: number
): Promise<number> {
  const { rows } = await getPool().query<{ count: number }>(
    `insert into rate_limits (key, window_start, count)
     values ($1, now(), 1)
     on conflict (key) do update set
       count = case
         when now() - rate_limits.window_start > make_interval(secs => $2)
           then 1
         else rate_limits.count + 1
       end,
       window_start = case
         when now() - rate_limits.window_start > make_interval(secs => $2)
           then now()
         else rate_limits.window_start
       end
     returning count`,
    [key, windowSeconds]
  );
  return rows[0].count;
}

export async function rateLimited(
  key: string,
  options: LimitOptions = {}
): Promise<boolean> {
  const max = options.max ?? DEFAULT_MAX;
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_S;
  const namespaced = `rl:${key}:${windowSeconds}`;

  try {
    const count =
      (await upstashCount(namespaced, windowSeconds)) ??
      (await postgresCount(namespaced, windowSeconds));
    return count > max;
  } catch (err) {
    console.error("rate limiter unavailable; failing open", err);
    return false;
  }
}
