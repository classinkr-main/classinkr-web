-- 한국팀·본사 담당자 표(2026-11-26) — 갈매봇·위컴 1:1 의 담당자 안내(lib/internal-cs-chat/contact.ts resolveContact)가 읽는다.
--
-- 그전에는 한국 담당표가 코드의 빈 배열(KR_CONTACT_ROWS)이라 "한국 지사 업무" 카드가 늘 역할·계정 권한으로만 답했다.
-- 사람이 어드민 설정 › 담당자 표(/admin/settings?tab=contacts)에서 채우거나, 회사 드라이브의 초안 CSV(readKrContacts 양식)를
-- 올려 채운다. 쓰기는 SUPER_ADMIN 만(app/api/admin/team-contacts), 읽기는 서버 service role 만.
--
--  - org  : 'KR'(한국 지사 업무 — area 는 KR_TOPICS 키) 또는 'HQ'(본사 영역 — area 는 HQ_DOMAINS 키).
--           HQ 행은 저장만 한다. 안내는 지금처럼 코드의 HQ_DOMAINS 를 쓰고 HQ 행으로 덮지 않는다(보충 방식은 설계 메모:
--           docs/active/internal-team-contacts-2026-11-26.md §5).
--  - channel : 연락 방법 "종류"만(예: 위컴 1:1, KR 운영방). 전화번호·이메일·주소 값 칸은 두지 않는다 — 앱이 연락처 꼴 값을 거절한다.
--  - 영역마다 활성 행은 하나(부분 유니크). 대리 담당은 deputy 칸에 적는다. 비활성화는 active=false(물리 삭제 없음).
--
-- 미적용 환경: 안내는 지금처럼 빈 표로 돌고 카드에 "담당자 표를 읽지 못했습니다"가 붙는다. 담당자 표 화면은 적용 안내,
-- 쓰기 API 는 503(lib/repositories/team-contacts.ts).
--
-- 전부 멱등(IF NOT EXISTS / DROP ... IF EXISTS) — 재실행은 무해하다.
-- 롤백: supabase/rollbacks/20261126_internal_team_contacts.rollback.sql

CREATE TABLE IF NOT EXISTS public.internal_team_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org TEXT NOT NULL,
  area TEXT NOT NULL,
  role TEXT,
  name TEXT,
  deputy TEXT,
  channel TEXT,
  prep TEXT[] NOT NULL DEFAULT '{}',
  admin_link TEXT,
  note TEXT,
  confirmed_at DATE,
  confirmed_by TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 제약은 표가 이미 있던 환경에서도 같은 정의가 되도록 지우고 다시 건다.
ALTER TABLE public.internal_team_contacts DROP CONSTRAINT IF EXISTS internal_team_contacts_org_check;
ALTER TABLE public.internal_team_contacts
  ADD CONSTRAINT internal_team_contacts_org_check CHECK (org IN ('KR', 'HQ'));

ALTER TABLE public.internal_team_contacts DROP CONSTRAINT IF EXISTS internal_team_contacts_area_check;
ALTER TABLE public.internal_team_contacts
  ADD CONSTRAINT internal_team_contacts_area_check CHECK (area ~ '^[a-z][a-z0-9_]{1,39}$');

ALTER TABLE public.internal_team_contacts DROP CONSTRAINT IF EXISTS internal_team_contacts_text_length_check;
ALTER TABLE public.internal_team_contacts
  ADD CONSTRAINT internal_team_contacts_text_length_check CHECK (
    coalesce(char_length(role), 0) <= 80
    AND coalesce(char_length(name), 0) <= 60
    AND coalesce(char_length(deputy), 0) <= 60
    AND coalesce(char_length(channel), 0) <= 60
    AND coalesce(char_length(admin_link), 0) <= 200
    AND coalesce(char_length(note), 0) <= 500
    AND coalesce(char_length(confirmed_by), 0) <= 80
    AND coalesce(array_length(prep, 1), 0) <= 10
  );

-- 어드민 화면 링크는 상대 경로(/admin...)만.
ALTER TABLE public.internal_team_contacts DROP CONSTRAINT IF EXISTS internal_team_contacts_admin_link_check;
ALTER TABLE public.internal_team_contacts
  ADD CONSTRAINT internal_team_contacts_admin_link_check CHECK (admin_link IS NULL OR admin_link LIKE '/admin%');

-- 영역마다 활성 행 하나 — 안내가 어느 행을 쓸지 헷갈리지 않게.
CREATE UNIQUE INDEX IF NOT EXISTS internal_team_contacts_active_area_uniq
  ON public.internal_team_contacts (org, area)
  WHERE active;

CREATE INDEX IF NOT EXISTS internal_team_contacts_org_sort_idx
  ON public.internal_team_contacts (org, sort_order, area);

DROP TRIGGER IF EXISTS internal_team_contacts_updated_at ON public.internal_team_contacts;
CREATE TRIGGER internal_team_contacts_updated_at
  BEFORE UPDATE ON public.internal_team_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- deny-all: 정책을 두지 않는다 — service_role 만 읽고 쓴다(관리자 인증을 거친 서버 API·갈매봇 서버 연결).
-- 공개 anon·authenticated 키로는 읽지도 쓰지도 못하게 권한도 회수한다.
ALTER TABLE public.internal_team_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_team_contacts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_team_contacts TO service_role;
