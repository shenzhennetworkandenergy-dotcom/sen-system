import { registerAction } from "@/lib/auth/form-actions";
import { redirectAuthenticatedUser } from "@/lib/auth/guards";

export default async function RegisterPage() {
  await redirectAuthenticatedUser();
  return <main className="grid min-h-screen place-items-center bg-[var(--muted-surface)] p-6"><form action={registerAction} className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm"><h1 className="text-2xl font-semibold">Create account</h1><p className="mt-2 text-sm text-[var(--muted-text)]">New accounts are created as customer accounts. SEN manages role and account status.</p><label className="mt-6 block text-sm font-semibold">Email<input name="email" type="email" required className="mt-2 w-full rounded border border-[var(--border)] bg-transparent p-3" /></label><label className="mt-4 block text-sm font-semibold">Password<input name="password" type="password" required className="mt-2 w-full rounded border border-[var(--border)] bg-transparent p-3" /></label><button className="mt-6 w-full rounded bg-[var(--primary)] px-4 py-3 font-semibold text-[var(--primary-foreground)]">Create account</button></form></main>;
}
