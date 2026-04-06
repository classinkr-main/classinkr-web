# Admin Partners Phase 1 Execution Plan

기준 시점: 2026-04-03  
관련 문서:

- `docs/admin-partners-ops-design.md`
- `docs/admin-partners-supabase-schema.sql`

## 1. 목적

현재 `/admin/partners`는 파트너 CRUD와 거래/문서/일정/매출 입력까지는 가능하지만, 실제 운영팀이 쓰는 "실행 허브"로는 아직 부족하다.

Phase 1의 목표는 아래 두 가지다.

1. 리스트를 "운영 큐"로 바꾼다.
2. 상세를 "업무 큐 + 맥락 + 다음 단계" 중심 워크스페이스로 재구성한다.

이번 문서는 실제 구현을 시작할 수 있도록 화면 구조, 타입, API, 데이터 계약, 단계별 구현 순서를 구체화한다.

## 2. 현재 문제 요약

### 2-1. 제품 구조 문제

- 리스트가 "어느 파트너를 지금 처리해야 하는가"보다 "등록된 파트너를 어떻게 찾는가"에 가깝다.
- 상세가 `개요 / 거래 / 일정 / 정산/문서 / 실적 / 자동화`로 나뉘어 있어, `견적 -> 계약 -> 이행 -> 정산 -> 로그` 흐름이 끊긴다.
- `이행 체크`, `로그/이슈`, `문서 전달 상태`, `열람 이력`이 UI에 없다.
- 거래 저장 후 다음 작업으로 이어지는 CTA가 없어서 운영자가 탭을 옮겨 다니며 수작업으로 이어붙여야 한다.

### 2-2. 기술 구조 문제

- 목록 페이지가 전체 워크스페이스 그래프를 조회한 뒤 클라이언트에서 재집계한다.
- 상세 페이지가 너무 큰 단일 클라이언트 컴포넌트로 묶여 있다.
- 캘린더가 파트너 일정만 필요해도 전체 파트너 워크스페이스를 읽는다.
- Supabase 실패 시 쓰기까지 로컬 JSON으로 폴백되어 데이터 split-brain 위험이 있다.

## 3. Phase 1 범위

### 3-1. 포함

- `/admin/partners` 운영 큐 개편
- `/admin/partners/[id]` 상세 IA 개편
- `거래 흐름` 탭 재구성
- `이행 체크` 탭 신규 추가
- `문서 운영` 탭 재구성
- `로그/이슈` 탭 신규 추가
- 캘린더용 일정 전용 조회 분리
- 리스트 summary DTO 분리
- 상세 탭별 DTO 분리
- `dealId` 정합성 검증
- Supabase 실패 시 쓰기 차단

### 3-2. 제외

- 외부 파트너 포털
- 전자서명 연동
- 카카오 알림 실발송
- 문서 링크 공개 페이지
- 체크리스트 템플릿 고도화
- SLA 에스컬레이션 자동화

## 4. 목표 정보구조

### 4-1. 리스트 페이지

```text
/admin/partners
  ├─ 상단 KPI
  ├─ 큐 토글
  ├─ 운영 리스트
  └─ 빠른 액션
```

### 4-2. 상세 페이지

```text
/admin/partners/[id]
  ├─ 헤더
  ├─ 상단 요약 스트립
  ├─ Workspace
  ├─ Deal Flow
  ├─ Fulfillment
  ├─ Documents
  ├─ Logs & Issues
  └─ Automations
```

## 5. 화면 설계

### 5-1. `/admin/partners`

이 페이지는 "파트너 검색"보다 "운영 우선순위 확인"이 먼저다.

#### 상단 KPI

- 활성 파트너 수
- 계약 검토 대기 수
- 설치/납품 진행 수
- 정산 지연 수
- 미해결 이슈 수

#### 큐 토글

- `전체`
- `계약 대기`
- `설치 진행`
- `정산 지연`
- `이슈 필요`
- `주의/휴면`

#### 운영 리스트 컬럼

- 파트너명
- 채널/유형
- 담당자
- 메인 거래 단계
- 다음 액션 시각
- 미완료 체크리스트 수
- 미해결 이슈 수
- 정산 리스크
- 최근 로그 요약

#### 빠른 액션

- 파트너 추가
- 새 거래 시작
- 체크리스트 생성
- 문서 생성
- 미팅 로그 추가

#### UX 원칙

- 첫 줄에서 "왜 이 파트너를 지금 봐야 하는지"가 보여야 한다.
- 숫자만 있는 카드보다 행동 유도형 큐가 우선이다.
- 검색은 보조 수단이고, 기본 진입은 큐 필터다.

### 5-2. `/admin/partners/[id]`

#### 헤더

- 파트너명
- 채널
- 지역
- 대표 담당자
- 내부 담당자
- 메인 거래 단계
- 다음 액션
- 계약 리스크
- 정산 리스크
- 최근 이슈 상태

#### 고정 액션

- 새 견적 생성
- 계약 문서 생성
- 체크리스트 생성
- 미팅 로그 추가
- 이슈 등록

#### 상단 요약 스트립

- 메인 거래 단계
- 오늘 처리할 일
- 설치 진행률
- 정산 필요 문서 수
- 이번 달 판매량
- 최근 미팅
- 다음 액션

### 5-3. 상세 탭 구조

#### 1. Workspace

이 탭은 설정이 아니라 "오늘 무엇을 해야 하는가"를 보여준다.

구성:

- 좌측: 오늘 할 일, 이번 주 마감, 파트너 응답 대기
- 중앙: 통합 타임라인
- 우측: 판단 필요 이슈

#### 2. Deal Flow

이 탭은 `견적 -> 계약 -> 매출` 흐름을 한 덩어리로 본다.

구성:

- 단계별 파이프라인
- 거래 카드
- 다음 단계 CTA

다음 단계 CTA 예시:

- 견적 저장 후 `계약 문서 생성`
- 계약 확정 후 `체크리스트 생성`
- 설치 완료 후 `정산/매출 기록 생성`

#### 3. Fulfillment

하드웨어 총판 운영의 핵심 탭이다.

구성:

- 체크리스트 그룹
- 품목/수량
- 설치 상태
- 담당자
- 마감일
- 누락/이슈 메모

그룹 예시:

- 설치 품목
- 수량 검수
- 출고/납품
- 현장 설치
- 후속 지원

#### 4. Documents

이 탭은 파일 보관소가 아니라 문서 운영 센터다.

구성:

- 문서 원본 목록
- 전달 상태
- 만료/비밀번호/다운로드 정책
- 최근 열람 로그
- 재발급/재전송 액션

Phase 1에서는 전체 전달 센터를 다 만들지 않더라도 아래는 보여야 한다.

- 문서 종류
- 거래 연결
- 상태
- 금액/기간
- 전달 상태 요약
- 만료 여부

#### 5. Logs & Issues

운영 로그와 판단 필요 이슈를 한 화면에서 다루되 모델은 구분한다.

좌측:

- 고객 미팅 로그
- 전화/카카오/이메일 로그
- 계약 로그
- 내부 메모/결정 로그

우측:

- open issues
- waiting issues
- blocked issues
- due soon issues

#### 6. Automations

자동화는 별도 탭으로 두되, 입력 원천은 다른 탭 데이터다.

표시:

- 자동화 이름
- 상태
- 트리거
- 대상 거래/문서
- 최근 실행
- 다음 실행
- 실패 사유

## 6. 프런트엔드 구조 제안

### 6-1. 페이지 단위

```text
app/admin/partners/page.tsx
  -> summary list query
  -> PartnerQueuePageClient

app/admin/partners/[id]/page.tsx
  -> workspace shell query
  -> PartnerWorkspaceShell
```

### 6-2. 상세 클라이언트 분리

```text
components/admin/partners/
  PartnerWorkspaceShell.tsx
  PartnerWorkspaceHeader.tsx
  PartnerWorkspaceOverviewTab.tsx
  PartnerDealFlowTab.tsx
  PartnerFulfillmentTab.tsx
  PartnerDocumentsTab.tsx
  PartnerLogsIssuesTab.tsx
  PartnerAutomationsTab.tsx
```

원칙:

- 탭마다 자기 상태와 저장 로직을 가진다.
- 전체 `workspace`를 하나의 큰 `useState`로 들고 있지 않는다.
- 탭 전환 시 URL query로 현재 탭을 유지한다.
- 무거운 탭은 필요 시 lazy load한다.

### 6-3. 즉시 적용할 UX 개선

- 리스트 검색에 `useDeferredValue` 적용
- 탭 상태 URL 동기화
- 모바일 폼 1열 레이아웃 전환
- 캘린더 오류 메시지 노출
- hover-only 액션에 텍스트 버튼 대체 제공
- 캘린더 자체 모달을 공용 `Dialog`로 교체

## 7. 타입 설계

## 7-1. 리스트용 Summary DTO

```ts
export interface PartnerQueueSummary {
  partnerId: string
  partnerName: string
  status: "lead" | "active" | "paused" | "churn_risk"
  channel: "direct" | "reseller" | "referral" | "branch"
  region: string
  accountManager: string
  ownerName: string
  mainDealStage?: DealStage
  mainDealTitle?: string
  nextActionAt?: string
  openChecklistCount: number
  openIssueCount: number
  overdueDocumentCount: number
  pendingSettlementCount: number
  latestActivitySummary?: string
  latestActivityAt?: string
  riskLevel: "low" | "medium" | "high"
}
```

리스트에는 `deals/documents/schedule/sales` 원본 배열 전체를 싣지 않는다.

## 7-2. 상세 공통 타입

```ts
export interface PartnerWorkspaceHeaderData {
  partner: PartnerSummary
  mainDeal?: PartnerDeal
  nextActionAt?: string
  todayTodoCount: number
  openIssueCount: number
  pendingDocumentCount: number
  currentMonthSalesUnits: number
  currentMonthNetAmount: number
  lastMeetingAt?: string
  fulfillmentProgress: number
}
```

## 7-3. 신규 도메인 타입

```ts
export interface PartnerContact {
  id: string
  partnerId: string
  name: string
  role?: string
  email?: string
  phone?: string
  isPrimary: boolean
}

export interface PartnerOpsChecklistItem {
  id: string
  partnerId: string
  dealId?: string
  parentItemId?: string
  checklistGroup: string
  title: string
  itemCategory?: string
  itemCode?: string
  itemName?: string
  plannedQuantity?: number
  confirmedQuantity?: number
  todoStatus: "open" | "waiting_partner" | "waiting_internal" | "blocked" | "done" | "canceled"
  installStatus: "planned" | "ordered" | "delivered" | "installed" | "verified" | "issue"
  ownerName?: string
  dueAt?: string
  completedAt?: string
  notes?: string
}

export interface PartnerOpsIssue {
  id: string
  partnerId: string
  dealId?: string
  relatedDocumentId?: string
  relatedChecklistItemId?: string
  title: string
  category: "contract" | "installation" | "settlement" | "customer_request" | "internal_decision"
  severity: "low" | "medium" | "high" | "critical"
  status: "open" | "waiting" | "blocked" | "resolved"
  facts?: string
  unresolvedPoints?: string
  ownerName?: string
  nextCheckAt?: string
  dueAt?: string
  resolutionSummary?: string
}

export interface PartnerActivityLog {
  id: string
  partnerId: string
  dealId?: string
  documentId?: string
  scheduleItemId?: string
  checklistItemId?: string
  issueId?: string
  logCategory: string
  status: "recorded" | "follow_up_needed" | "waiting_partner" | "waiting_internal" | "blocked" | "resolved" | "canceled"
  action: string
  summary: string
  details?: string
  actorName?: string
  nextAction?: string
  dueAt?: string
  occurredAt: string
}

export interface PartnerDocumentDeliverySummary {
  id: string
  partnerDocumentId: string
  deliveryChannel: "pdf" | "kakao" | "link"
  status: "draft" | "ready" | "sent" | "opened" | "expired" | "revoked" | "failed"
  recipientName?: string
  recipientEmail?: string
  recipientPhone?: string
  expiresAt?: string
  passwordEnabled: boolean
  allowDownload: boolean
  allowPrint: boolean
  sentAt?: string
  lastViewedAt?: string
  viewCount: number
}
```

## 7-4. 입력 타입 원칙

- `Summary`와 `MutationInput`을 분리한다.
- 날짜 입력은 클라이언트에서 timezone 포함 ISO로 보낸다.
- `dealId`가 넘어오면 서버에서 소유권을 다시 검증한다.
- `notes`는 보조 메모로만 쓰고, 운영 판단 대상은 `Issue`로 올린다.

## 8. API 설계

## 8-1. 목록

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/admin/partners` | 운영 큐 summary 목록 조회 |
| `POST` | `/api/admin/partners` | 파트너 생성 |
| `PATCH` | `/api/admin/partners/:id` | 파트너 기본 정보 수정 |
| `PATCH` | `/api/admin/partners/:id/archive` | 아카이브/비활성 처리 |

권장 query:

- `queue=all|contract_waiting|fulfillment_active|settlement_delayed|issue_needed|caution`
- `search=...`
- `manager=...`
- `cursor=...`
- `limit=...`

## 8-2. 상세 shell

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/admin/partners/:id` | 헤더/요약 스트립용 최소 데이터 조회 |

상세 shell 응답은 아래만 포함한다.

- partner summary
- main deal
- next action
- KPI strip
- recent flags

탭 데이터 전체를 한 번에 싣지 않는다.

## 8-3. 거래 흐름

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/admin/partners/:id/deals` | 거래 목록 |
| `POST` | `/api/admin/partners/:id/deals` | 거래 생성 |
| `PATCH` | `/api/admin/partners/:id/deals/:dealId` | 거래 수정 |
| `POST` | `/api/admin/partners/:id/deals/:dealId/next-step` | 다음 단계 생성 |

`next-step` payload 예시:

- `create_contract_document`
- `create_fulfillment_checklist`
- `create_sales_record`

## 8-4. 이행 체크

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/admin/partners/:id/checklists` | 체크리스트 목록 |
| `POST` | `/api/admin/partners/:id/checklists` | 체크리스트 생성 |
| `PATCH` | `/api/admin/partners/:id/checklists/:itemId` | 체크리스트 수정 |
| `POST` | `/api/admin/partners/:id/checklists/from-deal/:dealId` | 거래 기반 템플릿 생성 |

## 8-5. 문서 운영

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/admin/partners/:id/documents` | 문서 목록 |
| `POST` | `/api/admin/partners/:id/documents` | 문서 생성 |
| `PATCH` | `/api/admin/partners/:id/documents/:documentId` | 문서 수정 |
| `GET` | `/api/admin/partners/:id/documents/:documentId/deliveries` | 전달본 조회 |
| `POST` | `/api/admin/partners/:id/documents/:documentId/deliveries` | 전달본 생성 |
| `PATCH` | `/api/admin/partners/:id/documents/:documentId/deliveries/:deliveryId` | 전달 상태/정책 수정 |

Phase 1에서는 deliveries를 조회 중심으로만 시작해도 된다.

## 8-6. 로그/이슈

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/admin/partners/:id/activity-logs` | 로그 목록 |
| `POST` | `/api/admin/partners/:id/activity-logs` | 로그 추가 |
| `GET` | `/api/admin/partners/:id/issues` | 이슈 목록 |
| `POST` | `/api/admin/partners/:id/issues` | 이슈 생성 |
| `PATCH` | `/api/admin/partners/:id/issues/:issueId` | 이슈 수정/해결 |

## 8-7. 일정

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/admin/partners/:id/schedule` | 일정 목록 |
| `POST` | `/api/admin/partners/:id/schedule` | 일정 생성 |
| `PATCH` | `/api/admin/partners/:id/schedule/:itemId` | 일정 수정 |

추가 규칙:

- `syncToAdminCalendar` 플래그를 모델에 올린다.
- 캘린더 전용 조회는 월 범위 기반으로 별도 구현한다.

## 8-8. 캘린더

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/admin/partner-calendar?from=...&to=...` | 파트너 일정 전용 캘린더 피드 |

이 API는 `partner_schedule_items`만 읽고 아래만 반환한다.

- event id
- partner id/name
- deal id/title
- title
- startsAt / endsAt
- status
- syncToAdminCalendar

## 9. 서버/쿼리 설계

### 9-1. 리스트 조회 전략

현재처럼 파트너 하위 엔티티 전체를 메모리에서 묶지 않는다.

권장:

- summary view 또는 RPC
- partner 기준 aggregate count
- 최근 activity 서브쿼리
- queue 계산용 derived field

### 9-2. 상세 조회 전략

상세는 shell + 탭별 lazy query로 쪼갠다.

- shell: partner summary, KPI strip
- deals tab: deals only
- fulfillment tab: checklist only
- documents tab: docs + delivery summary
- logs/issues tab: activity logs + issues

### 9-3. 캘린더 조회 전략

- 월 범위로만 조회
- `sync_to_admin_calendar = true`
- `status = planned`
- 필요한 최소 필드만 반환

## 10. 검증 규칙

### 10-1. 정합성

- `dealId`는 반드시 같은 `partnerId` 소속인지 서버에서 검증
- `document.dealId`, `schedule.dealId`, `sales.dealId`, `checklist.dealId`, `issue.dealId` 모두 동일 원칙 적용
- `salesMonth`는 `partnerId + dealId + month` 기준 중복 검증
- `dealId`가 없는 월별 집계는 별도 unique 규칙 필요

### 10-2. 날짜/시간

- 클라이언트 입력은 timezone 포함 ISO 사용
- 서버 저장은 UTC 기준
- 표시만 로컬 타임존으로 변환

### 10-3. 장애 처리

- Supabase 읽기 실패 시 read-only fallback은 가능
- Supabase 쓰기 실패 시 local write fallback 금지
- 저장 실패는 운영자에게 명시적으로 노출

## 11. 권장 구현 순서

### Phase 1-A. 빠른 wins

- 리스트 검색 `useDeferredValue`
- 탭 URL 동기화
- 모바일 폼 1열화
- 캘린더 에러 표시
- 일정 전용 캘린더 조회 분리
- Supabase 쓰기 fallback 제거

### Phase 1-B. 구조 리팩터

- summary DTO 도입
- 상세 shell + 탭 분리
- `PartnerWorkspaceDetailClient.tsx` 분해
- 공용 mutation 훅 또는 resource action helper 정리

### Phase 1-C. 핵심 기능 추가

- `PartnerContact`
- `PartnerOpsChecklistItem`
- `PartnerOpsIssue`
- `PartnerActivityLog`

### Phase 1-D. 문서 운영 고도화

- `DocumentDeliverySummary`
- 전달 상태 뱃지
- 만료/열람 요약
- 재발급 액션 자리 확보

## 12. 파일 영향 범위 제안

### 새로 생길 가능성이 높은 파일

```text
components/admin/partners/PartnerQueuePageClient.tsx
components/admin/partners/PartnerWorkspaceShell.tsx
components/admin/partners/PartnerWorkspaceOverviewTab.tsx
components/admin/partners/PartnerDealFlowTab.tsx
components/admin/partners/PartnerFulfillmentTab.tsx
components/admin/partners/PartnerDocumentsTab.tsx
components/admin/partners/PartnerLogsIssuesTab.tsx
components/admin/partners/PartnerAutomationsTab.tsx

lib/partners-summary-data.ts
lib/partner-calendar-data.ts

app/api/admin/partners/[id]/checklists/route.ts
app/api/admin/partners/[id]/issues/route.ts
app/api/admin/partners/[id]/activity-logs/route.ts
app/api/admin/partner-calendar/route.ts
```

### 수정 가능성이 높은 기존 파일

```text
lib/partners-types.ts
lib/partners-data.ts
lib/calendar-data.ts
app/admin/partners/page.tsx
app/admin/partners/[id]/page.tsx
components/admin/partners/PartnerWorkspacePageClient.tsx
components/admin/partners/PartnerWorkspaceDetailClient.tsx
app/admin/calendar/page.tsx
```

## 13. 이번 Phase 1의 완료 기준

아래가 충족되면 Phase 1 완료로 본다.

1. 리스트에서 "지금 손이 가야 할 파트너"를 큐 기준으로 볼 수 있다.
2. 상세 첫 화면에서 오늘 할 일, 최근 맥락, 판단 필요 이슈를 같이 볼 수 있다.
3. 거래 저장 후 다음 단계로 이어지는 CTA가 있다.
4. 이행 체크와 로그/이슈가 notes 밖의 독립 모듈로 존재한다.
5. 캘린더가 일정 전용 쿼리로 동작한다.
6. Supabase 저장 실패가 로컬 저장으로 조용히 대체되지 않는다.

## 14. 실무 권장 결론

가장 먼저 해야 할 일은 새 기능을 많이 붙이는 것이 아니라, `리스트/상세 IA`와 `데이터 계약`을 다시 자르는 것이다.

권장 순서는 아래와 같다.

1. 리스트를 summary 기반 운영 큐로 바꾼다.
2. 상세를 shell + 탭 구조로 분해한다.
3. 체크리스트와 이슈/로그를 붙인다.
4. 문서 전달 상태와 열람 요약을 붙인다.
5. 그 다음에 자동화와 외부 전달 경험을 확장한다.
