-- External CRM snapshot query performance hardening.
--
-- These indexes support admin CRM period dashboards and customer drill-downs
-- without changing table semantics. They are safe to apply after the
-- 20260610 external CRM snapshot/stale-tracking migrations.

create index if not exists external_crm_records_active_object_occurred_idx
  on public.external_crm_records (source_system, object_api_key, is_stale, occurred_at desc)
  where occurred_at is not null;

create index if not exists external_crm_records_active_object_external_idx
  on public.external_crm_records (source_system, object_api_key, is_stale, external_id);

create index if not exists external_crm_records_shroff_account_link_idx
  on public.external_crm_records ((payload ->> 'Account__c'), occurred_at desc)
  where source_system = 'xiaoshouyi'
    and object_api_key = 'ShroffAccount__c'
    and is_stale = false;

create index if not exists external_crm_records_opportunity_account_link_idx
  on public.external_crm_records ((payload ->> 'accountId'), occurred_at desc)
  where source_system = 'xiaoshouyi'
    and object_api_key = 'opportunity'
    and is_stale = false;

create index if not exists external_crm_records_collection_order_account_link_idx
  on public.external_crm_records ((payload ->> 'orderAccountId__c'), occurred_at desc)
  where source_system = 'xiaoshouyi'
    and object_api_key = 'Collection__c'
    and is_stale = false;

create index if not exists external_crm_records_salesperformance_account_link_idx
  on public.external_crm_records ((payload ->> 'Account__c'), occurred_at desc)
  where source_system = 'xiaoshouyi'
    and object_api_key = 'SalesPerformance__c'
    and is_stale = false;
