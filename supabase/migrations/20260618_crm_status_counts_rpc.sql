-- CRM status-count aggregates.
--
-- Replaces the per-status COUNT round-trips in the CRM overview
-- (getSourceLinkCounts: 1 + N queries, getWriteQueueCounts: N queries — ~11 total)
-- with two GROUP BY functions returning all status counts in one round-trip each.
--
-- Non-breaking: callers prefer these RPCs and fall back to the prior per-status
-- COUNT loop on any error, so the app works before/after apply. The speedup
-- activates once this migration is applied.

-- Supporting indexes for the grouped counts --------------------------------
create index if not exists crm_source_links_status_idx
  on public.crm_source_links (status);

create index if not exists crm_write_requests_source_status_idx
  on public.crm_write_requests (source_system, status);

-- crm_source_links: count per status (caller sums for the total) ------------
create or replace function public.admin_crm_source_link_status_counts()
returns table (status text, cnt bigint)
language sql
stable
as $$
  select status, count(*)::bigint as cnt
  from public.crm_source_links
  group by status
$$;

-- crm_write_requests (xiaoshouyi): count per status -------------------------
create or replace function public.admin_crm_write_request_status_counts()
returns table (status text, cnt bigint)
language sql
stable
as $$
  select status, count(*)::bigint as cnt
  from public.crm_write_requests
  where source_system = 'xiaoshouyi'
  group by status
$$;

-- Grants — admin paths use the service role client -------------------------
grant execute on function public.admin_crm_source_link_status_counts() to service_role;
grant execute on function public.admin_crm_write_request_status_counts() to service_role;
