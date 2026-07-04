/**
 * Seeds the letter_chunks RAG store with Allegheny County appeal guidance and
 * letter-writing patterns. Content is grounded in BPAAR's published FAQ and
 * standard assessment-appeal practice.
 *
 *   npx tsx scripts/ingest/letter-chunks.ts
 */
import { getPool } from "./lib";
import {
  embedTexts,
  isVoyageConfigured,
  toVectorLiteral,
} from "../../src/lib/embeddings";

const CHUNKS: Array<{ source: string; title: string; content: string }> = [
  {
    source: "hearing_guidance",
    title: "What the Board considers",
    content:
      "The Board of Property Assessment Appeals and Review (BPAAR) hears two arguments: (1) the base year value as of January 1, 2012 is incorrect, or (2) the current market value, to which the Common Level Ratio is applied, is lower than the assessment implies. Most owner appeals argue current market value because the CLR creates a large wedge between market value and the correct assessed value.",
  },
  {
    source: "hearing_guidance",
    title: "Common Level Ratio application",
    content:
      "Allegheny County uses a 2012 base year. The State Tax Equalization Board publishes an annual Common Level Ratio; for tax year 2026 it is 50.14%. If an appellant proves a current market value of $100,000 at hearing, the assessed value becomes $50,140. The CLR is not applied automatically - the owner must file an appeal to receive its benefit.",
  },
  {
    source: "hearing_guidance",
    title: "Evidence the Board finds persuasive",
    content:
      "Persuasive evidence includes: recent arm's-length sales of similar properties (ideally within the last twelve months) in the same neighborhood and school district with close square footage, bedroom and bathroom counts; a recent appraisal performed for tax purposes; the recent purchase price of the subject property itself; photographs and contractor estimates documenting deferred maintenance or structural problems; and for income properties, rent rolls and operating statements supporting an income-approach value.",
  },
  {
    source: "hearing_guidance",
    title: "Burden of proof and tone",
    content:
      "The appellant bears the burden of proving market value. Hearings are brief and held by telephone, so written submissions should be organized, factual, and free of emotional argument. Lead with the strongest comparables, present the CLR math explicitly, and state a specific requested value. Board members are experienced in local real estate; overstated claims damage credibility.",
  },
  {
    source: "hearing_guidance",
    title: "Comparable sale adjustments",
    content:
      "When comparables differ from the subject, standard practice is to adjust the comparable's sale price toward the subject: add value for features the subject has and the comp lacks, subtract for features the comp has and the subject lacks. Typical adjustment categories: sale date (market conditions), gross living area, bathroom count, condition and grade, lot size, garage, and finished basement. Adjusted values should bracket the concluded market value.",
  },
  {
    source: "letter_pattern",
    title: "Letter structure",
    content:
      "Effective appeal letters follow this structure: (1) caption block with parcel ID, property address, owner, and tax year; (2) a one-paragraph statement of purpose stating the current assessment, the concluded market value, and the requested assessed value after CLR; (3) a property description; (4) a comparable sales analysis with a table of sales and adjustments; (5) the CLR calculation shown step by step; (6) any condition evidence; (7) a closing paragraph re-stating the requested value and listing attached exhibits.",
  },
  {
    source: "letter_pattern",
    title: "Statement of purpose example",
    content:
      "Example opening: 'This letter supports the annual assessment appeal for the property identified above. The property is currently assessed at $217,500. Recent arm's-length sales of comparable properties support a current fair market value of $331,900. Application of the 2026 Common Level Ratio of 50.14% yields an indicated assessed value of $166,400. The owner respectfully requests the assessment be reduced accordingly.'",
  },
  {
    source: "letter_pattern",
    title: "CLR calculation presentation",
    content:
      "Present the CLR math as a simple three-line calculation: 'Concluded fair market value: $X. Common Level Ratio (tax year YYYY): NN.NN%. Indicated assessed value: $X x NN.NN% = $Y.' Follow with one sentence comparing the indicated assessed value to the current assessment and stating the difference as the requested reduction.",
  },
  {
    source: "letter_pattern",
    title: "Condition evidence presentation",
    content:
      "When photographs document condition problems, describe each issue factually with its estimated cost to cure: 'The roof shows failed flashing and curling shingles (photo 3); a contractor estimate for replacement is $14,500.' Condition adjustments should tie to specific comps: if comparables are in average condition and the subject is in fair condition, apply a documented downward adjustment to the concluded value.",
  },
  {
    source: "hearing_guidance",
    title: "Filing window and process",
    content:
      "Annual appeals for a tax year are filed the preceding summer; for tax year 2026 the window ran July 1 to September 2, 2025. Appeals may be filed online through the county Real Estate Portal or by submitting the annual appeal form. Hearings are scheduled afterward and held by telephone. Both the school district and municipality receive notice and may participate as interested parties.",
  },
];

async function main() {
  const pool = getPool();
  console.log(
    `embedding ${CHUNKS.length} chunks with ${isVoyageConfigured() ? "Voyage" : "hashing fallback"}`
  );
  const embeddings = await embedTexts(
    CHUNKS.map((c) => `${c.title}\n${c.content}`),
    "document"
  );
  for (let i = 0; i < CHUNKS.length; i++) {
    const chunk = CHUNKS[i];
    // Upsert on title so switching embedding models re-embeds in place.
    await pool.query(
      `insert into letter_chunks (source, title, content, embedding)
       values ($1, $2, $3, $4::vector)
       on conflict (title) do update set
         source = excluded.source,
         content = excluded.content,
         embedding = excluded.embedding`,
      [chunk.source, chunk.title, chunk.content, toVectorLiteral(embeddings[i])]
    );
  }
  const { rows } = await pool.query(`select count(*) from letter_chunks`);
  console.log(`letter_chunks rows: ${rows[0].count}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
