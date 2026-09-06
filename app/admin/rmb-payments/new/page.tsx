import { connection } from "next/server";

import { DashboardShell } from "@/components/dashboard/Shell";
import { RmbPaymentForm } from "@/app/admin/rmb-payments/new/RmbPaymentForm";
import { requireProfile } from "@/lib/auth/session";
import { getRmbCustomerOptions, getRmbSetupOptions } from "@/lib/rmb-payments/data";

export const dynamic = "force-dynamic";

export default async function NewRmbPaymentPage() {
  await connection();
  await requireProfile(["admin"]);
  const [customers, setup] = await Promise.all([
    getRmbCustomerOptions(),
    getRmbSetupOptions(),
  ]);

  return <DashboardShell admin title="Create RMB Payment Job" subtitle="Record an isolated foreign-currency China payment-service job.">
    <RmbPaymentForm customers={customers} currencies={setup.currencies} methods={setup.methods} />
  </DashboardShell>;
}
