-- Keep the existing notification table compatible with each concrete
-- quotation event emitted by notify_quotation_change().

alter table public.customer_notifications
  drop constraint if exists customer_notifications_notification_type_check;
alter table public.customer_notifications
  add constraint customer_notifications_notification_type_check check (
    notification_type in (
      'order_status','support_reply','system','quotation_status','quotation_expiry',
      'quotation_submitted','quotation_staff_new','quotation_assigned',
      'quotation_additional_info_required','quotation_approved',
      'quotation_rejected','quotation_expired','quotation_converted_to_invoice',
      'quotation_updated','quotation_expiring'
    )
  );
