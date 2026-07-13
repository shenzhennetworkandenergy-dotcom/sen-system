import { redirectByRole, getCurrentUser } from "@/lib/auth/server";
import { LoginForm } from "@/components/auth/AuthForms";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) { if (await getCurrentUser()) await redirectByRole(); const sp = await searchParams; return <main className="flex min-h-screen items-center justify-center p-6"><LoginForm blocked={sp.status === "blocked"}/></main>; }
