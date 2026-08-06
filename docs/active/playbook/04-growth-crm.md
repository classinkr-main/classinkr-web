# 파트 가이드 — 마케팅 / 그로스 / CRM

> 담당 에이전트: `.claude/agents/growth-crm.md`

## 1. 책임 범위

리드 퍼널, consent와 분석 추적, 캠페인/메시징, CRM·Branch·Calendar, 영업 운영 화면과 해당 API/repository를 소유한다.

- 공개 API: `app/api/{lead,identify,consent,track,newsletter,meta}`
- 어드민 화면: `app/admin/{crm,marketing,campaigns,branch,calendar,analytics,traffic}`
- 영업 운영 화면: 견적·계약·영수증·하드웨어·설치 일정의 어드민 워크플로
- 어드민 API: 위 화면과 연결된 `app/api/admin/{crm,leads,marketing,marketing-campaigns,marketing-projects,branch,calendar,...}`
- 데이터 구현: `lib/crm/*`, `lib/branch/*`, `lib/admin-crm-*`, `lib/external-crm/*`, `lib/repositories/`의 리드·CRM·캠페인·캘린더·영업 운영 repository

결제 승인·Toss 검증 같은 결제 기반은 Platform 소유다. 영업 화면의 견적/계약 라이프사이클과 CRM 연결은 Growth 소유다. 모든 어드민 화면/API는 Admin Core의 인증·권한 규약을 따른다.

## 2. 핵심 흐름

- `lib/server/lead-capture.ts`: 검증, 중복 방지, 저장, 외부 전달, 자동화, 알림
- `lib/consent/consent.ts`, `app/api/consent/route.ts`: consent 저장과 감사
- `lib/analytics.ts`, `app/api/track/event/route.ts`: 이벤트 발화·allowlist·PII redaction
- `lib/crm/lead-attribution.ts`, `lib/crm/lead-ranking.ts`: 유입 분류와 우선순위
- `lib/admin-crm-revenue.ts`, `lib/crm-source-linking.ts`: 매출 연결·중복 제거
- `lib/notion-marketing-calendar.ts`, `lib/calendar-data.ts`, `lib/repositories/admin-calendar-events.ts`: 외부 원천 읽기와 자체 일정
- `lib/branch/*`: KR Team 시트 동기화·매출 확정·인사이트

## 3. 강제 규칙

### 리드와 consent

- 공개 리드 저장 실패를 성공으로 숨기지 않는다. 저장과 외부 전달이 모두 실패하면 pending 중복 상태를 제거하고 재시도를 허용한다.
- 미결정 consent는 거부로 취급한다. 마케팅 픽셀과 구독 동기화는 명시적 마케팅 동의 후에만 실행한다.
- raw IP와 불필요한 PII를 저장하지 않는다. 이벤트 파라미터는 allowlist와 redaction을 통과해야 한다.
- 새 이벤트는 `lib/analytics.ts`의 타입과 `/api/track/event`의 이벤트/파라미터 allowlist를 함께 갱신한다.
- `trackEvent`의 dataLayer, gtag, 내부 적재와 GTM 태깅이 중복 집계되지 않는지 확인한다.

### CRM과 매출

- 시트 REV, 외부 CRM, Portal V2 딜은 확정된 `crm_source_links`를 통해 중복 제거한 뒤 합산한다. 미확정 연결은 검토 대상으로만 표시한다.
- 공개 채널 리드의 확인 게이트와 SLA 예외를 유지한다. 숨긴 리드는 건수를 표시하고 사용자가 명시적으로 포함할 수 있어야 한다.
- 리드 우선순위의 `value`는 실제 원화 매출이 연결되기 전까지 상대 점수다. 금액처럼 표시하지 않는다.
- CRM 홈은 행동면과 참조면을 중복 배치하지 않는다. 요약에서 잘린 항목은 남은 건수를 표시한다.
- 외부 CRM의 한국 범위와 자동 연결 임계값은 실제 코드·운영 설정을 정본으로 확인한다.

### Notion과 자체 캘린더

- Notion에서 읽은 마케팅 캘린더 이벤트는 Supabase에 미러링하거나 양방향 쓰기하지 않는다.
- `NOTION_API_TOKEN`은 서버 전용이며 클라이언트 환경변수로 노출하지 않는다.
- Notion 읽기 실패는 다른 캘린더 원천을 망가뜨리지 않도록 격리한다.
- Classin이 자체 생성·수정하는 `admin_calendar_events`는 위 복제 금지의 대상이 아니다. 외부 원천 ID와 자체 이벤트를 혼동하지 않는다.

### 어드민 권한

- 각 Growth/Sales admin API는 `verifyAdmin()` 또는 `requireVerifiedAdminContext()`와 필요한 role/capability를 서버에서 강제한다.
- `nav_preset`은 메뉴 배치일 뿐 API 권한이 아니다.
- 데이터 접근은 `createSupabaseAdminClient()`와 해당 도메인 repository를 사용한다.

### 전량 조회

- PostgREST는 서버 `max-rows`를 넘는 행을 오류 없이 잘라 준다. 전량을 전제로 하는 조회
  (리드 보드·우선순위 큐·캠페인 귀속)는 `range` 페이지네이션으로 끝까지 넘긴다.
  `lib/repositories/leads.ts`의 `fetchAllLeadRows`가 기준 구현이다.
- 페이지 전진은 요청 크기가 아니라 실제 수신 행 수만큼 한다. 서버 상한이 요청 크기보다 작을 수 있다.
- 정렬은 전순서여야 한다. `created_at` 단독 정렬은 동시각 행이 페이지 경계에서 중복·누락되므로
  `id` 같은 타이브레이커를 함께 건다.

## 4. 검증

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

변경 범위에 따라 추가한다.

```bash
npx vitest run tests/api/lead-capture.test.ts
npx vitest run tests/repositories/leads-mode.test.ts
npx vitest run tests/repositories/leads-pagination.test.ts
npx vitest run tests/crm
```

- 이벤트 타입과 서버 allowlist 동시 등록 확인
- 크로스오리진, rate limit, honeypot, 중복 제출·재시도 분기 확인
- CRM readiness/schema contract와 source-link 중복 제거 확인
- Notion 원천 이벤트와 `admin_calendar_events`가 독립적으로 동작하는지 확인

## 5. 먼저 읽을 것

0. CRM 탭 작업이면 [CRM 탭 품질 감사(2026-08-06)](../crm-tab-quality-audit-2026-08-06.md) —
   항목별 채점, 고친 결함, 90선에 못 미친 채 남긴 항목(큐 스코어링 비용, 필터 URL 소유권)
1. `lib/server/lead-capture.ts`
2. `lib/consent/consent.ts`, `lib/analytics.ts`, `app/api/track/event/route.ts`
3. `lib/admin-crm-revenue.ts`, `lib/crm-source-linking.ts`
4. `lib/notion-marketing-calendar.ts`, `lib/calendar-data.ts`
5. 변경 대상의 admin route와 repository
