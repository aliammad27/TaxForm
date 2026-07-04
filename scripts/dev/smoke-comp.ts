/** Dev smoke test: runs the Comp Engine against a sample residential parcel. */
try {
  process.loadEnvFile();
} catch {}

import { estimateFmv } from "../../src/lib/comp-engine";
import { getPool } from "../../src/lib/db";

async function main() {
  const parid =
    process.argv[2] ??
    (
      await getPool().query(
        `select p.parid from parcels p
         join sales s on s.parid = p.parid
         where p.class = 'R'
           and p.finished_living_area between 1200 and 2000
           and s.is_valid_sale
         limit 1`
      )
    ).rows[0]?.parid;

  if (!parid) throw new Error("no sample parcel found - run ingestion first");

  const result = await estimateFmv(parid);
  if (!result) throw new Error("no result");
  console.log(
    JSON.stringify(
      {
        subject: result.subject.full_address,
        current_assessed: result.subject.county_total,
        method: result.method,
        estimated_fmv: result.estimated_fmv,
        comps: result.comps.map((c) => ({
          address: c.address,
          sale: `$${c.sale_price.toLocaleString()} on ${c.sale_date}`,
          adjusted: c.adjusted_value,
          adjustments: c.adjustments.length,
        })),
        narrative: result.narrative,
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
