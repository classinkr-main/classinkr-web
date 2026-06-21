-- Speed up /api/portal/documents quote interaction summaries.
-- The route fetches public quote view/review/accept logs by document target in bulk.
create index if not exists idx_activity_logs_quote_document_interactions
  on public.activity_logs(target_id, created_at desc)
  where target_type = 'quote_document'
    and action_type in (
      'public_quote_view',
      'public_quote_review_confirmed',
      'public_quote_accepted'
    );

create index if not exists idx_quote_documents_deal_updated
  on public.quote_documents(deal_id, updated_at desc);

create index if not exists idx_contract_documents_deal_updated
  on public.contract_documents(deal_id, updated_at desc);

create index if not exists idx_receipts_v2_deal_updated
  on public.receipts_v2(deal_id, updated_at desc);
