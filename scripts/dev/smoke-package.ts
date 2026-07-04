/** Dev smoke test: generates a full evidence package PDF for a sample parcel. */
try {
  process.loadEnvFile();
} catch {}

import { writeFileSync } from "node:fs";
import { computeSavingsScore } from "../../src/lib/savings";
import { generateLetterText } from "../../src/lib/letters";
import { renderEvidencePackagePdf } from "../../src/lib/evidence-package";
import { getCountyAdapter } from "../../src/lib/counties/registry";
import { getPool } from "../../src/lib/db";

async function main() {
  const parid =
    process.argv[2] ??
    (
      await getPool().query(
        `select p.parid from parcels p
         join sales s on s.parid = p.parid
         where p.class = 'R' and p.finished_living_area between 1200 and 2000
           and s.is_valid_sale
         limit 1`
      )
    ).rows[0]?.parid;

  const score = await computeSavingsScore(parid);
  if (!score) throw new Error("no score");
  console.log(`parcel: ${parid} (${score.county} County)`);

  const { text, method } = await generateLetterText({
    score,
    ownerName: "Jane Q. Homeowner",
  });
  console.log(`letter method: ${method}`);

  const window = await getCountyAdapter(score.county).appealWindow();
  console.log(
    `window: ${window.boardName}, deadline ${window.filingDeadline}, mailing: ${window.mailingAddress ?? "(none)"}`
  );

  const pdf = await renderEvidencePackagePdf({
    score,
    letterText: text,
    ownerName: "Jane Q. Homeowner",
    window,
    conditionContext:
      "Roof shows significant granule loss and two damaged sections of soffit; basement has visible efflorescence indicating chronic moisture intrusion.",
  });
  writeFileSync("/tmp/evidence-package-test.pdf", pdf);
  console.log(`PDF written to /tmp/evidence-package-test.pdf (${pdf.length} bytes)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
