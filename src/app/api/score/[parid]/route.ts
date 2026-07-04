import { NextResponse, type NextRequest } from "next/server";
import { computeSavingsScore } from "@/lib/savings";

// Simple fixed-window rate limit per IP (per server instance). Scores are
// cached in savings_scores, so repeat hits are cheap anyway.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, { count: number; windowStart: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ parid: string }> }
) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { parid } = await params;
  if (!/^[0-9A-Za-z]{16}$/.test(parid)) {
    return NextResponse.json({ error: "invalid_parid" }, { status: 400 });
  }

  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const score = await computeSavingsScore(parid, { refresh });
  if (!score) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(score);
}
