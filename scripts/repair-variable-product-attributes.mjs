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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase verification credentials are missing.");
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const aliases = new Map([
  ["Frequency (MHz)", "Frequency"],
  ["Storage Size (Form Factors )", "Form Factor"],
]);

for (const [oldName, newName] of aliases) {
  const { data: attribute, error } = await db
    .from("attributes")
    .select("id")
    .eq("name", oldName)
    .maybeSingle();
  if (error) throw error;
  if (!attribute) continue;
  const { error: updateError } = await db
    .from("attributes")
    .update({
      name: newName,
      slug: newName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", attribute.id);
  if (updateError) throw updateError;

  const { data: variations, error: variationError } = await db
    .from("product_variations")
    .select("id,combination_key")
    .ilike("combination_key", `%${oldName}=%`);
  if (variationError) throw variationError;
  for (const variation of variations ?? []) {
    const { error: keyError } = await db
      .from("product_variations")
      .update({
        combination_key: variation.combination_key.replace(
          `${oldName}=`,
          `${newName}=`,
        ),
        updated_at: new Date().toISOString(),
      })
      .eq("id", variation.id);
    if (keyError) throw keyError;
  }
}

const { data: products, error: productError } = await db
  .from("products")
  .select("id,name")
  .eq("product_type", "variable")
  .eq("status", "active");
if (productError) throw productError;

for (const product of products ?? []) {
  const [{ data: assignments, error: assignmentError }, { data: variations, error: variationError }] =
    await Promise.all([
      db
        .from("product_attributes")
        .select("attribute_id,attributes(name)")
        .eq("product_id", product.id),
      db
        .from("product_variations")
        .select("combination_key")
        .eq("product_id", product.id)
        .eq("status", "active"),
    ]);
  if (assignmentError) throw assignmentError;
  if (variationError) throw variationError;

  const usedNames = new Set(
    (variations ?? []).flatMap((variation) =>
      variation.combination_key
        .split("|")
        .map((part) => part.split("=")[0]?.trim())
        .filter(Boolean),
    ),
  );

  for (const assignment of assignments ?? []) {
    const relation = assignment.attributes;
    const attribute = Array.isArray(relation) ? relation[0] : relation;
    const isVariation = Boolean(attribute?.name && usedNames.has(attribute.name));
    const { error: updateError } = await db
      .from("product_attributes")
      .update({ is_variation: isVariation })
      .eq("product_id", product.id)
      .eq("attribute_id", assignment.attribute_id);
    if (updateError) throw updateError;
  }
  console.log(
    `${product.name}: ${[...usedNames].join(", ") || "no active variation attributes"}`,
  );
}

console.log("Variable-product attributes repaired and normalized.");
