import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeSavingsScore } from "@/lib/savings";
import { generateLetterText, renderLetterPdf } from "@/lib/letters";
import { verifyLetter } from "@/lib/letter-verifier";
import { hasDiyLetterAccess } from "@/lib/billing";
import { isStripeConfigured } from "@/lib/stripe";
import { getConditionContext } from "@/lib/vision";

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
    .select("full_name, email, company, tier")
    .eq("id", appeal.client_id)
    .single();

  if (
    client?.tier === "residential_diy" &&
    isStripeConfigured() &&
    !(await hasDiyLetterAccess(appeal.client_id, appeal.id))
  ) {
    return NextResponse.json(
      {
        error: "payment_required",
        message: "DIY tier requires payment before generating the appeal letter.",
      },
      { status: 402 }
    );
  }

  // Condition photo findings (CV module) feed the valuation and the letter.
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
  const pdf = await renderLetterPdf(text);

  // Persist to Storage + documents when the full stack is configured.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    const path = `${appeal.client_id}/${appeal.id}/appeal-letter-${Date.now()}.pdf`;
    const { error: uploadError } = await admin.storage
      .from("letters")
      .upload(path, Buffer.from(pdf), { contentType: "application/pdf" });

    if (!uploadError) {
      const { data: doc } = await admin
        .from("documents")
        .insert({
          client_id: appeal.client_id,
          parid: appeal.parid,
          appeal_id: appeal.id,
          type: "appeal_letter",
          storage_bucket: "letters",
          storage_path: path,
          original_name: "appeal-letter.pdf",
          mime_type: "application/pdf",
          processing_status: "processed",
          needs_review: !verification.ok,
          extracted_json: { method, text, verification },
        })
        .select("id")
        .single();

      if (doc) {
        const appealUpdate: {
          letter_document_id: string;
          target_value: number;
          updated_at: string;
          status?: string;
        } = {
          letter_document_id: doc.id,
          target_value: score.implied_assessed,
          updated_at: new Date().toISOString(),
        };
        if (verification.ok && appeal.status === "draft") {
          appealUpdate.status = "ready_to_file";
        }
        await admin.from("appeals").update(appealUpdate).eq("id", appeal.id);
      }
    }
  }

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="appeal-letter-${appeal.parid}.pdf"`,
      "X-Letter-Method": method,
      "X-Letter-Verification": verification.ok ? "ok" : "failed",
    },
  });
}
