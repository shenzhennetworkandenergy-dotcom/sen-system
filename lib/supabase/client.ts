import { createBrowserClient } from "@supabase/ssr";
import { nativeBrowserClient } from "@/lib/storage/native-browser";

export const supabase = process.env.NEXT_PUBLIC_SEN_BACKEND === "native" ? nativeBrowserClient as unknown as ReturnType<typeof createBrowserClient> : createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);
