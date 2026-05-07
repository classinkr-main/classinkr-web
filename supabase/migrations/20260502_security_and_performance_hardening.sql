-- Security and performance hardening identified in the 2026-05-02 audit.

-- Branch dashboard tables contain sales/customer/hardware data and should not be
-- directly readable or mutable through anon/authenticated PostgREST roles.
alter table if exists public.branch_rev_deals enable row level security;
alter table if exists public.branch_hw_inbound enable row level security;
alter table if exists public.branch_hw_outbound enable row level security;
alter table if exists public.branch_hw_stock enable row level security;
alter table if exists public.branch_hw_sales_monthly enable row level security;
alter table if exists public.branch_dashboard_insights enable row level security;
alter table if exists public.branch_sync_runs enable row level security;

revoke all on table
  public.branch_rev_deals,
  public.branch_hw_inbound,
  public.branch_hw_outbound,
  public.branch_hw_stock,
  public.branch_hw_sales_monthly,
  public.branch_dashboard_insights,
  public.branch_sync_runs
from anon, authenticated;

grant all on table
  public.branch_rev_deals,
  public.branch_hw_inbound,
  public.branch_hw_outbound,
  public.branch_hw_stock,
  public.branch_hw_sales_monthly,
  public.branch_dashboard_insights,
  public.branch_sync_runs
to service_role;

revoke execute on function public.replace_branch_rev_deals(jsonb) from public, anon, authenticated;
revoke execute on function public.replace_branch_hw_inbound(jsonb) from public, anon, authenticated;
revoke execute on function public.replace_branch_hw_outbound(jsonb) from public, anon, authenticated;
revoke execute on function public.replace_branch_hw_stock(jsonb) from public, anon, authenticated;
revoke execute on function public.replace_branch_hw_sales_monthly(jsonb) from public, anon, authenticated;

grant execute on function public.replace_branch_rev_deals(jsonb) to service_role;
grant execute on function public.replace_branch_hw_inbound(jsonb) to service_role;
grant execute on function public.replace_branch_hw_outbound(jsonb) to service_role;
grant execute on function public.replace_branch_hw_stock(jsonb) to service_role;
grant execute on function public.replace_branch_hw_sales_monthly(jsonb) to service_role;

-- Views over RLS tables should evaluate with caller privileges.
alter view if exists public.customer_deal_summary set (security_invoker = true);
alter view if exists public.customer_deal_history set (security_invoker = true);

-- SECURITY DEFINER functions are callable by PUBLIC by default unless revoked.
revoke execute on function public.increment_promo_code_used_count(uuid) from public, anon, authenticated;
grant execute on function public.increment_promo_code_used_count(uuid) to service_role;

create unique index if not exists promo_code_redemptions_order_id_uidx
  on public.promo_code_redemptions(order_id);

create or replace function public.redeem_promo_code(
  p_promo_code_id uuid,
  p_order_id text,
  p_amount_before numeric,
  p_amount_after numeric,
  p_currency text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  locked public.promo_codes%rowtype;
begin
  select *
    into locked
    from public.promo_codes
   where id = p_promo_code_id
   for update;

  if not found then
    return false;
  end if;

  if locked.usage_limit is not null and locked.used_count >= locked.usage_limit then
    return false;
  end if;

  insert into public.promo_code_redemptions (
    promo_code_id,
    order_id,
    amount_before,
    amount_after,
    currency
  )
  values (
    p_promo_code_id,
    p_order_id,
    p_amount_before,
    p_amount_after,
    p_currency
  )
  on conflict (order_id) do nothing;

  if not found then
    return true;
  end if;

  update public.promo_codes
     set used_count = used_count + 1
   where id = p_promo_code_id;

  return true;
end;
$$;

revoke execute on function public.redeem_promo_code(uuid, text, numeric, numeric, text)
from public, anon, authenticated;
grant execute on function public.redeem_promo_code(uuid, text, numeric, numeric, text)
to service_role;

-- Composite indexes for common RLS checks, list screens, and dashboard sorts.
create index if not exists idx_partner_account_users_user_status_account
  on public.partner_account_users(user_id, status, partner_account_id);
create index if not exists idx_partner_users_user_status_partner
  on public.partner_users(user_id, status, partner_id);
create index if not exists idx_deals_partner_updated
  on public.deals(partner_account_id, updated_at desc);
create index if not exists idx_deals_customer_updated
  on public.deals(customer_id, updated_at desc);
create index if not exists idx_activity_logs_customer_created
  on public.activity_logs(customer_id, created_at desc);
create index if not exists idx_activity_logs_deal_created
  on public.activity_logs(deal_id, created_at desc);
create index if not exists idx_calendar_events_customer_starts
  on public.calendar_events(customer_id, starts_at desc);
create index if not exists idx_installation_events_deal_scheduled_active
  on public.installation_events(deal_id, scheduled_start_at)
  where status in ('planned', 'confirmed', 'in_progress');
create index if not exists idx_payments_v2_deal_paid
  on public.payments_v2(deal_id, paid_at desc);
create index if not exists idx_client_events_created
  on public.client_events(created_at desc);
create index if not exists idx_newsletter_subscribers_status_created
  on public.newsletter_subscribers(status, created_at desc);
create index if not exists idx_newsletter_subscribers_lower_email
  on public.newsletter_subscribers(lower(email));
create index if not exists idx_newsletter_subscribers_tags_gin
  on public.newsletter_subscribers using gin(tags);

alter table if exists public.client_events
  add constraint client_events_name_length_check
  check (char_length(event_name) between 1 and 80) not valid;

alter table if exists public.client_events
  add constraint client_events_page_length_check
  check (page is null or char_length(page) <= 300) not valid;

-- Signatures are legal evidence; the bucket should not be public.
update storage.buckets
   set public = false
 where id = 'signatures';
