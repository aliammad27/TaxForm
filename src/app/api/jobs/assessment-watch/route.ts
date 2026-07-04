import { NextResponse } from "next/server";
import { runAssessmentWatch } from "@/lib/notifications";

export const maxDuration = 60;

/** Weekly cron (vercel.json): alert owners when tracked assessments change. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runAssessmentWatch();
  return NextResponse.json(result);
}
