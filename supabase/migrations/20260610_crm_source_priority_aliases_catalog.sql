-- CRM source priority, fuzzy-match alias, and external CRM query catalog.
-- These tables keep Korean CRM operations explicit: Xiaoshouyi/app CRM data is
-- authoritative, leads are high-priority intake, and REV sheets are supporting
-- comparison data.

CREATE TABLE IF NOT EXISTS public.crm_source_priorities (
  source_system          TEXT PRIMARY KEY,
  label                  TEXT NOT NULL,
  priority               INTEGER NOT NULL CHECK (priority > 0),
  trust_tier             TEXT NOT NULL CHECK (trust_tier IN ('authoritative', 'high', 'medium', 'supporting', 'legacy')),
  is_primary             BOOLEAN NOT NULL DEFAULT false,
  read_policy            TEXT NOT NULL DEFAULT 'read',
  write_policy           TEXT NOT NULL DEFAULT 'disabled',
  freshness_window_hours INTEGER CHECK (freshness_window_hours IS NULL OR freshness_window_hours > 0),
  notes                  TEXT,
  metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_source_priorities_priority_idx
  ON public.crm_source_priorities (priority, source_system);

CREATE TABLE IF NOT EXISTS public.crm_match_aliases (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias                      TEXT NOT NULL,
  normalized_alias           TEXT NOT NULL,
  canonical_name             TEXT,
  normalized_canonical_name  TEXT,
  target_type                TEXT CHECK (target_type IS NULL OR target_type IN ('partner_account', 'customer', 'deal', 'lead')),
  target_id                  TEXT,
  source_system              TEXT,
  source_record_key          TEXT,
  manager_name               TEXT,
  normalized_manager_name    TEXT,
  confidence_boost           NUMERIC(5,4) NOT NULL DEFAULT 0.1000
    CHECK (confidence_boost >= 0 AND confidence_boost <= 0.5000),
  status                     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rejected', 'stale')),
  metadata                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_match_aliases_normalized_alias_idx
  ON public.crm_match_aliases (normalized_alias);

CREATE INDEX IF NOT EXISTS crm_match_aliases_target_idx
  ON public.crm_match_aliases (target_type, target_id, status);

CREATE INDEX IF NOT EXISTS crm_match_aliases_manager_idx
  ON public.crm_match_aliases (normalized_manager_name)
  WHERE normalized_manager_name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_match_aliases_active_unique_idx
  ON public.crm_match_aliases (
    normalized_alias,
    COALESCE(target_type, ''),
    COALESCE(target_id, ''),
    COALESCE(source_system, ''),
    COALESCE(normalized_manager_name, '')
  )
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.crm_xiaoshouyi_query_catalog (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_api_key      TEXT NOT NULL UNIQUE,
  source_system       TEXT NOT NULL DEFAULT 'xiaoshouyi',
  fields              TEXT[] NOT NULL,
  where_clause        TEXT,
  order_by            TEXT NOT NULL DEFAULT 'updatedAt DESC',
  page_size           INTEGER NOT NULL DEFAULT 100 CHECK (page_size > 0 AND page_size <= 100),
  max_pages           INTEGER NOT NULL DEFAULT 20 CHECK (max_pages > 0),
  sync_priority       INTEGER NOT NULL DEFAULT 100 CHECK (sync_priority > 0),
  is_default_enabled  BOOLEAN NOT NULL DEFAULT true,
  is_write_allowed    BOOLEAN NOT NULL DEFAULT false,
  notes               TEXT,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_xiaoshouyi_query_catalog_enabled_idx
  ON public.crm_xiaoshouyi_query_catalog (is_default_enabled, sync_priority, object_api_key);

DROP TRIGGER IF EXISTS crm_source_priorities_updated_at ON public.crm_source_priorities;
CREATE TRIGGER crm_source_priorities_updated_at
  BEFORE UPDATE ON public.crm_source_priorities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS crm_match_aliases_updated_at ON public.crm_match_aliases;
CREATE TRIGGER crm_match_aliases_updated_at
  BEFORE UPDATE ON public.crm_match_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS crm_xiaoshouyi_query_catalog_updated_at ON public.crm_xiaoshouyi_query_catalog;
CREATE TRIGGER crm_xiaoshouyi_query_catalog_updated_at
  BEFORE UPDATE ON public.crm_xiaoshouyi_query_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.crm_source_priorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_match_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_xiaoshouyi_query_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage crm source priorities" ON public.crm_source_priorities;
CREATE POLICY "Admins manage crm source priorities"
  ON public.crm_source_priorities
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins manage crm match aliases" ON public.crm_match_aliases;
CREATE POLICY "Admins manage crm match aliases"
  ON public.crm_match_aliases
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins manage crm xiaoshouyi query catalog" ON public.crm_xiaoshouyi_query_catalog;
CREATE POLICY "Admins manage crm xiaoshouyi query catalog"
  ON public.crm_xiaoshouyi_query_catalog
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

INSERT INTO public.crm_source_priorities (
  source_system,
  label,
  priority,
  trust_tier,
  is_primary,
  read_policy,
  write_policy,
  freshness_window_hours,
  notes,
  metadata
)
VALUES
  (
    'app_v2',
    'ClassIn app CRM',
    10,
    'authoritative',
    true,
    'read_write_internal',
    'internal_app',
    null,
    'Canonical admin CRM tables: partner_accounts, customers, deals, quotes, contracts, receipts.',
    '{"owner":"admin_crm"}'::jsonb
  ),
  (
    'xiaoshouyi',
    'Xiaoshouyi / eeoCRM',
    20,
    'high',
    true,
    'read_snapshot',
    'approval_queue_only',
    24,
    'External CRM snapshot is preferred over spreadsheet exports. Writes must pass crm_write_requests approval.',
    '{"mcp_policy":"inspect_only_for_personal_oauth","server_sync":"service_credential"}'::jsonb
  ),
  (
    'lead',
    'Inbound leads',
    30,
    'high',
    true,
    'read_intake',
    'convert_v2',
    24,
    'Lead intake is linked into CRM before spreadsheet reconciliation.',
    '{"matching":"name_org_owner_alias"}'::jsonb
  ),
  (
    'branch_rev_sheet',
    'Branch REV sheet',
    80,
    'supporting',
    false,
    'read_compare_only',
    'disabled',
    48,
    'Spreadsheet data is supporting comparison data and must not override CRM truth automatically.',
    '{"exclude_from_revenue_rollup":true}'::jsonb
  ),
  (
    'legacy_partner',
    'Legacy partner tables',
    90,
    'legacy',
    false,
    'read_migration_reference',
    'disabled',
    null,
    'Legacy tables remain available for migration and duplicate preflight only.',
    '{"migration_only":true}'::jsonb
  )
ON CONFLICT (source_system) DO UPDATE SET
  label = EXCLUDED.label,
  priority = EXCLUDED.priority,
  trust_tier = EXCLUDED.trust_tier,
  is_primary = EXCLUDED.is_primary,
  read_policy = EXCLUDED.read_policy,
  write_policy = EXCLUDED.write_policy,
  freshness_window_hours = EXCLUDED.freshness_window_hours,
  notes = EXCLUDED.notes,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.crm_xiaoshouyi_query_catalog (
  object_api_key,
  fields,
  order_by,
  page_size,
  max_pages,
  sync_priority,
  notes,
  metadata
)
VALUES
  (
    'account',
    ARRAY['id', 'accountName', 'ownerId', 'entityType', 'phone', 'createdAt', 'updatedAt'],
    'updatedAt DESC',
    100,
    20,
    10,
    'Account/company master data.',
    '{"displayNameFields":["accountName","name"],"ownerFields":["ownerName","ownerId-label","ownerId"],"statusFields":["status","entityType-label","entityType"],"occurredAtFields":["updatedAt","createdAt"]}'::jsonb
  ),
  (
    'contact',
    ARRAY['id', 'contactName', 'mobile', 'accountId', 'ownerId', 'createdAt', 'updatedAt'],
    'updatedAt DESC',
    100,
    20,
    20,
    'Contacts linked to account records.',
    '{"displayNameFields":["contactName","name"],"ownerFields":["ownerName","ownerId-label","ownerId"],"occurredAtFields":["updatedAt","createdAt"]}'::jsonb
  ),
  (
    'opportunity',
    ARRAY['id', 'opportunityName', 'money', 'ownerId', 'accountId', 'saleStageId', 'closeDate', 'createdAt', 'updatedAt'],
    'updatedAt DESC',
    100,
    20,
    30,
    'Opportunity/pipeline records.',
    '{"displayNameFields":["opportunityName","name"],"ownerFields":["ownerName","ownerId-label","ownerId"],"statusFields":["saleStageId-label","saleStageId","status"],"amountFields":["money","amount"],"occurredAtFields":["closeDate","updatedAt","createdAt"]}'::jsonb
  ),
  (
    'ShroffAccount__c',
    ARRAY['id', 'name', 'uid__c', 'schoolName__c', 'Account__c', 'expireTime__c', 'currency__c', 'CurrencyAmount__c', 'PersonHourMargin__c', 'serviceState__c', 'ServiceStatus__c', 'LastClassDate__c', 'createdAt', 'updatedAt'],
    'updatedAt DESC',
    100,
    20,
    40,
    'Service account/subscription object.',
    '{"displayNameFields":["schoolName__c","name","uid__c"],"statusFields":["ServiceStatus__c","serviceState__c"],"amountFields":["CurrencyAmount__c","currency__c"],"occurredAtFields":["expireTime__c","LastClassDate__c","updatedAt","createdAt"]}'::jsonb
  ),
  (
    'Collection__c',
    ARRAY['id', 'name', 'ownerId', 'Amount__c', 'ActualTime__c', 'CollectionDate__c', 'approvalStatus', 'Contract__c', 'orderAccountId__c', 'createdAt', 'updatedAt'],
    'updatedAt DESC',
    100,
    20,
    50,
    'Collection/payment records.',
    '{"displayNameFields":["name"],"ownerFields":["ownerName","ownerId-label","ownerId"],"statusFields":["approvalStatus-label","approvalStatus"],"amountFields":["Amount__c"],"occurredAtFields":["ActualTime__c","CollectionDate__c","updatedAt","createdAt"]}'::jsonb
  ),
  (
    'SalesPerformance__c',
    ARRAY['id', 'name', 'amount_Collected__c', 'GetDate__c', 'type__c', 'product_famliy__c', 'new_or_addon__c', 'Account__c', 'ShroffAccount__c', 'IsCheckedOver__c', 'AccountGet__c', 'ownerId', 'createdAt', 'updatedAt'],
    'updatedAt DESC',
    100,
    20,
    60,
    'Sales performance/payment attribution records.',
    '{"displayNameFields":["name","Account__c-label","ShroffAccount__c-label"],"ownerFields":["ownerName","ownerId-label","ownerId"],"statusFields":["type__c-label","type__c","new_or_addon__c-label","new_or_addon__c"],"amountFields":["amount_Collected__c"],"occurredAtFields":["GetDate__c","updatedAt","createdAt"]}'::jsonb
  ),
  (
    'CollectionPlan__c',
    ARRAY['id', 'name', 'EstimatedTime__c', 'collectStatus__c', 'Amount__c', 'accountId', 'ownerId', 'createdAt', 'updatedAt'],
    'updatedAt DESC',
    100,
    20,
    70,
    'Planned collection records.',
    '{"displayNameFields":["name","accountId-label"],"ownerFields":["ownerName","ownerId-label","ownerId"],"statusFields":["collectStatus__c-label","collectStatus__c"],"amountFields":["Amount__c"],"occurredAtFields":["EstimatedTime__c","updatedAt","createdAt"]}'::jsonb
  ),
  (
    'FinancialInformation__c',
    ARRAY['id', 'ShroffAccInfor__c', 'currency__c', 'AmountReal__c', 'GetDate__c', 'orderType__c', 'PaymentType__c', 'orderId__c', 'ServiceVersion__c', 'newType__c', 'refunded__c', 'createdAt', 'updatedAt'],
    'updatedAt DESC',
    100,
    20,
    80,
    'Financial transaction detail records.',
    '{"displayNameFields":["ShroffAccInfor__c-label","orderId__c"],"statusFields":["orderType__c-label","orderType__c","PaymentType__c-label","PaymentType__c"],"amountFields":["AmountReal__c","currency__c"],"occurredAtFields":["GetDate__c","updatedAt","createdAt"]}'::jsonb
  ),
  (
    'ResourceInformation__c',
    ARRAY['id', 'ShroffAccount__c', 'ChangeType__c', 'ChangeCause__c', 'ChangeDetail__c', 'ChangeNumber__c', 'ChangeTime__c', 'Margin__c', 'ServiceType__c', 'Amount__c', 'createdAt', 'updatedAt'],
    'updatedAt DESC',
    100,
    20,
    90,
    'Service/resource usage and change records.',
    '{"displayNameFields":["ShroffAccount__c-label","ChangeDetail__c"],"statusFields":["ChangeType__c-label","ChangeType__c","ServiceType__c-label","ServiceType__c"],"amountFields":["Amount__c","ChangeNumber__c"],"occurredAtFields":["ChangeTime__c","updatedAt","createdAt"]}'::jsonb
  )
ON CONFLICT (object_api_key) DO UPDATE SET
  fields = EXCLUDED.fields,
  order_by = EXCLUDED.order_by,
  page_size = EXCLUDED.page_size,
  max_pages = EXCLUDED.max_pages,
  sync_priority = EXCLUDED.sync_priority,
  notes = EXCLUDED.notes,
  metadata = EXCLUDED.metadata,
  updated_at = now();
