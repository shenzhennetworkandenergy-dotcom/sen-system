const actionLabels: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "account.access_changed": "Account access changed",
  "account.role_changed": "Role changed",
  "account.status_changed": "Account status changed",
  "permissions.template_assigned": "Permission template assigned",
  "permissions.overrides_updated": "Permission overrides updated",
  "permissions.template_created": "Permission template created",
  "permissions.template_updated": "Permission template updated",
  "permissions.template_duplicated": "Permission template duplicated",
  "permissions.template_status_changed": "Permission template status changed",
  "permissions.reset_to_template": "Permissions reset to template",
};

export function activityLabel(action: string) {
  return actionLabels[action] ?? action.split(/[._]/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

export function formatActivityTime(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function safeJsonSummary(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 8);
  return entries.length ? entries.map(([key, item]) => `${key}: ${typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? String(item) : "updated"}`).join(" · ") : null;
}
