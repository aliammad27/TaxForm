import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeSavingsScore } from "@/lib/savings";
import { generateLetterText } from "@/lib/letters";
import { verifyLetter } from "@/lib/letter-verifier";
import { renderEvidencePackagePdf } from "@/lib/evidence-package";
import { getCountyAdapter } from "@/lib/counties/registry";
import { getConditionContext } from "@/lib/vision";

/** Generates the full evidence package PDF for an appeal. */
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

  // RLS restricts this to the owner (or an admin acting on their behalf).
  const { data: appeal } = await supabase
    .from("appeals")
    .select("id, client_id, parid, tax_year, status")
    .eq("id", id)
    .single();
  if (!appeal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("full_name, email, company")
    .eq("id", appeal.client_id)
    .single();

  const conditionContext = await getConditionContext(appeal.client_id, appeal.parid);

  const score = await computeSavingsScore(appeal.parid, { conditionContext });
  if (!score) {
    return NextResponse.json(
      { error: "no_score", message: "Could not value this parcel." },
      { status: 422 }
    );
  }

  const ownerName =
    client?.company || client?.full_name || client?.email || "Property Owner";
  const { text, method } = await generateLetterText({
    score,
    ownerName,
    conditionContext,
  });
  const verification = await verifyLetter(text, score);

  const window = await getCountyAdapter(score.county).appealWindow();
  const pdf = await renderEvidencePackagePdf({
    score,
    letterText: text,
    ownerName,
    window,
    conditionContext,
  });

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    const path = `${appeal.client_id}/${appeal.id}/evidence-package-${Date.now()}.pdf`;
    const { error: uploadError } = await admin.storage
      .from("letters")
      .upload(path, Buffer.from(pdf), { contentType: "application/pdf" });

    if (!uploadError) {
      await admin.from("documents").insert({
        client_id: appeal.client_id,
        parid: appeal.parid,
        appeal_id: appeal.id,
        type: "evidence_package",
        storage_bucket: "letters",
        storage_path: path,
        original_name: "evidence-package.pdf",
        mime_type: "application/pdf",
        processing_status: "processed",
        needs_review: !verification.ok,
        extracted_json: { method, text, verification },
      });
    }
  }

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="evidence-package-${appeal.parid}.pdf"`,
      "X-Letter-Method": method,
      "X-Letter-Verification": verification.ok ? "ok" : "failed",
    },
  });
}
