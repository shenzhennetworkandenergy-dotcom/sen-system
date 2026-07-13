import { getCurrentUser, redirectByRole } from "@/lib/auth/server";
import { RegisterForm } from "@/components/auth/AuthForms";
export default async function RegisterPage() { if (await getCurrentUser()) await redirectByRole(); return <main className="min-h-screen bg-[var(--muted-surface)] p-6 py-10"><RegisterForm /></main>; }
