import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractDocument, incomeApproachValue, rentRollSchema, t12Schema } from "@/lib/extraction";
import { reconcileExtracted } from "@/lib/reconciliation";
import { analyzePropertyPhoto } from "@/lib/vision";
import { computeSavingsScore } from "@/lib/savings";
import { getPool } from "@/lib/db";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS-scoped read confirms the caller owns this document (or is admin).
  const { data: doc } = await supabase
    .from("documents")
    .select("id, client_id, parid, type, storage_bucket, storage_path, mime_type")
    .eq("id", id)
    .single();
  if (!doc) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!["rent_roll", "t12", "photo"].includes(doc.type)) {
    return NextResponse.json({ error: "not_processable" }, { status: 422 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "storage_unconfigured" }, { status: 503 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "anthropic_unconfigured", message: "Set ANTHROPIC_API_KEY to process documents." },
      { status: 503 }
    );
  }

  const admin = createAdminClient();
  await admin
    .from("documents")
    .update({ processing_status: "processing", updated_at: new Date().toISOString() })
    .eq("id", doc.id);

  try {
    const { data: blob, error: downloadError } = await admin.storage
      .from(doc.storage_bucket)
      .download(doc.storage_path);
    if (downloadError || !blob) {
      throw new Error(downloadError?.message ?? "download failed");
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mime = doc.mime_type ?? "application/octet-stream";

    let extracted: unknown = null;
    let needsReview = false;

    if (doc.type === "photo") {
      let context: { address?: string | null; useDesc?: string | null } = {};
      if (doc.parid) {
        const { rows } = await getPool().query(
          `select full_address, use_desc from parcels where parid = $1`,
          [doc.parid]
        );
        context = { address: rows[0]?.full_address, useDesc: rows[0]?.use_desc };
      }
      extracted = await analyzePropertyPhoto(bytes, mime, context);
    } else {
      extracted = await extractDocument(doc.type as "rent_roll" | "t12", bytes, mime);

      if (doc.type === "rent_roll" && extracted) {
        const rr = rentRollSchema.safeParse(extracted);
        if (rr.success) {
          const reconciliation = reconcileExtracted("rent_roll", rr.data);
          extracted = { ...rr.data, reconciliation };
          needsReview = !reconciliation.ok;
        }
      }

      if (doc.type === "t12" && extracted) {
        const t12 = t12Schema.safeParse(extracted);
        if (t12.success) {
          let useDesc: string | null = null;
          if (doc.parid) {
            const { rows } = await getPool().query(
              `select use_desc from parcels where parid = $1`,
              [doc.parid]
            );
            useDesc = rows[0]?.use_desc ?? null;
          }
          const reconciliation = reconcileExtracted("t12", t12.data);
          extracted = {
            ...t12.data,
            income_approach: incomeApproachValue(
              t12.data.net_operating_income,
              useDesc
            ),
            reconciliation,
          };
          needsReview = !reconciliation.ok;
        }
      }
    }

    if (!extracted) throw new Error("extraction returned no data");

    await admin
      .from("documents")
      .update({
        processing_status: "processed",
        extracted_json: extracted,
        needs_review: needsReview,
        updated_at: new Date().toISOString(),
      })
      .eq("id", doc.id);

    if (doc.type === "t12" && doc.parid) {
      await computeSavingsScore(doc.parid, { refresh: true }).catch((err) =>
        console.error("savings score refresh after T-12 failed", err)
      );
    }

    return NextResponse.json({ id: doc.id, status: "processed", extracted });
  } catch (err) {
    await admin
      .from("documents")
      .update({
        processing_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", doc.id);
    return NextResponse.json(
      { error: "processing_failed", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
