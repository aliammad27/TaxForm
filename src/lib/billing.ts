import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "./stripe";

/** Returns true when DIY letter generation is allowed (paid or billing disabled). */
export async function hasDiyLetterAccess(
  clientId: string,
  appealId: string
): Promise<boolean> {
  if (!isStripeConfigured()) return true;

  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("id")
    .eq("client_id", clientId)
    .eq("appeal_id", appealId)
    .eq("type", "diy_flat")
    .eq("status", "paid")
    .maybeSingle();

  return Boolean(data);
}
