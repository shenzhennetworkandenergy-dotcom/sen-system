export const attendanceStatuses = [
  "present",
  "absent",
  "late",
  "half_day",
  "leave",
  "holiday",
  "remote",
  "overtime",
  "holiday_overtime",
] as const;

export type AttendanceStatus = (typeof attendanceStatuses)[number];
export type EmploymentStatus = "active" | "probation" | "on_leave" | "terminated";
export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";
export type LeaveDecision = "approved" | "rejected";

export type EmployeeScheduleRow = {
  weekday: number;
  isWorking: boolean;
  startTime: string;
  endTime: string;
  timezone: string;
};

export type EmployeeInput = {
  profileId: string;
  jobTitle: string;
  hireDate: string;
  departmentId?: string | null;
  teamId?: string | null;
  designationId?: string | null;
  employmentType?: EmploymentType;
  employmentStatus?: EmploymentStatus;
  workLocationId?: string | null;
  managerProfileId?: string | null;
  baseSalary?: string | number | null;
  salaryCurrency?: string;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
};
