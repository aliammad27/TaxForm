import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio, portfolioToCsv } from "@/lib/portfolio";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rows = await getPortfolio();
  const csv = portfolioToCsv(rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="portfolio-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
