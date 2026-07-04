# 어드민 OS 통합 재구성 마스터플랜 (2026-07-03)

상태: 기획 확정 → 단계별 구현 착수
선행 문서: [admin-ia-redesign-2026-06-29.md](admin-ia-redesign-2026-06-29.md) · [admin-organic-audit-2026-07-02.md](admin-organic-audit-2026-07-02.md) · [erp-blueprint-2026-06-22.md](erp-blueprint-2026-06-22.md) · [classin-operating-canon-2026-07-02.md](classin-operating-canon-2026-07-02.md)

---

## 0. 한 줄 결론

**탭을 더 줄이는 게 목표가 아니다.** 남은 진짜 공사는 ①한 학원(Account)을 전 도메인이 같은 키로 인식하는 **데이터 스파인**, ②[마케팅 리드 → CRM → 견적 → 매출 원장 → 하드웨어]가 **한 번 입력하면 끝까지 흐르는 핸드오프**, ③여러 탭이 **같은 숫자·같은 차트 부품**을 쓰게 하는 표면 통합이다. IA 겹침 정리(Phase 0~2)는 2026-07-02에 대부분 완료됐고, 이 문서는 그 다음(모델·흐름·시각화 단일화)을 설계한다.

## 1. 현재 상태 진단 — 무엇이 이미 됐고, 무엇이 겹치는가

### 이미 완료 (재작업 금지)

- nav SSOT([components/admin/admin-nav.ts](../../components/admin/admin-nav.ts)) + ⌘K 파생, commercial 폐기, redirect 스텁 정리, 가드 스냅샷 테스트, CRM 롤 매트릭스 통일.
- 리드 계보: convert-v2 멱등 판정 `crm_source_links` SSOT화, unified 고객 3원천 병합, 승인 큐 실행 와이어링, 행사 attribution 공용 파서, 채널톡 루프, reindex 서버 훅.
- 매칭 자동확정(confidence ≥0.92 & 갭 ≥0.15, customer/partner만) + `/admin/crm/matching` 인박스.
- REV 고객 정규화 키 SSOT: [lib/branch/account-key.ts](../../lib/branch/account-key.ts) `normalizedAccountKey()` — 주석에 이미 "향후 하드웨어 출고 ↔ REV 매출 대사의 조인 키"로 명시됨.
- REV 데이터셋 단일 규약: [lib/branch/read-rev-deals.ts](../../lib/branch/read-rev-deals.ts) (DB-native 우선, 시트 미러 폴백).

### 남은 겹침 (이번 이니셔티브의 대상)

| # | 겹침 | 실태 | 근거 |
|---|------|------|------|
| 1 | **딜/매출 3분할** | Portal V2 딜(운영 파이프라인) vs crm_deals-lite vs REV 시트 딜(`branch_rev_deals`) — 상호 FK 없음 | organic audit §3 |
| 2 | **매출 지표 이중 계산** | admin-crm-overview vs admin-crm-revenue 계산식 상이 → 홈 히어로와 딜 대시보드 숫자 어긋남 가능 | organic audit §3 |
| 3 | **견적·계약 V1/V2 이중 모델** | V1(partner 기반 `quotes`/`contracts`/`receipts`, `partner_id`만 보유) vs V2(deal 기반 `quote_documents`, `deal_id`·`customer_id` 보유). 채번 각자 count 기반 → 중복 번호 가능 | [lib/repositories/quotes.ts](../../lib/repositories/quotes.ts) · [lib/portal/repositories/quote-documents.ts](../../lib/portal/repositories/quote-documents.ts) |
| 4 | **재고 이중 모델** | `branch_hw` staging(시트 정규화) vs `hardware_movements` 원장 — low 임계값도 상이, 수기 입출고는 원장에만 | organic audit §3 |
| 5 | **KPI 카드·차트 중복 구현** | recharts 사용 파일 13개(crm 2, campaigns 4, analytics/overview/branch/ledger 각 1+) + KPI 그리드 다수가 각자 구현. 공용 모듈은 [components/admin/viz/Sparkline.tsx](../../components/admin/viz/Sparkline.tsx) 1개뿐 | grep 검증 |
| 6 | **nav 잔여 후보** | 6-29 재설계안 중 미적용: 챗봇→docs 흡수, campaigns↔analytics 행사·이메일 단일화, `/admin/marketing` 고아 흡수. Analytics vs 방문자/트래픽도 여전히 별도 탭 | admin-nav.ts 대조 |

### 수동 재입력 지점 (파이프라인 단절)

| 구간 | 증상 | 연결 키 후보 |
|------|------|--------------|
| 리드 → 견적 | convert-v2가 만든 customer/deal이 견적 작성으로 이어지지 않음. QuickQuote는 고객을 또 생성 | V2 `quote_documents.deal_id`(실존) — 진입 동선만 부재 |
| CRM 딜 ↔ REV 원장 | REV 행 식별자는 `customer_name` 자유 텍스트뿐 | `normalizedAccountKey` + `crm_source_links`(source 우선순위에 `branch_rev_sheet` 이미 정의됨) |
| 출고 ↔ 딜/원장 | movement가 `reference_no`로 딜을 가리켜도 딜 stage/수납 미반영 (`isCrmReference` 헬퍼는 실존) | `reference_no` + `normalizedAccountKey` 대사 |
| 견적 수락 → 계약 → 딜 stage | V2 전환 우선순위 로직은 있으나 수락 이벤트→딜 단계 전이 자동화 없음. /share 뷰어 placeholder | `activity_logs.after_json` 이벤트 → 액션 큐 |

## 2. 설계 원칙

1. **만들지 말고 켜라** — 새 시스템 대신 이미 심어진 씨앗(`crm_source_links`, `normalizedAccountKey`, `isCrmReference`, sync-chain, 액션 큐)을 연결·활성화한다. (operating canon §9 자동화 훅 맵이 배선도)
2. **자동 산출 우선, 수기 최소** — 입력할 명시 오너가 없는 테이블은 만들지 않는다. (ERP 블루프린트 원칙)
3. **커버리지 먼저** — 스파인·귀속·대사 전부 `crm_source_links` 매칭에 의존. 커버리지가 낮으면 통합 숫자가 매출을 조용히 누락하므로, **측정 UI가 모든 것에 선행**한다.
4. **unmatched는 절대 0으로 합치지 않는다** — 'needs link'로 표시하고 매칭 인박스로 보낸다.
5. **삭제보다 흡수** — 라우트는 redirect 스텁으로 보존(북마크 호환), 데이터 모델은 읽기 뷰로 합성부터(파괴적 마이그레이션은 최후).
6. **거버넌스 미결정(CEO 3건: book-of-record/귀속/목표 소스)에 의존하는 설계 금지** — 읽기 뷰·자문형 표시로 우회 가능한 범위만 착수.
7. 품질 게이트: `npx eslint app components lib --max-warnings=0` + `npm run build`, 스키마 변경 시 `supabase/migrations/` 동반.

## 3. 목표 아키텍처

### 3-1. 데이터 스파인 (Account 360)

```
leads ──convert-v2──▶ customers ─┐
external_crm_records(NEO) ───────┼── crm_source_links(confirmed) ──▶ account_master(읽기 뷰)
branch_rev_deals(REV 시트) ──────┤        조인 규약: normalizedAccountKey     │
hardware_movements(원장) ────────┘                                           ▼
                                              생애 CNY · HW 대수 · SW 활성 · 만료일 · 오너 · 헬스
```

- `account_master`는 **읽기 뷰**다(신규 쓰기 테이블 아님). 원천은 각자 소유권 유지(ClassIn-owned / External-owned / Derived — canon §5).
- `normalizedAccountKey`의 SQL 쌍둥이(immutable 함수)를 마이그레이션으로 추가 — TS 구현과 바이트 단위 동일 규칙(account-key.ts 주석의 regexp 그대로).
- REV↔CRM 연결은 새 매칭이 아니라 **기존 매칭 파이프라인에 source=`branch_rev_sheet` 후보 생성기를 추가**하는 것 (자동확정 티어·인박스 그대로 재사용).

### 3-2. 파이프라인 핸드오프 5단 (한 번 입력 → 끝까지 흐름)

| 단계 | 상태 | 이번 작업 |
|------|------|-----------|
| ① 리드→CRM | ✅ 가동(convert-v2 + source_links) | 손대지 않음 |
| ② CRM→견적 | ❌ 수동 재입력 | 딜/고객 상세에서 "견적 만들기" → V2 `quote_documents`에 `deal_id`·고객정보 프리필. QuickQuote는 기존 고객 검색-연결 우선(신규 생성은 폴백) |
| ③ 견적→계약→딜 stage | 🟡 반자동(전환 우선순위 로직만) | `public_quote_accepted` 이벤트 → 담당자 액션 큐 카드 + 계약 전환 시 딜 stage 자동 전이 제안(원클릭 확인, 자동 변경 금지) |
| ④ 계약/수주→매출 원장 | ❌ 단절(REV는 시트 원천) | REV 행 ↔ account 링크(§3-1) → 원장 워크벤치에 "CRM 딜 연결됨" 배지 + 계약 확정 시 원장 입력 큐에 초안 제안 |
| ⑤ 출고↔원장/딜 대사 | ❌ 단절 | `hardware_movements` ↔ REV 매출을 accountKey+기간으로 대사하는 리콘실 뷰: "출고 있는데 매출 없음 / 매출 있는데 출고 없음" 인박스 |

원칙: **자동은 '제안·매칭·초안'까지, 확정은 사람이 원클릭.** (매칭 자동확정도 deal은 수동인 기존 정책 유지)

### 3-3. 표면 통합 (IA + KPI SSOT + 차트)

- **KPI 정의 SSOT**: `lib/admin/metrics/`(가칭 revenue-core)로 overview·branch·crm이 같은 계산식을 import. 통화 규범(오더 USD/매출·REV CNY/딜 KRW, grand total 혼합 금지) 준수.
- **차트 공용 모듈**: [components/admin/viz/](../../components/admin/viz/)를 확장해 TrendCombo(막대+선), FunnelSteps, KpiStatGrid, MonthHeatmap, DonutGauge, Sparkline(기존)을 표준화. 각 탭은 데이터만 주입. DESIGN.md 팔레트·신호색 규범 내장(그린 단일 CTA, 신호색은 상태 표시 한정).
- **nav 잔여 정리(6-29안 완결)**: 챗봇 운영→가이드 문서 탭 흡수(딥링크 유지), `/admin/marketing`→campaigns 이메일 허브 정식 흡수, campaigns↔analytics 행사·이메일 패널 단일화. Analytics·트래픽은 데이터 원천이 달라(비즈니스 vs 계측) 탭 유지하되 중복 패널만 제거.
- **branch ↔ branch/ledger ↔ overview**: 숫자는 전부 KPI SSOT 경유. branch(성과 관제)와 ledger(입력·검수 워크벤치)는 역할이 달라 통합하지 않음 — 대신 상호 딥링크와 동일 수치 보장.

## 4. 실행 로드맵

> 표기: S=하루 이내, M=수일, L=수주. `[MIG]`=마이그레이션 동반. 병렬 트랙은 서브에이전트 분담.

### Phase A — 신뢰 기반 (스파인)
- **A1 (S) [진행]** 매출보유 계정 기준 커버리지 — 기존 [getCrmSourceLinkCoverage](../../lib/repositories/crm-source-links.ts)는 링크 "행 수" 기준이라 후보조차 없는 REV 고객의 매출 누락이 안 보임. 신규 [rev-account-coverage.ts](../../lib/repositories/rev-account-coverage.ts)가 원장 쪽에서 출발해 계정·금액 두 축으로 계산(판정 규칙은 후보 생성기와 공유: `isInactiveSheetStatus`·placeholder 제외·`getBranchRevSourceRecordKey` 정확 일치). `/api/admin/crm/coverage`에 `revAccounts`로 노출, CRM 홈 스트립 + 매칭 인박스 헤더에 표시. (overview 타일은 병행 세션 파일 충돌로 보류)
- **A2 (M) `[MIG]` [진행]** `normalized_account_key()` SQL immutable 함수 + TS↔SQL 패리티 픽스처(마이그레이션 DO 블록 자기검증 + vitest 쌍) + `branch_rev_deals`·`customers` 표현식 인덱스.
- **A3 ✅ 기구현 확인** REV→매칭 후보 생성기는 이미 존재·배선됨: `generateBranchRevLinkCandidates`(자동확정 티어 포함) + `/api/admin/crm/source-links/generate`. 추가 작업 불필요.
- **A4 ✅ v1 완료** `account_master`를 SQL 뷰 대신 **TS 합성**으로 구현([lib/repositories/account-master.ts](../../lib/repositories/account-master.ts)) — REV 링크 키 재구성에 `normalizeCrmName`의 SQL 쌍둥이가 또 필요해지는 파리티 함정을 피하고, 후보 생성기·커버리지와 같은 함수를 재사용해 판정 일치를 보장. `GET /api/admin/crm/account-master` + 고객DB(unified) "Account 360" 렌즈(요약 3스탯·매출 상위 계정·needs link 리스트, 접힘 기본·lazy fetch). 외부 CRM은 통화 혼재(오더 USD) 때문에 건수만 표기. *잔여: 만료일(external expireAt)·HW 대수 필드는 후속.*

### Phase B — 핸드오프 (수동 재입력 제거)
- **B1 ✅ 완료** 딜→견적 프리필: `/admin/quotes?dealId=`(별칭 `deal`/`customerId`)가 QuickQuoteComposer를 **기존 고객 모드로 자동 선택**해 오픈(1회 적용, 수동 변경 미침범, 암묵 고객 생성 없음). 진입 딥링크 2곳 — 리드 전환 성공 패널 "견적 만들기"(주 액션), 딜 워크스페이스 "견적 대기" 카드 "견적" 링크(adminView 한정). V2 `quote_documents.deal_id` 저장은 기존 API 그대로. *QuickQuote 기본 모드를 '기존 고객 우선'으로 바꾸는 UX 결정은 별도(회귀 위험).*
- **B2 ✅ 완료** 견적 수락(`public_quote_accepted`, dedupe 통과분만) → `crm_tasks` materialize(taskType quote, 새 테이블 없음·중복 방지) → 우선순위 큐 카드 자동 노출(taskHref deal 분기 신설). 계약 전환 성공 시 portal 딜 stage **전진만**(contact/quote→contract, 후퇴·건너뛰기 금지) + 해당 quote task 자동 완료 처리. crm_deals(어드민 계열) 동기화는 portal↔crm_deals 매핑 미확인으로 보류.
- **B3 ✅ v1 완료** 출고↔REV **존재성 대사**([lib/repositories/hw-rev-reconcile.ts](../../lib/repositories/hw-rev-reconcile.ts) + `GET /api/admin/crm/reconcile/hw-rev` + 매칭 워크스페이스 하단 접힘 패널). 출고 revenue는 USD·REV는 CNY라 금액 비교는 하지 않고 hw_only(매출 미기재 의심)/rev_only/both만 판정. 배송예정·물류No 누락은 실출고와 구분 표기, destination 미지정 행은 "대사 불가" 카운트. *금액 대조는 환율 정책 확정 후 v2.*
- **B4 ✅ 완료** V2 계약 양측 서명 완료(admin_signed) → 원장 forecast 초안 자동 제안([lib/admin/handoff/contract-to-ledger-draft.ts](../../lib/admin/handoff/contract-to-ledger-draft.ts), 신규 모듈 — 원장 repo는 import만). **통화 환산 금지**: V2 계약 계열엔 currency 컬럼이 없어 금액은 0으로 넣고 원금액(₩ 추정)은 note/metadata 참고용만 — CNY 금액은 검수자가 입력. 기존 draft→checked→apply 2단 게이트가 안전장치. dedup: 같은 딜의 열린 forecast 초안 있으면 스킵.

### Phase C — 표면 통합
- **C1 ✅ 1차 완료** (a) KPI 카드 단일화 — `viz/primitives.StatTile`을 통합 구현으로 확장(href/sparkline/상세 trend/lift), `StatCard.tsx`는 얇은 델리게이트화(사용처 9곳 무변경·시각 동일). (b) 퍼널 통합 — `MiniFunnel`에 waterfall variant 흡수, `FunnelWaterfall.tsx` 삭제. (c) 게이지 추출 — `viz/GaugeRing`·`viz/ProgressRoadmap`(hero/meter/mini) 신설, BranchHeroGauges·GoalProgressPanel이 공용판 사용. (d) 툴팁·팔레트 표준화 — campaigns 4종·analytics·FiscalRoadmap이 `viz/ChartTheme`/`viz/theme` 토큰 사용, **파랑 하드코딩 제거 완료**(FiscalRoadmap 추세선 amber화, BranchHeroGauges blue는 데드코드였음). **C1 2차(2026-07-04)**: (e) KPI 카드 로컬 재구현 6벌(analytics·campaigns·marketing·ops·docs·chatbot) 전부 StatTile 위임 원라이너로 축소 + StatTile `compact` 변형 추가 — §A-4의 8벌이 공용 1벌로 수렴(CoreKpiGrid만 원장 트랙 소유라 머지 후). (f) `viz/ComparisonBarChart`(이중축 Bar+Line)·`viz/RankedHorizontalBars`(수평 랭킹) 래퍼 신설, campaigns 2종(MetaPerformanceCharts·CampaignTrendChart) 이식. (g) 2026-07-04: `viz/TrendAreaChart` 신설 + CRM 차트 2종(CrmPerformanceCharts·CrmHomeCharts) 이식 완료 — 래퍼에 light 툴팁 variant·목표선·cellColor 옵션. 잔여: KpiGrid 열 규칙 통일, Workbench(6,999줄)·하드웨어 클라이언트(6,336줄) 분해([money-mesh §3](admin-money-mesh-2026-07-03.md) 백로그와 공유).
- **C2 (M)** KPI SSOT(revenue-core) 추출 — overview·branch·crm 순차 전환, 스냅샷 테스트로 수치 동일성 고정.
- **C3 🟡 부분 완료** 챗봇→docs 흡수 ✅(2026-07-04): 챗봇 페이지 전 블록이 보강 큐 탭(DocsGapsPanel)의 상위집합으로 커버 확인 → 새 탭 없이 redirect 스텁 + nav 항목 제거(순 −1) + 검색어 병합 + 워밍업/딥링크/테스트 정리. 잔여: marketing→campaigns 흡수, campaigns↔analytics 행사·이메일 패널 단일화.
- **C3b ✅ 사이드바 6→4섹션 재편**(2026-07-04, 사용자 지시 "너무 세분화"): 잡탕이던 "분석" 섹션 해체 — 웹 분석(Analytics·트래픽)→마케팅, 매출 성과(KR Team·매출 장부)→영업으로 흡수. 섹션 라벨 `영업·매출`/`마케팅·분석`/`고객 지원`/`운영·시스템`. Overview는 헤더 없는 최상위 단독, 섹션 부제(설명 줄) 미렌더. 항목 20개는 전부 최상위 유지(탭 강등·페이지 구조 변경 없음 — 사용자가 "가벼운 정리" 선택). nav SSOT(admin-nav.ts)만 바꿔 ⌘K 팔레트 그룹도 자동 반영. 라이브 DOM 검증 완료. *더 강한 통합(중복 3~4쌍 탭 강등)은 보류된 옵션.*
- **C4 (L, 별도 착수)** 견적·계약 V1→V2 완전 단일화(서명 루프 포함) + 채번 시퀀스 RPC화. — *가장 무겁고 /share 뷰어 구현이 선행. 본 이니셔티브에서는 설계만.*

### 비범위 (하지 않음)
- REV 워크벤치 자체 개선(P0 4건 등) — [rev-tab-audit-2026-07-03.md](rev-tab-audit-2026-07-03.md) 트랙에서 별도 진행 중.
- 귀속(attribution split)·목표 DB 이관 — CEO 거버넌스 결정 대기(ERP 블루프린트 §5).
- 풀 귀속 원장·CS 티켓·거점/예산 모듈 — ERP 블루프린트 Phase 4~5로 유지.
- JSON 저장소 Supabase 승격 — 별도 트랙(organic audit Phase 3 잔여).

## 5. 검증 계획

- 게이트 2종(eslint/build) + `npx tsc --noEmit` + vitest 기존 725건 통과 유지.
- 신규: 커버리지 지표 스냅샷 테스트, account_master 뷰 조인 무결성 테스트(unmatched 비합산 보장), KPI SSOT 수치 동일성 테스트(전환 전/후 비교), 채번 중복 회귀 테스트(C4 착수 시).
- normalizedAccountKey SQL↔TS 패리티 테스트(동일 입력 100케이스 fixture).

## 6. 병행 작업 충돌 관리

원장·하드웨어 파트가 동시 진행 중이므로 아래 파일은 이번 트랙에서 **직접 수정 금지**(읽기·신규 파일 연결만): `components/admin/branch/SalesLedgerWorkbench.tsx`, `lib/repositories/sales-ledger-*.ts`, `lib/repositories/hardware-inventory.ts`, `lib/repositories/branch-hw.ts`, `app/api/admin/branch/*`. 연결이 필요하면 신규 모듈(예: `lib/admin/reconcile/*`)에서 import로 붙인다.

교차 참조(2026-07-04): 원장 트랙의 [admin-money-mesh-2026-07-03.md](admin-money-mesh-2026-07-03.md)가 같은 문제로 수렴 — §2.1 HW↔REV 스키마 대사(GENERATED account_key·`v_hardware_rev_matches` 뷰·`rev_record_key`)는 이 트랙 B3 존재성 대사의 본질 버전이고, 그 Phase A 선행조건(SQL account_key 트윈)은 이 트랙 A2 마이그레이션이 이미 충족한다. B3 v1 패널은 §2.1 인박스가 서면 그 소비처로 수렴시키면 된다. §2.3 '확정 매출' 단일 정의 = 이 트랙 C2(KPI SSOT)와 동일 항목 — **운영자 캐논 결정(장부 confirmedMonthAmount 권장) 후 진행**으로 정렬. §2.2(수동 출고 매출 캡처)·§2.4(재고 SSOT)도 결정 대기 목록에 병합.

머지 노트(2026-07-03): 이 트랙 분기 후 원장 트랙이 체크포인트 커밋들을 쌓았다(원장 안정화 + `lib/branch/account-key.ts`·`read-rev-deals.ts` 정식 커밋 포함). 이 트랙은 `account-key.ts`를 바이트 동일 복사로 선반영했으므로 머지 시 add/add는 무충돌로 수렴한다. 병합 순서는 원장 트랙 → 이 트랙 권장(REV 데이터셋 규약이 먼저 안착한 뒤 대사·스파인이 그 위에 얹히는 의존 방향).
