# 갈매봇 구조와 작업 리스트 (2026-09-29)

상태: 실행 로드맵. 프론트 1차는 끝났고 **서버 1단계(B6 — 조회·묻기, 쓰기는 미리보기·사람 확인)가 들어왔다(§4.1, 2026-11-25)**. 2026-11-25: 갈매봇 점검 결과로 §1·§2.3·§2.7·§3·작업 순서를 갱신했고, 작업 순서는 S1′→S2에서 **묶음 B1~B7**로 바꿨다(§4 끝). 사용자가 아직 정하지 않은 항목은 "결정 대기"(기획 §9.1)다.
기준 문서: [갈매봇 위젯·원격 오더 기획](admin-ai-widget-remote-order-plan-2026-09-28.md) — 무엇을·왜는 그 문서가 정본이고, 이 문서는 어떤 구조로·어떤 순서로 만드는지만 다룬다.
조사 방식: 조회·쓰기 후보 함수, 인증·감사, LLM·스트리밍, 마이그레이션·테스트 관례를 코드에서 대조했다. 확인하지 못한 것은 "확인 못 함"으로 적었다.

---

## 0. 한 줄 요약

화면은 이미 `AdminAiClient` 인터페이스 하나만 보고 있다. 서버는 그 뒤에 **대화 조율기 → 오더 레지스트리 → 도메인 함수** 세 층을 세우면 된다. 조회(R0)는 DB 없이 먼저 붙일 수 있고, 쓰기는 오더 저장소가 생긴 뒤에 등급 순서(R1 → R2 → R2 민감 → R3)로 연다.

## 1. 지금 있는 것과 없는 것

**선행 사실(2026-11 점검).** 이 문서 이후 **홈 MCP**(`app/api/mcp/route.ts`, `lib/mcp/server.ts`·`tools.ts`, 읽기 8 · 쓰기 2)가 들어왔다. 갈매봇이 쓸 조회 함수와 같은 업무 함수를 이미 외부 AI 클라이언트에 도구로 내놓고 있어서, **S1-2(레지스트리)는 MCP 도구를 `lib/ops-tools/`로 옮겨 정본을 하나로 만드는 일이 선행**이다(기획 §6.5). 그렇지 않으면 등급·권한·마스킹이 두 벌이 된다.

| 층 | 상태 | 위치 |
|---|---|---|
| 화면(위젯·탭·카드) | 있음 | `components/admin/ai/`, `app/admin/ai/` |
| 화면 상태·오더 상태 전이 | 있음 | `lib/admin-ai/store.ts`, `order-state.ts` |
| 대화 클라이언트 경계 | 있음(시안 구현만) | `lib/admin-ai/client.ts` |
| 대화 API · 조율기 | **있음(B6, 결정형)** — 모델 연결은 인터페이스와 가짜만 | `app/api/admin/ai/chat`, `lib/admin-ai/server/` |
| 오더 레지스트리 · 핸들러 | **없음** — 단, 홈 MCP가 도구 층 하나를 따로 갖고 있다 | `lib/mcp/tools.ts` |
| 묻기(지식·담당자·링크) 결정형 함수 | **없음** — 재료는 있다(`escalation-routing.ts`, `context.ts`, `admin-nav.ts`) | B2·B4 |
| 오더 저장소 · 확인 API | 확인 API는 **있음(B6, DB 표 없이 서명 표)**, 오더 저장소는 없음 | `app/api/admin/ai/orders/confirm`, `lib/admin-ai/server/tickets.ts` |

## 2. 구조

### 2.1 층

```
화면 (위젯 · AI 올인원 탭)
  │  AdminAiClient.ask()            lib/admin-ai/client.ts
  ▼
POST /api/admin/ai/chat              인증 · 요청 제한 · NDJSON 스트림
  │
  ▼
조율기                               한 턴: LLM ↔ 도구 호출 반복, 시간 예산
  ├─ LLM 어댑터                      Gemini function calling, 폴백
  └─ 오더 레지스트리                 오더 정의 조회, 도구 선언 생성
        │
        ├─ R0 조회 ── 바로 실행 ──▶ 도메인 읽기 함수 ──▶ 답변 블록
        └─ R1~R3 ── 미리보기만 ──▶ 오더 티켓 저장 ──▶ 오더 카드

화면 (오더 카드의 확인 · 취소 · 되돌리기)
  ▼
POST /api/admin/ai/orders/[id]/confirm|cancel|undo     ← LLM 이 부를 수 없는 경로
  │  권한 재검사 · 만료 검사 · 멱등 검사
  ▼
오더 레지스트리 ── execute / undo ──▶ 도메인 쓰기 함수 ──▶ 감사 로그
```

핵심 규칙 세 가지.

1. **LLM 은 조율기 안에만 있다.** 확인·취소·되돌리기 경로에는 LLM 호출이 없다. 갈매봇이 멈춰도 확인 대기 오더는 처리된다.
2. **핸들러는 도메인 함수를 직접 부른다.** 기존 `app/api/admin/*` 라우트를 HTTP 로 다시 부르지 않는다(`requireVerifiedAdminContext` 의 same-origin 검사에 막히고 행위자가 흐려진다).
3. **상태 전이 규칙은 한 벌이다.** `lib/admin-ai/order-state.ts` 를 화면과 서버가 같이 쓴다. 서버가 정본이고 화면은 응답으로 받은 티켓을 그린다.

### 2.2 디렉터리

```
lib/admin-ai/
  types.ts  order-state.ts  format.ts  tabs.ts        화면·서버 공용 (있음)
  order-catalog.ts  suggestions.ts                     화면용 메타 (있음 — 2.3 참고)
  client.ts  store.ts  demo-scenarios.ts               화면 (있음)
  server/                                              전부 server-only (신설)
    stream.ts            스트림 이벤트 타입과 인코더
    orchestrator.ts      한 턴 처리
    guard.ts             역할 · capability · 상한 · 멱등
    redact.ts            LLM 에 넘기기 전 마스킹
    registry.ts          오더 정의 등록 · 조회
    llm/gemini-tools.ts  function calling 어댑터
    llm/prompt.ts        시스템 지시문, 도구 선언 생성
    orders/              도메인별 오더 정의
      crm.ts  hardware.ts  calendar.ts  ledger.ts  marketing.ts
      messaging.ts  quotes.ts  payments.ts
lib/repositories/admin-ai-orders.ts                    오더 저장소 (신설)
app/api/admin/ai/
  chat/route.ts
  orders/route.ts
  orders/[id]/confirm/route.ts  cancel/route.ts  undo/route.ts
supabase/migrations/YYYYMMDD_admin_ai_orders.sql
tests/admin-ai/  tests/api/admin-ai-*.test.ts
```

- API 를 `app/api/admin/ai/` 에 두는 이유: `app/api/admin/crm/` 아래에 두면 `tests/admin/crm-role-matrix.test.ts` 의 핸들러 합계·분포를 매번 고쳐야 한다. 가드 누락은 `tests/api/admin-route-guards.test.ts` 가 경로와 무관하게 자동으로 잡는다.
- `server/orders/<도메인>.ts` 의 소유권은 그 도메인 파트에 있다([플레이북](playbook/README.md)). 어드민 코어는 `registry.ts`·`guard.ts` 규약만 갖는다. 하드웨어·견적·쇼룸의 어드민 워크플로는 그로스·CRM, 포털 인가와 결제 기반은 플랫폼 소유다.

### 2.3 카탈로그의 정본

지금 `order-catalog.ts` 는 화면 표시용 표다. 레지스트리가 생기면 **레지스트리가 정본**이 되고 카탈로그 탭은 거기서 파생한다. 다만 레지스트리는 서버 전용이라 화면이 직접 가져올 수 없다. 오더 정의를 두 부분으로 나눈다.

| 부분 | 위치 | 내용 |
|---|---|---|
| 메타 | `lib/admin-ai/order-catalog.ts` (공용) | id, 도메인, 이름, 등급, 민감 여부, 되돌리기 방식, 역할 묶음 이름 |
| 핸들러 | `lib/admin-ai/server/orders/*` (서버) | 입력 스키마, preview, execute, undo |

**갱신(2026-11).** 도구 정의의 정본은 `lib/ops-tools/registry.ts`(신설, server-only)다. 이 표의 "핸들러"는 거기로 모이고, MCP(`lib/mcp/tools.ts`)와 갈매봇이 각각 얇은 어댑터가 된다. R0는 `run` 하나, R1 이상은 `resolveTarget`·`preview`·`execute`·`undo`로 나누며 `run`을 두지 않는다. 오더 id 집합 = MCP ∪ 갈매봇 집합이 레지스트리와 같다는 시험을 둔다.

테스트로 고정할 것: 메타에 있는 id 와 핸들러가 등록된 id 가 같은 집합이다. 등급은 메타에만 있고 핸들러는 그것을 읽는다 — 등급이 두 군데에 적히지 않게 한다.

### 2.4 오더 정의

```ts
interface OrderHandler<Input, Snapshot = unknown> {
  id: string                                   // 메타의 id 와 같다
  roles: readonly AdminApiRole[]               // lib/admin-auth.ts 의 역할 묶음
  capability?: AdminCapability
  input: InputSchema<Input>                    // LLM 도구 선언도 여기서 만든다
  resolveTarget(input, admin): Promise<TargetResolution>   // 후보가 여럿이면 되묻기 카드
  preview(input, admin): Promise<OrderDraft>   // 쓰기 없음. 이전 값을 읽어 전/후를 채운다
  execute(input, admin): Promise<{ result: unknown; snapshot?: Snapshot }>
  undo?(snapshot: Snapshot, admin): Promise<void>
}
```

- `resolveTarget` 을 따로 둔 이유: 동명 고객이 여럿일 때 추측하지 않고 되묻는 것을 모든 오더가 같은 방식으로 하게 한다.
- `snapshot` 은 되돌리기에 쓸 이전 값이다. 조사 결과 대부분의 쓰기 함수에 전용 역함수가 없어(§3.2) 이전 값을 저장해 두고 다시 쓰는 방식이 기본이 된다.
- 조회(R0)는 `preview`·`undo` 없이 `execute` 만 갖는다.

### 2.5 스트림 이벤트

공개 챗봇과 같은 NDJSON(한 줄에 JSON 하나)을 쓴다. 파서는 `components/ui/FloatingChatbot.tsx` 의 줄 파서를 공용으로 뽑아 재사용한다.

| 이벤트 | 내용 | 화면 처리 |
|---|---|---|
| `step` | 진행 단계 이름 | `onStep` |
| `block` | 글 · 조회 카드 · 거절 카드 · 되묻기 카드 | 답변에 붙인다 |
| `order` | 오더 티켓(확인 대기) | 스토어에 넣고 카드로 그린다 |
| `error` | 사람이 읽을 사유 | 폴백 화면(화면 이동 목록) |
| `done` | 턴 종료 | `onDone` |

글자 단위 스트림(`delta`)은 넣지 않는다. 갈매봇 답은 짧고 카드가 중심이라 단계 표시만으로 충분하다.

### 2.6 데이터

1단계(조회)는 **테이블이 필요 없다.** 대화는 화면이 들고 있다가 최근 몇 턴을 요청에 실어 보낸다. 2단계부터 아래를 만든다.

| 테이블 | 역할 | 선례 |
|---|---|---|
| `admin_ai_orders` | 오더 티켓. 컬럼은 기획 §6.3 + `snapshot jsonb`, `expires_at`, `grace_until`, `undo_until` | `crm_write_requests` |
| `admin_ai_order_events` | 상태 변화 이력(from, to, 행위자, 사유) | `crm_write_request_events` |

- 새 테이블 관례(`20260829_showroom_bookings.sql`): `create table if not exists`, `update_updated_at` 트리거, RLS 켜고 정책 0개, `anon`·`authenticated` 회수, `service_role` 만 허용.
- `lib/db/schema-contract.ts` 에 마이그레이션 경로, 테이블 프로브, anon 프로브를 등록한다. [런북](db-migration-runbook.md)에도 적는다.
- 상태 값 목록은 `OrderState` 와 마이그레이션 CHECK 가 같아야 한다. `editing` 은 화면 전용이라 DB 에는 없다.
- 대화 본문 저장은 기획 D6(30일 보관)이 확정된 뒤에 별도 테이블로 한다.

### 2.7 보호

**MCP 토큰의 scope와 계정 결합(결정 1·2 대기).** 외부 입구(MCP)에는 토큰마다 scope(읽기·쓰기)와 만료, 연결된 어드민 계정을 둔다. 1단계는 환경변수 줄 형식 `이름:토큰:scope:만료:adminEmail`, 쓰기 scope는 기본 꺼짐이다. `internal` 플래그는 scope로만 켠다. 토큰이 DB 해시(`mcp_tokens`)로 옮겨 가는 것은 B5 뒤다(퇴사·권한 회수를 바로 반영하려고). 직원 개인 AI 계정으로 고객 연락처가 나가지 않도록 응답 직렬화 직전에 공통 가림을 적용한다(결정 7).

| 항목 | 방식 | 근거 |
|---|---|---|
| 인증 | 모든 라우트가 `requireVerifiedAdminContext` | 가드 전수 테스트가 자동 검사 |
| 역할 | 오더마다 기존 읽기·쓰기 라우트와 **같은 역할 묶음**을 쓴다 | 갈매봇으로 우회해 더 많이 보거나 쓰지 못하게 |
| capability | 티켓 작성 시와 확인 시 두 번 | 지금 목록은 `hardware.finalize` 하나. 2개 신설 필요 |
| 요청 제한 | **사용자 키**로 건다 | 기존 어드민 예시는 전부 IP 키인데 사무실은 IP 를 공유한다 |
| 시간 예산 | `maxDuration = 60`, LLM 호출당 3.5초, 턴 전체 예산 상수, 도구 호출 반복 3회 상한 | `lib/internal-cs-chat/gemini.ts` 의 예산 패턴 |
| 마스킹 | `redactPii` 로 연락처·이메일·사업자번호를 가린다 | 고객명·학원명은 가려지지 않는다 — 이름은 넘기되 연락처는 서버가 DB 에서 다시 읽는다 |
| 주입 방어 | 도구 호출은 사용자 발화 직후에만. 조회 결과를 읽은 뒤의 쓰기 제안은 버린다 | 기획 §7 |
| 감사 | 실행·되돌리기·실패를 `logAdminAudit` 과 `admin_ai_order_events` 양쪽에 | `updateLead` 등은 자체 이력이 없다 |
| 캐시 | 읽기 함수는 `unstable_cache` 를 쓰므로 요청 컨텍스트(라우트 핸들러) 안에서만 부른다 | 조율기를 크론·스크립트에서 돌리지 않는다 |

## 3. 조사에서 나온 사실

### 3.1 조회(R0)에 쓸 함수

**묻기 3종(R0, 모델 없이 결정형으로 먼저 낸다).**

| 묻기 | 함수 | 읽는 곳 | 비고 |
|---|---|---|---|
| `knowledge.ask`(A) | `buildInternalEvidence()` — `context.ts`에서 export(신설, 기존 코파일럿 출력은 그대로) | 큐레이션 지식·사고 이력·공개 문서·내부 문서 근거를 구조화한 부품 | 답 색인은 참고 칸. 상담 사례는 수만 보인다 |
| `contact.who`(D) | `resolveContact(text, { customerId? })` — 고객·딜 owner → HQ 도메인 → KR 표(없으면 기본 답) | 담당표(시드 전까지 server-only 상수, 결정 3·5 뒤 DB) | 담당자 이름은 server-only(결정 6) |
| `link.find`(C) | `lib/admin-ai/links.ts` — 어드민 고정층(`ADMIN_NAV`·팔레트 자식)과 공개 정적 경로·브로셔 URL | 허용 목록(`link_id`)만. 모델은 `link_id`만 고른다 | 고객용은 `SITE_URL` 절대화(결정 9) |

MCP 읽기 도구(견적 조회 `quote.read`·하드웨어 매출 `hardware.sales.read`·사이트 방문 `site.traffic.read`)도 같은 레지스트리의 R0로 들어온다. 쓰기 쪽 `quote.draft.create`는 R1(할인 지시만 받음, 결정 8), 하드웨어 이동 `hw_plan_movement`는 품목 id가 정확히 일치할 때만 동작한다.

| 오더 | 함수 | 기존 역할 묶음 |
|---|---|---|
| 고객·리드 검색 | `getCrmUnifiedCustomers` (`lib/repositories/crm-unified-customers.ts`) | CRM 스태프 |
| 고객 요약 · 최근 기록 | `getCrmCustomer360` (`lib/repositories/crm-customer-360.ts`) | CRM 스태프 |
| 오늘 후속조치 | `getCrmPriorityQueue`, `listCrmTasks` | CRM 스태프 |
| 재고 · 배송예정 | `getHardwareDashboard` (`lib/repositories/hardware-inventory.ts`) | 읽기 |
| 매출 요약 | `buildBranchSummaryPayload` (`lib/branch/summary-payload.ts`) | 읽기 |
| 일정 | `getEventsByRange` (`lib/calendar-data.ts`) | 읽기 |
| 캠페인 성과 | `getCachedMarketingPerf` (`lib/marketing/perf-assemble.ts`) | 읽기 |

전부 로직이 lib 에 있어 바로 부를 수 있다. 걸리는 것 두 가지.

- **주간 매출 요약 함수는 확인 못 함.** `buildBranchSummaryPayload` 는 월·분기·연 단위다. 1단계의 매출 요약은 월 단위부터 연다.
- **요청자 기준으로 읽기 범위를 좁히는 패턴이 없다.** BRANCH 역할은 접근할 수 있는 라우트만 다르고 데이터는 전체를 본다. 갈매봇도 같은 범위를 따른다.

### 3.2 쓰기에 쓸 함수와 되돌리기

| 오더 | 함수 | 로직 위치 | 되돌리기 |
|---|---|---|---|
| 할 일 생성 | `createCrmTask` | lib | 있음 — `cancelCrmTask` |
| 할 일 기한 변경 · 완료 | `updateCrmTask`, `completeCrmTask` | lib | 완료는 `reopenCrmTask`. 변경은 이전 값 재적용 |
| 고객 태그 추가 | `addCustomerTag` | lib | 있음 — `removeCustomerTag`. 이미 있던 태그였는지 미리보기에서 확인해야 한다 |
| 일정 등록 | `createEvent` | lib | `deleteEvent`(하드 삭제). 구글 캘린더 미러 부수효과 있음 |
| 컨택 기록 추가 | `addContactLog` | **라우트에 있음** | 부분적 — 기록은 지울 수 있으나 미러된 이벤트·자동 생성 할 일·상태 전환은 남는다 |
| 리드 상태 변경 | `updateLead` | **라우트에 있음**(필드 허용 목록, "연락중" 사전조건) | 이전 값 재적용. 자체 이력 없음 |
| 리드 담당 변경 | `assignLeadsGuarded` | lib | 이전 담당으로 재배정 |
| 입출고 예정 등록 | `createHardwareMovementRows` | lib | `voidHardwareMovement` |
| 입출고 확정 | `confirmPlannedHardwareMovement` | lib | **없음** — 예정 행이 복구되지 않는다 |
| 결제(수납) 확정 | `createPayment` | **라우트에 있음**(딜 일치 검사, 금액 검사, 활동 로그) | **없음** — 삭제·수정 함수가 없다 |
| 견적 금액 변경 | `createQuoteDocumentVersion` | **라우트에 있음**(권한 판정) | 현재 버전 포인터만 되돌림(추정) |

기획을 고쳐야 하는 발견.

| 발견 | 영향 |
|---|---|
| 리드 PATCH 는 담당(`assigned_to`)을 받지 않는다 | "리드 상태·담당 변경" 오더를 **상태 변경**과 **담당 변경** 둘로 나눈다. 카드 한 장에서 둘을 같이 바꾸려면 두 함수를 순서대로 부르고 부분 실패를 다뤄야 한다 |
| 컨택 기록의 부수효과가 라우트 안에 있다 | 핸들러가 `addContactLog` 만 부르면 상태 전환·CRM 미러가 빠진다. 라우트의 로직을 lib 으로 먼저 뽑는다 |
| 컨택 기록은 깨끗하게 되돌릴 수 없다 | 되돌리기를 "10분" 이 아니라 "기록만 삭제, 파생된 것은 남음" 으로 카드에 밝히거나, 되돌리기 없음으로 내린다(결정 필요) |
| 견적 버전 번호가 자동 증가하지 않는다 | 핸들러가 현재 최대 버전을 읽어 +1 한다. 동시 작성 충돌 처리가 필요하다 |
| 수납·견적은 포털 인증(`requirePortalContext`)을 쓰고 관리자는 SUPER_ADMIN·ADMIN 만 인정한다 | 두 오더의 역할 묶음은 스태프다. BRANCH·EDITOR 에는 열리지 않는다 |
| `gemini.ts` 는 CS 코파일럿 전용이다(지시문 고정, 글 응답만 파싱) | 고치지 않고 도구 호출용 어댑터를 따로 만든다. 모델 허용 목록과 예산 패턴만 가져온다 |

## 4. 작업 리스트

표기: **파트**는 [플레이북](playbook/README.md)의 소유 파트, **선행**은 먼저 끝나야 하는 작업 id.

### S0. 준비

| id | 작업 | 파트 | 선행 | 끝났다는 기준 |
|---|---|---|---|---|
| S0-1 | 스트림 줄 파서를 공용 모듈로 뽑는다 | 챗봇 | — | 공개 챗봇 동작 변화 없음, 기존 테스트 통과 |
| S0-2 | `order-catalog.ts` 를 메타 정본으로 정리(역할 묶음 이름을 실제 상수와 연결) | 어드민 코어 | — | 메타의 역할이 `lib/admin-auth.ts` 상수를 가리킨다 |
| S0-3 | 빌드를 막는 기존 결함 해소 — 내부 CS 생성 라우트가 핸들러가 아닌 함수를 내보낸다 | 챗봇 | — | 빌드의 타입 검사 통과 |

### S1. 조회 (R0) — 서버 1단계

쓰기와 테이블이 없다. 여기까지 끝나면 운영에서 켤 수 있다(기획 D13). 시안 코드는 2026-10-19 통합 병합으로 먼저 들어갔지만
노출 스위치 `NEXT_PUBLIC_ADMIN_AI_PREVIEW` 가 꺼져 있어(기본) 화면에 나오지 않는다 — 판정은 `lib/admin-ai/preview.ts` 하나(기획 D13 이행).

| id | 작업 | 파트 | 선행 | 끝났다는 기준 |
|---|---|---|---|---|
| S1-1 | 스트림 이벤트 타입과 인코더 | 어드민 코어 | S0-1 | 타입이 `AdminAiTurnResult` 와 맞물린다 |
| S1-2 | 레지스트리와 가드(역할 · capability · 상한) | 어드민 코어 | S0-2 | 메타 id 집합 = 핸들러 id 집합 테스트 |
| S1-3 | Gemini 도구 호출 어댑터 + 시스템 지시문 | 챗봇 | — | 모델 허용 목록, 호출당 · 턴 전체 예산, 실패 시 다음 모델, 전부 실패 시 폴백 |
| S1-4 | 조율기: 도구 호출 반복(상한 3), R0 즉시 실행, 쓰기 제안은 "아직 지원하지 않음" 으로 거절 | 챗봇 | S1-1~3 | 조회 결과 속 지시문으로 도구가 호출되지 않는 테스트 |
| S1-5 | 마스킹 | 챗봇 | — | LLM 요청 본문에 전화·이메일이 없다는 테스트 |
| S1-6 | `POST /api/admin/ai/chat` — 인증, 사용자 키 요청 제한, 본문 검증(잘못된 모양은 400) | 어드민 코어 | S1-4 | 가드 전수 테스트 통과, 시간 초과 시 폴백 응답 |
| S1-7 | R0 핸들러: 고객 검색 · 고객 요약 · 오늘 후속조치 | 그로스·CRM | S1-2 | 기존 라우트와 같은 역할 묶음, 대상이 여럿이면 되묻기 |
| S1-8 | R0 핸들러: 재고 · 배송예정 | 그로스·CRM | S1-2 | 배송예정과 실제 재고를 구분해 반환 |
| S1-9 | R0 핸들러: 매출 요약(월 단위) · 일정 · 캠페인 성과 | 그로스·CRM | S1-2 | 금액에 통화 표기 |
| S1-10 | R0 핸들러: 화면 이동 | 어드민 코어 | S1-2 | nav 정본에서만 파생 |
| S1-11 | 화면 연결: `adminAiClient` 를 실제 구현으로 교체, 시안 구현은 테스트·스토리용으로 남김 | 어드민 코어 | S1-6 | "시안 · 샘플 데이터" 표시가 사라진다 |
| S1-12 | 내비의 `wip` 와 "시안" 뱃지 제거 | 어드민 코어 | S1-11 | 탭 재구성 §15 갱신 |
| S1-13 | 갈매봇 장애 화면(화면 이동 목록) 연결 | 어드민 코어 | S1-11 | LLM 을 끊어도 위젯이 열리고 이동이 된다 |

### S2. 오더 저장과 R1

| id | 작업 | 파트 | 선행 | 끝났다는 기준 |
|---|---|---|---|---|
| S2-1 | 마이그레이션 `admin_ai_orders`, `admin_ai_order_events` + 스키마 계약 + 런북 | 플랫폼 | S1 | `check:db` 통과, 서울 프로젝트 적용은 승인 뒤 |
| S2-2 | 오더 저장소 | 플랫폼 | S2-1 | 상태 목록이 CHECK 와 같다는 테스트 |
| S2-3 | 확인 · 취소 · 되돌리기 API — 만료 · 권한 재검사 · 멱등 | 어드민 코어 | S2-2 | 같은 확인을 두 번 보내도 한 번만 실행 |
| S2-4 | 조율기가 쓰기 제안을 티켓으로 만든다(`preview` → 저장 → `order` 이벤트) | 챗봇 | S2-2 | 티켓 작성은 쓰기를 하지 않는다는 테스트 |
| S2-5 | 화면: `actOnOrder` 가 API 를 부르고 응답으로 전이, 확인 대기 목록을 서버에서 읽음 | 어드민 코어 | S2-3 | 새로고침해도 확인 대기 오더가 남는다 |
| S2-6 | 컨택 기록 라우트의 로직을 lib 으로 뽑는다 | 그로스·CRM | — | 라우트 동작 변화 없음 |
| S2-7 | R1 핸들러: 할 일 생성 · 태그 추가 · 일정 등록 | 그로스·CRM | S2-3 | 실행 → 되돌리기 왕복 테스트 |
| S2-8 | R1 핸들러: 컨택 기록 추가 | 그로스·CRM | S2-6, 되돌리기 결정 | 되돌리기 범위가 카드에 적힌다 |
| S2-9 | 오더함 탭을 서버 이력으로 | 어드민 코어 | S2-3 | 내 오더 · 전체, 기간, 등급 필터 |

### S3. R2 일반

| id | 작업 | 파트 | 선행 | 끝났다는 기준 |
|---|---|---|---|---|
| S3-1 | 리드 PATCH 의 허용 목록 · 사전조건을 lib 으로 뽑는다 | 그로스·CRM | — | 라우트 동작 변화 없음 |
| S3-2 | 핸들러: 리드 상태 변경, 리드 담당 변경(둘로 나눔) | 그로스·CRM | S3-1 | 전/후 값이 실제 DB 값과 같다, 이전 값 복원 |
| S3-3 | 핸들러: 할 일 기한 변경 · 완료 | 그로스·CRM | S2-7 | 기한 없음 → 있음 → 없음 복원 |
| S3-4 | 핸들러: 쇼룸 예약 확정 · 변경, 입출고 예정 등록 | 그로스·CRM | — | 실행 → 되돌리기 왕복 |
| S3-5 | 버전 충돌: 미리보기 뒤에 값이 바뀌었으면 실행하지 않고 실패 카드 | 어드민 코어 | S3-2 | 실패 사유 "그 사이 다른 사람이 바꿨습니다" |

### S4. R2 민감 변경

| id | 작업 | 파트 | 선행 | 끝났다는 기준 |
|---|---|---|---|---|
| S4-1 | capability `payment.confirm`, `amount.edit` 추가 + 회원 설정 화면에 노출 | 어드민 코어 | 기획 D9 | 부여 · 회수가 감사 로그에 남는다 |
| S4-2 | 수납 등록 · 견적 버전 라우트의 검사 로직을 lib 으로 뽑는다 | 그로스·CRM + 플랫폼(포털 인가) | — | 포털 라우트 동작 변화 없음 |
| S4-3 | 핸들러: 입출고 확정 | 그로스·CRM | S3 | capability 없으면 권한 없음 카드, 기존 감사 액션명 유지 |
| S4-4 | 핸들러: 결제(수납) 확정 | 그로스·CRM | S4-1·2, 기획 D8 | 금액은 서버가 DB 에서 읽는다, 통화 표기 |
| S4-5 | 핸들러: 견적 금액 변경 | 그로스·CRM | S4-1·2 | 서버 재계산, 버전 번호 충돌 처리, 수락된 견적 거절, 자동 발송 없음 |
| S4-6 | 수납 취소 경로 | 그로스·CRM + 플랫폼(스키마) | 기획 D10 | 결제 확정에 되돌리기가 생긴다 |

### S5. R3 발송

| id | 작업 | 파트 | 선행 | 끝났다는 기준 |
|---|---|---|---|---|
| S5-1 | 유예 실행기 — 30초 뒤 실제 발송을 누가 하는지 정한다 | 플랫폼 | S2 | 브라우저를 닫아도 유예가 끝나면 나가거나, 닫으면 취소되거나 — 둘 중 하나로 확정하고 카드에 밝힌다 |
| S5-2 | 핸들러: 문자 · 알림톡 1건, 이메일 1건 | 그로스·CRM | S5-1 | `MESSAGING_DRY_RUN` 존중, 수신 동의 확인, 1건 상한 |
| S5-3 | 핸들러: 견적 공유 링크 발송 | 그로스·CRM | S5-1 | 동의 없으면 실패 카드 |

### F. 프론트 잔여

| id | 작업 | 파트 | 선행 | 끝났다는 기준 |
|---|---|---|---|---|
| F-1 | 화면이 열린 대상을 알리는 훅(**B1 골격 구현**: `useAdminAiEntity`) + CRM 고객 상세 · 리드 서랍 · 견적 상세 · 하드웨어 품목에 적용(남음, 각 화면 소유 파트) | 어드민 코어 + 각 도메인 | — | "이 학원" 이 맥락의 대상으로 풀린다 |
| F-2 | 화면이 우하단 사용량을 알리는 훅(경로 표 대체), 오른쪽 서랍이 열리면 비켜남 | 어드민 코어 | — | `floating-slots.ts` 의 경로 표 삭제 |
| F-3 | ⌘K 에서 갈매봇으로 넘기는 항목(전역 · CRM 팔레트) | 어드민 코어 | — | 맞는 화면이 없을 때 마지막 줄에 나온다 |
| F-4 | 모바일 시트의 포커스 가두기(**B1 구현**), 키보드가 올라올 때 높이(남음) | 어드민 코어 | — | 실제 기기에서 확인 |
| F-5 | 갈매봇 그림의 디자인 규칙 예외 등재 — "마스코트 그림 한정, 화면 크롬은 불가" 한 줄 | 어드민 코어 | 기획 §12-4, 디자인 문서 소유자 동의 | `DESIGN.md` 에 마스코트 항목(B1에서는 고치지 않음) |
| F-6 | 단축키 `Ctrl/⌘ + J` 의 브라우저 충돌 확인 | 어드민 코어 | — | Chrome · Edge · Safari |

### 순서 (2026-11 갱신 — 묶음 B1~B7)

점검 결과로 "S1′(테이블 없이 묻기·조회) → S2(티켓)" 순서를 아래 묶음으로 바꿨다. 각 묶음은 모델·DB 의존이 낮은 것부터다.

| 묶음 | 내용 | 모델·DB | 선행 |
|---|---|---|---|
| **B1** | 위젯 안전·새 대화·묻기 시안·기획 문서 갱신 — 오더함 카드 경유, 질문형 판정 선행, 운영 차단, 접근성, 새 대화 N1~N5(1단계)·N7·N8, `useAdminAiEntity` 골격 | 없음 | — |
| B2 | 담당자·지식 근거의 서버 전용화와 정확도 — `escalation-routing` server-only, `resolveContact`, `buildInternalEvidence` | 없음 | — |
| B3 | 홈 MCP 보강과 공용 도구 레지스트리(`lib/ops-tools`) — scope·만료·가림·멱등 | 없음 | — |
| B4 | 링크 레지스트리와 묻기 답 카드 3종(`answer`·`links`·`contact`) | 없음 | B1 |
| B5 | DB 마이그레이션 — 담당표·MCP 토큰·오더·대화 | DB | B2 |
| B6 | 갈매봇 서버 1단계: 대화 API·조율기·결정형 폴백(조회·묻기, 쓰기 없음), `liveAdminAiClient` | 모델 선택 | B1·B2·B3·B4 |
| B7 | 쓰기 티켓·확인 API, MCP 쓰기의 티켓화, 오더함·대화 서버 저장(N6) | DB | B3·B5·B6 |

F-1(맥락 훅)은 B1에서 **골격**(`useAdminAiEntity`·등록부)이 들어갔다. 화면 연결은 각 화면 소유 파트의 일로 남는다. F-4(모바일 시트 포커스 가두기)는 B1에서 구현했다.
기존 S0~S5 표는 작업 단위의 상세로 남긴다. 순서는 위 묶음이 정한다.

```
B1 ─▶ B4 ─┐
B2 ─▶ B5 ─┼─▶ B6 ─▶ B7
B3 ────────┘
```

### 4.1 서버 1단계 구현 현황 (B6, 2026-11-25)

**되는 것**

| 영역 | 무엇이 되나 | 코드 |
|---|---|---|
| 대화 API | `POST /api/admin/ai/chat` — `requireVerifiedAdminContext`(CRM 스태프 역할: SUPER_ADMIN·ADMIN·BRANCH·EDITOR), 계정별 분당 20회, NDJSON 스트림(step·block·order·done·error), `maxDuration` 60. 본문 `{ messages(최근 12개), pageContext? }` | `app/api/admin/ai/chat/route.ts`, `lib/admin-ai/server/request.ts`, `lib/admin-ai/stream-protocol.ts` |
| 갈래 | 모델 없는 결정형이 기본. 메시지를 질문 조각(최대 4)으로 나누고 조각마다 묻기·담당자·링크·조회·쓰기·모름으로 가른다. 묻는 대상과 묻는 꼴을 함께 점수로 보며, 쓰기는 문장 끝의 시키는 꼴이 분명할 때만. 요청 갈래 둘이 가까우면 되묻기 카드(후보 2개). 시안의 질문 33·명령 8 표를 서버 시험이 같이 쓴다 | `lib/admin-ai/server/router.ts`, `orchestrator.ts`, `tests/admin-ai/fixtures/intent-table.ts` |
| 묻기(클래스인 정보) | `answerKnowledge(question, deps)` — 두괄식(결론 한 문장 → 방법 한 단계 한 줄 → 조건·주의), 확정/확인 필요 배지, 근거 출처(링크 목록 id만), 답 색인 상위 카드는 "고객용 문안" 칸(fixed·policy 카드, conf ≥ 0.7, 정책 질문엔 정책 카드만), 근거가 없으면 "근거를 찾지 못했습니다" + 담당자 + 코파일럿 링크 | `lib/admin-ai/server/knowledge.ts`, `deps.ts` |
| 담당자·링크 | `resolveContact`(열린 고객 먼저)·`findLinks` 를 카드로. 링크 목록에 맞는 화면이 없으면 근거 문서 답으로 넘긴다 | `lib/admin-ai/server/contact.ts` |
| 조회 | `lib/ops-tools` R0 도구(재고·입출고·판매·딜·견적·방문)를 스태프 행위자로 실행기를 거쳐 부른다. 요약 한 줄(두괄식, 통화·단위) + 표 + 해당 어드민 화면 링크. 도구가 없는 조회(결제·문자 이력·할 일·통화 기록·리드 상태)는 "아직 준비 중 — 화면에서" 카드 | `lib/admin-ai/server/tools.ts`, `actor.ts` |
| 쓰기 | 견적 초안(`quote_create_draft`)·HW 배송 예정(`hw_plan_movement`)만. 조율기는 **preview 만** 부르고 오더 카드(서버 계산 금액)를 낸다. 실행은 아래 확인 경로에서만 | `lib/admin-ai/server/writes.ts` |
| 확인 | `POST /api/admin/ai/orders/confirm` — 서명·만료(15분)·행위자 일치 → 역할 재검사 → 실행기(`idempotency_key` = 표 id) → 실행 직전 preview 를 다시 계산해 서명된 요약과 대조 → 감사(도구 감사 + `logAdminAudit` `admin_ai.order.confirm`). **이 경로는 모델 어댑터·조율기를 import 하지 않는다**(모듈 그래프 시험) | `lib/admin-ai/server/confirm.ts`, `tickets.ts` |
| 화면 | `liveAdminAiClient` 가 스트림을 기존 블록·카드로 그린다. 서버 오더의 확인은 서버 답으로만 완료·실패. 답 카드에 방법·주의·고객용 문안 칸 | `lib/admin-ai/client.ts`, `store.ts`, `components/admin/ai/cards/*` |

**스위치·환경변수(사용자가 정하고 넣는다)**

| 이름 | 어디 | 뜻 |
|---|---|---|
| `NEXT_PUBLIC_ADMIN_AI_LIVE` | 빌드·서버 | `"1"` 이면 실제 모드 — 위젯이 서버와 대화하고 `/api/admin/ai/chat`·`/orders/confirm` 이 열린다. 아니면 404 이고 위젯은 시안 스위치를 따른다. 판정은 `lib/admin-ai/preview.ts` `adminAiMode()` 한 곳. 운영에서도 켤 수 있다(실제 자료) — 켜는 결정은 사용자 몫 |
| `NEXT_PUBLIC_ADMIN_AI_PREVIEW` | 빌드 | 기존 시안 스위치. 실제 스위치가 꺼져 있고 운영이 아닐 때만 시안 |
| `ADMIN_AI_TICKET_SECRET` | 서버 비밀(32자 이상) | 쓰기 확인 표 서명. **없으면 쓰기는 미리보기까지만**이고 카드는 확인 버튼 대신 "화면에서 직접 등록" 링크다. 바꾸면 발급된 표가 모두 무효가 된다 |

역할: 대화·조회는 CRM 스태프 역할, 견적 초안은 견적 API 와 같은 역할 묶음, HW 배송 예정은 HW 출고 등록 API 와 같은 역할 묶음(`lib/admin-ai/server/actor.ts`). 연락처 원문은 SUPER_ADMIN·ADMIN 화면에만, 모델 입력은 늘 가린다.

**쓰기 확인 방식과 한계(DB 표 없음)**

- 표 = `{표 id, 도구, 인자, 인자 지문, 미리보기 요약 해시, 만료, 행위자}` 를 HMAC-SHA256 으로 서명한 문자열. 카드에 싣고 확인 때 그대로 돌려받는다. 인자는 서명만 하고 암호화하지 않는다(본인이 방금 미리본 값).
- 같은 표를 두 번 눌러도 실행은 한 번 — 실행기의 idempotency 는 **인스턴스 메모리** 기준이다. HW 배송 예정은 도메인 행으로도 다시 찾지만, 견적 초안은 실을 칸이 없어 인스턴스가 다르면 두 번 만들어질 수 있다(B7 오더 저장소에서 막는다).
- 표를 서버가 지우지 못한다(일회용 판정이 메모리) — 만료 15분이 상한이다. 오더함은 새로고침하면 사라진다(서버 이력 없음).
- 되돌리기는 이번 범위가 아니다 — 카드에 "되돌리기는 화면에서".
- 문자 발송·결제 확정·금액 변경·리드 변경·할 일·삭제 등 다른 오더는 "아직 준비 중 — 화면에서" 카드다.

**검토 고침(2026-11-25, 서버 1단계 검토)**

| 무엇 | 어떻게 | 코드·시험 |
|---|---|---|
| 결론이 질문에 대한 답인가 | 1순위 근거와 결론 문장을 질문 낱말(조사·어미를 덜고, 일반어는 반만)과 겹치는 정도로 고른다. 정리 지식을 무조건 앞세우지 않는다. 겹침이 질문 무게의 60% 미만이면 "근거를 찾지 못했습니다" | `knowledge.ts`, `tests/admin-ai/server/knowledge-relevance.test.ts`(실제 정리 지식) |
| 질문 둘이면 둘 다 | 쉼표 없는 "…알려 주고 …", "…등록하고 … 만들어 줘", "A 목록이랑 B 목록 보여 줘"를 끊는다(양쪽 꼴을 본 뒤에만). 앞 조각은 원형 꼬리로 되돌린다("설명해 주고" → "설명해 줘"). 조각 4개를 넘으면 "나머지는 다시 물어봐 주세요" 한 줄. 쓰기 둘이면 둘째는 "한 번에 하나" | `router.ts`, `orchestrator.ts`, `router-recall.test.ts`, `orchestrator-compound.test.ts` |
| 조회 재현율·미끼 | "몇 명", "뭐야", 명사로 끝나는 조회(재고·품목·현황…), "출고된", "주문 권장"을 조회로. "…만드는 법"은 지식, "누가 …했는지"는 담당자가 아니다. "화면·페이지 어디 있어"는 링크 | `router.ts` |
| 링크 | "화면·메뉴·페이지"는 어드민 링크 먼저, "공개·고객용"은 공개 주소 먼저. 낱말 절반 이상이 맞아야 낸다. 링크를 청했으면 지식과 같은 점수일 때 링크 | `contact.ts`, `router.ts` |
| 기간 말 | 오늘·어제·이번/지난 주·이번/지난달·올해·최근 N일(KST). 입출고는 기간으로 거른다(100건 안). 견적 목록은 기간을 거르지 못해 기간을 물으면 합계를 결론으로 내지 않는다. 방문 비교는 화면으로 | `tools.ts`, `tools-period.test.ts` |
| 끊김·시간 | 클라이언트: done 없이 끝나거나 연결이 끊기면 받은 블록 + "답이 중간에 끊겼습니다", 전체 45초 상한. 조율기: 조각마다 15초 상한 → "시간이 넘었습니다 — 화면에서" 카드 | `client.ts`, `orchestrator.ts`, `live-client.test.tsx` |
| 겉모양 | 한 턴 안에서 같은 담당자·코파일럿 카드는 한 번. 뒤 조각이 담당자를 물으면 앞 조각의 담당자 카드는 뺀다. 표의 상태 코드는 한국어 이름표 | `orchestrator.ts`, `tools.ts` |
| 실제 모드 첫 화면 | 시안 시나리오 문장(표본 기관 이름) 대신 실제로 되는 일만, 기관 이름 없는 문장으로 추천. 사이드바 "시안" 배지는 실제 모드에서 뺀다 | `suggestions.ts`, `AdminAiHome.tsx`, `admin-nav.ts`, `live-suggestions.test.ts` |
| 확인 경로의 import | 공용 레지스트리 대신 쓰기 정의만 담은 표(`write-tools.ts`). 그래프 시험이 `lib/chatbot/llm`·`service`·`internal-cs-chat/gemini`·레지스트리를 금지 | `confirm/route.ts`, `writes-confirm.test.ts` |
| 입력 | 화면 맥락 경로의 `..`·`//`·역슬래시 거절, 연락처 꼴 이름표는 비움, 본문 64KB 넘으면 413. 계정 id 없는 세션의 행위자 키는 출처·역할·이름 해시 | `request.ts`, `chat/route.ts`, `actor.ts`, `input-guards.test.ts` |

**`ADMIN_AI_TICKET_SECRET` 을 운영에 넣기 전 조건(검토 안전-2, 미해결)**: 같은 표를 서로 다른 서버 인스턴스에 동시에 보내면 견적 초안이 두 번 만들어질 수 있다(일회용 판정이 인스턴스 메모리). 운영에 비밀을 넣기 전에 ① 이미 쓰는 분산 저장(Upstash)에 표 id 를 한 번만 넣는 방식(SET NX, 15분)으로 막거나 ② B7 오더 저장소가 붙은 뒤에 넣는다 — 사용자가 정한다. 비밀이 없으면 쓰기는 미리보기까지만이라 이 길은 열리지 않는다.

**아직인 것**

- 모델 연결(Vertex·Claude): `lib/admin-ai/server/llm/adapter.ts` 인터페이스(`route`·`pick`)와 시험용 가짜만 있다. `getAdminAiModelAdapter()` 는 늘 null — 키·공급자 결정(기획 §9.1 결정 11) 뒤에 붙인다.
- 답 색인 doc 카드(문서 문장 조립)·howto 카드는 고객용 문안으로 쓰지 않는다(공개 챗봇 서비스 조립 함수가 필요하다). 상담 사례 건수는 deps 칸만 있고 기본 연결은 꺼져 있다(임베딩 검색 비용·R17 범위 결정 전).
- CRM 조회(고객 360·오늘 후속조치)·화면 이동 도구·장애 화면(S1-7·S1-10·S1-13), 위컴 방 어댑터(조율기는 화면과 무관한 `runTurn`·`collectTurn` 이라 그대로 부를 수 있다).
- B7: 오더 저장소·취소·되돌리기·MCP 쓰기의 표 통일·오더함 서버 영속.

## 5. 아직 정해지지 않은 것

2026-11 점검에서 새로 생긴 결정 13개는 기획 [§9.1](admin-ai-widget-remote-order-plan-2026-09-28.md#91-갈매봇-점검-결정-대기-2026-11-25)에 질문·선택지·추천과 함께 모았다(**결정 대기**). 이 표의 항목과 겹치는 것은 D4·D6 정도다.

| 질문 | 막는 작업 |
|---|---|
| "결제 확정" 의 대상 — 거래건 수납 등록인가 도입 신청인가 (기획 D8) | S4-4 |
| 신설 권한 두 개를 누구에게 주는가 (D9) | S4-1 |
| 수납 취소 경로를 만드는가 (D10) | S4-6 |
| R2 민감 변경의 확인을 버튼 한 번으로 둘 것인가 | S4-3~5 |
| 컨택 기록의 되돌리기 범위 | S2-8 |
| 발송 유예 중 브라우저를 닫으면 나가는가 취소되는가 | S5-1 |
| BRANCH 역할에 어디까지 여는가 (D4) | S1-7~9 |
| 대화 본문 보관 기간 (D6) | 대화 저장 테이블 |
| 갈매봇이 공개 챗봇과 같은 캐릭터인가, 그림의 파랑을 예외로 둘 것인가 | F-5 |

S1 은 위 질문 중 BRANCH 범위 하나만 걸린다. 정해지기 전에는 각 조회의 기존 역할 묶음을 그대로 따른다.

## 6. 검증

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npx vitest run tests/admin-ai tests/api tests/admin
npm run build
```

- 마이그레이션을 건드리면 `npm run check:db`.
- LLM 호출을 건드리면 시간 초과·전 모델 실패·빈 응답 세 경우의 폴백 테스트.
