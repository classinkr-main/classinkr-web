# CRM 통합 마스터 설계 (정합화)

기준 시점: 2026-06-27
상태: 설계 정합화 캐논 (single source of truth for CRM design)
범위: ClassIn Home Admin CRM의 모든 기존 설계 문서를 하나의 정합된 캐논으로 통합한다. "Next Action First" 작업대 문화 적합 지침에 정렬하고, 실제 빌드 상태(built / partial / designed)에 정직하게 근거를 둔다. 데이터 모델, 정보구조, Task 모델, Capture Layer, 서비스 위험·NEO 싱크, 데이터 신뢰 규칙, 단계 로드맵, 비기능 제약을 다룬다.

이 문서가 정합화/대체하는 문서:
- `docs/superpowers/specs/2026-06-27-crm-next-action-culture-fit-design.md` (캐논 원천 — 원칙·화면 우선순위·Phase 번호의 권위 출처)
- `docs/superpowers/specs/2026-06-27-crm-capture-layer-design.md` (Capture Layer 설계 — 백엔드 빌드 완료, UI 미빌드)
- `docs/superpowers/specs/2026-06-18-neo-crm-customer-snapshot-design.md` (cron 주기 부분 대체, 패리티 원칙 유지)
- `docs/active/sales-crm-phase0-phase1-discussion-2026-06-27.md`
- `docs/active/internal-crm-backend-operating-plan-2026-06-26.md`
- `docs/active/crm-phase0-spike-findings-2026-06-24.md`
- `docs/active/crm-merge-redesign-2026-06-24.md` (phase 번호 대체, Tier-B no-ML 결정 유지)
- `docs/active/crm-ia-phase3-plan-2026-06-12.md`
- `docs/active/crm-sheet-revenue-sync-plan.md`
- `docs/active/neo-crm-integration-request.md`
- `docs/active/lead-funnel-consent-auth-scoring-plan-2026-06-14.md` (유지/load-bearing — getLeadActivity + buildLeadPriorityItem 응답속도 스코어링의 근거)
- `docs/superpowers/specs/2026-04-22-crm-admin-merger-design.md` (전체 대체 — 7탭 워크스페이스 폐기)

동반 문서: [CRM 지식 공백 & 선결 입력 레지스터](docs/active/crm-knowledge-gaps-register-2026-06-27.md) — 더 디벨롭/더 편하게 하기 위해 알아야 할 것(측정 공백·데이터 의존 붕괴점·인간이 답할 결정).

§3 IA 개정(2026-06-27 결정): 6섹션 **배치**를 상단 탭 → **글로벌 사이드바 CRM 확장 + 컨텍스트 sub-tab**으로 변경(섹션 수·불변식 동일, 배치만). 상세·시퀀싱: [구조·핵심기능 적용 기획](docs/active/crm-structure-feature-adoption-plan-2026-06-27.md) §2.5. (구현은 공유 AdminSidebar 미커밋 변경 해소 후.)

---

## 1. 문서 위상 & 정합화 선언

이 문서가 CRM 설계의 **단일 진실원천**이다. 충돌이 발생하면 본 문서의 결정이 우선한다. 권위 순서는 다음과 같다.

1. **빌드된 코드/마이그레이션** — 실제 실행 중인 스키마/로직이 캐논. (예: `crm_tasks.owner_key`, `task_type='other'`, capture 스키마)
2. **2026-06-27 culture-fit 캐논** — 원칙·화면 우선순위·Phase 번호의 권위. 미빌드 영역(예: `crm_service_risk_snapshots`)은 이 문서가 설계 권위.
3. **그 외 보조 문서** — 자기 niche 안에서만 유효.

문서별 위상 표:

| 문서 | 위상 | 비고 |
|------|------|------|
| 2026-06-27 culture-fit | **캐논(유지)** | 원칙·화면·Phase 번호 권위 |
| 2026-06-27 capture-layer | **캐논(유지, 단 스키마는 빌드본 우선)** | 백엔드 빌드 완료, UI 미빌드 |
| crm-phase0-spike-findings | **유지(load-bearing)** | CollectionPlan→Collection 교정, 3-identity-space, polymorphic events, HW 절대 합산 금지 |
| crm-merge-redesign | **부분 대체** | Tier-B no-ML/no-`전환확률%` 유지, phase 0-3 번호 폐기 |
| crm-sheet-revenue-sync-plan | **유지** | `branch_rev_deals` 원천, 색상 분해(red=확정/blue=임박) 유지 |
| sales-crm-discussion | **유지** | "top-level 탭 추가 금지" 규칙 원천 |
| internal-crm-operating-plan | **부분 대체** | 자체 CRM 원칙 유지, phase 0-5 번호 폐기 |
| neo-crm-customer-snapshot-design | **부분 대체** | "숫자 회귀 0" 패리티 원칙·live-compute 재사용 유지, 4×/일 cron 폐기, 6-task 롤아웃 번호(Migration→rollup→…→quality gate) 폐기, generic rollup은 선택적 perf로 강등 |
| neo-crm-integration-request | **부분 대체** | HQ lead-push 협상 아티팩트 유지, 실시간 양방향 write-back 자세는 §13 read-mostly로 무효화 |
| crm-ia-phase3-plan | **유지(기계적 URL 정리)** | `/partners/*`→`/deals/*` 리다이렉트 스텁 (이미 적용) |
| lead-funnel-consent-auth-scoring-plan | **유지(load-bearing)** | `getLeadActivity`(인증신호 join + provider/consent/marketing-consent 배지) + `buildLeadPriorityItem` 응답속도 스코어링의 설계 근거 |
| 2026-04-22 merger-design | **전체 대체(historical)** | 7탭 워크스페이스 + Apr-22 사이드바 IA + partner→customer 라우트명 모두 폐기 |

---

## 2. 제품 한 줄 결정 + 원칙

**한 줄 결정**: Admin CRM은 기록을 강제하는 감시형 CRM이 아니다. 매니저가 **덜 놓치고, 보고를 덜 쓰고, 성과가 보이게 하는 Next Action First 작업대**다.

정합 원칙(culture-fit §3 기준):

- **입력은 최소, 보상은 즉시.** 필수 입력은 고객·다음 액션·기한·결과 상태로 작게 유지. 보상은 자동 할 일 정리, 고객 히스토리 자동 축적, 놓친 리드 경고, 주간 보고 초안, 지사장 가시성으로 즉시 돌려준다.
- **감시보다 작업 지원.** 개인 작업 화면을 먼저. 지연/누락은 숨기지 않되 첫 경험이 공개 압박이 되지 않게. 지사장 화면은 주간 점검·코칭 도구.
- **딜 단계보다 다음 액션.** 무거운 opportunity stage 대신 다음 액션 중심. Deal Lite(`crm_deals`)는 다음 액션·예상금액·예상종료일·견적/오더 연결·리스크의 얇은 객체로만 빌드됨.
- **공식 원천과 작업 캐시 분리.** 서비스 만료·충전 잔액·EEO 상태의 공식 원천은 NEO/HQ. Admin CRM은 빠른 작업용 스냅샷 + 우선순위 계산층이며 원천을 대체하지 않는다.
- **출처와 freshness를 항상 표시.** 모든 상태/위험 신호는 출처를 보여준다. 불일치는 조용히 합치지 않고 `확인 필요`. stale은 confidence를 낮춘다.

실패 방지 게이트(culture-fit §11): 입력 10초 이내 · 즉시 보상 · HQ CRM 중복 작업 없음 · 느린 외부 조회 없이 첫 화면 오픈 · 출처+freshness 표시 · 잘못된 데이터를 확정값처럼 보이지 않음 · 지사장 화면이 코칭으로 연결.

---

## 3. 정보구조(IA) & 화면 우선순위

### 3.1 탭 캐논 — 정확히 6개 (5 primary + 1 maintenance)

`components/admin/crm/CrmSubnav.tsx`에 빌드된 실제 구조가 캐논이다.

| 탭 | 경로 | 비고 |
|----|------|------|
| 현황 | `/admin/crm` | 매니저 홈 = 작업대 |
| 고객 | `/admin/crm/customers/unified` | sub-tab: 통합·리드·원천 고객 |
| 기록 | `/admin/crm/activity` | 활동 타임라인 |
| 돈흐름 | `/admin/crm/deals` | sub-tab: 매출·오더·설치·KPI |
| 인사이트 | `/admin/crm/insights` | 위험/기회 + 지사장 주간 점검 |
| 연동 | `/admin/crm/matching` | maintenance, dashed/ghost로 일상 흐름에서 강등 |

**top-level 탭 추가 금지 (하드 IA 불변식).** 새 표면은 다음 사다리 순서로만 붙인다:
1. **contextual sub-tab** (고객/돈흐름 내부) →
2. **drawer** (Customer360Drawer) →
3. **modal** (Capture).

7번째 top-level 탭은 명시적 캐논 개정을 요구한다. (sales-crm-discussion §6 원천; 거버넌스 4문서에는 verbatim 없으나 본 문서가 하드 규칙으로 승격.)

### 3.2 매니저 홈(현황) 블록 우선순위 (culture-fit §4)

| 순서 | 블록 | 빌드 상태 | 컴포넌트 |
|------|------|----------|----------|
| 1 | 오늘 연락할 고객 | **built** | `CrmPriorityQueuePanel` |
| 2 | 고객 검색 | **designed (홈 미빌드 / `/customers/unified`에 built)** | 인라인 홈 블록으로 추가 필요 |
| 3 | 이번 주 해야 할 일 | **built** | `CrmWeekAheadPanel` |
| 4 | 최근 처리 성과 | **designed (홈 미빌드 / 인사이트에 built)** | 인사이트 페이지의 `CrmManagerReportPanel` — 홈에 compact summary band로 표면화 필요 |
| 5 | 지연/누락/리스크 요약 | **부분** | Action Queue band + `CrmOperationsDashboard`로 근사 |

`CrmCoverageStrip` / `NeoCrmTeamPanel` / `CrmOperationsDashboard`는 §4 우선순위 블록이 아니라 보조 band다.

> 정직성 주석: row 2(고객 검색)·row 4(최근 처리 성과)는 **다른 화면에는 빌드되어 있으나 현황 홈에는 0% 빌드** 상태다. "부분"이 아니라 "홈 미빌드 / 타 화면 built"로 라벨해 'built elsewhere'와 'partially on home'을 혼동하지 않는다. row 5만 홈에서 보조 band로 부분 근사된다.

### 3.3 새 표면이 붙는 위치

- **Capture Layer** → 공유 `+ 접점 캡처` 버튼으로 여는 **모달**. top-level 탭 아님, 독립 페이지 아님. 캐논 진입점은 정확히 5개: ① 현황 헤더 · ② 고객 통합 리스트 bulk action · ③ 기록 탭 · ④ 이벤트 상세 (Phase C2 deferred) · ⑤ 검색 결과 (Phase C2 deferred). 빌드 1차 범위는 ①②③ 셋이며, ④⑤는 C2로 명시 deferred(누락 아님).
- **Customer 360** → **Customer360Drawer** (우측 드로어). 현재 통합 리스트에만 연결됨. 캐논은 현황 우선순위 큐 행 · 홈 검색 결과 · 기록 타임라인 행에서도 열리도록 요구.
- **레거시 URL** → query-preserving 리다이렉트 스텁으로 유지(삭제 금지): `/revenue→/deals`, `/partners→/deals/kpi`, `/partners/[id]→/deals/kpi/[id]`, `/partners/portal→/deals/orders`, `/partners/customers→/customers/accounts`, `/customers→/customers/unified`.

---

## 4. 데이터 모델 정본

### 4.1 빌드된 내부 CRM 스파인

| 테이블 | 상태 | 마이그레이션 | 핵심 필드 |
|--------|------|--------------|-----------|
| `crm_customer_events` | **built** | `20260626_crm_customer_events.sql` | target_type(lead/neo_account/customer/deal/unknown), source_type(manual_note/meeting_minutes/recording/calendar_event/lead_contact_log/external_crm/sheet), title, next_actions JSONB[], sentiment, recording_storage_path. 활동 스파인. **source 인덱스는 `crm_customer_events_source_idx`(line 48)이며 non-unique** — UNIQUE 제약 없음(§6.3 하드닝 대상). |
| `crm_tasks` | **built** | `20260627_crm_tasks.sql` | §5 참조. 1급 next-action 객체. |
| `crm_deals` | **built** | `20260628_crm_deals.sql` | stage(consult/demo/quote/decision/order/won/lost), status(open/won/lost), expected_amount, next_task_id. **legacy `public.deals`와 별개.** |
| `crm_capture_batches` | **built** | `20260629_crm_capture_batches.sql` | §6 참조. |
| `crm_capture_rows` | **built** | `20260629_crm_capture_rows.sql` | §6 참조. |

### 4.2 빌드된 식별/외부 싱크 + 참조 레이어

| 테이블 | 상태 | 비고 |
|--------|------|------|
| `crm_source_links` | **built** | target_type **11값 CHECK** 포함 `external_account`. 3값 제한은 TS write surface(`CrmManualLinkTargetType`)일 뿐 DB 제약 아님. confirmed-only로 unified 조인. capture 확정 매칭의 source linkage 기록 대상(§6.1). |
| `external_crm_sync_runs` | **built** | 싱크 런 감사. status(running/success/failed/skipped), trigger(manual/cron/import). |
| `external_crm_records` | **built** | NEO 원본 스냅샷 원천. `is_stale`/`stale_at`/`last_seen_run_id`/`payload_hash` stale-tracking 포함 → deriveServiceRisk confidence 공급. |
| `crm_write_requests` | **built** | 승인 게이트 외부 write 큐 (preview/approve/execute routes). |
| `branch_rev_deals` | **built** | 시트 REV 탭 매출 싱크. 색상 분해(red=확정/blue=임박). app DB가 source-of-truth. |
| `crm_xiaoshouyi_query_catalog` | **built** | ShroffAccount/opportunity 필드 카탈로그 → 싱크 구동. `20260619`/`20260614` 마이그레이션. |
| `crm_auto_confirm_policy` | **built** | source-scoped auto-confirm 게이트 (minConfidence 0.92 / minGap 0.15, xiaoshouyi/branch_rev_sheet 한정). `20260611_crm_auto_confirm_policy.sql`. |
| `regions` / `region_aliases` | **built** | 17 시도 참조 + alias map. public SELECT + admin manage. `normalize_region_code()`. |
| `admin_crm_overview_snapshots` / `_dirty_log` | **built** | 비즈니스 오버뷰 집계 캐시(전용). 위험 read model 아님. |
| `admin_profiles` CRM 컬럼 | **built** | crm_team_role, crm_assignable, **crm_owner_key**, crm_owner_aliases, neo_owner_id, crm_sort_order. owner_key 브리지. |

### 4.3 설계-미빌드 테이블

| 테이블 | 상태 | 비고 |
|--------|------|------|
| `crm_service_risk_snapshots` | **designed (미빌드)** | §7 참조. 마이그레이션 없음, TS 타입 없음. 현재 위험은 `lib/crm/service-risk.ts`가 인메모리 계산. Phase 3 빌드 대상. |
| `neo_crm_customer_snapshot` | **designed, 강등** | generic 고객 rollup. 선택적 perf 캐시로 강등. 홈 위험 read model은 `crm_service_risk_snapshots`. |

### 4.4 설계-코드 필드 정합 표

| 개념 | 캐논 결정 | 근거 |
|------|-----------|------|
| **소유권 (내부 스파인)** | `owner_key` TEXT + `owner_name_snapshot` TEXT. crm_tasks/crm_deals/crm_capture/risk snapshot/admin_profiles.crm_owner_key 모두 이 규약. | `20260627_crm_tasks.sql:12-13` 등 |
| **소유권 (레거시)** | `public.deals.owner_id` uuid→auth.users **전용**. 내부 스파인에 owner_id 사용 금지. | `20260622_deal_owner.sql:5` |
| **인증 actor** | `created_by`/`confirmed_by`/`requested_by`/`assigned_by`/`completed_by` uuid→auth.users. 작업-owner(owner_key)와 별개 축. | migrations |
| **target_type (스파인)** | {lead, neo_account, customer, deal, unknown} (storage-language). UI는 리드/학원·기관/딜/미연결로 렌더. raw 노출 금지. | events/tasks/deals CHECK |
| **target_type (source_links)** | 11값 CHECK 포함 external_account 유지. | `20260610_crm_source_links.sql` |

세 번째 소유권 규약 도입 금지. RLS는 모든 신규 CRM 테이블 `is_active_admin()` 게이트. regions/region_aliases는 public SELECT + admin manage.

---

## 5. Task 모델 (1급 객체)

`crm_tasks`는 단일 1급 next-action 객체다. 빌드된 스키마(`20260627_crm_tasks.sql`)가 권위.

**필드 (빌드본 = 캐논, culture-fit §8 + 빌드 교정 2건):**
id, target_type, target_id, target_label, **owner_key** (TEXT), owner_name_snapshot, task_type, title, **detail**, due_at, **snoozed_until**, priority, status, source_event_id (FK→crm_customer_events SET NULL), created_by, assigned_by, completed_at, completed_by, outcome, created_at, updated_at.

> 빌드 교정: 캐논 §8 필드 리스트에 없던 `detail`·`snoozed_until`은 load-bearing이므로 캐논 필드로 채택. `snoozed_until`은 snooze 작업·`crm_tasks_snoozed_idx`·week-ahead 버킷팅이 의존.

**status enum (캐논, 드리프트 없음):** open, done, snoozed, canceled.

**task_type enum (11값 — `other` 포함, 캐논 §8의 10값 교정):**
call, kakao, email, meeting, quote, demo, install, renewal, cs_checkin, data_fix, **other**.
`other`는 load-bearing — `inferTaskTypeFromTitle`의 기본 fallback이고 CS_MOTIONS·capture 템플릿이 의존.

**priority enum:** low, normal, high, urgent.

Task는 CRM 홈의 기본 단위. 고객 히스토리·주간 보고·지사장 코칭은 task 처리 결과에서 파생. `crm_customer_events.next_actions` JSON은 pre-task 메모 형태이며 `createTasksFromEventNextActions`로 (open next-actions만) task로 승격된다.

**CS Motions (built):** `lib/crm/cs-motions.ts`의 `CS_MOTIONS` 7개 원클릭 프리셋이 `crm_tasks`를 생성한다(템플릿화된 task_type/title/offset). capture follow-up 템플릿과 동일하게 `crm_tasks` 스파인에 합류.

---

## 6. Capture Layer

paste → parse → match → review → apply 일괄 캡처 입력 레이어. **백엔드 빌드 완료(f4319a4), 프론트엔드 미빌드.**

### 6.1 빌드된 백엔드 (캐논 = 빌드본 스키마, capture-layer 문서 오버라이드)

**`crm_capture_batches`:**
source_type {**pasted_table, pasted_text, public_event, single**}, default_activity_type(10값), **default_task_enabled** bool + **default_task_offset_days** int (문서의 default_task_template 대체), status {draft, parsed, reviewed, applied, partial_failed, canceled}, 카운터 **row_count / event_created_count / task_created_count / lead_created_count**.

> `public_event` source_type은 **스키마 레벨에서 이미 빌드**되어 있다. 단 이 enum 값을 소비하는 "행사에서 불러오기" import flow는 Phase C2로 deferred(§6.2). 즉 enum=built, flow=designed.

**`crm_capture_rows`:**
raw_text, organization_name, contact_name, phone, email, region_label, activity_type(10값), memo, **match_status** {confirmed_customer, confirmed_lead, multiple_candidates, new_lead_candidate, needs_review, duplicate_in_batch}, matched_target_type, matched_target_id, match_candidates JSONB[], **selected (DB DEFAULT true)**, create_task, task_due_at, **apply_status** {pending, applied, skipped, failed}, created_event_id/task_id/lead_id, error_message. UNIQUE(batch_id, row_index).

> **selected의 진실 위치 (중요):** `crm_capture_rows.selected`의 **DB 컬럼 기본값은 true** — 즉 모든 행이 기본 선택 상태로 삽입된다. "확정 매칭만 default-selected"는 **DB 제약이 아니라 matcher/UI 동작**이다: matcher(`matching.ts`)는 단일 phone/email 정확 일치 auto-confirm 행만 선택 상태로 확정하고, 모호한 행(org-only/multiple/new-lead/needs-review)은 matcher 또는 Row Review Table이 `selected=false`로 **명시적으로 뒤집어야** 한다. no-double-create + 사람 검토 가드레일은 DB가 강제하는 것이 아니라 matcher/UI가 강제한다.

**activity 타입 10값:** event_attended, visit, demo_call, check_in_call, installation, consultation, quote_sent, onboarding, cs_issue, memo.

**API 6 routes (모두 admin-gated):** `app/api/admin/crm/capture/batches` (POST), `/batches/[id]` (GET), `/batches/[id]/parse` (POST), `/batches/[id]/apply` (POST), `/batches/[id]/cancel` (POST), `/rows/[id]` (PATCH).

**매칭 우선순위 체인 + 임계값 (보수적, §14 dedup과 단일 정의 공유):**
1. **후보 keep 임계값**: confidence ≥ 0.72, **또는** owner/alias 증거가 있을 때 confidence ≥ 0.45. (`scoreCrmEntityMatch`)
2. **매칭 우선순위**: phone 정확 → email 정확 → org normalized → org+region.
3. **auto-confirm 정책 게이트** (`crm_auto_confirm_policy`, `20260611_crm_auto_confirm_policy.sql`): `auto_confirm_min_confidence 0.92` / `auto_confirm_min_gap 0.15`, **source-scoped** — xiaoshouyi/branch_rev_sheet 에만 enabled. capture에서는 단일 phone/email 정확 일치만 auto-confirm + pre-select(selected 유지).
4. org-only/multiple/new-lead/needs-review는 모두 사람 검토 필요 → matcher/UI가 `selected=false`로 플립.
5. intra-batch 중복은 `duplicate_in_batch`로 경고.

이 매칭 엔진은 §14 매출 dedup 규칙과 **동일한 auto-confirm 정책 테이블**을 공유한다 — 매칭/dedup 규칙은 여기서 한 번만 완결적으로 정의한다. (`lib/crm/capture/matching.ts`)

**apply + 확정 매칭 write-binding:**
- 선택된 행만 처리.
- **confirmed_customer / confirmed_lead 행**: 활동을 **매칭된 대상(matched_target_type / matched_target_id)** 에 대해 `crm_customer_events`(sourceType='sheet', sourceId=`capture:{rowId}`)로 기록한다. 새 source linkage가 성립하면 `crm_source_links`(status=confirmed)로 기록 — §4.2 unified-customer 식별 레이어 규약과 일관. 조건부 follow-up task 생성.
- **new_lead_candidate 행**: confirm 후 `saveLead(source='crm_capture')`로 신규 리드 생성. 신규 리드 후보는 저장 전에 **출처(source)+consent 상태를 표시**한다(§6.4).
- 부분 실패는 batch 전체를 실패시키지 않고 failed 행만 retryable.

**follow-up task 템플릿:** event_attended D+1, visit/demo/checkin/quote D+3, installation/onboarding D+7, cs_issue/consultation D+1, memo=task 없음.

### 6.2 남은 UI 범위 (단일 최대 미완 deliverable)

capture-layer §6/§13 기준, **기존 batches/parse/rows/apply/cancel 라우트 재사용 — 신규 백엔드 없음.**

- **진입점 (1차 빌드)**: 공유 `+ 접점 캡처` 버튼 — 현황 헤더 / 고객 통합 리스트 bulk action / 기록 탭. (이벤트 상세 + 검색 결과는 C2 deferred — §3.3의 5진입점 캐논 중 ④⑤.)
- **탭 모달 (4탭)**: 엑셀·CSV 붙여넣기 / 카톡·메모 붙여넣기 / 단건 기록 / (행사에서 불러오기 — C2 deferred, 단 `public_event` enum은 schema-built).
- **예외 중심 Row Review Table**: 그룹 **확정 매칭 / 확인 필요 / 신규 리드 후보 / 중복 의심 / 제외됨**. matcher/UI가 확정 매칭 행만 selected 유지하고 나머지를 selected=false로 둔다(§6.1 — DB 기본값은 전부 true이므로 이 플립은 명시적). 행별 액션: 매칭 변경 · 신규 리드로 저장 · 제외 · 메모 수정 · task 날짜 변경.
- **Bulk Apply CTA**: 명시적 — 예 `확정된 32명에게 행사 참석 기록 + D+1 task 생성`.
- **Result Summary**: activity/task/new-lead 생성 수 · 확인 필요 잔여 · 중복 제외 · failed-retryable 4개 disjoint 카운트.

### 6.3 빌드 하드닝 항목 (코드-문서 분기)

- **idempotency**: 현재 row-state 기반(applyStatus + createdEventId)만. **현행 `crm_customer_events_source_idx`는 non-unique 인덱스**(`20260626_crm_customer_events.sql:48`)로, DB UNIQUE 제약이 아니다 → 행 레코드 유실 시 이벤트 중복 가능. **하드닝 delta**: `crm_customer_events(source_type, source_id)`에 **partial UNIQUE 인덱스** 추가(`source_id IS NOT NULL`, capture 이벤트 한정). 기존 non-unique 인덱스를 partial UNIQUE로 승격. (`lib/crm/capture/apply.ts:49,81-92`)
- **reviewRemaining 중복 카운트**: failed-this-run 행이 인메모리 stale 'pending'으로 남아 un-reviewed와 혼동됨. post-apply DB 상태에서 재계산하거나 failed 분리. (`apply.ts:124-135`)

### 6.4 Capture PII / 보존 / consent 계약 (비기능 — capture §11/§12 철칙)

raw 입력(`raw_input_storage_path`)은 전화·이메일·이름 등 PII를 포함할 수 있으므로 다음 거버넌스를 적용한다 (CLAUDE.md/플레이북 consent+PII 철칙 준수):

- **보존 기간**: `raw_input_storage_path` 원본은 정의된 보존 윈도우 후 만료/삭제. 무기한 보존 금지.
- **export 제외**: raw 입력의 다운로드/export는 **1차 범위에서 제외**. capture 결과(activity/task/lead)만 정상 경로로 노출하고 raw 원본은 내려받기 대상 아님.
- **접근 범위**: raw 접근은 **Admin CRM 권한**으로 한정.
- **신규 리드 consent 표시**: new_lead_candidate를 저장하기 전에 **출처(source)+consent 상태**를 화면에 표시한 뒤 저장한다(§6.1 write-binding과 연계). consent 미확인 출처는 명시적으로 라벨.

---

## 7. 서비스 위험 & NEO/HQ 싱크

### 7.1 단일 위험 derivation 엔진

`lib/crm/service-risk.ts` `deriveServiceRisk()`가 **유일한 위험 derivation 원천**. level/reasons/expireInDays/balance/confidence/freshnessLabel을 방출(현재 인메모리, `getCrmCustomer360` 1개 호출처).

**두 갈래 derivation 통합 (캐논 결정, §13에 결정 로그 행으로 추적):** `lib/crm/priority.ts` `buildNeoAccountPriorityItem`(홈 큐, confidence/freshness 없음, `priority.ts:167-242` 인라인 derivation)과 `service-risk.ts`(`64-144`, 360 드로어 전용)가 서로 다른 임계값을 쓴다. 홈 우선순위 큐는 snapshot의 `risk_level` + `source_synced_at`을 읽어 버킷에 매핑해야 한다 — 단일 `deriveServiceRisk` 원천으로 통일하고 홈/드로어가 위험을 다르게 보여주는 현 상태를 제거한다. (culture-fit §11: 첫 화면에 출처+freshness 표시. 예: `구독 만료 D-18 · NEO 2시간 전` reason chip.) **이는 high-severity 정합 항목이며 §13에 discrete 행으로 추적된다.**

**위험 임계값 (빌드본):** 만료/D-7 이내 → urgent, D-30 → soon, D-60 → watch. balance≤0(소진) → soon. 비활성 ≥30d + balance → watch (escalate-only, max level). NEO-missing → level=normal + reason=neo_missing + confidence=low (절대 없는 데이터로 위험 조작 안 함).

> `inactive`는 balance가 null 또는 >0 일 때만 발화한다 — `depleted_balance`(balance≤0)와 **상호 배타적**(`service-risk.ts:116`). 즉 소진된 고객은 inactive로 중복 분류되지 않는다.

**deriveServiceRisk 입력 ← 싱크 객체 매핑 (§7.4 싱크 대상과 연결):**
- `expireAt` ← subscription / `ContractEndDate`
- `balance` ← `ShroffAccount__c` `CurrencyAmount__c`
- `lastClassAt` ← `ResourceInformation__c` `ChangeTime__c`
- `syncedAt` ← 레코드 `updatedAt`

이 매핑으로 §7.3 read-model 빌드는 어떤 synced 필드가 어떤 위험 입력을 채우는지 명확히 알 수 있다.

### 7.2 위험 reason 코드 (빌드본 = 캐논, 문서 §7.4 오버라이드)

**`ServiceRiskReasonCode`** (`service-risk.ts:14-20`): subscription_expired, subscription_expiring, **depleted_balance**, **inactive**, neo_missing, stale_snapshot.

> 문서 §7.4의 `low_balance`→`depleted_balance`로 개명, `depleting_fast` 제거(신뢰할 분모 없어 소진 예측 미산출), `inactive` 추가. balance-ratio는 의도적으로 미산출(culture-fit §6.2 "비율 억지로 만들지 않는다" 해소). balance 위험은 `balance≤0`(소진)에서만 발화하고 `inactive`와 상호 배타.

### 7.3 `crm_service_risk_snapshots` read model (designed, Phase 3)

홈이 매 요청마다 `external_crm_records`를 재조합하지 않도록 하는 영속 read model. **SQL로 위험 로직 재구현 금지 — 같은 TS `deriveServiceRisk()`로 싱크 시점에 계산해 영속화** (neo-snapshot 문서의 "숫자 회귀 0" 패리티 원칙 계승).

**컬럼 (빌드 전 정합):** account_id, customer_name, region_label, **owner_key**, expire_at, balance, risk_level {urgent, soon, watch, normal}, risk_reasons (§7.2 빌드본 enum), source_synced_at, calculated_at, confidence {high, medium, low}. `balance_ratio` / `predicted_depletion_at`는 **nullable로 예약하되 채우지 않음** — NEO가 원 충전 금액(분모)과 burn window를 노출하기 전까지 deferred. 그때까지 절대 잔액 + 소진(balance≤0)만 표시. 영속 필드는 §7.1 매핑(expire_at←ContractEndDate, balance←ShroffAccount__c.CurrencyAmount__c, source_synced_at←record updatedAt)으로 채운다.

### 7.4 NEO/HQ 싱크 (Hobby 1/일 cron 호환)

| 티어 | 상태 | 캐논 |
|------|------|------|
| 야간 전체 싱크 | **built** | `/api/cron/sync-external-crm` `0 1 * * *` (1×/일). 대상 객체: **account, ShroffAccount__c, ResourceInformation__c, opportunity, Collection__c**. 실패는 freshness 경고로, 전체 장애로 번지지 않음. (§7.1 입력 매핑 참조 — opportunity/account는 식별·구독, ShroffAccount__c는 balance, ResourceInformation__c는 lastClassAt, Collection__c는 매출/원장.) |
| 핫 데이터 미니 싱크 | **designed** | 만료 D-45 / 잔액 30% 이하 / 14일 소모 큼 / 오늘 열어본 / 지사장 지정 고객의 홈 필드만. **신규 cron 아님** — 기존 일일 체인 확장 또는 admin/on-open 트리거. |
| 고객 단위 refresh | **designed** | 360 드로어 오픈 시 stale면 백그라운드로 해당 고객만 fetch → 위험+freshness 갱신. **cron 아님.** 실패 시 화면 유지 + `최신 확인 실패`. |

> 4×/일 cron(neo-snapshot 문서, 22/01/04/07 UTC) **대체**. 빌드 현실(`0 1 * * *`)이 이미 캐논과 일치. Vercel tier는 별도 검증(메모상 ~13 crons → Pro 가능성)하되 설계 기본값은 1×/일 full 유지.

---

## 8. 데이터 신뢰·출처·freshness 공통 규칙

모든 화면 공통 계약(culture-fit §10).

**출처 3분류 (모든 표시 신호에 provenance 태그):**
- **ClassIn-owned**: task, CRM event, lead status, memo, source link.
- **NEO/HQ-owned**: subscription expiry, balance, EEO status, account snapshot, **contact 필드(email 포함)**. source='neo' + freshnessLabel + confidence로 렌더.
- **Derived**: priority score, risk level, predicted depletion, weekly report summary. 계산값임을 가시적으로(fake precision 금지). `우선순위 점수` 사용, `전환 확률 %` 금지.

**표시 규칙:**
- 공식/보조 데이터 불일치는 조용히 합치지 않고 `확인 필요`로 표시.
- **NEO 데이터는 없을 때 숨기지 않고 보여준다.** NEO-owned 필드가 비어 있으면 `미확인`/`NEO 정보 없음`으로 명시 렌더하고 필드 자체를 누락시키지 않는다. (예: NEO email이 아직 플럼 안 됨 → `이메일 미확인`으로 표시. §9의 `crm-customer-360.ts:376-380` email:null 하드코딩이 이 규칙을 위반하므로 polish 대상.)
- **freshness→confidence 계약 (빌드본 = 캐논, verbatim 채택):** syncedAt 없음 → low. ≥72h stale → low + stale_snapshot reason(`NEO 최신 확인 필요`). ≥24h → medium. <24h → high. label: `NEO 방금` / `NEO N시간 전` / `NEO N일 전`. (`lib/crm/service-risk.ts:55-62,124-133`)
- stale은 위험 confidence를 낮춘다. 없는 데이터를 확정값처럼 보이지 않는다.

**현재 한계 / 하드닝:** provenance 태그는 `ServiceRisk.source='neo'`만 코드화됨. money summary·contact 필드로 확장 필요. `computeCustomer360Risk`는 provenance 라벨 없이 derived 위험을 blend함 — Derived 태그 부착 필요. 충돌 시 `확인 필요` 경로 신규 추가 필요. NEO contact email 미플럼은 §9 polish이자 본 §8 "absent NEO data is shown, not hidden" 계약 위반이므로, 플럼 전까지 360 contact 패널은 `이메일 미확인`을 렌더해야 한다.

---

## 9. 지역 라벨

지역 라벨은 **고객 실제 주소 기준**이며 담당자/영업권과 섞지 않는다(culture-fit §5). 빌드 완료(`lib/crm/region-label.ts`, `deriveCustomerRegion`).

**3축 분리:**
- **지역 라벨**: 주소 기준. 예 `서울 강남`, `부산 해운대`.
- **담당자**: 현재 관리 매니저(owner_key).
- **운영 권역**: 선택적 후속 분류(`수도권` 등).

**규칙 (빌드본):** 수동 보정값 우선 → 없으면 첫 주소 후보 → 없으면 `지역 미지정`, 출처(source) 태깅. 부산 고객을 서울 담당자가 관리해도 왜곡 없이 표현. 지역은 우선순위/필터에 쓰되 담당 배정의 유일 기준 아님. 참조: `regions`(17 시도) + `region_aliases` + `normalize_region_code()`.

**현재 한계 (polish):** 주소 소스가 사실상 NEO payload only. 내부 주소 마스터 부재. `crm-customer-360.ts:376-380`이 NEO contacts email을 하드코딩 null로 두어 contact 완전성 손실 — payload에 email이 있으면 통과시키는 것이 polish 항목. **§8 provenance 계약 연계: 플럼 전까지 360 contact 패널은 email 필드를 누락하지 말고 `이메일 미확인`으로 렌더해 "absent NEO data is shown, not hidden" 규칙을 지킨다.**

---

## 10. 매니저/지사장 보고

**원칙:** 매니저가 CRM을 쓰면 보고가 자동으로 편해진다. 별도 입력 부담 없이 task/event/risk에서 자동 집계.

- **매니저 보고**: task 완료/미룸/리스크/고객 기록 → 주간 보고 초안 자동 생성.
- **지사장 화면(주간 점검·코칭)**: 담당자별 완료/지연 task, 미응답 리드, 만료/소모 위험, 다음 액션 없는 고객, 최근 처리 성과, 지사장 확인 필요, NEO 불일치 고객. **개인 순위 경쟁보다 막힌 고객·놓친 액션을 먼저.**

**빌드 상태:** `getCrmManagerReport` + `/api/admin/crm/manager-report` + `CrmManagerReportPanel` 빌드 완료. 7일 윈도우 per-owner rollup(open/snoozed/overdue/completed task, open deals, no-next-action deals) + attention 큐. 패널은 현재 `CrmInsightsClient.tsx:167`에서 렌더된다.

**IA 정정 (홈에는 미빌드):** 패널이 현재 **인사이트 페이지**에 렌더됨(`app/admin/crm/page.tsx`에는 해당 render·검색 박스 없음). 이는 수용된 배치다. 단 culture-fit §4.4 "최근 처리 성과"를 만족시키려면 현황 홈에 **compact summary band**(manager-report API 소싱)를 표면화하고, full 패널은 인사이트의 지사장 주간 점검 화면으로 유지. full 코칭 보드는 감시감 회피를 위해 일상 홈에서 제외. (§3.2 정직성 주석과 일치: 홈 기준 row 4는 "부분"이 아니라 "홈 미빌드 / 인사이트에 built".)

---

## 11. 빌드 현황 매트릭스

| 기능 | 상태 | 근거 (file/table) | 다음 액션 |
|------|------|-------------------|-----------|
| CRM 6탭 IA | **built** | `CrmSubnav.tsx:24-95` | — |
| 오늘 연락할 고객 | **built** | `CrmPriorityQueuePanel`, `lib/crm/priority.ts` | priority 큐가 risk snapshot 소비하도록 (§7.1) |
| 이번 주 해야 할 일 | **built** | `CrmWeekAheadPanel`, `lib/crm/week-ahead.ts` | — |
| 고객 검색 (홈) | **designed (홈 미빌드 / `/customers/unified`에 built)** | 홈 page에 검색 박스 없음 | 인라인 검색 블록 추가 (`/customers/unified?q=` 재사용) |
| 최근 처리 성과 (홈) | **designed (홈 미빌드 / 인사이트에 built)** | `CrmInsightsClient.tsx:167` 렌더, 홈 page 없음 | 홈 compact band 표면화 (§10) |
| crm_tasks | **built** | `20260627_crm_tasks.sql`, `lib/repositories/crm-tasks.ts` | — |
| crm_deals (Deal Lite) | **built** | `20260628_crm_deals.sql`, `crm-deals.ts` | — |
| crm_customer_events | **built** | `20260626_*`, `crm-events.ts` | source_idx → partial UNIQUE 승격 (§6.3) |
| Customer360Drawer | **built (제한 연결)** | 통합 리스트만 연결 | 우선순위 큐·홈 검색·기록 행에서도 오픈 |
| 서비스 위험 derivation | **built (인메모리)** | `lib/crm/service-risk.ts`, `computeCustomer360Risk` | snapshot으로 영속화 + 홈/드로어 단일화 (§7.1) |
| crm_service_risk_snapshots | **designed (미빌드)** | 마이그레이션·TS 타입 없음 | Phase 3 빌드 (§7.3) |
| 핫 미니 / 고객 refresh 싱크 | **designed** | 일일 cron만 빌드 | 일일 체인 확장 + on-open fetch |
| 야간 전체 싱크 | **built** | `/api/cron/sync-external-crm` `0 1 * * *` (account/ShroffAccount__c/ResourceInformation__c/opportunity/Collection__c) | — |
| 매니저/지사장 보고 | **built** | `crm-manager-report.ts`, `CrmManagerReportPanel`(`CrmInsightsClient.tsx:167`) | 홈 compact band 표면화 |
| 리드 활동 인텔리전스 | **built** | `lib/repositories/lead-activity.ts` (`getLeadActivity` — user_profiles/material_downloads/client_events 인증신호 join, provider/consent/marketing-consent 배지, board-wide 배지 map) | hidden 인텔을 우선순위에 노출 |
| Capture 백엔드 | **built** | `lib/crm/capture/*`, 6 API routes, `20260629_*` | — |
| Capture UI (C1 — 진입점/모달/리뷰테이블) | **designed (미빌드)** | grep `접점 캡처`/`명단 정리` → 0 | §6.2 빌드 |
| Capture C2 (행사/public_event 소스 + 이벤트상세·검색결과 진입점) | **enum built / flow designed** | `public_event` source_type schema-built, import flow·진입점 ④⑤ 미빌드 | C2 빌드 |
| Capture C3 (matching 하드닝) | **designed** | matching.ts 빌드, auto-confirm 정책(`20260611_*`) 존재; 임계값 튜닝/정책 확장 미완 | C3 빌드 |
| Capture C4 (capture nudges) | **designed** | — | C4 빌드 |
| Capture idempotency DB 제약 | **gap** | `apply.ts` row-state only, `source_idx` non-unique | partial UNIQUE 인덱스 (§6.3) |
| Capture auto-confirm 정책 / xiaoshouyi 카탈로그 | **built** | `crm_auto_confirm_policy`(`20260611_*`), `crm_xiaoshouyi_query_catalog`(`20260619`/`20260614`) | — |
| write-requests 외부 write 큐 | **built** | `crm_write_requests` + preview/approve/execute routes | — |
| branch_rev_deals 시트 매출 싱크 | **built** | `lib/repositories/branch-deals.ts`, REV 탭(red=확정/blue=임박), app DB source-of-truth | — |
| CS Motions | **built** | `lib/crm/cs-motions.ts` `CS_MOTIONS` 7 프리셋 → `crm_tasks` | — |
| CRM 진단 엔드포인트 | **built** | `action-kpis` / `coverage` / `readiness` / `mcp-context` routes | — |
| 지역 라벨 | **built** | `lib/crm/region-label.ts`, `regions`/`region_aliases` | 주소 소스 확장 |
| 통합 고객 / 소스링크 / 매칭 | **built** | `crm-unified-customers.ts`, `crm-source-links.ts`, `MatchingInboxClient` | — |
| 인사이트 | **built** | `crm-insights.ts`, `CrmInsightsClient` | — |
| NEO contact email | **gap (polish)** | `crm-customer-360.ts:376-380` null 하드코딩 | payload email 통과 + 미플럼 시 `이메일 미확인` 렌더 (§8/§9) |

---

## 12. 통합 단계 로드맵

모든 상충 phase 번호(culture-fit §12 / capture §14 / crm-merge §7 / operating-plan 0-5 / neo-snapshot 6-task 롤아웃)를 **하나의 글로벌 스파인**으로 흡수. culture-fit Phase 1-4가 권위, capture는 sub-track C1-C4로 합류. (§13 phase 행에서 폐기 번호 명시.)

| Phase | 목표 | 완료 기준 | 현재 상태 |
|-------|------|-----------|-----------|
| **P1 — Next Action CRM** | crm_tasks 1급 객체 + 매니저 홈(오늘 연락할 고객 / 이번 주 할 일) | 오늘 처리 고객 즉시 확인, 완료/미룸/재배정/결과 입력, 히스토리 누적 | **BUILT** (프론트 완료, 단 홈 검색·최근성과 band gap) |
| **P2 — Capture Layer (C1-C4)** | paste→parse→match→apply | 붙여넣기→행 후보, 메모→행 분리, 기존 고객/리드 후보 표시, 확정 행만 bulk-apply | **백엔드 BUILT, UI 미빌드.** C1 UI=최대 잔여. C2 public-event 소스(enum built/flow designed)·이벤트상세·검색결과 진입점 / C3 matching 하드닝(designed) / C4 nudges(designed) |
| **P3 — Service Risk Snapshot** | crm_service_risk_snapshots read model + NEO 1×/일 full + 핫 미니 + 고객 refresh + 홈/드로어 위험 단일화 | D-30 만료/소진이 freshness+confidence와 빠르게 표시, NEO 실패가 화면 전체 장애 아님, 홈·드로어 위험 일치 | **derivation BUILT(인메모리), 영속 read model + 미니/refresh 싱크 + 단일화 미빌드** |
| **P4 — Weekly Report + 360 Lite** | 주간 보고 초안 + 지사장 점검 + Customer 360 드로어 + 홈 검색 | 보고 시간 감소, 지사장이 담당자별 성과/지연/리스크 한 번에, 360을 검색에서 오픈 | **보고·360 드로어 BUILT, 홈 검색·홈 최근성과 band 미빌드** |

P1 잔여 gap: 고객 검색·최근 처리 성과 band가 홈에 없음(§3.2) — close 시 P1 frontend-complete. P4 polish: 더 많은 진입점에서 드로어 오픈.

> §11 매트릭스와 정합: C2/C3/C4는 §11에 별도 행으로 분해되어 있으며(public_event enum=built / flow=designed, matching 하드닝=designed, nudges=designed), 본 로드맵의 P2 sub-track과 1:1 대응한다.

---

## 13. 정합화 결정 로그

| 충돌/드리프트 | canon_says | code_state | 결정 |
|---------------|-----------|------------|------|
| Phase 번호 다중 스킴 | culture-fit 1-4 / capture 1-4 / crm-merge 0-3 / operating-plan 0-5 / neo-snapshot 6-task 롤아웃(Migration→rollup→…→quality gate) | P1 built, P2 backend, P3 인메모리, P4 대부분 | 단일 글로벌 스파인 **P1-4 + capture C1-4만 권위**. crm-merge 0-3, operating-plan 0-5, neo-snapshot 6-task 번호 모두 retire. |
| **위험 derivation 2갈래 (high)** | §4.1/§6.3: 홈 reason chip이 NEO freshness 동반 (예: `구독 만료 D-18 · NEO 2시간 전`). 첫 화면 출처+freshness 필수 (culture-fit §11) | `priority.ts:167-242` 인라인 derivation, confidence/freshness 없음; `service-risk.ts:64-144` 별도; 360만 service-risk 호출 → 홈/드로어 위험 불일치 | **priority 큐가 snapshot `risk_level` + `source_synced_at`을 소비. 단일 `deriveServiceRisk` 원천. 홈/드로어 disagreement 제거.** severity=high |
| task_type enum | §8 10값 (no `other`) | CHECK 11값 + 분류기 default | **11값 채택** (`other` 추가) |
| crm_tasks 필드 | §8 리스트에 detail/snoozed_until 없음 | 둘 다 빌드·사용 | **둘 다 캐논 필드** |
| 위험 reason 코드 | §7.4 {low_balance, depleting_fast, ...} | `service-risk.ts:14-20` {depleted_balance, inactive, ...} | **빌드본 채택**, doc enum 폐기. inactive↔depleted 상호 배타(`:116`) |
| 위험 필드명 | risk_level/risk_reasons + balance_ratio/predicted_depletion | level/reasons + freshnessLabel/expireInDays | 인메모리=level/reasons. 영속 컬럼=risk_level/risk_reasons (1:1 매핑). ratio/depletion nullable·미채움 |
| 소유권 컬럼 | owner_key (tasks/deals/risk) | spine owner_key TEXT, legacy deals owner_id uuid | **owner_key=스파인 캐논**, owner_id=legacy 전용, 제3규약 금지 |
| Capture 스키마 | §9 source_type spreadsheet/manual, default_task_template, total/confirmed/review/new_lead_rows | pasted_table/single, default_task_enabled+offset, row_count/event/task/lead_created_count | **빌드본 채택** |
| Capture selected 기본값 | §6.2 "확정 매칭만 default-selected" | `crm_capture_rows.selected` DB DEFAULT **true** (전체); matcher가 모호 행을 false로 플립 | **DB 기본=true(전체)**, "확정만 선택"=matcher/UI 동작. 가드레일은 matcher-enforced, DB-enforced 아님 (§6.1) |
| Capture write-binding | §9.3 confirmed match → source_links OR unified repo | apply: new_lead→saveLead, activity→events; 확정 매칭 바인딩 미명시 | 확정 매칭은 matched_target_type/id에 활동 기록 + 신규 linkage는 `crm_source_links`(confirmed) (§6.1) |
| Capture idempotency | §10 idempotent apply | row-state guard only; `crm_customer_events_source_idx` **non-unique** | row-state 명시 + non-unique idx → partial UNIQUE(source_type,source_id) 승격 |
| Capture C2/C3/C4 granularity | §12 C2/C3/C4 designed | `public_event` enum schema-built, import flow·nudges 미빌드 | §11에 C2(enum built/flow designed)·C3·C4 별도 행. 로드맵과 매트릭스 1:1 |
| Capture PII/retention | capture §11/§12 retention+export 제외+consent 표시 | raw_input_storage_path 컬럼만, 정책 미문서화 | §6.4 신규: 보존 윈도우·export 1차제외·Admin CRM 한정·신규리드 source+consent 표시 |
| reviewRemaining | §7 Step6 확인필요≠failed 분리 | failed-this-run을 un-reviewed로 혼동 | DB 상태 재계산, 4 disjoint 카운트 |
| sync cadence | §7.1 ≤1/일 full + 미니 + refresh | `0 1 * * *` 1×/일 (일치) | 4×/일 대체. 미니/refresh = non-cron |
| read model 정체 | §7.4 crm_service_risk_snapshots | 인메모리 derive only | snapshot=홈 위험 캐논. neo_crm_customer_snapshot=선택적 perf 강등 |
| 매니저 보고 배치 | §4.4 홈 블록 | `CrmInsightsClient.tsx:167` 인사이트 렌더, 홈 page render 없음 | 인사이트 full 유지 + 홈 compact band 추가. 홈 기준 status=designed(미빌드), "부분" 아님 |
| 360 spine 형태 | §7.4 risk read model + 드로어 | request-composed fan-out | 360=request-composed 유지. 유일 영속 read model=risk snapshot. account_master view defer (closed) |
| NEO email | §10 NEO contact 표시 + §8 absent-not-hidden | `crm-customer-360.ts:376-380` email:null 하드코딩 (필드 누락) | payload email 통과 (polish). 미플럼 시 `이메일 미확인` 렌더 — 필드 숨김 금지 |
| lead-funnel 문서 위상 | (§1 미등재) | `getLeadActivity` + `buildLeadPriorityItem` 응답속도 스코어링 load-bearing | §1에 lead-funnel-consent-auth-scoring-plan **유지/load-bearing** 등재 |
| external_account 제약 | "enum lacks external_account" blocker | CHECK 11값 이미 허용 | blocker 철회 — TS write surface 선택일 뿐 |
| Apr-22 7탭 워크스페이스 | 7탭 per-customer | Customer360Drawer (5+1 탭 IA) | 드로어-first 캐논, 7탭 폐기 |

---

## 14. 비기능 제약

- **Admin 인증 게이트**: 모든 `app/api/admin/crm/**`는 `verifyAdmin()` / `requireVerifiedAdminContext()` + `createSupabaseAdminClient()`. server client 사용 시 빈 배열 silent 반환. capture 6 routes 포함 모두 admin-gated 빌드 확인.
- **Repository 데이터 접근**: `lib/repositories/` 또는 `lib/portal/repositories/`로 funnel. Supabase 직접 접근 금지.
- **Capture PII/retention (§6.4 요약)**: raw 입력 보존 윈도우 정의 · 다운로드/export 1차 범위 제외 · raw 접근 Admin CRM 한정 · 신규 리드 저장 전 source+consent 표시.
- **검증 게이트**: `npx eslint app components lib --max-warnings=0` + `npm run build` (check:vercel-crons + check:public-content 훅). 스키마 변경은 `supabase/migrations/YYYYMMDD_*.sql` (ADD COLUMN IF NOT EXISTS) 동반.
- **DESIGN 팔레트**: DESIGN.md 팔레트만. Classin Green `#084734`이 유일 채도색(accent/CTA), 파랑/보라 금지. CTA radius 6px, 그린 surface 배지 9999px.
- **Whisper 보더**: `1px solid rgba(0,0,0,0.08)` 정확히 — 더 두껍게 금지. 카드 = 보더 + 12px(hero 16px) radius + 레이어드 섀도.
- **섹션 배경 리듬**: `#FFFFFF` ↔ `#F6F5F4` ↔ `#ECFDF5`. 하드 보더 없이 배경+간격으로 구분. 페이지 배경 `#FAFAF8`.
- **모바일 우선**: 모바일 우선 반응형 유지. 데스크톱 80-120px / 모바일 48-64px 섹션 간격, max 1200px 중앙.
- **시안 우선**: UI 변경 전 시안 제시 + 동의.
- **Hobby cron**: 전체 싱크 ≤1/일. check:vercel-crons 가드 통과. Vercel tier 별도 검증.
- **마이그레이션 규율**: 신규 테이블 = migration + RLS(`is_active_admin()`) + admin policy. 누락 시 INSERT가 catch에서 silent 실패.
- **매출 중복 제거 철칙**: 통화/원장 혼합 합산 금지. USD orders / CNY collection / KRW REV / HW(KRW)는 라벨된 별도 원장. 단일 총합은 `crm_source_links` status=confirmed 후에만 — 이때 dedup은 §6.1 매칭 엔진과 **동일한 `crm_auto_confirm_policy`**(auto_confirm_min_confidence 0.92 / auto_confirm_min_gap 0.15, source-scoped)를 사용한다. 우선순위 app_v2 > xiaoshouyi > lead > branch_rev_sheet. HW 매출은 절대 grand-total 안 함, destination별 집계.
- **문서 규칙**: repo-relative 링크만. 브랜치명/절대경로/비밀 금지. stale 메모를 현재 단정에 쓰지 않고 audit+코드로 재검증.
- **소유**: CRM은 Part 4 Growth(growth-crm) 소유.

---

## 15. 비범위 & 검증 기준

**비범위 (culture-fit §13):**
- 모든 외부 CRM 필드를 Admin CRM에 복제
- Salesforce식 무거운 opportunity pipeline
- 본사 CRM 실시간 양방향 write-back (HQ는 read-mostly 공식 원천 유지)
- 매니저 모든 통화 기록 강제
- 공식 원천 불명확한 잔액 비율 추정 (balance_ratio deferred)
- NEO 장애 시 화면 전체 차단
- 개인별 감시 중심 랭킹 화면
- Capture: 완전 자동 저장, 복잡 AI confirm-merge, HQ write-back, full event-ops 시스템, 마케팅 자동 발송, raw 입력 다운로드/export(1차 제외)
- Customer 360: account_master DB view (perf 필요 시까지 defer)

**제품 검증 (culture-fit §14):**
- 첫 화면에서 오늘 연락할 고객 5초 내 파악
- 기본 task 입력 10초 내
- 고객 검색 결과 1초대 체감
- 서비스 위험에 이유·출처·freshness 표시 (홈/드로어 동일 값)
- 주간 보고 초안이 수작업 시간 단축
- Capture: 30명 참석자를 5분 내 activity+task로, raw 엑셀/구글시트 붙여넣기 동작, 메모 텍스트가 행 후보+needs-review 산출, 매니저는 모호 행만 검토, 결과가 히스토리+매니저 홈에 즉시 반영, 신규 리드 저장 전 source+consent 표시

**기술 검증 (culture-fit §14):**
- Admin CRM API `verifyAdmin()` 또는 동등
- Supabase 접근 repository에 집중
- NEO 라이브 조회 실패가 화면 전체 실패로 번지지 않음
- 위험 read model이 리스트에서 빠르게 읽힘
- 전체 싱크 ≤1/일 cron
- 신규 테이블 migration + RLS + admin policy
- Capture: idempotent apply (DB partial UNIQUE 제약 하드닝 후), 부분 실패 격리, raw PII 보존정책 적용, repository + parser unit test

```bash
npx eslint app components lib --max-warnings=0
npm run build
```