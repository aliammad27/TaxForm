import { createClient } from "@/lib/supabase/server";

export type PortfolioRow = {
  parid: string;
  nickname: string | null;
  address: string | null;
  muni: string | null;
  class_desc: string | null;
  current_assessed: number | null;
  estimated_fmv: number | null;
  implied_assessed: number | null;
  estimated_annual_savings: number | null;
  probability: number | null;
  appeal_status: string | null;
  appeal_tax_year: number | null;
};

type QueryRow = {
  parid: string;
  nickname: string | null;
  parcels: {
    full_address: string | null;
    muni_desc: string | null;
    class_desc: string | null;
    county_total: number | null;
    savings_scores: Array<{
      tax_year: number;
      estimated_fmv: number;
      implied_assessed: number;
      estimated_annual_savings: number;
      probability: number;
    }>;
  } | null;
};

export async function getPortfolio(): Promise<PortfolioRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [{ data: propsData }, { data: appealsData }] = await Promise.all([
    supabase
      .from("client_properties")
      .select(
        `parid, nickname,
         parcels(full_address, muni_desc, class_desc, county_total,
                 savings_scores(tax_year, estimated_fmv, implied_assessed,
                                estimated_annual_savings, probability))`
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("appeals")
      .select("parid, status, tax_year")
      .order("tax_year", { ascending: false }),
  ]);

  const latestAppeal = new Map<string, { status: string; tax_year: number }>();
  for (const a of appealsData ?? []) {
    if (!latestAppeal.has(a.parid)) {
      latestAppeal.set(a.parid, { status: a.status, tax_year: a.tax_year });
    }
  }

  return ((propsData ?? []) as unknown as QueryRow[]).map((p) => {
    const scores = p.parcels?.savings_scores ?? [];
    const latest = [...scores].sort((a, b) => b.tax_year - a.tax_year)[0];
    const appeal = latestAppeal.get(p.parid);
    return {
      parid: p.parid,
      nickname: p.nickname,
      address: p.parcels?.full_address ?? null,
      muni: p.parcels?.muni_desc ?? null,
      class_desc: p.parcels?.class_desc ?? null,
      current_assessed: p.parcels?.county_total ?? null,
      estimated_fmv: latest?.estimated_fmv ?? null,
      implied_assessed: latest?.implied_assessed ?? null,
      estimated_annual_savings: latest?.estimated_annual_savings ?? null,
      probability: latest?.probability ?? null,
      appeal_status: appeal?.status ?? null,
      appeal_tax_year: appeal?.tax_year ?? null,
    };
  });
}

export function portfolioToCsv(rows: PortfolioRow[]): string {
  const header = [
    "parcel_id", "nickname", "address", "municipality", "class",
    "current_assessed", "estimated_fmv", "target_assessed",
    "estimated_annual_savings", "success_probability",
    "appeal_status", "appeal_tax_year",
  ];
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.parid, r.nickname, r.address, r.muni, r.class_desc,
      r.current_assessed, r.estimated_fmv, r.implied_assessed,
      r.estimated_annual_savings,
      r.probability != null ? (r.probability * 100).toFixed(1) + "%" : "",
      r.appeal_status, r.appeal_tax_year,
    ]
      .map(escape)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}
