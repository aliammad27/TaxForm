import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "text/csv",
  "application/csv",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error: "storage_unconfigured",
        message:
          "File storage requires the Supabase stack (SUPABASE_SERVICE_ROLE_KEY).",
      },
      { status: 503 }
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const type = String(form.get("type") || "other");
  const parid = String(form.get("parid") || "") || null;
  const appealId = String(form.get("appeal_id") || "") || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "unsupported_type", message: `Unsupported type ${file.type}` },
      { status: 415 }
    );
  }
  if (!["rent_roll", "t12", "photo", "other"].includes(type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }

  const admin = createAdminClient();
  const safeName = file.name.replace(/[^\w.-]/g, "_");
  const path = `${user.id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
    });
  if (uploadError) {
    return NextResponse.json(
      { error: "upload_failed", message: uploadError.message },
      { status: 500 }
    );
  }

  // Insert through the user's client so RLS applies to ownership.
  const { data: doc, error: insertError } = await supabase
    .from("documents")
    .insert({
      client_id: user.id,
      parid,
      appeal_id: appealId,
      type,
      storage_bucket: "documents",
      storage_path: path,
      original_name: file.name,
      mime_type: file.type,
      processing_status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !doc) {
    return NextResponse.json(
      { error: "insert_failed", message: insertError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: doc.id, status: "pending" });
}
