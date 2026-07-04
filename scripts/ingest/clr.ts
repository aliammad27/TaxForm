/**
 * Seeds/refreshes the Common Level Ratio table. Values are published annually
 * by the PA State Tax Equalization Board (STEB) each July for every county;
 * update this list when new ratios land. The table is keyed by
 * (county, tax_year) — add rows here as counties are onboarded.
 */
import { getPool } from "./lib";

const CLR: Array<{
  county: string;
  taxYear: number;
  ratio: number;
  source: string;
}> = [
  { county: "Allegheny", taxYear: 2021, ratio: 0.811, source: "STEB" },
  { county: "Allegheny", taxYear: 2022, ratio: 0.6353, source: "STEB (litigated value)" },
  { county: "Allegheny", taxYear: 2023, ratio: 0.6353, source: "STEB" },
  { county: "Allegheny", taxYear: 2024, ratio: 0.545, source: "STEB" },
  { county: "Allegheny", taxYear: 2025, ratio: 0.527, source: "STEB" },
  { county: "Allegheny", taxYear: 2026, ratio: 0.5014, source: "STEB" },
  {
    county: "York",
    taxYear: 2026,
    ratio: 0.5046,
    source: "STEB (cited by York County Board of Assessment Appeals)",
  },
  { county: "Cumberland", taxYear: 2026, ratio: 0.678, source: "STEB" },
  { county: "Montgomery", taxYear: 2026, ratio: 0.3076, source: "STEB" },
  { county: "Butler", taxYear: 2026, ratio: 0.06, source: "STEB" },
  { county: "Indiana", taxYear: 2026, ratio: 0.7532, source: "STEB" },
  { county: "Juniata", taxYear: 2026, ratio: 0.0811, source: "STEB" },
  { county: "Chester", taxYear: 2026, ratio: 0.3184, source: "STEB" },
  { county: "Bedford", taxYear: 2026, ratio: 0.5452, source: "STEB" },
  { county: "Forest", taxYear: 2026, ratio: 0.1305, source: "STEB" },
  { county: "Franklin", taxYear: 2026, ratio: 0.0768, source: "STEB" },
];

async function main() {
  const pool = getPool();
  for (const { county, taxYear, ratio, source } of CLR) {
    await pool.query(
      `insert into common_level_ratio (county, tax_year, ratio, source)
       values ($1, $2, $3, $4)
       on conflict (county, tax_year) do update
         set ratio = excluded.ratio, source = excluded.source, updated_at = now()`,
      [county, taxYear, ratio, source]
    );
  }
  console.log(`seeded ${CLR.length} CLR rows`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
