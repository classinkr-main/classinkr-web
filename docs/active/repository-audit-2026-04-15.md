# Repository Audit And Fix Playbook

기준 시점: 2026-04-15  
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

- 공개 사이트 제품 기준: [prd.md](./prd.md)
- 파트너 포털 제품 기준: [partner-portal-master-spec.md](./partner-portal-master-spec.md)
- 아키텍처 입구: [architecture-schema-erd.md](./architecture-schema-erd.md)
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
   - [app/admin/commercial/page.tsx](../../app/admin/commercial/page.tsx)
4. 문서 링크와 문서 계층 정리
   - 파트너 포털 문서군의 절대경로 제거
   - 활성 문서와 역사 문서의 경계 재표시
5. 중복된 결정 사항을 ADR로 승격

## 6. Docs Health Map

### 현재 기준으로 유지

- [prd.md](./prd.md)
- [partner-portal-master-spec.md](./partner-portal-master-spec.md)
- [architecture-schema-erd.md](./architecture-schema-erd.md)
- [notification-architecture-plan.md](./notification-architecture-plan.md)
- [../hardware-ops/README.md](../hardware-ops/README.md)

### 중복 또는 링크 정리가 필요한 활성 문서

- [partner-portal-guidelines.md](./partner-portal-guidelines.md)
- [partner-portal-product-plan.md](./partner-portal-product-plan.md)
- [partner-portal-screen-layout.md](./partner-portal-screen-layout.md)
- [partner-portal-front-back-contract.md](./partner-portal-front-back-contract.md)
- [partner-portal-implementation-roadmap.md](./partner-portal-implementation-roadmap.md)
- [partner-portal-worklog.md](./partner-portal-worklog.md)

메모:

- 이 군집은 같은 결정을 여러 파일에 반복하고 있어서, 변경 시 동기화 비용이 높다.
- 파트너 포털은 `master spec 1개 + roadmap 1개 + 필요한 세부 실행안` 구조로 줄이는 것이 좋다.

### 역사적 구현 스냅샷으로 읽어야 하는 문서

- [MARKETING_EMAIL_SYSTEM.md](./MARKETING_EMAIL_SYSTEM.md)
- [supabase-backend-masterplan.md](./supabase-backend-masterplan.md)
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
