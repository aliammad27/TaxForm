import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required for parcel search and scoring"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let validated: ServerEnv | null = null;

/** Validates required server env vars once; throws with a clear message on failure. */
export function requireServerEnv(): ServerEnv {
  if (validated) return validated;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  validated = parsed.data;
  return parsed.data;
}

/** Non-throwing check for health endpoints and graceful degradation. */
export function hasDatabaseUrl(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
