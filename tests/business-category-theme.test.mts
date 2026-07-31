import assert from "node:assert/strict";
import test from "node:test";

import {
  categoryStyle,
  catalogueTheme,
  fallbackBusinessCategory,
  toBusinessCategory,
} from "../lib/catalog/themes.ts";

test("maps a database category into a serializable category view model", () => {
  assert.deepEqual(
    toBusinessCategory({
      id: "0d22fcce-f12f-466f-935d-f7eb22180c68",
      name: "Clothing",
      slug: "clothing",
      description: "Apparel and uniforms",
      tagline: "Purpose-built clothing",
      theme_color: "#6F42C1",
      icon: "◈",
      image_path: null,
      is_active: true,
      sort_order: 50,
      archived_at: null,
    }),
    {
      id: "0d22fcce-f12f-466f-935d-f7eb22180c68",
      name: "Clothing",
      slug: "clothing",
      description: "Apparel and uniforms",
      tagline: "Purpose-built clothing",
      themeColor: "#6F42C1",
      foregroundColor: "#ffffff",
      icon: "◈",
      imagePath: null,
      imageUrl: null,
      active: true,
      sortOrder: 50,
      productCount: 0,
      fields: [],
    },
  );
});

test("creates CSS variables from the saved category color", () => {
  const category = {
    ...fallbackBusinessCategory,
    themeColor: "#FD7E14",
    foregroundColor: "#10152f" as const,
  };
  assert.deepEqual(categoryStyle(category), {
    "--category-color": "#FD7E14",
    "--category-foreground": "#10152f",
    "--theme-primary": "#FD7E14",
  });
});

test("returns a neutral fallback for absent category records", () => {
  assert.equal(catalogueTheme(null), fallbackBusinessCategory);
  assert.equal(fallbackBusinessCategory.slug, "uncategorized");
  assert.equal(fallbackBusinessCategory.themeColor, "#245FC8");
});
