import { NextResponse, type NextRequest } from "next/server";
import { computeSavingsScore } from "@/lib/savings";
import { rateLimited } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ parid: string }> }
) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (await rateLimited(`score:${ip}`, { max: 10, windowSeconds: 60 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { parid } = await params;
  // Parcel-ID shapes vary by county (Allegheny: 16 alnum; York: 13 digits).
  if (!/^[0-9A-Za-z]{10,20}$/.test(parid)) {
    return NextResponse.json({ error: "invalid_parid" }, { status: 400 });
  }

  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const score = await computeSavingsScore(parid, { refresh });
  if (!score) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(score);
}
