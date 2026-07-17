export const profileRoles = ["admin", "employee", "customer"] as const;
export type ProfileRole = (typeof profileRoles)[number];

export const activeProfileStatus = "active";
export type ProfileStatus = "active" | "pending" | "suspended" | "disabled";

export type CurrentProfile = {
  id: string;
  role: ProfileRole;
  status: ProfileStatus;
  full_name: string | null;
};
