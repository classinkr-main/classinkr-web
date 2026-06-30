-- Add 'call' and 'sms' to crm_customer_events.source_type.
-- The unified contact composer (콜/문자/메모/회의록) records direct contacts in the
-- customer 360 context; previously only manual_note/meeting_minutes were enterable.

ALTER TABLE public.crm_customer_events
  DROP CONSTRAINT IF EXISTS crm_customer_events_source_type_check;

ALTER TABLE public.crm_customer_events
  ADD CONSTRAINT crm_customer_events_source_type_check
  CHECK (source_type IN (
    'manual_note',
    'meeting_minutes',
    'recording',
    'calendar_event',
    'lead_contact_log',
    'external_crm',
    'sheet',
    'call',
    'sms'
  ));
