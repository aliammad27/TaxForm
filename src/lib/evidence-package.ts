/**
 * Full evidence package PDF (Phase 7): cover page, county filing
 * instructions, the appeal letter, the CLR math table, comparable sale
 * pages, the condition report, and an exhibits checklist.
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { AppealWindow } from "./counties/types";
import type { SavingsScore } from "./savings";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72;
const BODY_SIZE = 11;
const LINE_H = 15;
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

class PdfWriter {
  page!: PDFPage;
  y = 0;

  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont
  ) {
    this.addPage();
  }

  addPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  private ensure(lines = 1) {
    if (this.y < MARGIN + lines * LINE_H) this.addPage();
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    if (!text) return [""];
    const words = text.split(" ");
    const out: string[] = [];
    let current = "";
    for (const word of words) {
      const attempt = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(attempt, size) > width && current) {
        out.push(current);
        current = word;
      } else {
        current = attempt;
      }
    }
    out.push(current);
    return out;
  }

  text(content: string, opts: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb>; indent?: number } = {}) {
    const font = opts.bold ? this.bold : this.font;
    const size = opts.size ?? BODY_SIZE;
    const indent = opts.indent ?? 0;
    for (const raw of content.split("\n")) {
      for (const line of this.wrap(raw, font, size, PAGE_W - MARGIN * 2 - indent)) {
        this.ensure();
        this.page.drawText(line, {
          x: MARGIN + indent,
          y: this.y,
          size,
          font,
          color: opts.color ?? INK,
        });
        this.y -= LINE_H;
      }
    }
  }

  heading(content: string) {
    this.ensure(3);
    this.y -= LINE_H * 0.5;
    this.text(content, { bold: true, size: 13 });
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + LINE_H * 0.6 },
      end: { x: PAGE_W - MARGIN, y: this.y + LINE_H * 0.6 },
      thickness: 0.5,
      color: MUTED,
    });
    this.y -= LINE_H * 0.4;
  }

  spacer(lines = 1) {
    this.y -= LINE_H * lines;
  }

  keyValue(rows: [string, string][]) {
    const labelWidth = 200;
    for (const [label, value] of rows) {
      this.ensure();
      this.page.drawText(label, {
        x: MARGIN,
        y: this.y,
        size: BODY_SIZE,
        font: this.font,
        color: MUTED,
      });
      const valueLines = this.wrap(
        value, this.font, BODY_SIZE, PAGE_W - MARGIN * 2 - labelWidth
      );
      for (const [i, line] of valueLines.entries()) {
        if (i > 0) this.ensure();
        this.page.drawText(line, {
          x: MARGIN + labelWidth,
          y: this.y,
          size: BODY_SIZE,
          font: this.font,
          color: INK,
        });
        this.y -= LINE_H;
      }
    }
  }
}

export type EvidencePackageInput = {
  score: SavingsScore;
  letterText: string;
  ownerName: string;
  window: AppealWindow;
  conditionContext?: string;
};

export async function renderEvidencePackagePdf(
  input: EvidencePackageInput
): Promise<Uint8Array> {
  const { score, letterText, ownerName, window: win } = input;
  const subject = score.comp_result.subject;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const w = new PdfWriter(doc, font, bold);

  // Cover page ---------------------------------------------------------------
  w.spacer(6);
  w.text("ASSESSMENT APPEAL EVIDENCE PACKAGE", { bold: true, size: 20 });
  w.spacer(2);
  w.keyValue([
    ["Property", subject.full_address ?? score.parid],
    ["Parcel ID", score.parid],
    ["County", `${score.county} County, Pennsylvania`],
    ["Owner", ownerName],
    ["Tax year under appeal", String(score.tax_year)],
    ["Appeal board", win.boardName],
    ["Filing deadline", win.filingDeadline],
    ["Prepared", new Date().toISOString().slice(0, 10)],
  ]);
  w.spacer(2);
  w.keyValue([
    ["Current assessed value", usd(score.current_assessed)],
    ["Concluded fair market value", usd(score.estimated_fmv)],
    [`Common Level Ratio (${score.tax_year})`, `${(score.clr * 100).toFixed(2)}%`],
    ["Requested assessed value", usd(score.implied_assessed)],
    ["Requested reduction", usd(score.assessment_reduction)],
  ]);

  // Filing instructions --------------------------------------------------------
  w.addPage();
  w.heading(`HOW TO FILE — ${score.county.toUpperCase()} COUNTY`);
  w.text(
    `Annual assessment appeals in ${score.county} County are decided by the ${win.boardName}. ` +
      `To be effective for tax year ${win.taxYear}, the appeal must be filed by ${win.filingDeadline}` +
      `${win.openDate ? ` (filings accepted from ${win.openDate})` : ""}.`
  );
  w.spacer();
  const steps = [
    `1. Complete the county's assessment appeal form${win.portalUrl ? ` (available at ${win.portalUrl})` : ""}.`,
    `2. Attach the appeal letter and the exhibits listed in the checklist at the end of this package.`,
    win.mailingAddress
      ? `3. Hand-deliver or mail the signed form and attachments to: ${win.mailingAddress}. Mailed filings must be postmarked or received by the deadline — retain proof of mailing.`
      : `3. File the signed form and attachments with the county assessment office by the deadline — retain proof of filing.`,
    `4. The board will schedule a hearing and notify you by mail (typically at least 20 days in advance). Bring this package and be prepared to walk through the comparable sales and the Common Level Ratio calculation.`,
  ];
  for (const step of steps) {
    w.text(step, { indent: 0 });
    w.spacer(0.4);
  }

  // Appeal letter ---------------------------------------------------------------
  w.addPage();
  w.heading("APPEAL LETTER");
  for (const line of letterText.split("\n")) {
    const isHeading =
      /^[A-Z][A-Z\s—-]{4,}$/.test(line.trim()) && line.trim().length < 60;
    w.text(line, { bold: isHeading });
  }

  // CLR math table ----------------------------------------------------------------
  w.addPage();
  w.heading("COMMON LEVEL RATIO CALCULATION");
  w.text(
    "Pennsylvania law entitles an appellant to an assessment equal to current market value multiplied by the county's Common Level Ratio (CLR), published annually by the State Tax Equalization Board."
  );
  w.spacer();
  w.keyValue([
    ["Concluded fair market value", usd(score.estimated_fmv)],
    [`Common Level Ratio (tax year ${score.tax_year})`, `${(score.clr * 100).toFixed(2)}%`],
    ["Indicated assessed value", `${usd(score.estimated_fmv)} x ${(score.clr * 100).toFixed(2)}% = ${usd(score.implied_assessed)}`],
    ["Current assessed value", usd(score.current_assessed)],
    ["Requested reduction", usd(score.assessment_reduction)],
  ]);
  if (score.valuation?.income_fmv) {
    w.spacer();
    w.text(
      `Two valuation approaches were considered: a sales-comparison value of ${usd(score.valuation.comp_fmv)} and an income-approach value of ${usd(score.valuation.income_fmv)}` +
        `${score.valuation.cap_rate ? ` (net operating income capitalized at ${(score.valuation.cap_rate * 100).toFixed(1)}%)` : ""}. ` +
        `The concluded value adopts the ${score.valuation.selected === "income" ? "income approach" : "sales comparison"}, the lower of the two.`
    );
  }

  // Comparable sales ---------------------------------------------------------------
  const comps = score.comp_result.comps;
  if (comps.length) {
    w.addPage();
    w.heading("COMPARABLE SALES");
    w.text(score.comp_result.narrative);
    for (const [i, comp] of comps.entries()) {
      w.spacer();
      w.text(`Comparable ${i + 1}: ${comp.address ?? comp.parid}`, { bold: true });
      w.keyValue([
        ["Parcel ID", comp.parid],
        ["Sale date", comp.sale_date ?? "n/a"],
        ["Sale price", usd(comp.sale_price)],
        ["Adjusted value", usd(comp.adjusted_value)],
        ["Weight", `${Math.round(comp.weight * 100)}%`],
      ]);
      for (const adj of comp.adjustments) {
        w.text(
          `- ${adj.reason}: ${adj.amount >= 0 ? "+" : ""}${usd(adj.amount)}`,
          { indent: 12 }
        );
      }
    }
  }

  // Condition report ----------------------------------------------------------------
  if (input.conditionContext) {
    w.addPage();
    w.heading("PROPERTY CONDITION REPORT");
    w.text(
      "The following condition findings were documented from photographs of the subject property and support a downward adjustment to value relative to average-condition comparables."
    );
    w.spacer();
    w.text(input.conditionContext);
  }

  // Exhibits checklist ----------------------------------------------------------------
  w.addPage();
  w.heading("EXHIBITS CHECKLIST");
  const exhibits = [
    "[ ] County assessment appeal form, signed and dated",
    "[ ] Appeal letter (included in this package)",
    "[ ] Comparable sales analysis (included in this package)",
    "[ ] Common Level Ratio calculation (included in this package)",
    ...(input.conditionContext
      ? ["[ ] Property condition report and photographs (photos attached separately)"]
      : ["[ ] Photographs of the subject property (recommended)"]),
    "[ ] Recent appraisal, if available",
    "[ ] Purchase documents (settlement statement), if the property sold recently",
    "[ ] For income properties: rent roll and trailing-12-month operating statement",
  ];
  for (const ex of exhibits) {
    w.text(ex);
    w.spacer(0.3);
  }

  return doc.save();
}
