import Image from "next/image";
import { routes } from "@/lib/constants/routes";
import { visibleAdminNavigation, visibleEmployeeNavigation } from "@/lib/navigation/dashboard";
import { DashboardNavigation } from "@/components/dashboard/DashboardNavigation";
import { ProductSearch } from "@/components/catalog/ProductSearch";
import { getDashboardWorkCounts, getEmployeeWorkCounts } from "@/lib/dashboard/work-counts";
import { getCurrentProfile } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { getEffectivePermissions } from "@/lib/auth/permissions";
import { ThemeSelector } from "@/components/ui/ThemeSelector";

type DashboardShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  admin?: boolean;
  employeePermissions?: Iterable<string>;
};

export async function DashboardShell({ title, subtitle, children, admin = false, employeePermissions }: DashboardShellProps) {
  const { profile } = await getCurrentProfile();
  const isAdmin = profile?.role === "admin";
  const resolvedEmployeePermissions = profile?.role === "employee"
    ? employeePermissions ?? await getEffectivePermissions(profile.id)
    : [];
  const navigation = isAdmin
    ? visibleAdminNavigation()
    : profile?.role === "employee"
      ? visibleEmployeeNavigation(resolvedEmployeePermissions)
      : [];
  const workCounts = isAdmin && admin
    ? await getDashboardWorkCounts()
    : profile?.role === "employee"
      ? await getEmployeeWorkCounts(profile.id, resolvedEmployeePermissions)
      : {};
  let avatarUrl: string | null = null;
  if (profile?.avatar_path) {
    const signed = await createSupabaseAdminClient().storage
      .from("profile-avatars")
      .createSignedUrl(profile.avatar_path, 3600);
    avatarUrl = signed.data?.signedUrl ?? null;
  }

  return <div className="sen-dashboard-shell min-h-screen">
    <header className="sen-dashboard-header sticky top-0 z-30 border-b bg-[#07152f] text-white shadow-lg backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[100rem] items-center justify-between gap-4 px-3 sm:px-5">
        <a href={routes.home} className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <span className="grid h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-sm">
            <Image src="/brand/sen-official-logo.png" alt="SEN logo" width={144} height={144} className="h-full w-full object-contain" priority />
          </span>
        </a>
        <ProductSearch compact className="hidden w-full max-w-md md:block" />
        <nav aria-label="Account navigation" className="flex shrink-0 items-center gap-1 text-xs font-semibold sm:gap-2 sm:text-sm">
          <ThemeSelector compact />
          <a href={routes.home} className="rounded-lg px-2.5 py-2 !text-slate-100 hover:bg-white/10 hover:!text-white sm:px-3">Public website</a>
          <a href={routes.profile} className="flex items-center gap-2 rounded-lg px-2 py-1.5 !text-slate-100 hover:bg-white/10 hover:!text-white">
            <ProfileAvatar imageUrl={avatarUrl} emoji={profile?.avatar_emoji} name={profile?.full_name} size={28} className="ring-1 ring-white/30" />
            <span className="hidden sm:inline">My Profile</span>
          </a>
          <a href={routes.logout} className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1.5 !text-white hover:bg-white/15 hover:!text-white sm:px-3">Logout</a>
        </nav>
      </div>
    </header>
    <div className={`mx-auto grid max-w-[100rem] gap-3 px-3 py-3 sm:px-5 sm:py-4 ${navigation.length ? "lg:grid-cols-[15rem_minmax(0,1fr)]" : ""}`}>
      {navigation.length ? <DashboardNavigation items={navigation} workCounts={workCounts}/> : null}
      <main className="sen-dashboard-content min-w-0">
        <div className="sen-dashboard-title mb-3 flex flex-col gap-0.5 rounded-xl border px-4 py-3 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="min-w-0"><h1 className="text-2xl font-bold tracking-tight sm:text-[1.7rem]">{title}</h1><p className="mt-0.5 max-w-4xl text-sm text-[var(--muted-text)]">{subtitle}</p></div>
        </div>
        {children}
      </main>
    </div>
  </div>;
}
