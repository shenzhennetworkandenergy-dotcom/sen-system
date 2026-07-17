import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAdminKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export function hasSupabaseAdminConfig() {
  return Boolean(supabaseUrl && supabaseAdminKey);
}

export function getSupabaseAdminConfigError() {
  const missing = [
    supabaseUrl ? null : "NEXT_PUBLIC_SUPABASE_URL",
    supabaseAdminKey ? null : "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);

  return `Missing server-only Supabase admin configuration: ${missing.join(", ")}.`;
}

export function createSupabaseAdminClient() {
  if (!supabaseUrl || !supabaseAdminKey) {
    throw new Error(getSupabaseAdminConfigError());
  }

  return createClient(supabaseUrl, supabaseAdminKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
