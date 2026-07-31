import assert from "node:assert/strict";
import test from "node:test";

import {
  employeeHrNotificationColumns,
  mapEmployeeHrNotification,
} from "../lib/hr/notification-query.ts";

test("employee HR notifications use the deployed read_at schema", () => {
  assert.equal(
    employeeHrNotificationColumns,
    "id,title,message,read_at,created_at,entity_type,entity_id",
  );
  assert.deepEqual(
    mapEmployeeHrNotification({
      id: "notification-1",
      title: "Leave approved",
      message: "Your leave request was approved.",
      read_at: "2026-07-31T04:00:00.000Z",
      created_at: "2026-07-31T03:00:00.000Z",
      entity_type: "hr_leave_request",
      entity_id: "leave-1",
    }),
    {
      id: "notification-1",
      title: "Leave approved",
      message: "Your leave request was approved.",
      isRead: true,
      createdAt: "2026-07-31T03:00:00.000Z",
      entityType: "hr_leave_request",
      entityId: "leave-1",
    },
  );
});
