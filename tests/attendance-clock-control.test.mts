import assert from "node:assert/strict";
import test from "node:test";

type AttendanceClockPresentation = {
  actionLabel: "CHECK IN NOW" | "CHECK OUT NOW" | null;
  actionValue: "check_in" | "check_out" | null;
  statusLabel: "Not Checked In" | "Checked In" | "Attendance Completed";
  statusDetail: string;
  tone: "pending" | "active" | "complete";
};

type PresentationModule = {
  getAttendanceClockPresentation: (
    state: "not_checked_in" | "checked_in" | "checked_out",
    checkInTime: string | null,
    checkOutTime: string | null,
  ) => AttendanceClockPresentation;
};

async function loadPresentationModule() {
  let presentationModule: PresentationModule | null = null;
  try {
    presentationModule = (await import(
      "../components/hr/attendance-clock-presentation.ts"
    )) as PresentationModule;
  } catch {
    // The first test run intentionally proves the presentation contract is absent.
  }
  assert.equal(
    typeof presentationModule?.getAttendanceClockPresentation,
    "function",
    "Attendance control presentation mapping must be implemented.",
  );
  assert.ok(presentationModule);
  return presentationModule.getAttendanceClockPresentation;
}

test("not checked in presents the fingerprint check-in action", async () => {
  const present = await loadPresentationModule();
  assert.deepEqual(present("not_checked_in", null, null), {
    actionLabel: "CHECK IN NOW",
    actionValue: "check_in",
    statusLabel: "Not Checked In",
    statusDetail: "Ready to record today’s attendance",
    tone: "pending",
  });
});

test("checked in presents check-out with the recorded check-in time", async () => {
  const present = await loadPresentationModule();
  assert.deepEqual(present("checked_in", "9:15:30 AM", null), {
    actionLabel: "CHECK OUT NOW",
    actionValue: "check_out",
    statusLabel: "Checked In",
    statusDetail: "Check-in time: 9:15:30 AM",
    tone: "active",
  });
});

test("checked out presents a completed, non-actionable attendance state", async () => {
  const present = await loadPresentationModule();
  assert.deepEqual(
    present("checked_out", "9:15:30 AM", "6:05:10 PM"),
    {
      actionLabel: null,
      actionValue: null,
      statusLabel: "Attendance Completed",
      statusDetail: "Check-in 9:15:30 AM · Check-out 6:05:10 PM",
      tone: "complete",
    },
  );
});
