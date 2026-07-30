export type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "leave" | "holiday" | "remote";
export type EmploymentStatus = "active" | "probation" | "on_leave" | "terminated";
export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";
export type LeaveDecision = "approved" | "rejected";

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
