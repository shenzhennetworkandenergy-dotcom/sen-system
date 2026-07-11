import { supabase } from "@/lib/supabase/client";

export default async function Home() {
  const { data, error } = await supabase
    .from("environment_check")
    .select("message")
    .limit(1)
    .single();

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">
          SEN Platform Environment Ready
        </h1>

        <p className="mt-4 text-lg">
          {error ? "Supabase connection failed" : data.message}
        </p>
      </div>
    </main>
  );
}