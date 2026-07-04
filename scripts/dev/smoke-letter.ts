/** Dev smoke test: generates an appeal letter PDF for a sample parcel. */
try {
  process.loadEnvFile();
} catch {}

import { writeFileSync } from "node:fs";
import { GOLDEN_RESIDENTIAL_PARID } from "../../src/lib/golden-parcels";
import { computeSavingsScore } from "../../src/lib/savings";
import { generateLetterText, renderLetterPdf } from "../../src/lib/letters";
import { getPool } from "../../src/lib/db";

async function main() {
  const parid = process.argv[2] ?? GOLDEN_RESIDENTIAL_PARID;

  const score = await computeSavingsScore(parid);
  if (!score) throw new Error(`no score for ${parid} — is the seed fixture loaded?`);

  const { text, method } = await generateLetterText({
    score,
    ownerName: "Jane Q. Homeowner",
  });
  console.log(`method: ${method}\n`);
  console.log(text.slice(0, 1200));

  const pdf = await renderLetterPdf(text);
  writeFileSync("/tmp/appeal-letter-test.pdf", pdf);
  console.log(`\nPDF written to /tmp/appeal-letter-test.pdf (${pdf.length} bytes)`);
  await getPool().end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
