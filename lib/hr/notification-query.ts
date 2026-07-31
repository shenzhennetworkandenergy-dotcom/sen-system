export const employeeHrNotificationColumns =
  "id,title,message,read_at,created_at,entity_type,entity_id";

export type EmployeeHrNotificationRow = {
  id: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
  entity_type: string | null;
  entity_id: string | null;
};

export function mapEmployeeHrNotification(row: EmployeeHrNotificationRow) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    isRead: Boolean(row.read_at),
    createdAt: row.created_at,
    entityType: row.entity_type,
    entityId: row.entity_id,
  };
}
