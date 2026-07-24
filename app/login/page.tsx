import Link from "next/link";
import { redirectAuthenticatedUser } from "@/lib/auth/session";
import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  await redirectAuthenticatedUser();
  const params = await searchParams;

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold">Login</h1>
      <p className="mt-2 text-sm text-[var(--muted-text)]">
        Sign in with the account configured for this environment.
      </p>
      {params.error ? (
        <div role="alert" className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-900">
          {params.error}
        </div>
      ) : null}
      {params.message ? (
        <div role="status" className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          {params.message}
        </div>
      ) : null}
      <form action={loginAction} className="mt-8 grid gap-4">
        <label className="font-semibold">
          Email
          <input name="email" type="email" autoComplete="email" required className="mt-1 w-full rounded-lg border p-3 font-normal focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </label>
        <label className="font-semibold">
          Password
          <input name="password" type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border p-3 font-normal focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
        </label>
        <button className="rounded-lg bg-[var(--primary)] px-4 py-3 font-bold text-[var(--primary-foreground)] transition hover:-translate-y-0.5 hover:shadow-lg">
          Login
        </button>
      </form>
      <p className="mt-4 text-sm">
        <Link href="/forgot-password">Forgot password?</Link>
        {" · "}
        <Link href="/register">Create account</Link>
      </p>
    </main>
  );
}
