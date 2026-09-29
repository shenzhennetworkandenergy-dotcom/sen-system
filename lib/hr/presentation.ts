export type HrTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "special"
  | "neutral";

export type HrStatusPresentation = {
  label: string;
  tone: HrTone;
};

export const HR_URGENCY_THRESHOLDS = Object.freeze({
  criticalDays: 7,
  warningDays: 30,
  informationDays: 60,
});

const statusTones: Record<HrTone, ReadonlySet<string>> = {
  success: new Set([
    "active",
    "present",
    "approved",
    "completed",
    "paid",
    "confirmed",
    "documents_complete",
    "probation_completed",
    "on_time",
    "achieved",
    "fully_released",
  ]),
  warning: new Set([
    "pending",
    "late",
    "expiring_soon",
    "needs_attention",
    "partially_paid",
    "in_progress",
    "pending_review",
    "pending_hr_review",
    "correction_requested",
    "probation",
  ]),
  danger: new Set([
    "absent",
    "rejected",
    "terminated",
    "suspended",
    "overdue",
    "expired",
    "expired_contract",
    "failed",
    "critical",
  ]),
  info: new Set([
    "on_leave",
    "leave",
    "scheduled",
    "new_joiner",
    "remote",
    "half_day",
    "holiday",
    "submitted",
    "open",
  ]),
  special: new Set([
    "birthday",
    "anniversary",
    "performance",
    "review",
    "goal",
  ]),
  neutral: new Set([
    "inactive",
    "resigned",
    "archived",
    "draft",
    "not_applicable",
    "cancelled",
    "weekly_off",
    "not_set",
  ]),
};

const normalizeStatus = (value: string) =>
  value.trim().toLowerCase().replace(/[\s-]+/g, "_");

export function formatHrLabel(value: string) {
  const normalized = normalizeStatus(value);
  if (!normalized) return "Not set";
  return normalized
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getHrStatusPresentation(value: string): HrStatusPresentation {
  const normalized = normalizeStatus(value);
  const tone = (Object.keys(statusTones) as HrTone[]).find((item) =>
    statusTones[item].has(normalized),
  );
  return {
    label: formatHrLabel(normalized),
    tone: tone ?? "info",
  };
}

const utcDate = (value: string | Date) => {
  if (value instanceof Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return Number.isNaN(date.getTime()) ? null : date;
};

export function getHrDateUrgency(
  dueDate: string,
  referenceDate = new Date(),
): { daysRemaining: number; label: string; tone: HrTone } {
  const due = utcDate(dueDate);
  const reference = utcDate(referenceDate);
  if (!due || !reference) {
    return { daysRemaining: 0, label: "Date unavailable", tone: "neutral" };
  }
  const daysRemaining = Math.round(
    (due.getTime() - reference.getTime()) / 86_400_000,
  );
  if (daysRemaining < 0) {
    const elapsed = Math.abs(daysRemaining);
    return {
      daysRemaining,
      label: `Expired ${elapsed} ${elapsed === 1 ? "day" : "days"} ago`,
      tone: "danger",
    };
  }
  if (daysRemaining === 0) {
    return { daysRemaining, label: "Due today", tone: "danger" };
  }
  const label = `Due in ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"}`;
  if (daysRemaining <= HR_URGENCY_THRESHOLDS.criticalDays) {
    return { daysRemaining, label, tone: "danger" };
  }
  if (daysRemaining <= HR_URGENCY_THRESHOLDS.warningDays) {
    return { daysRemaining, label, tone: "warning" };
  }
  if (daysRemaining <= HR_URGENCY_THRESHOLDS.informationDays) {
    return { daysRemaining, label, tone: "info" };
  }
  return { daysRemaining, label, tone: "neutral" };
}

const monthAndDay = (value: string) => {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}` : null;
};

export function isBirthdayOn(dateOfBirth: string, onDate = new Date()) {
  return monthAndDay(dateOfBirth) === monthAndDay(onDate.toISOString());
}

export function isWorkAnniversaryOn(hireDate: string, onDate = new Date()) {
  const hireYear = Number(hireDate.slice(0, 4));
  return (
    Number.isInteger(hireYear) &&
    hireYear < onDate.getUTCFullYear() &&
    monthAndDay(hireDate) === monthAndDay(onDate.toISOString())
  );
}

export function clampHrProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function summarizeHrAttendance(rows: Array<{ status?: string | null }>) {
  const summary = {
    total: rows.length,
    present: 0,
    absent: 0,
    late: 0,
    onLeave: 0,
    other: 0,
  };
  for (const row of rows) {
    const status = normalizeStatus(String(row.status ?? ""));
    if (status === "present") summary.present += 1;
    else if (status === "absent") summary.absent += 1;
    else if (status === "late") summary.late += 1;
    else if (status === "leave" || status === "on_leave") summary.onLeave += 1;
    else summary.other += 1;
  }
  return summary;
}

type DashboardEmployee = {
  id: string;
  name: string;
  employmentStatus: string;
  hireDate?: string | null;
  probationEndDate?: string | null;
  departmentId?: string | null;
  dateOfBirth?: string | null;
};

export function buildHrDashboardPresentation(input: {
  referenceDate?: Date;
  employees: DashboardEmployee[];
  departments: Array<{ id: string; name: string }>;
  attendance: Array<{ employeeId?: string | null; status?: string | null }>;
  documents: Array<{ employeeId: string; name: string; expiresOn?: string | null }>;
  payroll: Array<{ status: string; netPay: number; currency: string }>;
  reviews: Array<{ rating: number; status: string }>;
  goals: Array<{ status: string }>;
}) {
  const referenceDate = input.referenceDate ?? new Date();
  const employeeNames = new Map(input.employees.map((employee) => [employee.id, employee.name]));
  const attendance = summarizeHrAttendance(input.attendance);
  const departmentCounts = new Map(input.departments.map((department) => [department.id, 0]));
  let unassigned = 0;
  for (const employee of input.employees) {
    if (employee.departmentId && departmentCounts.has(employee.departmentId)) {
      departmentCounts.set(employee.departmentId, (departmentCounts.get(employee.departmentId) ?? 0) + 1);
    } else unassigned += 1;
  }

  const alerts: Array<{
    label: string;
    detail: string;
    date: string;
    tone: HrTone;
  }> = [];
  for (const employee of input.employees) {
    if (employee.probationEndDate) {
      const urgency = getHrDateUrgency(employee.probationEndDate, referenceDate);
      if (urgency.daysRemaining <= HR_URGENCY_THRESHOLDS.informationDays) {
        alerts.push({
          label: `Probation · ${employee.name}`,
          detail: urgency.label,
          date: employee.probationEndDate,
          tone: urgency.tone,
        });
      }
    }
  }
  for (const document of input.documents) {
    if (!document.expiresOn) continue;
    const urgency = getHrDateUrgency(document.expiresOn, referenceDate);
    if (urgency.daysRemaining <= HR_URGENCY_THRESHOLDS.informationDays) {
      alerts.push({
        label: `${document.name} · ${employeeNames.get(document.employeeId) ?? "Employee"}`,
        detail: urgency.label,
        date: document.expiresOn,
        tone: urgency.tone,
      });
    }
  }
  alerts.sort((left, right) => left.date.localeCompare(right.date));

  const events: Array<{ type: "birthday" | "anniversary"; label: string; tone: HrTone }> = [];
  for (const employee of input.employees) {
    if (employee.dateOfBirth && isBirthdayOn(employee.dateOfBirth, referenceDate)) {
      events.push({ type: "birthday", label: `Birthday · ${employee.name}`, tone: "special" });
    }
    if (employee.hireDate && isWorkAnniversaryOn(employee.hireDate, referenceDate)) {
      events.push({ type: "anniversary", label: `Work anniversary · ${employee.name}`, tone: "special" });
    }
  }

  const netByCurrency: Record<string, number> = {};
  for (const record of input.payroll) {
    if (!["approved", "paid"].includes(normalizeStatus(record.status))) continue;
    const currency = String(record.currency || "BDT").toUpperCase();
    netByCurrency[currency] = (netByCurrency[currency] ?? 0) + Number(record.netPay || 0);
  }
  const finalizedReviews = input.reviews.filter((review) => normalizeStatus(review.status) === "finalized");
  const ratingTotal = finalizedReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);

  return {
    totalEmployees: input.employees.length,
    activeEmployees: input.employees.filter((employee) => normalizeStatus(employee.employmentStatus) === "active").length,
    attendance,
    departments: [
      ...input.departments.map((department) => ({ label: department.name, value: departmentCounts.get(department.id) ?? 0 })),
      ...(unassigned ? [{ label: "Unassigned", value: unassigned }] : []),
    ],
    alerts,
    events,
    payroll: {
      records: input.payroll.length,
      paid: input.payroll.filter((record) => normalizeStatus(record.status) === "paid").length,
      approved: input.payroll.filter((record) => normalizeStatus(record.status) === "approved").length,
      netByCurrency,
    },
    performance: {
      reviews: finalizedReviews.length,
      averageRating: finalizedReviews.length ? Number((ratingTotal / finalizedReviews.length).toFixed(2)) : 0,
      goals: input.goals.length,
      completedGoals: input.goals.filter((goal) => normalizeStatus(goal.status) === "completed").length,
    },
  };
}
