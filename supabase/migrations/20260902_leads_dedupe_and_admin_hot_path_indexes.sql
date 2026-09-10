-- 리드 중복 탐지 핫패스 + 어드민 API 필터·정렬 보조 인덱스 (2026-09-02).
--
-- 1) 리드 제출마다 lib/repositories/leads.ts findDuplicateLeads()가 phone/email 인덱스 없이
--    public.leads 를 두 번 스캔한다. 근거:
--      lib/repositories/leads.ts:526-528 phoneCandidates = [원문 phone, digitsOnly(phone)]
--      lib/repositories/leads.ts:529-531 emailCandidates = [원문 email, lower(email)]
--      lib/repositories/leads.ts:535     .from("leads").select(...).in("phone", phoneCandidates)
--      lib/repositories/leads.ts:538     .from("leads").select(...).in("email", emailCandidates)
--    candidates 배열에 원문과 정규화값이 함께 들어가므로(둘 다 원문 컬럼 표기 그대로 비교),
--    lower(email) 표현식 인덱스가 아니라 email 컬럼 그대로의 인덱스가 맞다 — 대소문자가 섞인
--    candidate가 lower(email) 인덱스와는 절반만 맞아떨어진다. 마이그레이션 전수 grep
--    (supabase/migrations/*.sql, "leads" 관련 CREATE INDEX 전부) 결과 phone/email 단독
--    인덱스는 없었다 — status/source/created_at/source_detail/lead_magnet/follow_up_at/
--    assigned_to/anonymous_id/user_id 만 있다(20260614, 20260608, 20260624, 20260805 마이그레이션).
--
-- 2) app/api/admin/** 핫패스 중 기존 인덱스로 못 받는 필터 2건만 추가한다(근거 확실한 것만):
--    a) admin_calendar_events — 멀티데이 일정이 걸치는 기간 조회.
--       lib/repositories/admin-calendar-events.ts:114-119 의 "spanning" 분기가
--       `end_date IS NOT NULL AND date <= :to AND end_date >= :from` 를 그대로 던진다.
--       기존 인덱스(supabase/migrations/20260805_admin_calendar_events.sql:56-59)는
--       date 단독 인덱스와 COALESCE(end_date, date) 표현식 인덱스뿐이다. PostgREST가 만드는
--       `end_date >= :from` 조건은 원본 컬럼 조건이라 COALESCE 표현식 인덱스와 텍스트가
--       다르면 플래너가 매치하지 못한다 — 이 분기만 end_date 라는 실제 컬럼의 인덱스가 없다.
--       app/api/admin/calendar/route.ts → lib/calendar-data.ts getEventsByMonth/getEventsByRange
--       가 이 경로를 그대로 부른다(어드민 캘린더 화면의 모든 월/주/타임라인 조회).
--    b) crm_tasks — 매니저 리포트의 기간 내 완료 건수 집계.
--       lib/repositories/crm-manager-report.ts:128
--         .eq("status", "done").gte("completed_at", windowStartIso).limit(5000)
--       기존 crm_tasks_status_due_idx(status, due_at) (supabase/migrations/20260627_crm_tasks.sql:51)
--       는 status='done' 접두는 태우지만 completed_at 은 인덱스 밖이라 done 전체를 다시 훑는다.
--       done 건은 시간이 지날수록 계속 쌓이는 반면 조회 창(windowDays)은 고정이라, 이 스캔
--       비용은 인덱스 없이는 done 누적치에 비례해 계속 나빠진다.
--       app/api/admin/crm/manager-report/route.ts → getCrmManagerReport() 가 이 경로를 부른다.
--
--    나머지 후보(lead_contact_logs, crm_customer_events, notifications)는 코드 대조 결과
--    이미 충분히 커버돼 넣지 않았다. lead_contact_logs 는 실제 컬럼이 created_at이 아니라
--    contacted_at이고 이미 idx_lead_contact_logs_lead_id + lead_contact_logs_contacted_at_idx
--    (20260827_admin_perf_indexes.sql)가 있다.
--    crm_customer_events 는 crm_customer_events_target_idx(target_type, target_id,
--    occurred_at DESC)(20260626)가 이미 정확히 그 조합이다. notifications 는
--    idx_notifications_unread(recipient_type, recipient_id, status)(20260407)가 countOnly
--    unread 집계와 정확히 맞는다.
--
-- CREATE INDEX CONCURRENTLY 는 쓰지 않는다 — 이 저장소의 마이그레이션은 트랜잭션 안에서
-- 실행되는 SQL Editor/CLI로 적용되며(기존 인덱스 마이그레이션 전부 동일), CONCURRENTLY는
-- 트랜잭션 내부에서 금지된다.

CREATE INDEX IF NOT EXISTS idx_leads_phone
  ON public.leads (phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_email
  ON public.leads (email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_calendar_events_end_date
  ON public.admin_calendar_events (end_date)
  WHERE end_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_tasks_status_completed_at
  ON public.crm_tasks (status, completed_at)
  WHERE status = 'done';
