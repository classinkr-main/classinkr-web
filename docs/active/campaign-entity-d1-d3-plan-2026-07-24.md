# 크로스채널 캠페인 개체(D1) + 프로젝트 묶음(D3) — 설계 & 구현 계획

- 상태: **구현 완료 + 마이그레이션 라이브 적용 완료** (2026-07-24). CS_UP1 머지(11커밋). 두 마이그(`20260724_marketing_campaigns.sql`, `20260724_marketing_projects.sql`)를 classinkr-main 프로덕션 DB에 순서대로 적용 — `marketing_campaigns`/`campaign_links`/`marketing_projects` 라이브 확인(행 0, project_id FK 존재). 검증: `tmp/db-probe-marketing-tables.mjs`.

> **실행:** superpowers:subagent-driven-development — 태스크별 서브에이전트 + 스펙·품질 2단계 리뷰. 체크박스(`- [x]`) 추적.

**목표:** 오늘 채널별 실행(email_campaigns·sms_campaigns·public_events·Meta)으로 파편화된 "캠페인"을, 이들을 **연결·롤업하는 크로스채널 캠페인 1급 개체**(D1)로 통합하고, 그 위에 캠페인을 묶는 **프로젝트**(D3)를 얹는다. 출처: [campaign-marketing-ia-develop-analysis-2026-07-23.md](campaign-marketing-ia-develop-analysis-2026-07-23.md) P2-P3.

**접근:** **Approach A (연결·롤업 레이어)** — 기존 채널 실행 테이블은 불변. 신규 `marketing_campaigns` + `campaign_links` 연결 테이블. 캠페인은 우산(umbrella)으로서 링크된 실행의 지표를 읽기시점 롤업. UI는 **전용 라우트**(`/admin/campaigns/manage`, `/admin/campaigns/projects`)로 두어 동시 진행 중인 campaigns 페이지 탭 리팩터와 충돌 회피.

**정직 규칙(D2에서 이어짐):** 롤업은 링크된 실행에서 **실제 가용한 값만** 표기. Meta 집행은 계정 통화(USD 등)·행사 매출은 "입력 기준"이라, **채널·통화를 가로지르는 조작된 ROAS는 만들지 않는다**. 추정치는 "추정" 라벨.

**스택:** Next.js 16, React 19, TS, Tailwind 4, Supabase(admin 클라이언트 — RLS admin-only 테이블은 admin 클라이언트 필수), vitest(node env, `renderToStaticMarkup`+문자열매칭).

---

## 설계 결정 (settled)

### 스키마 (신규 마이그레이션 `supabase/migrations/<date>_marketing_campaigns.sql`)
```sql
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  objective   TEXT,
  status      TEXT NOT NULL DEFAULT 'planned'
              CHECK (status IN ('planned','active','paused','done')),
  channels    TEXT[] NOT NULL DEFAULT '{}',   -- 선언 채널(정보성): email/sms/kakao/meta/event/search/display 등
  starts_at   DATE,
  ends_at     DATE,
  budget      BIGINT,                          -- KRW, nullable
  owner       TEXT,
  project_id  UUID,                            -- D3에서 FK 연결(지금은 nullable 컬럼만)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.campaign_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  ref_type    TEXT NOT NULL CHECK (ref_type IN ('email_campaign','sms_campaign','event','meta_campaign')),
  ref_id      TEXT NOT NULL,                   -- 링크 대상 실행의 id(문자열: uuid 또는 Meta 캠페인 id)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, ref_type, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_links_campaign ON public.campaign_links(campaign_id);
-- updated_at 트리거 + RLS admin-only(기존 20260423_rls_admin_only_tables 패턴 따름)
```
D3 마이그레이션(`<date>_marketing_projects.sql`)에서 `marketing_projects` 생성 + `marketing_campaigns.project_id` FK 추가.

### 타입 (`lib/types/marketing-campaign.ts`)
`MarketingCampaign`, `CampaignLink`, `CampaignRefType`, `CampaignStatus`, `CampaignWithLinks`(campaign + links[] + rollup), `CampaignRollup`(집계 결과). D3: `MarketingProject`.

### 롤업 (`lib/marketing/campaign-rollup.ts`, 순수 함수)
입력: 캠페인의 links[] + 조회된 실행 데이터(email_campaigns 행·sms_campaigns 행·event-metrics·Meta 대시보드). 출력 `CampaignRollup`:
- `emailRecipients`, `emailOpens` (email 링크 합)
- `smsRecipients` (sms 링크 합)
- `eventLeads`, `eventDeals`, `eventRevenue` (event 링크의 event-metrics 합; revenue는 "입력 기준" 플래그)
- `metaSpend` + `metaCurrency`, `metaLeads` (meta 링크; 통화 네이티브, KRW 합산 금지)
- `linkedCounts`: {email, sms, event, meta}
채널·통화 가로지르는 종합 ROAS 없음. 순수 함수라 단위테스트 용이.

### API (`app/api/admin/marketing-campaigns/`) — 전부 `verifyAdmin`
- `route.ts` GET(list, 각 캠페인에 links[] 조인) · POST(create, sanitize)
- `[id]/route.ts` GET(1건+links+rollup 원천) · PATCH(update) · DELETE
- `[id]/links/route.ts` POST(add link: {ref_type, ref_id} sanitize) · DELETE(remove: {linkId} 또는 {ref_type,ref_id})
- `link-candidates/route.ts` GET — 링크 후보 조회(연결 안 된 email_campaigns·sms_campaigns·events·Meta 캠페인 목록, 라벨 포함)

### UI
- `/admin/campaigns/manage` — 캠페인 관리: 리스트(이름·상태칩·채널칩·기간·예산·롤업요약·담당자, 행 클릭→상세) + "새 캠페인" 생성 드로어 + 상세(롤업 + 링크된 실행 목록 + 링크 추가/해제 피커). DESIGN.md 토큰.
- 캠페인 허브(`/admin/campaigns`)·nav·R4 크로스링크에서 진입 링크.
- D3: `/admin/campaigns/projects` — 프로젝트 리스트(멤버 캠페인 롤업: 캠페인/광고/행사 수 + 예산 소진%) + 생성/편집 + 캠페인↔프로젝트 배정.

---

## 구현 계획 (bite-sized)

### Task D1-1: 스키마 마이그레이션 + 타입
**Files:** Create `supabase/migrations/<date>_marketing_campaigns.sql`, `lib/types/marketing-campaign.ts`
- [x] Step 1: 마이그레이션 작성 — 위 설계의 두 테이블 + 인덱스 + updated_at 트리거 + RLS admin-only(기존 `supabase/migrations/*rls_admin_only*` 파일에서 정확한 패턴 확인 후 동일 적용).
- [x] Step 2: 타입 파일 — `MarketingCampaign`(스키마 컬럼 그대로), `CampaignRefType = "email_campaign"|"sms_campaign"|"event"|"meta_campaign"`, `CampaignStatus`, `CampaignLink`, `CampaignRollup`, `CampaignWithLinks`. `CAMPAIGN_STATUSES`/`CAMPAIGN_REF_TYPES` 런타임 상수 배열도 export(sanitizer·UI 공용 SSOT).
- [x] Step 3: **읽기전용 프로브로 마이그 적용 여부 확인용 스크립트**는 만들지 않는다(적용은 사람이 라이브에 수동 적용 — 기존 관행). 대신 마이그 SQL이 문법상 유효한지 로컬에서 육안 검토.
- [x] Step 4: `npx tsc --noEmit` 통과. Commit `feat(campaigns): marketing_campaigns/campaign_links 스키마 + 타입`.

### Task D1-2: 저장소
**Files:** Create `lib/repositories/marketing-campaigns.ts`, Test `tests/repositories/marketing-campaigns.test.ts`
- [x] Step 1: 기존 Supabase 저장소(예: `lib/repositories/automation.ts`)의 admin-client 패턴을 읽고 미러. 함수: `listCampaigns()`(+links 조인), `getCampaign(id)`, `createCampaign(input)`, `updateCampaign(id, patch)`, `deleteCampaign(id)`, `addLink(campaignId, refType, refId)`, `removeLink(linkId)`. admin 클라이언트 사용(RLS 메모 준수).
- [x] Step 2: TDD — vitest에서 supabase admin 클라이언트를 목킹(기존 `tests/repositories/*.test.ts`의 `vi.mock("@/lib/supabase/admin")` 패턴 복제)해 listCampaigns가 from("marketing_campaigns")+links 조인 형태를 호출하는지, createCampaign이 sanitize된 payload를 insert하는지 검증.
- [x] Step 3: lint+tsc. Commit.

### Task D1-3: 링크 후보 + 롤업 순수함수
**Files:** Create `lib/marketing/campaign-rollup.ts`, Test `tests/marketing/campaign-rollup.test.ts`
- [x] Step 1: TDD — `computeCampaignRollup(links, { emailCampaigns, smsCampaigns, eventMetrics, metaCampaigns })` 순수함수. 테스트: email 링크 2건→recipient/open 합산, event 링크→leads/deals/revenue 합(revenue "입력기준" 플래그), meta 링크→spend/currency 보존(KRW 합산 안 함), 빈 링크→0.
- [x] Step 2: 구현. Commit.

### Task D1-4: API 라우트
**Files:** Create `app/api/admin/marketing-campaigns/route.ts`, `[id]/route.ts`, `[id]/links/route.ts`, `link-candidates/route.ts`, Test `tests/api/admin-marketing-campaigns.test.ts`
- [x] Step 1: 기존 `app/api/admin/automation/rules/route.ts`의 verifyAdmin+sanitize 패턴 미러. sanitizer(`sanitizeCampaignInput`, `sanitizeLinkInput`) export해 단위테스트.
- [x] Step 2: TDD — sanitizer 테스트(유효 입력 통과·잘못된 status/ref_type 거부·name 빈값 거부). Commit.

### Task D1-5: 캠페인 관리 UI — 리스트 + 생성/편집 드로어
**Files:** Create `app/admin/campaigns/manage/page.tsx`, `components/admin/campaigns/manage/CampaignManageClient.tsx`, `CampaignFormDrawer.tsx`, Test(렌더)
- [x] Step 1: 얇은 서버 페이지(verifyAdmin 게이트) + 클라이언트 컴포넌트. 리스트: 이름·상태칩·채널칩·기간·예산·롤업요약·담당자. adminFetchJson으로 조회. DESIGN.md 토큰.
- [x] Step 2: 생성/편집 드로어(name/objective/status/channels/기간/budget/owner). PATCH/POST.
- [x] Step 3: 렌더 테스트(renderToStaticMarkup) — 리스트 행·상태칩·빈 상태. Commit.

### Task D1-6: 상세 — 롤업 + 링크 추가/해제 피커
**Files:** Create `components/admin/campaigns/manage/CampaignDetailPanel.tsx`, `LinkPicker.tsx`, Test
- [x] Step 1: 상세 패널 — 롤업 카드(채널별 가용 지표, 정직 라벨, 종합 ROAS 없음) + 링크된 실행 목록.
- [x] Step 2: LinkPicker — `link-candidates` 조회해 미연결 email/sms/event/meta 실행을 유형별로 보여주고 추가; 링크 행에 해제 버튼.
- [x] Step 3: 렌더 테스트. Commit.

### Task D1-7: 진입 링크 배선 (최소 침습)
**Files:** Modify `components/admin/admin-nav.ts`(marketing 섹션에 "캠페인 관리" 항목 추가) + `components/admin/MarketingCrossLinks.tsx`는 nav SSOT 파생이라 자동 반영. 캠페인 허브 헤더에 링크 1개.
- [x] Step 1: admin-nav marketing 섹션에 `{ href: "/admin/campaigns/manage", label: "캠페인 관리", ... }` 추가(하드코딩 라우트 목록 없음 — SSOT). R4 크로스링크는 자동 포함.
- [x] Step 2: 캠페인 허브(`/admin/campaigns`) 헤더 액션에 "캠페인 관리" 링크 추가(page.tsx 최소 3줄 — 리팩터 충돌 최소화). lint+build. Commit.

### Task D1-8: D1 회귀 게이트
- [x] 전체 vitest + `eslint app components lib --max-warnings=0` + `npm run build`. 브라우저: `/admin/campaigns/manage`에서 생성→링크추가→롤업 표시→해제 왕복(라이브 DB 쓰기 주의 — 테스트 데이터는 삭제).

### Task D3-1: 프로젝트 스키마 + 타입 + 저장소
**Files:** Create `supabase/migrations/<date>_marketing_projects.sql`, extend `lib/types/marketing-campaign.ts`, `lib/repositories/marketing-projects.ts`, Test
- [x] `marketing_projects`(name/objective/status/starts_at/ends_at/budget/owner/timestamps) + `marketing_campaigns.project_id` FK(ON DELETE SET NULL). 저장소 CRUD + `assignCampaignToProject`. TDD. Commit.

### Task D3-2: 프로젝트 API + 롤업
**Files:** Create `app/api/admin/marketing-projects/`, extend rollup
- [x] verifyAdmin CRUD + 프로젝트 롤업(멤버 캠페인 수·채널/행사 수·예산 소진%=합산집행/합산배정). sanitizer 테스트. Commit.

### Task D3-3: 프로젝트 UI
**Files:** Create `app/admin/campaigns/projects/page.tsx` + client + 생성/편집 + 캠페인 배정
- [x] 프로젝트 리스트(레퍼런스 프로젝트 요약 형태: 캠페인/광고/행사 수 + 예산 소진 바) + 캠페인↔프로젝트 배정 UI. nav 항목 추가(SSOT). 렌더 테스트. Commit.

### Task D3-4: 최종 회귀
- [x] 전체 게이트 + 브라우저 왕복(프로젝트 생성→캠페인 배정→롤업).

---

## 범위 밖 / 정직 노트
- Meta 캠페인 링크의 ref_id는 Graph API의 캠페인 id 문자열(로컬 미저장) — 후보 목록은 라이브 Meta 대시보드에서 조회, 미연결이면 빈 목록.
- 채널·통화 가로지르는 종합 ROAS는 만들지 않음(D2와 동일). 프로젝트 예산 소진%는 KRW 배정 대비 KRW 집행만(Meta USD는 별도 표기).
- 라이브 배포 시 두 마이그레이션은 사람이 수동 적용(기존 관행). 마이그 미적용 시 API list가 500 → UI는 빈/에러 상태로 강등(크래시 금지).
- 파일기반 event-metrics·channel-budgets는 그대로(이번 범위에서 Supabase 이전 안 함).
