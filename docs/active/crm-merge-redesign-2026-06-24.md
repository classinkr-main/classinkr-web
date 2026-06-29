# CRM 병합·재설계 기획 — 레퍼런스 디자인 + 우리 정체성

> 작성일: 2026-06-24 · 파트: 마케팅/그로스/CRM (growth-crm) · 상태: 기획 확정, 구현 미착수
> 관련: [erp-blueprint-2026-06-22.md](erp-blueprint-2026-06-22.md) · [playbook/04-growth-crm.md](playbook/04-growth-crm.md)

## 0. 브리프 & 확정 결정

두 레퍼런스(`G CRM` = AI 우선 풀기능 청사진, `ClassIn CRM System` = 그 청사진을 이미 우리 정체성·도메인으로 번역한 버전)를 참고해, **우리 디자인을 최대한 유지**하면서 **구조와 핵심 본질(CRM · 간편하게 · 정보 확인·입력 · 데이터 분석)**을 **정체성 고려해 병합·디벨롭**한다.

핵심 본질 매핑:

| 본질 | 화면 |
|------|------|
| CRM | 현황 · 고객 · 돈흐름 · 인사이트 4축 |
| 간편하게 | 빠른 리드 등록 모달 + 360 카드 1클릭 다음 액션 |
| 정보 확인·입력 | 고객 통합 DB + 360 통합 카드(타임라인·특이사항·돈) |
| 데이터 분석 | 인사이트(전환 퍼널·유입 소스 품질·월별 추이·팀 달성률·구조 리스크) |

**확정 결정 (사용자 승인):**
1. **스코프 = Tier B** — 구조 통합 + **규칙 기반 휴리스틱**(ML·임베딩 없음, 오늘 가진 데이터로만).
2. **현황(홈) = 블렌드** — 개인 우선순위 큐 메인 칼럼 + 상단 팀·돈 요약 strip.
3. **내비 = 현황 · 고객(통합 DB) · 돈흐름(=기존 Deals) · 인사이트(신규)** + **연동(고스트 유지보수 탭)**.
4. **돈 리본 = 라이트 유지** — 넓은 면은 뉴트럴, 그린은 숫자 액센트만, 다크는 nav/active에만. 통화는 별도 라벨(합산 금지).
5. **현황 개인 큐 기본 = 팀 전체 + 담당 필터** — 오너 식별 매핑 구축 후 '내 고객' 개인화 토글 추가.
6. **미수(수금) 신호 = Phase 0 검증 후 결정** — `CollectionPlan__c` 조인키 스파이크 통과 시에만 도입, 그 전엔 "수금데이터 미연결"로 정직 표기.

> **이 기획은 코드베이스 그라운딩 + 적대적 비평을 거쳤다.** 비평이 잡은 블로커 3개(미수 미배선 / `external_account` target 부재 / HW 고객 필드 부재)와 교차 갭 2개(360 타임라인 단일 저장소 / 개인 큐 오너 식별)를 모두 반영한 버전이다.

---

## 1. 정보 구조 (IA) & 내비게이션

현행 서브내비(`현황 · 고객[리드↔계정] · Deals[매출·오더·KPI] · 연동`, [components/admin/crm/CrmSubnav.tsx](../../components/admin/crm/CrmSubnav.tsx))를 다음으로 디벨롭:

| 병합 후 | 내용 | 현행 대비 |
|---|---|---|
| **현황** | 블렌드 커맨드 덱 (개인 큐 + 팀·돈 요약 strip) | 재배치·강화 |
| **고객** | **고객 통합 DB** — 리드+계정 한 테이블, 행→360 카드 | 리드↔계정 탭 분리 → 세그먼트/필터로 통합 |
| **돈흐름** | 이번 달 견적·오더·수납 파이프라인·진행 거래 | 기존 Deals를 "돈흐름"으로 **rename**(신규 빌드 아님) |
| **인사이트** | 전환 퍼널·유입 소스 품질·월별 추이·팀 달성률·구조 리스크 | **신규 1급 승격** |
| **연동·정합성** | 매칭/정합성 인박스 | 점선 고스트 탭(유지보수)로 유지 |

→ **4개 주 탭 + 1개 유지보수 탭** = ClassIn CRM System과 동일 골격, 우리 Deals 내용은 돈흐름에 보존.

---

## 2. 화면별 설계

### 2.1 현황 (홈) — 블렌드
기준: [app/admin/crm/page.tsx](../../app/admin/crm/page.tsx) 재배치.
- **상단 strip(얇게):** 월 목표 달성률(라디얼 게이지) + 돈흐름 미니(이번 달 견적/오더/수납, **통화별 별도 라벨**). [components/admin/crm/NeoCrmTeamPanel.tsx](../../components/admin/crm/NeoCrmTeamPanel.tsx)의 `CrmNeoKpis` compact 슬롯 재사용.
- **메인(좌, 지배적):** **"오늘 먼저 연락할 고객"** 우선순위 큐 — 휴리스틱 정렬(§3). 행 = `기관/담당 · 점수 · 근거 라벨(만료 D-12 / 무접촉 N일 / 48h 미응답) · 추천 다음 액션 · 1클릭 실행`. **기본 범위 = 팀 전체 + 담당 필터.**
- **우측 컬럼:** 위험 경보(만료임박·휴면·클레임·업셀) + 이번 주 설치·방문.
- **하단(접힘):** 팀별 KPI 게이지 + 주간 활동량.
- **HW 편중 미러:** 상단 strip에 compact 1줄("HW 상위N destination = 매출 M%") → 클릭 시 인사이트 딥링크.

### 2.2 고객 통합 DB
기준: [components/admin/crm/NeoCrmCustomersClient.tsx](../../components/admin/crm/NeoCrmCustomersClient.tsx)에 통합 렌즈 추가.
- 한 테이블에 리드+계정 통합. 컬럼: `기관·담당 · 점수 · 상태 · 최근 접촉 · 계약·잔액 · 특이사항·다음 액션`.
- **세그먼트 저장** + 기본: `전체 DB · 리드 · 위험·특이 · 활동 로그 · 점수 70+`. 정렬: **액션 시급도** 기본.
- **스파인 가드:** unmatched 행은 버리지 않고 표시하되, **기본 뷰는 매칭된 행 + 상단 "연결 필요 N건" 카운트·필터**. 톤은 **뉴트럴**(테라코타=진짜 위험에 예약).
- **편집 권한 시각화:** 리드 행 = 인라인 편집, NEO/Xiaoshouyi 행 = 읽기전용 배지 + `sync {date}` 신선도 캡션(`formatAgeHours`/`is_stale`). 죽은 클릭처럼 보이지 않게.

### 2.3 고객 360 통합 카드
기준: `CustomerDetailPanel`(NeoCrmCustomersClient) 쉘 + [components/admin/crm/leads/LeadsBoardClient.tsx](../../components/admin/crm/leads/LeadsBoardClient.tsx)의 `LeadDrawer` 내부 머지. 데스크탑 `max-w-[480px]` 드로어 + 모바일 바텀시트 단일 규격.
- 헤더: 점수 · 상태 · 돈(잔액 CNY / 오더 USD / 성과) — **통화 분리, 합산 없음**.
- **고정 특이사항**(`border-l-2 border-[#084734]` 액센트).
- **활동 타임라인 = 읽기시 머지**: `crm_customer_events`(수기 콜·방문·메모, 단일 저장소) + `external_crm_records` 오더·수금(NEO 읽기전용) + deal stage 변경(읽기전용). 단일 시간순 피드.
- **다음 액션(1클릭):** 결정론적 후보 버튼(콜 기록·견적 작성·방문 일정·특이사항 추가). LLM은 문구 다듬기만.
- 편집: 리드 출처 = 인라인, NEO = `crm_write_requests` 큐.

### 2.4 인사이트 (신규)
- 전환 퍼널(리드 유입→견적→오더→수납) · 유입 소스 품질(전환율·평균 계약가치 기준) · 월별 매출 추이(수납 기준) · 팀별 달성률 비교.
- **구조 리스크(ERP 실존 리스크):** HW 편중(destination 기준, §4-3) · SW 활성화율 게이지 · 리뉴얼 레이더(expireAt D-90/60/30 × `lastClassAt` 무접촉 교차).
- 유사고객 대체 = `owner_name`/`region`/`size` **룰 facet 그룹핑**.

### 2.5 빠른 리드 등록 모달
- "핵심 정보만 빠르게, 나머지는 나중에" — name/org/phone/source 최소 필드, **Enter 빠른 저장**. 전역 `새 리드` 버튼.
- 기존 `lib/server/lead-capture.ts` 경유로 honeypot·중복창·저장실패 격리 철칙 유지. 저장 즉시 우선순위 큐 반영.
- ⚠️ admin 인증 경로(`verifyAdmin`)이므로 공개 캡처 레이트리밋(5/min)을 그대로 적용하면 정당한 빠른 입력을 막을 수 있음 → **admin quick-add는 공개 throttle 우회/완화** (Phase 3에서 확정).

---

## 3. 휴리스틱 엔진 (Tier B · ML 없음)

기준: 신규 순수 함수 `lib/crm-priority.ts`. 스냅샷 모수 위에서 계산.

### 3.1 우선순위 큐 정렬 = risk-pinned 하이브리드
점수 내림차순 정렬 + 위험 신호(만료임박·휴면) 보유 고객 상단 핀.

| 축 | 인자 | 실제 필드 (출처) | 가중 |
|---|---|---|---|
| 긴급도 | 갱신 만료 D-day | `ShroffAccount__c.expireTime__c`(fallback `DateBack__c`/`ContractEndDate__c`)→`expireAt`; `EXPIRING_SOON_DAYS=60` | 0~26 (D-7=26) |
| 긴급도 | 리드 응답 SLA | `leads.status='new'` + 응답대상 source(`demo_modal`/`contact_page`/`meta_lead_ads`) + `created_at` | 0~22 |
| 긴급도 | 무접촉 경과 | `LastClassDate__c`→`lastClassAt`; `leads.follow_up_at` | 0~12 |
| 가치 | EEO 잔액 | `CurrencyAmount__c`→`balance` (스냅샷 모수 백분위) | 0~14 |
| 가치 | 오더 규모 | `opportunity.amount`(USD, 상대 랭킹) | 0~10 |
| 신뢰 | confirmed 링크 | `crm_source_links.status='confirmed'` (동률 타이브레이커) | 0~4 |

**비평 반영 보정:**
- **미수 인자는 Phase 1에서 제외** (§4-2). Phase 0 검증 통과 시 도입.
- 가치 백분위는 **현재 페이지가 아니라 스냅샷 모수**로 1회 계산(비결정성 제거).
- **연락처 없는 신규 리드를 음수 페널티로 하단 매장하지 않음** → "연락처 확보 필요" 레인에 노출.
- 응답 SLA는 기존 `isUnrespondedLeadRecord` 의미(`status='new'` + 응답대상 source)에 정렬. contacted 리드는 `follow_up_at` overdue로만.
- NEO staleness = 인자별 ×0.5 아님, **큐 상단 배너 1줄**("NEO 스냅샷 N시간 전").

### 3.2 위험 경보 (5종, 미수는 검증 후)
- **만료임박** — 활성 유료 EEO(`payloadIsActivePaidEeo`) & `expireAt` D-60 이내(D-7=긴급, `#B85C33` 강조). 이미 만료+미갱신은 휴면으로.
- **휴면** — `balance>0` & `lastClassAt` 180일+ (365일+=심각). 조용한 이탈.
- **클레임** — `CurrencyAmount__c<0` 또는 `FinancialInformation__c.refunded__c` → 특이사항 강제 알림(점수 미반영).
- **업셀** — `orderCount≥3` & 경보 無 (그린 액센트, 위험 아님).
- **(미수)** — `CollectionPlan__c` 배선·검증 후. 그 전엔 "수금데이터 미연결" 커버리지 갭 표기.

### 3.3 다음 액션 (결정론적)
신규 리드 미접촉→콜 기록 · 만료 D-30~60→견적 작성 · 만료 D-7→방문 일정 · 휴면→육성 시퀀스 · 연락처/담당 없음→특이사항(확보). `lib/crm-priority.ts`의 `deriveNextAction(row)` 1행 평가를 360 카드 버튼이 재사용.

### 3.4 리드 점수 & 군집 대체
- **"전환 확률 %" 가짜 정밀도 금지** → "우선순위 점수"(0~100 가산) + 근거 라벨. 입력: `leads`의 정보충실도·채널의도(utm/lead_magnet)·응답신선도·상태.
- 유사고객 군집 = `owner_name`/`region`/`size`/`utm_campaign` 룰 facet.

---

## 4. 데이터 / 백엔드

### 4.1 고객 통합 DB & 스파인 게이트
- 신규 `lib/repositories/crm-unified-customers.ts`: `getUnifiedCustomers({q,owner,status,linkState,expiringSoon,limit,offset})` — leads + `getNeoCrmCustomers`를 **`crm_source_links` confirmed-only**로, **같은 `customer`/`partner_account` target_id**에 모이게 조인.
- ❌ **`external_account` target_type 신설 안 함** (현 enum은 `partner_account`/`customer`/`deal`뿐이며 신규 매칭 머신 = anti-goal 위반). pipeline customer 없는 NEO는 "연결 필요" 행으로 둠.
- **unmatched = "연결 필요"** 행, 절대 드랍/합산 0 금지. 헤더에 merged / 연결 필요 / NEO-only / lead-only 카운트.
- 부분 유니크 인덱스 `crm_source_links_one_confirmed_source_idx`가 confirmed 1:1 보장 → 이중계상 차단(조인 필터는 명시적으로 `status='confirmed'`).

### 4.2 신규 엔드포인트 (전부 `verifyAdmin()` + `createSupabaseAdminClient()`)
| Method | Path | 목적 |
|---|---|---|
| GET | `/api/admin/crm/customers/unified` | 페이지네이션 통합 리스트 (서버측 필터, 5000행 일괄 로드 금지) |
| GET | `/api/admin/crm/customers/unified/[key]` | 360 카드 (리드+NEO drill-down+타임라인 머지) |
| GET | `/api/admin/crm/home/priority-queue` | 현황 우선순위 큐 (룰 정렬, 캐시) |
| GET | `/api/admin/crm/insights` | 인사이트 집계 (구조 리스크 포함) |
| POST | `/api/admin/crm/leads/quick` | 빠른 리드 등록 |
| PATCH | `/api/admin/crm/customers/unified/[key]` | 리드 필드만 인라인, NEO 필드 거부 |
| POST | `/api/admin/crm/customers/[key]/notes` | 고정 특이사항 + 메모 타임라인 |

### 4.3 타임라인 단일 저장소
- **수기 콜·방문·메모 = `crm_customer_events` 하나**(canonicalKey 키)로 통일. `activity_logs`는 `partner_account_id` NOT NULL FK라 리드 행 사용 불가.
- ⚠️ **기존 `lib/repositories/contact-logs.ts` 재사용 vs 신규 확정 필요** (Phase 0). 병렬 테이블 신설 금지.
- 360 타임라인 = 읽기시 머지(수기 + NEO 오더·수금 읽기전용 + deal stage).

### 4.4 쓰기 경로 게이팅
- **편집 가능:** `leads.*`(기존 `updateLead`/`saveLead`), 신규 `leads.pinned_note`, `crm_customer_events/notes`, `crm_source_links` 상태 전이.
- **읽기전용(큐 경유):** `external_crm_records` 전체 — NEO 변경은 **`crm_write_requests` draft→approved→sent** 큐로만. ⚠️ **큐 작성/상태 UI 컴포넌트 신규 필요**(360 카드에서 NEO 필드 변경 시 드래프트 작성 플로우).

### 4.5 마이그레이션 규율 (명시 산출물)
- `leads.pinned_note`, `crm_customer_events`/`crm_customer_notes` 테이블 + **RLS enable + `is_active_admin` 정책 + 인덱스**를 **Phase 1 named 산출물**로. 누락 시 과거 `follow_up_at`/`assigned_to` 무음 INSERT 실패 재발.
- 순서: `database.types` → repo INSERT → SQL(`ADD COLUMN IF NOT EXISTS`) → apply → smoke.
- `leads.priority_score`는 **v1 읽기시 계산**(컬럼 미신설), 크로스페이지 정렬 필요 입증 시에만 후속 마이그.

### 4.6 성능 & 안정성
- `getAdminCrmRevenueDashboard`/`getNeoCrmCustomers`(5000행 스캔) 확장 금지 → 전용 페이지네이션 쿼리.
- 헤더 카운트 = `crm_status_counts` RPC 패턴(신규 `admin_crm_unified_customer_counts`). 현황 큐·인사이트 = `admin_crm_overview_snapshots` dirty-log/TTL 스냅샷 재사용 + 어드바이저리 락.
- **듀얼모드 가드:** 통합 DB는 Supabase 모드 전용(`assertDurableLeadStorage` 패턴), JSON 폴백에선 **비활성**(degraded 아님).
- REV full-replace 재고아(`reattachBranchRevConfirmedLinks`) — 통합 행이 야간 sync마다 merged↔연결 필요로 깜빡이지 않게 보장.
- ⚠️ **RLS 클라이언트 함정:** 모든 신규 어드민 라우트는 `createSupabaseAdminClient()` 사용(server client = 빈 배열 사고).

---

## 5. UX / 디자인 시스템

기준: [DESIGN.md](../../DESIGN.md) + [app/globals.css](../../app/globals.css)(토큰 ~187-241).

- **거의 다 기존 재사용/확장.** 순수 신규는 **라디얼 게이지 1종**뿐. 360=`CustomerDetailPanel`+`LeadDrawer` 머지, 통합 테이블=`NeoCrmCustomersClient`, 위험 칩=`ExpiryBadge`/`getCustomerLogTone`, 우선순위 행=`pipelineRiskLeads`+로그행 그리드, 소스 톤=`MatchingInboxClient`.
- **차트:** 손수 `div` 막대(h-2 `#f0f0ec` 트랙 / `#084734` 필) 유지, **Recharts는 코어 CRM 금지**(FiscalRoadmap에 격리 + 오프팔레트라 복사 금지). 라디얼 = 인라인 SVG `<circle>`(트랙 `#f0f0ec`, 진행 `rate≥0.7?#084734:#B85C33`) + **숫자·% 병기(a11y)**, 작게(h-16/20)·attainment KPI에만.
- **돈 리본 = 라이트** — `#FFFFFF/#FAFAF8` 뉴트럴 카드, 그린은 숫자 액센트. **통화 합산 금지** — 원장별(USD 오더 / CNY 수금 / KRW REV / HW) 별도 라벨, grand total 없음, confirmed 매출 1개만 헤드라인. 다크는 nav/active fill(`#111110`)에만.
- **신규 hue 0개** — 위험=`#B85C33`/`#FEF3EE`, 경고=amber-50/700(D-60), 그린=액센트만. "연결 필요"=뉴트럴 톤.
- **밀도 유지** — eyebrow `text-[11px]` uppercase, 값 `text-[22px] font-bold tracking-[-0.03em]`, 카드 `rounded-2xl border-[#e8e8e4] bg-white p-4`. 리스트는 `slice + 더보기`.

---

## 6. Phase 0 검증 스파이크 (통합 숫자 출하 전 게이트)

1. **오너 식별 매핑** — 로그인 admin ↔ NEO `ownerId`(숫자, `getXiaoshouyiOwnerNameMap`) ↔ `leads.assigned_to` 연결고리 정의. 없으면 '내 고객' 개인화 불가 → 그동안 팀 전체 + 담당 필터(확정).
2. **미수 `CollectionPlan__c` 조인키** — payload의 account 조인키(`accountId` vs `orderAccountId__c` 추정) 실데이터 검증 + `EstimatedTime__c`/`collectStatus__c`/`Amount__c` 파싱. 통과 시에만 미수 신호 도입.
3. **HW 편중** — `branch_hw_outbound`엔 **고객 필드 없음**(destination 자유텍스트만) → "destination 기준"으로 정직 라벨링 + (선택) destination→customer 정규화. **HW 매출은 NEO USD와 별도 원장 → 절대 합산 금지, 나란히 표기.**
4. **`contact-logs` 재사용 결정** — 기존 repo를 단일 수기 저장소로 재사용 vs `crm_customer_events` 신규.
5. **스파인 커버리지 측정** — `getCrmSourceLinkCoverage()` 확장(매출보유 모수 기준 verified/needs-review/unmatched %), 임계 초과 시 통합 DB 경고 배너.

---

## 7. 단계별 실행

| Phase | 스코프 | 핵심 산출물 |
|---|---|---|
| **0** | 키스톤 측정 + 검증 스파이크 + 토큰 (마이그 불필요) | §6 5개 스파이크, 커버리지 위젯, 디자인 토큰·읽기전용 배지, CrmSubnav rename 설계 |
| **1** | 현황 BLEND + 고객 통합 DB + 360 | 우선순위 큐 메인 승격, 통합 조인 뷰, 360 카드, **마이그(pinned_note·crm_customer_events + RLS·인덱스)**, 쓰기 게이팅 |
| **2** | 인사이트 + 룰 추천 | 전환 퍼널·유입 소스 품질·HW 편중·SW 활성·리뉴얼 레이더, facet 그룹핑, (검증되면)미수 |
| **3** | polish + Quick-add + 돈흐름 정리 | 빠른 리드 모달, Deals→돈흐름 **rename**, NEO 쓰기 큐 UI, 반응형·a11y |

각 Phase 종료 게이트: `npx eslint app components lib --max-warnings=0 && npm run build`.

---

## 8. 비범위 / Anti-goals (ERP 청사진 §6 준수)

- ❌ 풀 귀속 원장(15개 신규 테이블) — 자문형으로 분리, 본 병합 범위 밖.
- ❌ `login_6mo`/`class_open_3mo` 등 HQ 소관 컬럼 신설 — SW 활성은 `balance`/`lastClassAt`/`expireAt` 파생 3신호로만.
- ❌ 노션 캘린더 Supabase 복제 — 라이브 읽기전용 유지. "연동" 탭은 매칭 정합성에 한정.
- ❌ CRM/티켓/BI 처음부터 재구축 — 기존 어드민 API·`crm_source_links` 확장.
- ❌ ML/임베딩·예측 확률·의미적 군집 — 전부 결정론적 룰로 대체.
- ❌ `external_account` target_type 신설 · 신규 매칭 엔진.
- ❌ 통화 grand total · 원장 간 매출 합산.
