# Repository Status Snapshot

기준 시점: 2026-06-08

상태: 역사 기록. 현재 상태는 실제 코드와 검증 결과로 확인한다.

문서 목적: 2026-04-15 감사 문서 이후 실제 코드 상태와 다음 개발 우선순위를 빠르게 확인한다. 4월 감사 문서는 히스토리로 유지하고, 현재 상태 판단은 이 문서와 실제 검증 명령을 우선한다.

## 1. Current Verification

- `npm run lint`: 통과
- `npm run build`: 통과
- 현재 브랜치: `2.22`
- 주요 활성 영역:
  - 공개 사이트: 랜딩, 제품 소개, 가격/체크아웃, 블로그, 이벤트, 문의, 문서센터
  - 관리자: CRM, 콘텐츠, 가이드 문서, 캠페인, 견적·계약·영수증, 지사 관리, 알림, Dev Mode
  - 포털/API: `/api/portal/*`, `/share/quote/[token]`, `/share/contract/[token]`
  - 문서센터: draft 저장, 공개본 반영, redirect, analytics, chatbot 추천 질문 API

## 2. Current Development Focus

- 리드마그넷 퍼널:
  - 블로그/가이드/제품 페이지 CTA를 `source_detail`과 `lead_magnet`으로 추적한다.
  - 관리자 CRM에서 세부 유입과 리드마그넷별 필터링이 가능해야 한다.
- 콘텐츠 공개 절차:
  - 블로그 초안은 공개되지 않는다.
  - 가이드 문서는 `draft/review/published`, `public/unlisted/internal`, `noindex` 조합으로 검수한다.
  - 리드마그넷 direct URL이 필요하면 docs의 `published + unlisted + noindex`가 블로그보다 안전하다.
- 운영 DB 재현성:
  - `supabase/migrations`를 기준으로 새 환경을 만들 수 있게 base schema와 운영 적용 누락을 줄인다.
  - `docs_article_drafts`, `chatbot_recommended_questions`, quote approval, `pending_approval` enum 적용 여부를 운영에서 계속 확인한다.

## 3. Stale Docs

- `repository-audit-2026-04-15.md`
  - 당시에는 build/lint 실패가 진실이었지만 현재는 통과한다.
  - 보존하되 현재 상태 판단에는 사용하지 않는다.
- `architecture-schema-erd.md`
  - 과거에는 DB schema/migration 파일 부재를 전제로 쓴 부분이 있다.
  - 현재는 `supabase/migrations/*`가 존재하므로 migration 현황은 별도로 확인한다.
- 파트너 포털 구문서군
  - `app/partner`, `app/api/partner`, `components/partner-portal`, `lib/partner-portal` 표현이 남은 문서는 히스토리로 본다.
  - 현재 구현은 주로 `app/api/portal`, `components/portal`, `lib/portal`, 관리자 파트너/견적 라우트에 있다.

## 4. Canonical Runbooks

- DB 적용 순서: `docs/active/supabase-migration-checklist-2.22.md`
- 공개 문서 운영 규칙: `docs/active/docs-center-content-guidelines.md`
- 공개 사이트 PRD: `docs/active/prd.md`
- 제품 기능 인벤토리: `docs/active/classin-software-feature-inventory.md`
- 하드웨어 안전/매뉴얼 기준: `docs/active/classin-board-s-series-safe-manual-guidelines.md`

## 5. Next Development Elements

1. 리드마그넷 자료를 관리자에서 검수하고, 공개 전 `source_detail = lead_magnet:<slug>` 규칙을 맞춘다.
2. `/admin/crm`에서 리드마그넷별 유입, 응대 지연, 담당자 미배정 상태를 함께 본다.
3. 리드 attribution migration을 운영 DB에 반영한 뒤 실제 제출 smoke test를 한다.
4. docs article draft workflow를 운영 DB에 반영하고, 초안이 공개 라우트에 노출되지 않는지 다시 확인한다.
5. 견적 공유/확인/인쇄 플로우를 브라우저 E2E로 점검한다.
