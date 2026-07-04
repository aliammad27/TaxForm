import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ClientProfile = {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  tier: "residential_diy" | "commercial_contingency" | "full_service";
  role: "client" | "admin";
  referral_code: string | null;
};

/** Returns the signed-in user's client profile, redirecting to /login if absent. */
export async function requireClient(): Promise<ClientProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("clients")
    .select("id, email, full_name, company, tier, role, referral_code")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // A signed-in user without a clients row (e.g. migrations not applied)
    // must be signed out, otherwise /login redirects back to /dashboard
    // and the two redirects loop forever.
    await supabase.auth.signOut();
    redirect("/login");
  }
  return profile as ClientProfile;
}

export async function requireAdmin(): Promise<ClientProfile> {
  const profile = await requireClient();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}
