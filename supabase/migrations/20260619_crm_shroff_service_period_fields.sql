-- Capture enough ShroffAccount fields to diagnose service-period drift.
-- The Admin CRM customer list still displays expireTime__c by default, but these
-- extra fields let operators compare contract/service expiry variants after the
-- next external CRM sync.

UPDATE public.crm_xiaoshouyi_query_catalog
SET
  fields = ARRAY[
    'id',
    'name',
    'uid__c',
    'schoolName__c',
    'Account__c',
    'expireTime__c',
    'DateBack__c',
    'ContractStartDate__c',
    'ContractEndDate__c',
    'service_version__c',
    'select_version__c',
    'Version__c',
    'currency__c',
    'currencyShow__c',
    'CurrencyAmount__c',
    'PersonHourMargin__c',
    'PriceType__c',
    'serviceState__c',
    'ServiceStatus__c',
    'LastClassDate__c',
    'createdAt',
    'updatedAt'
  ],
  metadata = jsonb_set(
    jsonb_set(
      jsonb_set(
        metadata,
        '{amountFields}',
        '["CurrencyAmount__c","currencyShow__c","currency__c"]'::jsonb,
        true
      ),
      '{occurredAtFields}',
      '["expireTime__c","DateBack__c","ContractEndDate__c","LastClassDate__c","updatedAt","createdAt"]'::jsonb,
      true
    ),
    '{servicePeriodFields}',
    '["expireTime__c","DateBack__c","ContractEndDate__c"]'::jsonb,
    true
  ),
  updated_at = now()
WHERE source_system = 'xiaoshouyi'
  AND object_api_key = 'ShroffAccount__c';
