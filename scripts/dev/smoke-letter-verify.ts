/** Dev smoke test: letter verification catches corrupted figures. */
try {
  process.loadEnvFile();
} catch {}

import { computeSavingsScore } from "../../src/lib/savings";
import { generateLetterText } from "../../src/lib/letters";
import { verifyLetter } from "../../src/lib/letter-verifier";
import { getPool } from "../../src/lib/db";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

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

  if (!parid) throw new Error("no parcel found");

  const score = await computeSavingsScore(parid);
  if (!score) throw new Error("no score");

  const { text, method } = await generateLetterText({
    score,
    ownerName: "Jane Q. Homeowner",
  });
  console.log(`method: ${method}`);

  const clean = await verifyLetter(text, score);
  if (!clean.ok) {
    console.log("clean letter issues:", clean.issues);
  }
  assert(clean.ok, "clean letter passes verification");
  console.log(`checked ${clean.checked.length} items, method=${clean.method}`);

  const corrupted = text.replace(
    `$${Math.round(score.current_assessed).toLocaleString()}`,
    `$${Math.round(score.current_assessed * 1.5).toLocaleString()}`
  );
  const bad = await verifyLetter(corrupted, score);
  assert(!bad.ok, "corrupted letter fails verification");
  assert(bad.issues.length > 0, "corrupted letter reports issues");
  console.log(`caught ${bad.issues.length} issue(s):`, bad.issues[0]);

  await getPool().end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
