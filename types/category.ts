import type { CategoryFieldDefinition } from "@/lib/catalog/business-category-domain";

export type BusinessCategoryField = CategoryFieldDefinition & {
  id?: string;
  business_category_id?: string;
};

export type BusinessCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  tagline: string | null;
  themeColor: string;
  foregroundColor: "#ffffff" | "#10152f";
  icon: string | null;
  imagePath: string | null;
  imageUrl: string | null;
  active: boolean;
  sortOrder: number;
  productCount: number;
  fields: BusinessCategoryField[];
};

export type BusinessCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  tagline?: string | null;
  theme_color: string;
  icon?: string | null;
  image_path?: string | null;
  image_url?: string | null;
  is_active?: boolean | null;
  sort_order?: number | null;
  archived_at?: string | null;
  product_count?: number | null;
  fields?: BusinessCategoryField[] | null;
  business_category_fields?: BusinessCategoryField[] | null;
};
