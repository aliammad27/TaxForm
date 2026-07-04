import { z } from "zod";
import { createAdminClient } from "./supabase/admin";
import { CLAUDE_MODEL, getAnthropic, isAnthropicConfigured } from "./anthropic";

export const conditionAnalysisSchema = z.object({
  overall_condition: z.enum(["excellent", "good", "average", "fair", "poor", "very_poor"]),
  condition_score: z.number().min(0).max(1),
  findings: z.array(
    z.object({
      issue: z.string(),
      severity: z.enum(["minor", "moderate", "major"]),
      estimated_cost_to_cure: z.number().nullable(),
    })
  ),
  summary: z.string(),
});

export type ConditionAnalysis = z.infer<typeof conditionAnalysisSchema>;

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * Computer Vision module: analyzes property photos with Claude vision and
 * returns structured condition findings that feed Comp Engine adjustments
 * and appeal letter evidence.
 */
export async function analyzePropertyPhoto(
  imageBytes: Uint8Array,
  mimeType: string,
  context: { address?: string | null; useDesc?: string | null } = {}
): Promise<ConditionAnalysis | null> {
  if (!isAnthropicConfigured()) return null;
  if (!MEDIA_TYPES.includes(mimeType as MediaType)) return null;

  const response = await getAnthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system:
      "You are a property condition inspector supporting tax assessment appeals. Analyze the photo and report observable condition issues factually. Only report what is visible; do not speculate. Severity: minor (cosmetic), moderate (functional wear), major (structural/systems). Estimate cost-to-cure in USD when a reasonable range is inferable, otherwise null.",
    tools: [
      {
        name: "submit_condition_analysis",
        description: "Submit the structured condition analysis of the photo.",
        input_schema: {
          type: "object" as const,
          properties: {
            overall_condition: {
              type: "string",
              enum: ["excellent", "good", "average", "fair", "poor", "very_poor"],
            },
            condition_score: {
              type: "number",
              description: "0 (very poor) to 1 (excellent)",
            },
            findings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  issue: { type: "string" },
                  severity: { type: "string", enum: ["minor", "moderate", "major"] },
                  estimated_cost_to_cure: { type: ["number", "null"] },
                },
                required: ["issue", "severity", "estimated_cost_to_cure"],
              },
            },
            summary: {
              type: "string",
              description: "2-3 sentences suitable for an appeal letter.",
            },
          },
          required: ["overall_condition", "condition_score", "findings", "summary"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_condition_analysis" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as MediaType,
              data: Buffer.from(imageBytes).toString("base64"),
            },
          },
          {
            type: "text",
            text: `Property: ${context.address ?? "unknown address"}${context.useDesc ? ` (${context.useDesc})` : ""}. Analyze visible condition.`,
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return null;
  const parsed = conditionAnalysisSchema.safeParse(toolUse.input);
  return parsed.success ? parsed.data : null;
}

/**
 * Aggregates processed photo analyses for a client's parcel into a text block
 * used by the Comp Engine and letter generator as condition evidence.
 */
export async function getConditionContext(
  clientId: string,
  parid: string
): Promise<string | undefined> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return undefined;

  const admin = createAdminClient();
  const { data: docs } = await admin
    .from("documents")
    .select("extracted_json")
    .eq("client_id", clientId)
    .eq("parid", parid)
    .eq("type", "photo")
    .eq("processing_status", "processed")
    .not("extracted_json", "is", null);

  if (!docs?.length) return undefined;

  const parts: string[] = [];
  for (const doc of docs) {
    const parsed = conditionAnalysisSchema.safeParse(doc.extracted_json);
    if (!parsed.success) continue;
    const a = parsed.data;
    const findings = a.findings
      .map(
        (f) =>
          `${f.issue} (${f.severity}${f.estimated_cost_to_cure ? `, est. cost to cure $${Math.round(f.estimated_cost_to_cure).toLocaleString()}` : ""})`
      )
      .join("; ");
    parts.push(
      `Photo analysis - overall condition ${a.overall_condition.replace("_", " ")}: ${a.summary}${findings ? ` Findings: ${findings}.` : ""}`
    );
  }
  return parts.length ? parts.join("\n") : undefined;
}
