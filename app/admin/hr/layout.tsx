import { requireHrAdmin } from "@/lib/hr/admin";

export default async function HrAdminLayout({ children }: { children: React.ReactNode }) {
  await requireHrAdmin();
  return children;
}
