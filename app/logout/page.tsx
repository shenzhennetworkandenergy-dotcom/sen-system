import { logoutAction } from "@/lib/auth/actions";
export default function LogoutPage() { return <main className="p-8"><form action={logoutAction}><button className="rounded-lg bg-[var(--primary)] px-4 py-2 text-[var(--primary-foreground)]">Confirm logout</button></form></main>; }
