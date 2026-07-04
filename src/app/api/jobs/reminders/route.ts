import { NextResponse } from "next/server";
import { runReminderJob } from "@/lib/notifications";

export const maxDuration = 60;

/** Daily cron (vercel.json): deadline + hearing reminder emails. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runReminderJob();
  return NextResponse.json(result);
}
