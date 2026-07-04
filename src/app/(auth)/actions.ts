"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) return { error: error.message };
  redirect(String(formData.get("next") || "/dashboard"));
}

export async function signInWithMagicLink(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: String(formData.get("email")),
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  return { message: "Check your email for a sign-in link." };
}

export async function signUp(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const supabase = await createClient();
  const tier = String(formData.get("tier") || "residential_diy");
  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
    options: {
      data: {
        full_name: String(formData.get("full_name") || ""),
        tier,
      },
    },
  });
  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
