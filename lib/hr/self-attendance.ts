export type SelfAttendanceState = "not_checked_in" | "checked_in" | "checked_out";

export function getSelfAttendanceAvailability(
  attendance: { check_in?: string | null; check_out?: string | null } | null,
) {
  if (!attendance?.check_in) {
    return {
      canCheckIn: true,
      canCheckOut: false,
      state: "not_checked_in" as SelfAttendanceState,
    };
  }
  if (!attendance.check_out) {
    return {
      canCheckIn: false,
      canCheckOut: true,
      state: "checked_in" as SelfAttendanceState,
    };
  }
  return {
    canCheckIn: false,
    canCheckOut: false,
    state: "checked_out" as SelfAttendanceState,
  };
}
