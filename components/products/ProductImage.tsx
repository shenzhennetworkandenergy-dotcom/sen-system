import Image from "next/image";
import { getProductImage, type ProductCategory } from "@/components/products/productImages";

export function ProductImage({ title, category, image_url, image_alt }: { title: string; category: ProductCategory; image_url?: string | null; image_alt?: string | null }) {
  const image = getProductImage({ title, category, image_url, image_alt });
  return <Image src={image.src} alt={image.alt} width={900} height={600} sizes="(max-width: 768px) 100vw, 33vw" className="h-48 w-full rounded-[var(--radius-md)] object-cover" />;
}
