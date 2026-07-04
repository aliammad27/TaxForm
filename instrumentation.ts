import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { requireServerEnv } = await import("./src/lib/env");
    try {
      requireServerEnv();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (process.env.NODE_ENV === "production") {
        throw new Error(`TaxForm cannot start: ${message}`);
      }
      console.error(`\nTaxForm env warning: ${message}`);
      console.error("Parcel search and scoring need DATABASE_URL in .env\n");
    }
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
