/**
 * Seeds/refreshes the Common Level Ratio table. Values are published annually
 * by the PA State Tax Equalization Board (STEB) each July; update this list
 * when the new ratio lands.
 */
import { getPool } from "./lib";

const CLR: Array<{ taxYear: number; ratio: number; source: string }> = [
  { taxYear: 2021, ratio: 0.811, source: "STEB" },
  { taxYear: 2022, ratio: 0.6353, source: "STEB (litigated value)" },
  { taxYear: 2023, ratio: 0.6353, source: "STEB" },
  { taxYear: 2024, ratio: 0.545, source: "STEB" },
  { taxYear: 2025, ratio: 0.527, source: "STEB" },
  { taxYear: 2026, ratio: 0.5014, source: "STEB" },
];

async function main() {
  const pool = getPool();
  for (const { taxYear, ratio, source } of CLR) {
    await pool.query(
      `insert into common_level_ratio (tax_year, ratio, source)
       values ($1, $2, $3)
       on conflict (tax_year) do update
         set ratio = excluded.ratio, source = excluded.source, updated_at = now()`,
      [taxYear, ratio, source]
    );
  }
  console.log(`seeded ${CLR.length} CLR rows`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
