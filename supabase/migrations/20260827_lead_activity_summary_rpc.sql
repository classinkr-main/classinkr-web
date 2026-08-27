-- 리드 참여 신호 집계 RPC (2026-08-27).
--
-- lib/repositories/lead-activity.ts getLeadsActivitySummary() 는 네 테이블을 1000행씩
-- range 페이징으로 전량 끌어와 리드별 COUNT/MAX 만 만들었다. 산출물이 순수 GROUP BY 라
-- 원본 행을 앱까지 옮길 이유가 없고, CRM 홈 콜드에서는 우선순위 큐와 통합 스냅샷이
-- 같은 스캔을 각각 돌려 두 배로 들었다. 이 함수가 그 집계를 한 왕복으로 접는다.
--
-- 창(p_days): 활동 3종(client_events·material_downloads·lead_contact_logs)에만 건다.
-- user_profiles 는 "로그인 신원이 붙었나"라는 사실이지 활동이 아니라서 시간이 지나도
-- 소멸하지 않으므로 전 기간을 센다. 앱 경로에 남아 있던 user_profiles 무음 절단
-- (limit 없이 select → PostgREST 기본 1000행에서 조용히 잘림)도 여기서는 성립하지 않는다.
--
-- 반환이 table 이 아니라 jsonb 1건인 이유: PostgREST 의 행수 상한은 함수 결과에도 걸린다.
-- 리드가 상한을 넘는 순간 table 반환은 무음으로 잘리므로, 잘릴 수 없는 단일 값으로 돌린다.
-- 키는 리드 id, 값은 LeadActivityBadge 와 같은 camelCase 필드다.
--
-- 미적용 환경 안전: 호출부가 PGRST202/42883 을 잡아 기존 행 페이징 집계로 폴백한다.
--
-- 보조 인덱스는 이미 있는 것으로 충분하다 —
--   client_events_lead_id_idx (lead_id, created_at desc) where lead_id is not null
--   material_downloads_lead_created_idx (lead_id, created_at desc) where lead_id is not null
--   lead_contact_logs_contacted_at_idx (contacted_at, id) include (lead_id)
--   user_profiles_lead_id_idx (lead_id) where lead_id is not null

-- timezone 고정: 값이 jsonb 로 직렬화되므로 세션 TimeZone 이 그대로 오프셋 표기에 실린다.
-- 폴백(PostgREST 컬럼 직렬화)과 같은 UTC 표기를 보장하려고 함수에 못박는다.
create or replace function public.admin_lead_activity_summary(p_days integer default 90)
returns jsonb
language sql
stable
set timezone = 'UTC'
as $$
  with win as (
    select now() - make_interval(days => greatest(1, least(coalesce(p_days, 90), 3650))) as since
  ),
  profiles as (
    select
      p.lead_id,
      array_agg(distinct p.provider) filter (where p.provider is not null) as providers
    from public.user_profiles p
    where p.lead_id is not null
    group by p.lead_id
  ),
  -- 창 경계는 join 이 아니라 스칼라 서브쿼리로 읽는다. join 이면 필터가 조인 조건으로
  -- 남아 인덱스 범위 스캔을 못 쓰지만, 서브쿼리는 InitPlan 상수가 되어 스캔 경계가 된다.
  downloads as (
    select d.lead_id, count(*)::bigint as cnt, max(d.created_at) as last_at
    from public.material_downloads d
    where d.lead_id is not null
      and d.created_at >= (select since from win)
    group by d.lead_id
  ),
  events as (
    select e.lead_id, count(*)::bigint as cnt, max(e.created_at) as last_at
    from public.client_events e
    where e.lead_id is not null
      and e.created_at >= (select since from win)
    group by e.lead_id
  ),
  contacts as (
    select c.lead_id, count(*)::bigint as cnt, max(c.contacted_at) as last_at
    from public.lead_contact_logs c
    where c.lead_id is not null
      and c.contacted_at >= (select since from win)
    group by c.lead_id
  ),
  keys as (
    select lead_id from profiles
    union
    select lead_id from downloads
    union
    select lead_id from events
    union
    select lead_id from contacts
  )
  select coalesce(
    jsonb_object_agg(
      k.lead_id::text,
      jsonb_build_object(
        'authenticated', p.lead_id is not null,
        'providers', coalesce(p.providers, array[]::text[]),
        'downloadCount', coalesce(d.cnt, 0),
        'eventCount', coalesce(e.cnt, 0),
        'contactLogCount', coalesce(c.cnt, 0),
        -- greatest 는 NULL 을 무시한다(전부 NULL 일 때만 NULL) — 앱의 maxIso 와 같은 규약.
        'lastActivityAt', greatest(d.last_at, e.last_at),
        'lastContactAt', c.last_at
      )
    ),
    '{}'::jsonb
  )
  from keys k
  left join profiles p on p.lead_id = k.lead_id
  left join downloads d on d.lead_id = k.lead_id
  left join events e on e.lead_id = k.lead_id
  left join contacts c on c.lead_id = k.lead_id
$$;

comment on function public.admin_lead_activity_summary(integer) is
  '리드 id → 참여 신호(로그인·다운로드·이벤트·연락) 집계 맵. 활동 3종만 p_days 창을 적용하고 user_profiles 는 전 기간.';

-- 어드민 경로는 service role 클라이언트로만 호출한다.
revoke all on function public.admin_lead_activity_summary(integer) from public;
revoke all on function public.admin_lead_activity_summary(integer) from anon;
revoke all on function public.admin_lead_activity_summary(integer) from authenticated;
grant execute on function public.admin_lead_activity_summary(integer) to service_role;

notify pgrst, 'reload schema';
