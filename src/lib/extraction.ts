import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODEL, getAnthropic, isAnthropicConfigured } from "./anthropic";

// -- Rent roll -----------------------------------------------------------------

export const rentRollSchema = z.object({
  as_of_date: z.string().nullable(),
  units: z.array(
    z.object({
      unit: z.string(),
      unit_type: z.string().nullable(),
      sqft: z.number().nullable(),
      tenant: z.string().nullable(),
      monthly_rent: z.number().nullable(),
      lease_end: z.string().nullable(),
      occupied: z.boolean(),
    })
  ),
  totals: z.object({
    unit_count: z.number(),
    occupied_count: z.number(),
    monthly_scheduled_rent: z.number(),
    occupancy_rate: z.number(),
  }),
  notes: z.string().nullable(),
});

export type RentRoll = z.infer<typeof rentRollSchema>;

// -- T-12 operating statement ----------------------------------------------------

export const t12Schema = z.object({
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  income: z.object({
    gross_potential_rent: z.number().nullable(),
    vacancy_loss: z.number().nullable(),
    other_income: z.number().nullable(),
    effective_gross_income: z.number(),
  }),
  expenses: z.object({
    taxes: z.number().nullable(),
    insurance: z.number().nullable(),
    utilities: z.number().nullable(),
    repairs_maintenance: z.number().nullable(),
    management: z.number().nullable(),
    other: z.number().nullable(),
    total_operating_expenses: z.number(),
  }),
  net_operating_income: z.number(),
  notes: z.string().nullable(),
});

export type T12 = z.infer<typeof t12Schema>;

/** Default market cap rates by rough property type for the income approach. */
export function incomeApproachValue(
  noi: number,
  useDesc: string | null
): { cap_rate: number; indicated_value: number } {
  const use = (useDesc ?? "").toUpperCase();
  let capRate = 0.085;
  if (use.includes("APART") || use.includes("MULTI")) capRate = 0.07;
  else if (use.includes("OFFICE")) capRate = 0.09;
  else if (use.includes("RETAIL") || use.includes("COMMERCIAL")) capRate = 0.08;
  else if (use.includes("WAREHOUSE") || use.includes("INDUST")) capRate = 0.075;
  return {
    cap_rate: capRate,
    indicated_value: noi > 0 ? Math.round(noi / capRate) : 0,
  };
}

// -- Claude structured extraction --------------------------------------------------

type ExtractableType = "rent_roll" | "t12";

const TOOL_CONFIG: Record<
  ExtractableType,
  { name: string; description: string; schema: Record<string, unknown> }
> = {
  rent_roll: {
    name: "submit_rent_roll",
    description: "Submit the structured rent roll extraction.",
    schema: {
      type: "object",
      properties: {
        as_of_date: { type: ["string", "null"] },
        units: {
          type: "array",
          items: {
            type: "object",
            properties: {
              unit: { type: "string" },
              unit_type: { type: ["string", "null"] },
              sqft: { type: ["number", "null"] },
              tenant: { type: ["string", "null"] },
              monthly_rent: { type: ["number", "null"] },
              lease_end: { type: ["string", "null"] },
              occupied: { type: "boolean" },
            },
            required: ["unit", "unit_type", "sqft", "tenant", "monthly_rent", "lease_end", "occupied"],
          },
        },
        totals: {
          type: "object",
          properties: {
            unit_count: { type: "number" },
            occupied_count: { type: "number" },
            monthly_scheduled_rent: { type: "number" },
            occupancy_rate: { type: "number" },
          },
          required: ["unit_count", "occupied_count", "monthly_scheduled_rent", "occupancy_rate"],
        },
        notes: { type: ["string", "null"] },
      },
      required: ["as_of_date", "units", "totals", "notes"],
    },
  },
  t12: {
    name: "submit_t12",
    description: "Submit the structured trailing-12-month operating statement extraction.",
    schema: {
      type: "object",
      properties: {
        period_start: { type: ["string", "null"] },
        period_end: { type: ["string", "null"] },
        income: {
          type: "object",
          properties: {
            gross_potential_rent: { type: ["number", "null"] },
            vacancy_loss: { type: ["number", "null"] },
            other_income: { type: ["number", "null"] },
            effective_gross_income: { type: "number" },
          },
          required: ["gross_potential_rent", "vacancy_loss", "other_income", "effective_gross_income"],
        },
        expenses: {
          type: "object",
          properties: {
            taxes: { type: ["number", "null"] },
            insurance: { type: ["number", "null"] },
            utilities: { type: ["number", "null"] },
            repairs_maintenance: { type: ["number", "null"] },
            management: { type: ["number", "null"] },
            other: { type: ["number", "null"] },
            total_operating_expenses: { type: "number" },
          },
          required: ["taxes", "insurance", "utilities", "repairs_maintenance", "management", "other", "total_operating_expenses"],
        },
        net_operating_income: { type: "number" },
        notes: { type: ["string", "null"] },
      },
      required: ["period_start", "period_end", "income", "expenses", "net_operating_income", "notes"],
    },
  },
};

function contentBlockFor(
  bytes: Uint8Array,
  mimeType: string
): Anthropic.ContentBlockParam | null {
  if (mimeType === "application/pdf") {
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: Buffer.from(bytes).toString("base64"),
      },
    };
  }
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/csv" ||
    mimeType === "text/csv"
  ) {
    return { type: "text", text: Buffer.from(bytes).toString("utf-8").slice(0, 150_000) };
  }
  if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType)) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: Buffer.from(bytes).toString("base64"),
      },
    };
  }
  return null;
}

/**
 * Commercial Document Ingestion Engine: extracts structured data from rent
 * rolls and T-12 operating statements (PDF, CSV/text, or image scans) via
 * Claude tool-use.
 */
export async function extractDocument(
  type: ExtractableType,
  bytes: Uint8Array,
  mimeType: string
): Promise<RentRoll | T12 | null> {
  if (!isAnthropicConfigured()) return null;

  const block = contentBlockFor(bytes, mimeType);
  if (!block) {
    throw new Error(
      `Unsupported file type ${mimeType}. Upload PDF, CSV/text, or an image scan.`
    );
  }

  const config = TOOL_CONFIG[type];
  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    system:
      type === "rent_roll"
        ? "You extract rent roll data for commercial property tax appeals. Extract every unit row faithfully. Compute totals from the extracted rows. Amounts are monthly USD unless the document clearly states otherwise. Do not invent data; use null for unreadable fields."
        : "You extract trailing-12-month (T-12) operating statement data for commercial property tax appeals. Extract annual totals in USD. Net operating income = effective gross income - total operating expenses (exclude debt service, depreciation, and capital expenditures). Do not invent data; use null for unreadable fields.",
    tools: [
      {
        name: config.name,
        description: config.description,
        input_schema: config.schema as Anthropic.Tool["input_schema"],
      },
    ],
    tool_choice: { type: "tool", name: config.name },
    messages: [{ role: "user", content: [block] }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return null;

  const parsed =
    type === "rent_roll"
      ? rentRollSchema.safeParse(toolUse.input)
      : t12Schema.safeParse(toolUse.input);
  return parsed.success ? parsed.data : null;
}
