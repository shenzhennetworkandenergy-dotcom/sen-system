import type { SelfAttendanceState } from "@/lib/hr/self-attendance";

export type AttendanceClockPresentation = {
  actionLabel: "CHECK IN NOW" | "CHECK OUT NOW" | null;
  actionValue: "check_in" | "check_out" | null;
  statusLabel: "Not Checked In" | "Checked In" | "Attendance Completed";
  statusDetail: string;
  tone: "pending" | "active" | "complete";
};

export function getAttendanceClockPresentation(
  state: SelfAttendanceState,
  checkInTime: string | null,
  checkOutTime: string | null,
): AttendanceClockPresentation {
  if (state === "not_checked_in") {
    return {
      actionLabel: "CHECK IN NOW",
      actionValue: "check_in",
      statusLabel: "Not Checked In",
      statusDetail: "Ready to record today’s attendance",
      tone: "pending",
    };
  }

  if (state === "checked_in") {
    return {
      actionLabel: "CHECK OUT NOW",
      actionValue: "check_out",
      statusLabel: "Checked In",
      statusDetail: checkInTime
        ? `Check-in time: ${checkInTime}`
        : "Check-in recorded",
      tone: "active",
    };
  }

  const completedTimes = [
    checkInTime ? `Check-in ${checkInTime}` : null,
    checkOutTime ? `Check-out ${checkOutTime}` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    actionLabel: null,
    actionValue: null,
    statusLabel: "Attendance Completed",
    statusDetail:
      completedTimes.join(" · ") || "Today’s attendance has been completed",
    tone: "complete",
  };
}
