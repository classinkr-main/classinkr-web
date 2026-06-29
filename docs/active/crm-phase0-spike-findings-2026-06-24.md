# CRM 병합 — Phase 0 검증 스파이크 결과

> 작성일: 2026-06-24 · 각 스파이크의 프로브 출력 + 결정 기록. Phase 1 착수 전 게이트.
> 관련: [crm-merge-redesign-2026-06-24.md](crm-merge-redesign-2026-06-24.md) §6 · [crm-merge-phase0-plan-2026-06-24.md](crm-merge-phase0-plan-2026-06-24.md) · [erp-blueprint-2026-06-22.md](erp-blueprint-2026-06-22.md)
> 프로브: `tmp/db-probe-phase0-*.mjs` (읽기전용, service-role, `is_stale=false` 필터). tmp/는 gitignore 처리됨.

---

## Phase 1 진입 결정 요약 (종료 게이트)

| 항목 | 결정 | 근거 스파이크 |
|---|---|---|
| **오너 큐 개인화** | **팀 전체 + 담당 필터로 출하**, '내 고객' 미도입 (확정) | A — 3개 식별공간 교집합 0, `leads.assigned_to` NULL |
| **미수(수금) 신호** | **Phase 2 진입 — 단, 객체를 `Collection__c`로 교정**. `CollectionPlan__c` 폐기 | B — `CollectionPlan__c`=0행, `Collection__c`=392행·99.5% account 조인 |
| **HW 편중 집계 단위** | **`destination` 기준 GO** (신규 컬럼 불필요). 블루프린트 77.55% → 실측 **61.78%** 교정 | C — destination=실제 학원명, 신규 account 컬럼 불요 |
| **360 이벤트 저장소** | **폴리모픽 `crm_customer_events` 신규 (Phase 1 마이그 산출물, 확정)** | D — 360 주체=844 NEO account(비-리드), `lead_contact_logs` 구조적 불가 |
| **스파인 커버리지 위젯** | **현황 홈 라이브** (Task 1~4 완료) | — |

### 스파이크가 교정한 계획 전제 (Phase 1 착수 전 반드시 반영)

1. **미수 객체명이 틀렸다 — `CollectionPlan__c`가 아니라 `Collection__c`.** `external_crm_records`에 `CollectionPlan__c`는 **0행**(싱크 설정 `xiaoshouyi-sync.ts:232-250`엔 정의돼 있으나 실제 적재 데이터 없음). 실 수금 데이터는 `Collection__c`(392행). 더 중요한 건 **`Collection__c`는 이미 360 detail 뷰에 조인돼 있다**(`lib/admin-crm-customers-neo.ts:381`, `orderAccountId__c`). 즉 "미수 완전 미배선"은 부정확 — 실수금 조인은 이미 있고, **빠진 건 net 미수 계산(예정−실수)과 `approvalStatus` 해석**뿐. → 스펙 §3.2·§6-2의 `CollectionPlan__c` 표현 전부 `Collection__c`로 교체.
2. **`crm_source_links.target_type`에 `external_account`가 있다.** 과제 브리프 블로커 ⓑ("external_account 없음, 3개뿐")는 **DB 기준 틀림**. 실제 CHECK 제약(`supabase/migrations/20260610_crm_source_links.sql:18-30`)은 11개 값(`lead,legacy_partner,partner_account,customer,deal,quote,contract,receipt,external_account,external_contact,external_opportunity`)이고 `external_account`를 **포함**한다. 3개(`partner_account|customer|deal`)는 **TS 쓰기 표면 타입**(`CrmManualLinkTargetType`, `:145`)일 뿐. → "신규 매칭 엔진 만들지 말 것"이라는 **의도는 유효**하나, "컬럼이 external_account를 허용 안 함"이라는 **근거는 폐기**. Phase 1 통합 조인은 여전히 confirmed link + 동일 `customer`/`partner_account` target_id 기준으로 가되, external_account 미사용은 *제약*이 아니라 *선택*임을 명시.
3. **HW 편중 77.55%는 실측 재현 안 됨(61.78%).** 블루프린트 수치는 분모(매출 vs 세트수)·null 처리 차이로 추정. → 헤드라인은 **실측치 사용**, 메트릭/분모 정의 후 재대조.
4. **Supabase `leads`=3행(시트 정본), NEO account=844.** 통합 DB(Phase 1)의 리드 측 모수는 Supabase `leads` 테이블(3행)이 아니라 시트 경로에서 와야 하며, 미반영 시 통합 뷰는 사실상 NEO account 844행에 지배된다. (메모리 `leads=시트정본`과 일치 — 듀얼모드 가드 `assertDurableLeadStorage` 재확인 필요.)

---

## 스파이크 A — 오너 식별 매핑 (admin login ⇄ NEO ownerId ⇄ leads.assigned_to)

**프로브:** `tmp/db-probe-phase0-owner.mjs` (+ 카운트 헬퍼 `tmp/db-probe-phase0-owner-counts.mjs`). 읽기전용, service-role.

### 프로브 출력
```
leads_total                              = 3
leads.assigned_to (non-null, distinct)   = 0   ← 컬럼 전부 NULL (실제 리드 정본 = 구글 시트)
admin_profiles.display_name (distinct=2) = ["classin-admin", "MOON"]
NEO User 디렉터리 (external_crm_records, object_api_key='User', source_system='xiaoshouyi'):
    total records      = 2000
    external_id (ownerId) = 16자리 숫자, 예 3637150237793118
    display_name shape    = "中文名-EEOxxxxx", 예 "谷岩-EEO00002", "李朝-EEO01104"
crm_xiaoshouyi_owner_names (큐레이팅 숫자→korean_name 오버라이드) = 10 rows

교집합 (정확 문자열 일치):
    assigned_to ∩ neo_display_name        = 0
    assigned_to ∩ admin_display_name      = 0
    admin_display_name ∩ neo_display_name = 0
```

### 발견
**조인 불가 — 그라운딩 예상보다 더 강하게 확정.** 3개 완전 분리 식별공간:

1. **Admin login** → `admin_profiles.display_name`, 실값 2개뿐 (`classin-admin`, `MOON`).
2. **NEO ownerId** → `external_crm_records.external_id`(16자리 숫자), `display_name`=중국 HQ 직원 문자열 `中文名-EEOxxxxx`(2000행 디렉터리). `getXiaoshouyiOwnerNameMap`(`lib/external-crm/owner-names.ts`)가 소비.
3. **`leads.assigned_to`** → Supabase에서 전부 NULL(리드 3행뿐, 프로덕션 리드 정본은 구글 시트).

정확-문자열 교집합 전부 **0**이고, 리드 측엔 애초에 조인할 오너 데이터가 없다. 유일한 숫자→이름 브리지는 10행짜리 `crm_xiaoshouyi_owner_names`(ownerId→큐레이팅 한글명)이나 admin login과는 연결고리 없음. 이게 `lib/admin-crm-scope.ts:139-143`이 `EXTERNAL_CRM_KOREA_ONLY = true`로 고정한 이유 — `owner_name`이 숫자 ownerId로 와서 매니저-이름 매칭이 불가하고 오너/페이로드 Korea-scope 휴리스틱이 무력화됨.

### 결정 (게이트)
- **Phase 1 현황 개인 큐 = '팀 전체 + 담당 필터'** (팀 전체 리스트 + 선택적 담당 필터). **'내 고객' 개인화 미도입** — 오늘 조인 컬럼이 없음.
- **추후 개인화 활성화:** `admin_profiles.neo_owner_id`(admin별 숫자 ownerId, `crm_xiaoshouyi_owner_names` 브리지 재사용) 추가 **+** `leads.assigned_to`를 같은 숫자 ownerId(또는 `admin_profiles.user_id`)로 정규화·적재. 둘 중 하나 없이는 세 공간 조인 불가.

---

## 스파이크 B — 미수(수금) account 조인키 — `CollectionPlan__c` → `Collection__c` 교정

**프로브:** `tmp/db-probe-phase0-collectionplan.mjs` (+ `db-probe-phase0-objectkeys.mjs`, `db-probe-phase0-collection-fields.mjs`, `db-probe-phase0-collection-amount.mjs`). 읽기전용, service-role, `is_stale=false`.

### 핵심 발견 — 객체명이 틀렸다
`external_crm_records`에 `CollectionPlan__c`는 **0행**. 전체 스캔(81,294행) 결과 수금 관련 객체는 **`Collection__c`(392행, 전부 fresh)** 뿐.

| object_api_key | 행수 | account 조인 필드 | account external_id 매칭 |
|---|---|---|---|
| `account` | 844 | (external_id = 정본 키) | — |
| `Collection__c` | 392 | **`orderAccountId__c`** | **385/387 = 99.5%** |
| `opportunity` | 806 | `payload.accountId` | (이미 배선됨, 합계 ≈ 416,474,733) |
| `FinancialInformation__c` | 9,193 | `orderId__c` | 0% (order 키, account 직결 안 됨) |

- `Collection__c` 페이로드 키: `ActualTime__c, Amount__c, CollectionDate__c, Contract__c, approvalStatus, createdAt, id, name, orderAccountId__c, ownerId, updatedAt`.
- 매칭 비교: `orderAccountId__c`=99.5%, `Contract__c`/`id`/`ownerId`=0%.
- 스파이크/계획이 가정한 `EstimatedTime__c` / `collectStatus__c` / `accountId` 필드는 **전부 없음**.
- `Amount__c` 100% 수치(392/392), 합계 ≈ **3,756,904**, 135개 distinct account. `approvalStatus` 분포: `0`=203(대기/미승인 추정), `3`=189(승인 추정).
- `Collection__c.Amount__c`는 **실수금** 한쪽만 제공 → 단일 객체로 "예정−실수=미수" 불가. **예정수금**은 `opportunity.amount`(account 직결, 합계 ≈ 416M)로 잡아야 함.

### 결정: Phase 2 진행 — 키 교정
- 계획서 `detailSelect('CollectionPlan__c','accountId')` → **`detailSelect('Collection__c','orderAccountId__c')`** 로 수정해 `lib/admin-crm-customers-neo.ts`에 배선. **단, `Collection__c`는 이미 detail 뷰에 조인돼 있음**(`:381`) — 신규 조인이 아니라 **net 미수 산출 로직 추가**.
- 순미수 = `Σ opportunity.amount`(accountId) − `Σ Collection__c.Amount__c`(orderAccountId__c), account 단위.
- **선결 과제:** `approvalStatus` 의미 확정(승인=3만 실수금으로 계산할지). 약 48%만 status 3 → 미확정 시 미수 과대계상.
- account 조인(99.5%) 견고 → 조인 키를 이유로 deferral 안 함. 배선 전까지 위젯은 `수금데이터 미연결` 표시.

---

## 스파이크 C — HW destination 집계 단위

**프로브:** `tmp/db-probe-phase0-hw.mjs` (읽기전용, service-role). 컬럼은 `lib/repositories/branch-hw.ts`의 `HwOutbound`(`destination/owner/revenue/quantity`)로 확인 — 이 테이블은 `database.types.ts`에 없고 repo 인터페이스가 정본.

### 프로브 출력
- Rows fetched: **311** (전체 테이블, 2000 cap 미만)
- Null/blank `destination`: **134 / 311 (43%)**
- Null `revenue`: **42 / 311 (14%)** (0으로 처리)
- Distinct destinations: **85**
- Total revenue (non-null-destination 풀): **750,080**

distinct destination 값은 전부 사람이 입력한 학원/기관명 — 예: `세정학원`, `봉담 종로엠스쿨`, `과사람 동래 본원`, `대치스파르타`, `이미숙국어`, `명문서일학원`, `캐슬 에듀`, `학문당`, `미지원교육`. **물류 코드·송장번호·주소 0건.**

### HW 매출 편중 (top-10 destination)
| # | destination | revenue | share % | cum % |
|---|---|---:|---:|---:|
| 1 | 과사람 동래 본원 | 118,800 | 15.84 | 15.84 |
| 2 | 이미숙국어 | 70,230 | 9.36 | 25.20 |
| 3 | 과사람 사하 센터 | 63,800 | 8.51 | 33.71 |
| 4 | 캐슬 에듀 | 48,800 | 6.51 | 40.21 |
| 5 | 과사람 해운 센터 | 44,000 | 5.87 | 46.08 |
| 6 | 윤유경플러스 | 30,860 | 4.11 | 50.19 |
| 7 | 학문당 | 25,155 | 3.35 | 53.55 |
| 8 | 진수학 | 23,360 | 3.11 | 56.66 |
| 9 | 대치스파르타 | 19,960 | 2.66 | 59.32 |
| 10 | 미지원교육 | 18,410 | 2.45 | 61.78 |

**Top-10 누적 share = 61.78%** (블루프린트 77.55% 미재현 — 분모/메트릭 차이 추정).

### 결정: HW 편중을 `destination` 기준 집계 (GO, 가드레일 포함)
- `destination`이 학원명을 신뢰성 있게 담음 → 유효한 집계 단위. **v1에 신규 `account_id`/`lead_id` 컬럼 불필요.**
- **블루프린트 수치 교정:** "top-10 ≈ 77.55%" 미재현, 실측 **61.78%**. 실측치 출하 + 메트릭/분모(매출 vs 세트수, null 처리) 재정의 후 재대조.
- **정직 라벨:** 위젯 제목 `destination 기준 (수기 입력 · 미정규화)`. 43% null-destination / 14% null-revenue 갭을 데이터 품질 각주로 노출.
- **체인 분절:** 한 체인(`과사람 동래 본원 / 사하 / 해운 / 사직`)이 여러 top 행으로 쪼개짐 — 정규화 타깃으로 플래그.
- **정규화 보류:** `destination` → NEO `account.display_name` / `leads.org` 이름유사도 Tier-B 매칭은 **별도 스펙**, Phase-0 블로커 아님.

### 철칙 (verbatim 기록)
HW 매출(`branch_hw_outbound.revenue`, KRW 원장)은 NEO opportunity USD와 **별도 원장**. **절대 단일 total로 합산 금지.** 통화·단위 각각 표기해 나란히.

---

## 스파이크 D — 360 타임라인 이벤트 저장소 (폴리모픽 vs 리드 전용)

**프로브:** `tmp/db-probe-phase0-events.mjs` (+ 검증 `tmp/db-probe-phase0-events2.mjs`). 읽기전용, service-role.

### 프로브 출력
| metric | value |
|---|---|
| NEO accounts (`external_crm_records` WHERE `object_api_key='account'`) | **844** |
| leads total (`leads`) | **3** |
| gap (accounts − leads) | **841** |
| ratio (accounts per lead) | **281.33** |
| `crm_customer_events` 존재 | **NO** — PGRST205 "Could not find the table 'public.crm_customer_events' in the schema cache" |

샘플 account display name (전부 `object_api_key='account'`, `leads` 행 없는 실제 고객 기관): 페트라비전학원, 새봄수학, 클래스원영어, 어바인어학원, 아소비 춘천.

`lead_contact_logs` (마이그 `20260409_schema_fixes.sql`):
- `lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE`
- `type TEXT NOT NULL CHECK (type IN ('call','sms','kakao','email'))` — 리드 획득형만.

### 해석
고객 360 스파인은 **844 NEO account**이지 leads(3행, 시트 정본 획득 퍼널이라 비어있음)가 아니다. account는 별도 id/key 공간에 살고 leads를 ~281:1로 압도. `lead_contact_logs`는 이들의 수기 이벤트를 구조적으로 저장 못함 — `lead_id` NOT NULL + cascade FK라 비-리드 account가 앵커할 곳 없음, `type` enum도 획득 채널로 잠김. 즉 360 주체가 전부 `leads.id`로 귀결되지 **않음**.

### 프로브 기법 메모
`.select('id',{head:true,count:'exact'})` 경로는 `crm_customer_events`와 **고의 가짜 테이블** 둘 다에 대해 에러 없이 `count:null` 반환, 반면 known-good control(`leads`)은 `count:3`. **존재 확인은 head-count가 아니라 `.select('*').limit(1)`(없으면 PGRST205)로 해야 함.**

### 결정 — `crm_customer_events` 필요 (Phase 1 named 마이그, 스펙 §4.5)
신규 **폴리모픽** 이벤트 저장소:
- `subject_type` (`lead` | `account`/`external_account` | `hw_destination`) + `subject_id`
- 확장 event-type enum (call/sms/kakao/email 너머: note / meeting / task / status_change …)
- RLS `USING`/`WITH CHECK is_active_admin()`
- 인덱스 `(subject_type, subject_id, occurred_at)`

`lead_contact_logs`는 **리드 전용 피더**로 유지(또는 `subject_type='lead'`로 마이그). in-place 확장 대안은 기각 — NOT-NULL `lead_id` FK가 844 account를 구조적으로 배제.
