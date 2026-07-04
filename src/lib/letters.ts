import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getPool } from "./db";
import { embedTexts, toVectorLiteral } from "./embeddings";
import { CLAUDE_MODEL, getAnthropic, isAnthropicConfigured, textFromMessage } from "./anthropic";
import { getCountyAdapter } from "./counties/registry";
import type { SavingsScore } from "./savings";

async function getBoardName(county: string): Promise<string> {
  try {
    const window = await getCountyAdapter(county).appealWindow();
    return window.boardName;
  } catch {
    return "County Board of Assessment Appeals";
  }
}

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

export type LetterInput = {
  score: SavingsScore;
  ownerName: string;
  conditionContext?: string;
};

type RagChunk = { source: string; title: string; content: string };

async function getRagContext(query: string, count = 5): Promise<RagChunk[]> {
  const [embedding] = await embedTexts([query], "query");
  const { rows } = await getPool().query<RagChunk>(
    `select source, title, content
     from match_letter_chunks($1::vector, $2)`,
    [toVectorLiteral(embedding), count]
  );
  return rows;
}

function compTable(score: SavingsScore): string {
  return score.comp_result.comps
    .map((c) => {
      const adj = c.adjustments
        .map((a) => `${a.reason}: ${a.amount >= 0 ? "+" : ""}${usd(a.amount)}`)
        .join("; ");
      return `- ${c.address} — sold ${c.sale_date} for ${usd(c.sale_price)}; adjustments: ${adj || "none"}; adjusted value ${usd(c.adjusted_value)}`;
    })
    .join("\n");
}

/** Deterministic letter used when Claude is unavailable. */
function templateLetter(input: LetterInput, boardName: string): string {
  const { score, ownerName } = input;
  const s = score.comp_result.subject;
  const clrPct = (score.clr * 100).toFixed(2);

  return `ANNUAL ASSESSMENT APPEAL — WRITTEN SUBMISSION

Parcel ID: ${score.parid}
Property: ${s.full_address}
Owner: ${ownerName}
Tax Year: ${score.tax_year}

To the ${boardName}:

This letter supports the annual assessment appeal for the property identified above. The property is currently assessed at ${usd(score.current_assessed)}. Recent arm's-length sales of comparable properties support a current fair market value of ${usd(score.estimated_fmv)}. Application of the ${score.tax_year} Common Level Ratio of ${clrPct}% yields an indicated assessed value of ${usd(score.implied_assessed)}. The owner respectfully requests that the assessment be reduced accordingly.

PROPERTY DESCRIPTION

The subject is a ${s.use_desc ?? s.class_desc ?? "property"} located in ${s.muni_desc ?? `${s.county} County`} (${s.school_desc ?? ""} School District)${s.finished_living_area ? ` with approximately ${Math.round(s.finished_living_area).toLocaleString()} square feet of finished living area` : ""}${s.bedrooms ? `, ${s.bedrooms} bedrooms` : ""}${s.full_baths ? `, ${s.full_baths} full bath(s)` : ""}${s.year_built ? `, built in ${s.year_built}` : ""}.

COMPARABLE SALES ANALYSIS

${compTable(score)}

${score.comp_result.narrative}

COMMON LEVEL RATIO CALCULATION

Concluded fair market value: ${usd(score.estimated_fmv)}
Common Level Ratio (tax year ${score.tax_year}): ${clrPct}%
Indicated assessed value: ${usd(score.estimated_fmv)} x ${clrPct}% = ${usd(score.implied_assessed)}

The indicated assessed value is ${usd(score.assessment_reduction)} below the current assessment of ${usd(score.current_assessed)}.
${input.conditionContext ? `\nPROPERTY CONDITION\n\n${input.conditionContext}\n` : ""}
CONCLUSION

Based on the comparable sales evidence and the application of the Common Level Ratio, the owner respectfully requests that the assessed value be set at ${usd(score.implied_assessed)} for tax year ${score.tax_year}.

Respectfully submitted,

${ownerName}`;
}

export async function generateLetterText(input: LetterInput): Promise<{
  text: string;
  method: "claude" | "template";
}> {
  const { score, ownerName } = input;
  const s = score.comp_result.subject;
  const boardName = await getBoardName(s.county);

  if (!isAnthropicConfigured()) {
    return { text: templateLetter(input, boardName), method: "template" };
  }

  const rag = await getRagContext(
    `assessment appeal letter comparable sales common level ratio ${s.class_desc ?? ""} ${input.conditionContext ? "property condition deferred maintenance" : ""}`
  );

  try {
    const response = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system: `You draft written submissions for ${s.county} County (PA) property assessment appeals before the ${boardName}. Write in plain, factual, professional prose. Never invent facts, comparables, or numbers - use only the data provided. Follow the structure and practices in the reference guidance. Output only the letter text, no commentary.

REFERENCE GUIDANCE:
${rag.map((c) => `[${c.title}] ${c.content}`).join("\n\n")}`,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            owner_name: ownerName,
            tax_year: score.tax_year,
            parcel: s,
            current_assessed: score.current_assessed,
            concluded_fmv: score.estimated_fmv,
            clr: score.clr,
            implied_assessed: score.implied_assessed,
            requested_reduction: score.assessment_reduction,
            comparable_sales: score.comp_result.comps,
            valuation_narrative: score.comp_result.narrative,
            condition_findings: input.conditionContext ?? null,
          }),
        },
      ],
    });
    return { text: textFromMessage(response), method: "claude" };
  } catch (err) {
    console.error("Claude letter generation failed; using template", err);
    return { text: templateLetter(input, boardName), method: "template" };
  }
}

/** Renders plain text into a simple letter-format PDF. */
export async function renderLetterPdf(text: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 72;
  const fontSize = 11;
  const lineHeight = 15;
  const maxWidth = pageWidth - margin * 2;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const wrap = (line: string, f = font): string[] => {
    if (!line) return [""];
    const words = line.split(" ");
    const out: string[] = [];
    let current = "";
    for (const word of words) {
      const attempt = current ? `${current} ${word}` : word;
      if (f.widthOfTextAtSize(attempt, fontSize) > maxWidth && current) {
        out.push(current);
        current = word;
      } else {
        current = attempt;
      }
    }
    out.push(current);
    return out;
  };

  for (const rawLine of text.split("\n")) {
    const isHeading =
      /^[A-Z][A-Z\s—-]{4,}$/.test(rawLine.trim()) && rawLine.trim().length < 60;
    const f = isHeading ? bold : font;
    for (const line of wrap(rawLine, f)) {
      if (y < margin + lineHeight) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, {
        x: margin,
        y,
        size: fontSize,
        font: f,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= lineHeight;
    }
  }

  return doc.save();
}
