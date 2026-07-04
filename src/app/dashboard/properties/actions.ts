"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDatabaseReachable } from "@/lib/health";
import { searchParcels, type ParcelSummary } from "@/lib/parcels";
import {
  classifySearchFailure,
  searchErrorMessage,
} from "@/lib/search-errors";

export type SearchState = { results: ParcelSummary[]; error?: string };

export async function searchAction(
  _prev: SearchState,
  formData: FormData
): Promise<SearchState> {
  const query = String(formData.get("query") ?? "");
  if (query.trim().length < 3) {
    return { results: [], error: searchErrorMessage("validation") };
  }
  try {
    const results = await searchParcels(query, 10);
    return {
      results,
      error: results.length ? undefined : "No parcels matched that search.",
    };
  } catch (err) {
    const kind = await classifySearchFailure(err, isDatabaseReachable);
    return { results: [], error: searchErrorMessage(kind) };
  }
}

export async function addProperty(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("client_properties").insert({
    client_id: user.id,
    parid: String(formData.get("parid")),
    nickname: String(formData.get("nickname") || "") || null,
  });
  revalidatePath("/dashboard/properties");
}

export async function removeProperty(formData: FormData) {
  const supabase = await createClient();
  await supabase
    .from("client_properties")
    .delete()
    .eq("id", String(formData.get("id")));
  revalidatePath("/dashboard/properties");
}
