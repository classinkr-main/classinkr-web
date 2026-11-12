-- 챗봇 대리 접수(구 [LEAD_SUBMIT] 경로) 기존 행 감사 — 읽기 전용, 아직 실행하지 않음.
--
-- 배경: 이전 챗봇은 [LEAD_SUBMIT:name,phone,org,event] 토큰을 받아 saveLead 를 직접 호출했다.
--   source='contact_page'(위장), source_detail='chatbot_assist_registration',
--   notes='[event:<행사명>] 챗봇을 통한 자동 세미나 대리 신청 리드'.
--   submitLeadCapture 를 거치지 않아 Compass 전달·광고 전환·동의 기록·중복 가드가 빠졌을 수 있다.
-- 브랜치 fix/chatbot-lead-capture 에서 이 경로는 삭제됐다(새 챗봇 리드는 source='chatbot').
--
-- 실행 규칙: 승인 후, 프로덕션 읽기 전용 세션(SQL 편집기 read-only 또는 replica)에서만.
-- 이 파일에는 UPDATE/DELETE/INSERT 가 없다. 재분류는 결정(재분류/유지/제외) 후 별도 마이그레이션으로.
-- 개인정보: 1·2번은 집계만, 3번은 마스킹된 값만 반환한다.

-- 1) 전체 규모와 기간
select
  count(*)                                   as total_rows,
  min(created_at at time zone 'Asia/Seoul')  as first_kst,
  max(created_at at time zone 'Asia/Seoul')  as last_kst,
  count(*) filter (where status = 'new')     as still_new,
  count(*) filter (where status = 'converted') as converted
from public.leads
where source = 'contact_page'
  and source_detail = 'chatbot_assist_registration';

-- 2) 행사별·월별 분포 (notes 첫 줄의 [event:<행사명>] 토큰 기준)
select
  date_trunc('month', created_at at time zone 'Asia/Seoul')::date as month_kst,
  coalesce(substring(notes from '\[event:([^\]]+)\]'), '(행사 토큰 없음)') as event_name,
  count(*) as rows,
  count(*) filter (where status <> 'new') as handled
from public.leads
where source = 'contact_page'
  and source_detail = 'chatbot_assist_registration'
group by 1, 2
order by 1 desc, 3 desc;

-- 3) 같은 연락처로 문의폼/다른 경로에도 들어온 중복 여부 (마스킹)
--    재분류 시 이중 집계·이중 연락을 피하려는 확인용.
with chatbot_rows as (
  select id, phone, created_at
  from public.leads
  where source = 'contact_page'
    and source_detail = 'chatbot_assist_registration'
    and phone is not null
)
select
  c.id                                                   as chatbot_lead_id,
  left(regexp_replace(c.phone, '\D', '', 'g'), 3) || '****' as phone_masked,
  c.created_at at time zone 'Asia/Seoul'                 as chatbot_created_kst,
  count(o.id)                                            as other_rows_same_phone,
  array_agg(distinct o.source || ':' || coalesce(o.source_detail, '')) filter (where o.id is not null) as other_sources
from chatbot_rows c
left join public.leads o
  on o.id <> c.id
 and regexp_replace(o.phone, '\D', '', 'g') = regexp_replace(c.phone, '\D', '', 'g')
group by c.id, c.phone, c.created_at
order by c.created_at desc;
