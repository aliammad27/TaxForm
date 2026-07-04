/** Dev smoke test: generates an appeal letter PDF for a sample parcel. */
try {
  process.loadEnvFile();
} catch {}

import { writeFileSync } from "node:fs";
import { computeSavingsScore } from "../../src/lib/savings";
import { generateLetterText, renderLetterPdf } from "../../src/lib/letters";
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

  const { text, method } = await generateLetterText({
    score,
    ownerName: "Jane Q. Homeowner",
  });
  console.log(`method: ${method}\n`);
  console.log(text.slice(0, 1200));

  const pdf = await renderLetterPdf(text);
  writeFileSync("/tmp/appeal-letter-test.pdf", pdf);
  console.log(`\nPDF written to /tmp/appeal-letter-test.pdf (${pdf.length} bytes)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
