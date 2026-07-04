/**
 * Embedding utilities.
 *
 * Two kinds of vectors are used in the platform:
 *
 * 1. Parcel characteristic vectors (16 dims) - deterministic, computed from
 *    normalized building characteristics. Used by pgvector for comp
 *    candidate retrieval. No external API calls, so 580k parcels can be
 *    embedded during ingestion for free.
 *
 * 2. Text embeddings (384 dims) - Voyage AI when VOYAGE_API_KEY is set
 *    (truncated Matryoshka embeddings, so 384 dims keeps the schema), with a
 *    deterministic feature-hashing fallback otherwise. The store and queries
 *    must share one space: re-run scripts/ingest/letter-chunks.ts after
 *    enabling or disabling Voyage.
 */

export const PARCEL_VECTOR_DIMS = 16;
export const TEXT_VECTOR_DIMS = 384;

export type ParcelCharacteristics = {
  finished_living_area: number | null;
  lot_area: number | null;
  bedrooms: number | null;
  full_baths: number | null;
  half_baths: number | null;
  total_rooms: number | null;
  year_built: number | null;
  stories: number | null;
  fireplaces: number | null;
  basement_garage: number | null;
  condition: string | null; // county condition code 1 (excellent) .. 8 (very poor)
  grade: string | null; // county grade code, e.g. 'A', 'B+', 'C'
  county_total: number | null;
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

const GRADE_SCALE: Record<string, number> = {
  XX: 1.0, // excellent+
  X: 0.95,
  A: 0.85,
  B: 0.7,
  C: 0.5,
  D: 0.3,
  E: 0.1,
};

function gradeScore(grade: string | null): number {
  if (!grade) return 0.5;
  const letter = grade.replace(/[^A-ZX]/gi, "").toUpperCase();
  const base = GRADE_SCALE[letter] ?? 0.5;
  const modifier = grade.includes("+") ? 0.05 : grade.includes("-") ? -0.05 : 0;
  return clamp01(base + modifier);
}

function conditionScore(condition: string | null): number {
  const code = Number(condition);
  if (!code || Number.isNaN(code)) return 0.5;
  // County codes: 1=excellent .. 8=very poor. Map to 1..0.
  return clamp01(1 - (code - 1) / 7);
}

/**
 * Normalizes parcel characteristics into a fixed-length vector where each
 * component is roughly 0..1, so L2 distance behaves as a similarity measure.
 * Weights emphasize living area, room counts, and age, which drive comp
 * selection in residential appraisal practice.
 */
export function parcelVector(c: ParcelCharacteristics): number[] {
  const sqft = c.finished_living_area ?? 0;
  const lot = c.lot_area ?? 0;
  const year = c.year_built ?? 0;

  const v = [
    2.0 * clamp01(sqft / 5000), // living area (heaviest weight)
    1.0 * clamp01(Math.log10(Math.max(lot, 1)) / 6), // lot area, log scale
    1.5 * clamp01((c.bedrooms ?? 0) / 8),
    1.5 * clamp01(((c.full_baths ?? 0) + 0.5 * (c.half_baths ?? 0)) / 6),
    0.8 * clamp01((c.total_rooms ?? 0) / 15),
    1.2 * (year >= 1800 ? clamp01((year - 1800) / 226) : 0.5),
    0.6 * clamp01((c.stories ?? 1) / 3),
    0.4 * clamp01((c.fireplaces ?? 0) / 3),
    0.4 * clamp01((c.basement_garage ?? 0) / 3),
    1.0 * conditionScore(c.condition),
    1.0 * gradeScore(c.grade),
    0.8 * clamp01(Math.log10(Math.max(c.county_total ?? 1, 1)) / 7),
    0,
    0,
    0,
    0, // reserved dims for future signals (e.g. CV condition score)
  ];
  return v.slice(0, PARCEL_VECTOR_DIMS);
}

/** FNV-1a 32-bit hash, used for the hashing-trick text embedding. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const grams: string[] = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    grams.push(`${words[i]}_${words[i + 1]}`);
  }
  return grams;
}

/**
 * Feature-hashing text embedding: tokens (unigrams + bigrams) hashed into a
 * fixed-dim vector with signed buckets, then L2-normalized. Deterministic,
 * offline, and good enough for retrieving topically similar letter chunks.
 */
export function textEmbedding(text: string): number[] {
  const v = new Array(TEXT_VECTOR_DIMS).fill(0);
  for (const token of tokenize(text)) {
    const h = fnv1a(token);
    const idx = h % TEXT_VECTOR_DIMS;
    const sign = (h >>> 16) % 2 === 0 ? 1 : -1;
    v[idx] += sign;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

const VOYAGE_MODEL = "voyage-3.5-lite";

/**
 * Voyage text embeddings, truncated to the store's 384 dims. Voyage's
 * Matryoshka-trained models keep most of their quality under truncation, so
 * we request the smallest dimension above 384 (512) and slice + renormalize.
 */
async function voyageEmbedding(
  texts: string[],
  inputType: "query" | "document"
): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: inputType,
      output_dimension: 512,
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    data: { index: number; embedding: number[] }[];
  };
  return json.data
    .sort((a, b) => a.index - b.index)
    .map(({ embedding }) => {
      const v = embedding.slice(0, TEXT_VECTOR_DIMS);
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    });
}

export function isVoyageConfigured(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

/**
 * Text embeddings for the letter RAG store: Voyage when configured, hashing
 * fallback otherwise. Both sides (chunk ingestion and query) call this, so
 * they stay in the same embedding space.
 */
export async function embedTexts(
  texts: string[],
  inputType: "query" | "document"
): Promise<number[][]> {
  if (isVoyageConfigured()) {
    try {
      return await voyageEmbedding(texts, inputType);
    } catch (err) {
      console.error("Voyage embedding failed; using hashing fallback", err);
    }
  }
  return texts.map(textEmbedding);
}

/** Formats a JS number array as a pgvector literal. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.map((x) => Number(x.toFixed(6))).join(",")}]`;
}
