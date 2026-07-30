import fs from "node:fs";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

if (process.argv.includes("--cloud")) {
  const content = fs.readFileSync(".env.cloud.local", "utf8");
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: products, error } = await db
  .from("products")
  .select("id,name")
  .eq("status", "active");
if (error) throw error;

let renamed = 0;
let mediaUpdated = 0;
for (const product of products ?? []) {
  const cleanedName = product.name
    .replace(/&\s+amp;/gi, "&")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (cleanedName !== product.name) {
    const { error: nameError } = await db
      .from("products")
      .update({ name: cleanedName, updated_at: new Date().toISOString() })
      .eq("id", product.id);
    if (nameError) throw nameError;
    renamed += 1;
  }
  const { count, error: mediaError } = await db
    .from("product_media")
    .update({ alt_text: cleanedName, updated_at: new Date().toISOString() })
    .eq("product_id", product.id)
    .eq("media_type", "image")
    .select("id", { count: "exact", head: true });
  if (mediaError) throw mediaError;
  mediaUpdated += count ?? 0;
}

console.log(
  `Cleaned ${renamed} product name(s) and refreshed ${mediaUpdated} image alt text record(s).`,
);
