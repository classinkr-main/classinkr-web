-- Internal CS copilot operational metrics (계약 1) — 서버측 단일 쿼리 집계.
--
-- 목적: /api/admin/cs-chat/metrics 의 계기판 행을 DB 안에서 한 번에 집계한다.
--   대량 행을 앱으로 끌어와 JS 로 접는 경로를 만들지 않고, 카운트·JSON 분류·백분위를
--   Postgres 에서 계산해 JSONB 1건으로 돌려준다.
--
-- 범위: range_days(기본 7)로 created_at 윈도를 잡는다. 모든 카운트는 동일 윈도를 공유하고,
--   리드타임 백분위는 "윈도 내 검토(reviewed_at)" 기준이다.
--
-- 근거 분류(evidenceMix): assistant 메시지 1건 = 정확히 한 버킷. 우선순위는
--   결정적 폴백(none) → 상담 사례(channel:) → 공개 문서(public_doc) → 그 외 지식(knowledge).
--   generate 라우트가 metadata.origin('deterministic') 과 source_refs(kind/id)에 기록한 값을 읽는다.
--
-- 안전: 마이그레이션 미적용 환경에서는 이 함수가 존재하지 않아 리포지토리가 not-ready 로 잡아
--   0/None 빈 shape 로 안전 렌더한다(코드 우선). service_role 전용.

create or replace function public.internal_cs_metrics(range_days integer default 7)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with win as (
    select
      greatest(1, least(coalesce(range_days, 7), 366)) as days,
      now() as to_ts,
      now() - make_interval(days => greatest(1, least(coalesce(range_days, 7), 366))) as from_ts
  ),
  msg as (
    select m.*
    from public.internal_cs_messages m, win
    where m.created_at >= win.from_ts
  ),
  assistant as (
    select
      m.review_state,
      m.regression_candidate,
      m.regression_outcome,
      case
        when (m.metadata->>'origin') = 'deterministic' then 'none'
        when exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(m.source_refs) = 'array' then m.source_refs else '[]'::jsonb end
          ) e
          where (e->>'id') like 'channel:%'
        ) then 'channel'
        when exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(m.source_refs) = 'array' then m.source_refs else '[]'::jsonb end
          ) e
          where (e->>'kind') = 'public_doc'
        ) then 'docs'
        else 'knowledge'
      end as evidence_bucket
    from msg m
    where m.role = 'assistant'
  ),
  reviewed as (
    select extract(epoch from (m.reviewed_at - m.created_at)) / 3600.0 as lead_hours
    from public.internal_cs_messages m, win
    where m.role = 'assistant'
      and m.reviewed_at is not null
      and m.reviewed_at >= win.from_ts
      and m.reviewed_at >= m.created_at
  )
  select jsonb_build_object(
    'days', (select days from win),
    'questions', (select count(*) from msg where role = 'user'),
    'conversations', (
      select count(*) from public.internal_cs_conversations c, win where c.created_at >= win.from_ts
    ),
    'assistantTotal', (select count(*) from assistant),
    'assistantDeterministic', (select count(*) from assistant where evidence_bucket = 'none'),
    'evidenceKnowledge', (select count(*) from assistant where evidence_bucket = 'knowledge'),
    'evidenceDocs', (select count(*) from assistant where evidence_bucket = 'docs'),
    'evidenceChannel', (select count(*) from assistant where evidence_bucket = 'channel'),
    'evidenceNone', (select count(*) from assistant where evidence_bucket = 'none'),
    'reviewApproved', (select count(*) from assistant where review_state = 'approved'),
    'reviewChangesRequested', (select count(*) from assistant where review_state = 'changes_requested'),
    'reviewPending', (select count(*) from assistant where review_state = 'pending'),
    'regressionNotEvaluated', (
      select count(*) from assistant where regression_candidate and regression_outcome = 'not_evaluated'
    ),
    'regressionPass', (
      select count(*) from assistant where regression_candidate and regression_outcome = 'pass'
    ),
    'regressionNeedsFix', (
      select count(*) from assistant where regression_candidate and regression_outcome = 'needs_fix'
    ),
    'regressionPromoted', (
      select count(*) from assistant where regression_candidate and regression_outcome = 'promoted'
    ),
    'regressionExcluded', (
      select count(*) from assistant where regression_candidate and regression_outcome = 'excluded'
    ),
    'leadTimeMedianHours', (
      select percentile_cont(0.5) within group (order by lead_hours) from reviewed
    ),
    'leadTimeP90Hours', (
      select percentile_cont(0.9) within group (order by lead_hours) from reviewed
    )
  )
$$;

comment on function public.internal_cs_metrics(integer) is
  '내부 CS 코파일럿 운영 계기판(계약 1) 단일 집계. range_days 윈도의 volume/fallback/evidenceMix/review/regression/leadTime 을 JSONB 1건으로 반환. 서버 서비스 롤 전용.';

revoke all on function public.internal_cs_metrics(integer) from public;
grant execute on function public.internal_cs_metrics(integer) to service_role;
