-- Lead assignment preview/apply concurrency guard.
-- All current lead versions, selected-row invariants, the assignment, and its audit event
-- are checked/written in one transaction. The short table lock closes the insert race where
-- a duplicate-contact lead could appear after preview but before apply.

create or replace function public.assign_leads_guarded(
  p_ids uuid[],
  p_assigned_to text,
  p_expected_versions jsonb,
  p_actor_user_id text default null,
  p_actor_display_name text default null,
  p_actor_role text default null,
  p_reason_code text default null
)
returns setof public.leads
language plpgsql
security invoker
set search_path = public
as $$
declare
  requested_count integer;
  expected_count integer;
  current_count integer;
begin
  if p_assigned_to is null or btrim(p_assigned_to) = '' then
    raise exception using errcode = '22023', message = 'assigned owner is required';
  end if;
  if p_reason_code is null or btrim(p_reason_code) = '' then
    raise exception using errcode = '22023', message = 'assignment reason is required';
  end if;

  select count(distinct value)::integer
    into requested_count
    from unnest(coalesce(p_ids, array[]::uuid[])) as value;
  if requested_count = 0 then
    raise exception using errcode = '22023', message = 'lead ids are required';
  end if;

  -- Blocks concurrent lead INSERT/UPDATE/DELETE only for this short transaction.
  lock table public.leads in share row exclusive mode;

  select count(*)::integer into expected_count from jsonb_object_keys(coalesce(p_expected_versions, '{}'::jsonb));
  select count(*)::integer into current_count from public.leads;
  if expected_count <> current_count then
    raise exception using errcode = '40001', message = 'lead assignment snapshot changed';
  end if;

  if exists (
    select 1
    from public.leads l
    where not (p_expected_versions ? l.id::text)
       or (p_expected_versions ->> l.id::text) is null
       or l.updated_at <> (p_expected_versions ->> l.id::text)::timestamptz
  ) then
    raise exception using errcode = '40001', message = 'lead assignment snapshot changed';
  end if;

  if (
    select count(*)
    from public.leads l
    where l.id = any(p_ids)
      and l.status in ('new', 'contacted')
      and l.assigned_to is null
      and l.confirmed_at is not null
  ) <> requested_count then
    raise exception using errcode = '40001', message = 'lead assignment precondition changed';
  end if;

  return query
  update public.leads l
     set assigned_to = btrim(p_assigned_to)
   where l.id = any(p_ids)
  returning l.*;

  insert into public.audit_logs (
    actor_user_id,
    actor_display_name,
    actor_role,
    action,
    target_type,
    target_id,
    payload
  ) values (
    case
      when p_actor_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then p_actor_user_id::uuid
      else null
    end,
    nullif(btrim(p_actor_display_name), ''),
    nullif(btrim(p_actor_role), ''),
    'lead.assignment.bulk',
    'lead',
    null,
    jsonb_build_object(
      'leadIds', to_jsonb(p_ids),
      'assignedTo', btrim(p_assigned_to),
      'reasonCode', btrim(p_reason_code),
      'count', requested_count
    )
  );
end;
$$;

revoke all on function public.assign_leads_guarded(uuid[], text, jsonb, text, text, text, text) from public;
revoke all on function public.assign_leads_guarded(uuid[], text, jsonb, text, text, text, text) from anon;
revoke all on function public.assign_leads_guarded(uuid[], text, jsonb, text, text, text, text) from authenticated;
grant execute on function public.assign_leads_guarded(uuid[], text, jsonb, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
