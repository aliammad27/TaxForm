/** Dev smoke test: runs the Comp Engine against the seed fixture parcel. */
try {
  process.loadEnvFile();
} catch {}

import { estimateFmv } from "../../src/lib/comp-engine";
import { GOLDEN_RESIDENTIAL_PARID } from "../../src/lib/golden-parcels";
import { getPool } from "../../src/lib/db";

async function main() {
  const parid = process.argv[2] ?? GOLDEN_RESIDENTIAL_PARID;

  const result = await estimateFmv(parid);
  if (!result) throw new Error(`no comp result for ${parid} — is the seed fixture loaded?`);

  console.log(
    JSON.stringify(
      {
        parid,
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
  await getPool().end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
