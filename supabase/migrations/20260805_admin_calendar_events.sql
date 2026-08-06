-- ─────────────────────────────────────────────────────────────
-- 어드민 운영 캘린더의 "팀 일정" 저장소
--
-- 배경: lib/calendar-data.ts 는 팀 일정을 data/calendar-events.json 파일에 써 왔다.
-- 그런데 assertLocalJsonWriteAllowed() 가 VERCEL=1 / NODE_ENV=production 에서 throw 하므로
-- 배포 환경에서는 생성·수정·삭제가 전부 실패했다. 즉 프로덕션의 /admin/calendar 는
-- 외부 소스만 읽는 뷰어였고 "팀 일정" 소스는 구조적으로 영구 0건이었다.
-- 이 테이블이 그 저장소를 대신한다.
--
-- 기존 partner portal V2 의 public.calendar_events 를 재사용하지 않는 이유:
-- 그쪽은 partner_account_id 가 NOT NULL 이라 파트너 계정에 매달린 행만 담을 수 있다.
-- 어드민 팀 일정은 파트너와 무관한 1급 개체이므로 표면을 분리한다.
--
-- id 가 UUID 가 아니라 TEXT 인 이유:
-- 애플리케이션이 이미 `ev_<timestamp>_<rand>` 형식을 발급하고 있고, 이 값이
-- 구글 캘린더 확장 속성(classin_local_event_id)에 기록돼 양방향 대조에 쓰인다.
-- UUID 로 바꾸면 이미 구글에 올라간 이벤트와의 연결이 끊긴다.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_calendar_events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  date        DATE NOT NULL,
  end_date    DATE,
  -- 시각은 KST 벽시계 "HH:mm" 문자열로 둔다(타임존 변환 없음).
  -- 캘린더 UI 가 종일/시간 일정을 같은 격자에 그리기 때문에 인스턴트(timestamptz)로
  -- 승격하면 종일 일정에서 하루 밀림이 생긴다 — lib/business-time.ts 가 관리하는
  -- 인스턴트 축과는 의도적으로 다른 축이다.
  "time"      TEXT,
  end_time    TEXT,
  type        TEXT NOT NULL DEFAULT 'team'
                CHECK (type IN ('team', 'deadline', 'meeting', 'launch', 'holiday', 'other')),
  description TEXT,
  assignees   TEXT[] NOT NULL DEFAULT '{}',
  all_day     BOOLEAN NOT NULL DEFAULT false,

  -- 구글 캘린더 단방향 미러 상태(lib/google-calendar-sync.ts).
  -- sync_error 는 저장 자체를 막지 않는다 — 미러 실패는 일정 등록 실패가 아니다.
  google_calendar_event_id       TEXT,
  google_calendar_last_synced_at TIMESTAMPTZ,
  google_calendar_sync_error     TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT admin_calendar_events_end_date_check
    CHECK (end_date IS NULL OR end_date >= date),
  CONSTRAINT admin_calendar_events_time_format_check
    CHECK ("time" IS NULL OR "time" ~ '^[0-2][0-9]:[0-5][0-9]$'),
  CONSTRAINT admin_calendar_events_end_time_format_check
    CHECK (end_time IS NULL OR end_time ~ '^[0-2][0-9]:[0-5][0-9]$')
);

-- 월/주/타임라인 조회는 전부 "기간과 겹치는 행" 질의다: date <= to AND coalesce(end_date, date) >= from.
-- 멀티데이 일정이 시작월 밖에서도 잡히려면 종료일 쪽에도 인덱스가 필요하다.
CREATE INDEX IF NOT EXISTS admin_calendar_events_date_idx
  ON public.admin_calendar_events (date);
CREATE INDEX IF NOT EXISTS admin_calendar_events_span_idx
  ON public.admin_calendar_events (COALESCE(end_date, date));

CREATE INDEX IF NOT EXISTS admin_calendar_events_google_event_idx
  ON public.admin_calendar_events (google_calendar_event_id)
  WHERE google_calendar_event_id IS NOT NULL;

-- 정책을 달지 않은 채 RLS 만 켠다 — 서비스 롤(어드민 클라이언트)만 접근 가능해지고
-- anon/authenticated 키로는 한 행도 새지 않는다. 저장소 계열 테이블의 기존 관례
-- (20260724_marketing_projects.sql 등)와 동일.
ALTER TABLE public.admin_calendar_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_calendar_events IS
  '어드민 운영 캘린더의 팀 일정. source=calendar 로 노출되는 유일한 편집 가능 소스.';
COMMENT ON COLUMN public.admin_calendar_events."time" IS
  'KST 벽시계 HH:mm. 종일 일정은 NULL.';
COMMENT ON COLUMN public.admin_calendar_events.google_calendar_sync_error IS
  '구글 미러 실패 사유. 값이 있어도 일정 자체는 유효하다.';
