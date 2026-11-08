type ReminderCountRow = {
  beneficiary_id: string;
  support_month: string;
  reminder_day_of_month: number;
  status: string;
};

type BeneficiaryCountRow = {
  id: string;
  is_active: boolean;
  monthly_support_enabled: boolean;
  reminder_day_of_month: number | null;
  support_start_date: string | null;
  support_end_date: string | null;
};

// Match the dashboard's UTC calendar and the existing reminder-creation rules.
// Missing reminders are counted virtually; navigation must never create them.
export function countDueDonationSupports(
  reminders: readonly ReminderCountRow[],
  beneficiaries: readonly BeneficiaryCountRow[],
  now = new Date(),
): number {
  const today = now.toISOString().slice(0, 10);
  const month = `${today.slice(0, 7)}-01`;
  const existing = new Set<string>();
  const due = new Set<string>();
  const isDue = (day: number | null) => day !== null && Number.isInteger(day)
    && day >= 1 && day <= 28 && `${month.slice(0, 8)}${String(day).padStart(2, "0")}` <= today;

  for (const reminder of reminders) {
    if (reminder.support_month !== month) continue;
    existing.add(reminder.beneficiary_id);
    if (reminder.status === "PENDING" && isDue(reminder.reminder_day_of_month)) {
      due.add(reminder.beneficiary_id);
    }
  }

  for (const beneficiary of beneficiaries) {
    if (existing.has(beneficiary.id) || !beneficiary.is_active || !beneficiary.monthly_support_enabled
      || !beneficiary.support_start_date || beneficiary.support_start_date.slice(0, 7) > today.slice(0, 7)
      || (beneficiary.support_end_date !== null && beneficiary.support_end_date < month)) continue;
    if (isDue(beneficiary.reminder_day_of_month)) due.add(beneficiary.id);
  }
  return due.size;
}
