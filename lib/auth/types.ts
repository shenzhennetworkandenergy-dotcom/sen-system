export type AccountRole = "admin" | "employee" | "customer";
export type AccountStatus = "active" | "suspended" | "disabled";
export type CustomerType = "individual" | "company";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  country_code: string;
  country_name: string;
  customer_type: CustomerType;
  company_name: string | null;
  role: AccountRole;
  status: AccountStatus;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  created_by: string | null;
  updated_by: string | null;
};
