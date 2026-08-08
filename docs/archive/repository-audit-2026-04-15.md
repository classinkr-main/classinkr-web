# Repository Audit And Fix Playbook

기준 시점: 2026-04-15  
상태: 역사 기록. 현재 상태 판단과 작업 라우팅에는 사용하지 않는다.
문서 목적: 이 저장소를 나중에 다시 수정하거나 검증할 때, 어디부터 읽고 무엇을 먼저 고치고 어떤 명령으로 확인해야 하는지 빠르게 찾게 한다.

## 1. Current Truth Snapshot

이 문서는 2026-04-15에 실제 저장소와 명령 결과를 다시 대조해 정리했다.

- `npm run build` 는 현재 실패한다.
  - 현재 블로커: [app/admin/overview/page.tsx](../../app/admin/overview/page.tsx) 의 타입 가드
- `npx eslint app components lib --max-warnings=0` 도 현재 실패한다.
  - 핵심 에러:
    - [app/admin/marketing/page.tsx](../../app/admin/marketing/page.tsx)
    - [components/admin/RichMarkdownEditor.tsx](../../components/admin/RichMarkdownEditor.tsx)
- 관리자 영역에는 깨진 한글 문자열과 BOM 흔적이 섞여 있다.
  - 최우선: [app/api/admin/marketing/ai/route.ts](../../app/api/admin/marketing/ai/route.ts)
- 문서 입구가 분산돼 있고, 일부 활성 문서는 절대경로 링크와 과거 브랜치 메모를 포함한다.
- `archive/` 아래 에러 문서는 역사 기록과 현재 가이드를 섞고 있어서 그대로 믿으면 안 된다.

## 2. Trust Order

현재 저장소를 확인할 때는 아래 순서를 기준으로 믿는다.

1. 실제 코드와 현재 검증 명령 결과
2. 이 문서
3. 현재 기준 제품/아키텍처 문서
4. 역사 기록용 문서 (`docs/archive/`)

## 3. Canonical Entry Docs

지금 기준으로 먼저 봐야 하는 문서는 아래다.

- 공개 사이트 제품 기준: [prd.md](../active/prd.md)
- 파트너 포털 제품 기준: [partner-portal-master-spec.md](../active/partner-portal-master-spec.md)
- 아키텍처 입구: [architecture-schema-erd.md](../active/architecture-schema-erd.md)
- 하드웨어 운영 허브: [../hardware-ops/README.md](../hardware-ops/README.md)
- ADR 규칙: [../adr/README.md](../adr/README.md)

## 4. Fast Verification Commands

현재 저장소에서 기본 품질 게이트로 쓰는 명령은 아래 두 개다.

```bash
npx eslint app components lib --max-warnings=0
npm run build
```

메모:

- `npm run lint` 는 현재 범위가 넓어서 기본 진실 소스로 보기 어렵다.
- 문서에 “build passed” 또는 “lint okay” 라고 적혀 있어도, 반드시 위 두 명령으로 다시 확인한다.

## 5. Current Fix Order

수정은 아래 순서가 가장 빠르고 안전하다.

1. 빌드 복구
   - [app/admin/overview/page.tsx](../../app/admin/overview/page.tsx)
2. 실제 소스 lint 에러 복구
   - [app/admin/marketing/page.tsx](../../app/admin/marketing/page.tsx)
   - [components/admin/RichMarkdownEditor.tsx](../../components/admin/RichMarkdownEditor.tsx)
3. 관리자 영역 한글/인코딩 복구
   - [app/api/admin/marketing/ai/route.ts](../../app/api/admin/marketing/ai/route.ts)
   - [app/api/admin/subscribers/route.ts](../../app/api/admin/subscribers/route.ts)
   - [app/api/admin/calendar/route.ts](../../app/api/admin/calendar/route.ts)
   - [app/api/admin/patch-notes/route.ts](../../app/api/admin/patch-notes/route.ts)
   - `app/admin/commercial/page.tsx`(2026-07-02 폐기 삭제)
4. 문서 링크와 문서 계층 정리
   - 파트너 포털 문서군의 절대경로 제거
   - 활성 문서와 역사 문서의 경계 재표시
5. 중복된 결정 사항을 ADR로 승격

## 6. Docs Health Map

### 현재 기준으로 유지

- [prd.md](../active/prd.md)
- [partner-portal-master-spec.md](../active/partner-portal-master-spec.md)
- [architecture-schema-erd.md](../active/architecture-schema-erd.md)
- [notification-architecture-plan.md](../active/notification-architecture-plan.md)
- [../hardware-ops/README.md](../hardware-ops/README.md)

### 중복 또는 링크 정리가 필요한 활성 문서

활성 유지:

- [partner-portal-front-back-contract.md](../active/partner-portal-front-back-contract.md)
- [partner-portal-implementation-roadmap.md](../active/partner-portal-implementation-roadmap.md)

2026-04-23 아카이브 (중복 제거):

- [partner-portal-guidelines.md](../archive/partner-portal-guidelines.md)
- [partner-portal-product-plan.md](../archive/partner-portal-product-plan.md)
- [partner-portal-screen-layout.md](../archive/partner-portal-screen-layout.md)
- [partner-portal-worklog.md](../archive/partner-portal-worklog.md)

메모:

- 이 군집은 같은 결정을 여러 파일에 반복하고 있어서, 변경 시 동기화 비용이 높다.
- 파트너 포털은 `master spec 1개 + roadmap 1개 + 필요한 세부 실행안` 구조로 줄이는 것이 좋다.

### 역사적 구현 스냅샷으로 읽어야 하는 문서

- [MARKETING_EMAIL_SYSTEM.md](../active/MARKETING_EMAIL_SYSTEM.md)
- [supabase-backend-masterplan.md](../active/supabase-backend-masterplan.md)
- [../archive/error-fix-notes.md](../archive/error-fix-notes.md)
- [../archive/error_handle.md](../archive/error_handle.md)
- [../archive/SESSION_2026-03-22.md](../archive/SESSION_2026-03-22.md)

메모:

- 이 문서들에는 여전히 유효한 맥락이 남아 있지만, 현재 상태를 보장하지 않는다.
- 현재 상태 단정은 반드시 코드와 최신 검증 결과로 다시 확인한다.

## 7. Security And Repo Hygiene

- 로컬 OAuth 시크릿 파일이 `classin_secret/` 아래 존재한다.
  - 현재는 `.gitignore` 에서 제외되도록 정리했지만, 실제 값이 살아 있다면 로테이션을 검토한다.
- 추적 문서에는 실제 비밀번호 예시를 남기지 않는다.
- 로컬 절대경로 링크와 브랜치명은 기준 문서에서 제거한다.
- 인코딩 재발 방지를 위해 UTF-8, LF, final newline 기준을 유지한다.

## 8. Recommended ADR Backlog

아래 결정은 여러 문서에 반복돼 있으므로 ADR로 분리할 가치가 높다.

- `ADR-001 customer-vs-deal-is-operational-unit`
- `ADR-002 document-links-are-version-fixed`
- `ADR-003 installations-use-start-end-datetime`
- `ADR-004 payments-are-partial-by-default`
- `ADR-005 homepage-lead-capture-success-criteria`
- `ADR-006 marketing-storage-mode-json-vs-supabase`
- `ADR-007 admin-auth-model`

## 8a. Backend / DB Findings (2026-04-23)

현재 저장소의 DB 설계와 코드 연결 상태를 대조하며 발견한 점들.

### 고아 / 방치 요소

- `lib/repositories/calendar.ts` — **삭제됨**. 존재하지 않는 컬럼(`date`, `time`, `assignees` 등)을 참조하던 깨진 코드였다. `calendar_events` 테이블은 partner-portal 전용 스키마(`partner_account_id` 필수)이며, 관리자 팀 캘린더용 테이블은 별도로 설계되어 있지 않다. 관리자 팀 캘린더는 [lib/calendar-data.ts](../../lib/calendar-data.ts) (JSON + Supabase 하이브리드)가 담당한다.
- `lib/marketing-data.ts` — **삭제됨**. `lib/repositories/marketing.ts` 로 완전 대체된 JSON 구현체.
- `data/subscribers.json`, `data/leads.json` — **삭제됨**. 활성 읽기 경로 없음.
- `docs_redirects` 테이블 — **연결 완료**. [lib/docs-content.ts](../../lib/docs-content.ts) `resolveDocsRedirect()` 추가, [app/docs/[category]/page.tsx](../../app/docs/[category]/page.tsx) 및 `[slug]/page.tsx` 에서 `notFound()` 이전에 lookup.

### 스키마 중복 / Split-brain

- V1 파트너 포털 테이블(partners, quotes, contracts, receipts, partner_users 등 20260402_partner_portal.sql) 과 V2(partner_accounts, customers, deals, quote_documents, contract_documents, payments_v2, receipts_v2 — 20260404_partner_portal_v2_domain.sql) 이 **공존**한다.
- Admin API 는 V1, Partner Portal API 는 V2 에 쓰고, Partner Portal 은 [lib/portal/repositories/legacy.ts](../../lib/portal/repositories/legacy.ts) 를 통해 V1 을 V2 타입으로 매핑해 **읽기만** 한다.
- 결과: admin 이 만든 파트너/견적/계약을 portal 이 읽기는 하나 편집은 못 하고, 반대로 portal 이 만든 deal/quote_document 를 admin 이 못 본다.
- 통합 방향 결정 필요 (ADR 후보).

### Repo hygiene — 추적되지 않은 테이블

아래 테이블들은 코드가 실제로 쿼리하지만 `supabase/migrations/` 에 `CREATE TABLE` 이 없다. 과거 Supabase 대시보드나 migration tracking 이전에 만들어진 것으로 추정.

- `email_campaigns`
- `partner_contacts`, `partner_deals`, `partner_documents`, `partner_schedule_items`, `partner_sales_records`, `partner_ops_checklist_items`, `partner_ops_issues`, `partner_activity_logs`
- `blog_posts` (20260402_blog_page_layout.sql 에서 ALTER 하지만 CREATE 없음)

DB dump → migration 파일로 역추적하는 작업이 필요하다. 현재 repo 로는 스키마 재현 불가.

### 레이어 정리 완료 항목

- [app/api/admin/software-quote-codes/route.ts](../../app/api/admin/software-quote-codes/route.ts) — 직접 Supabase 호출 제거, [lib/billing/quote-codes.ts](../../lib/billing/quote-codes.ts) 의 `listQuoteCodes` / `createQuoteCode` 사용.
- [app/api/admin/upload/route.ts](../../app/api/admin/upload/route.ts) — 직접 Supabase Storage 호출 제거, [lib/storage/blog-images.ts](../../lib/storage/blog-images.ts) `uploadBlogImage()` 로 추출.

### RLS 커버리지 보완 (2026-04-23 마이그레이션 추가)

[supabase/migrations/20260423_rls_admin_only_tables.sql](../../supabase/migrations/20260423_rls_admin_only_tables.sql) 로 아래 테이블에 RLS 활성화 (deny-all by default, service role 만 접근):

- automation_rules, automation_logs, automation_delay_queue
- email_templates, email_campaigns (IF EXISTS), sms_campaigns
- site_settings, notification_events, notifications, notification_delivery_logs
- newsletter_subscribers

### 아직 남은 이슈

- 파트너 포털 V1/V2 통합 전략 (ADR 필요).
- 위의 tracked-outside-repo 테이블들에 대한 DB dump / migration 복원 작업.
- `lib/blog-data.ts`, `lib/bugs-data.ts`, `lib/patch-notes-data.ts`, `lib/roadmap-data.ts` 의 JSON CRUD 함수들은 현재 아무도 호출하지 않는다 (타입만 import 됨). 순수 types 파일로 축소 가능.
- `data/blog-posts.json`, `data/bugs.json`, `data/patch-notes.json`, `data/roadmap.json` 은 위 CRUD 함수들이 제거되면 같이 삭제 가능.

## 9. Operating Rules For Future Updates

- 제품 영역마다 기준 문서는 하나만 둔다.
- 구현 순서는 이니셔티브마다 로드맵 문서 하나로 모은다.
- 사고 기록은 `archive/` 에 두고, 현재 상태처럼 읽히는 문장은 날짜와 역사 메모를 같이 남긴다.
- NOTE 주석은 로컬 코드 설명만 맡기고, 시스템 설명은 문서 한 곳에만 둔다.
- 문서를 고친 뒤에는 최소한 아래를 다시 확인한다.

```bash
npx eslint app components lib --max-warnings=0
npm run build
```
