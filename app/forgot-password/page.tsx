import { PasswordHelpChat } from "@/components/auth/PasswordHelpChat";

export default async function ForgotPasswordPage({searchParams}:{searchParams:Promise<{success?:string;error?:string}>}){
  const notice=await searchParams;
  return <main className="mx-auto max-w-md px-6 py-16"><h1 className="text-3xl font-bold">Forgot password</h1><p className="mt-4 text-[var(--muted-text)]">Open a private support chat. An administrator can verify your request and securely set a temporary password.</p><PasswordHelpChat success={notice.success} error={notice.error}/><a href="/login" className="mt-5 block text-center font-semibold text-[var(--primary)]">Return to login</a></main>;
}
