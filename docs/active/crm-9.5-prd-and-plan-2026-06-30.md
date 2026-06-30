# CRM 9.5 — PRD & 실행 계획

작성 2026-06-30 · 상태: v2 (3축 적대 리뷰 반영 — 실현가능성·완결성·AC엄밀성). 종합 9.5는 B1-full·D1 실QA 통과 조건부.

## 0. 한 줄 요약

3탭 IA + 신규 4기능까지 끝낸 현재 CRM(사용성·경로·디자인 각 **6.0/10**)을, 마찰 0 · 시스템 일관 · 데이터 충실 · 폴리시 완비로 끌어올려 **종합 9.5/10**을 만든다.

## 1. 배경 / 현재 상태

- 완료: CRM 탭 6→3 축소(현황·고객·기록), 라벨링, 연락 입력 폼(콜/문자/메모/회의록), 시각화(리드 분포·전환 퍼널), 다가오는 일정, 태그 DB 싱크·최적화.
- 두 차례 검증(자체평가 + 사용자 입장)이 모두 6.0으로 수렴. 진단: **"견고한 골격 + 반복 마찰"**.
- 6점대를 누르는 천장(검증 confirmed):
  1. 시스템 우회 — 인라인 hex·Tailwind 신호색(sky/emerald/amber), VIP 보라, 심각도 색 이중 의미.
  2. 분석 얕음 — 현황 차트가 리드 분포뿐(매출/수금 추이 부재), insights는 링크로만 연결.
  3. 폴리시 부재 — 빈/로딩/에러 상태 누락, 접근성(aria·터치·대비) 미흡, 낙관적 UI·피드백 비일관.
  4. 검증이 전부 **코드 기반** — 실브라우저·모바일·인터랙션 미검증.

## 2. 목표 & 성공 지표 (9.5의 정의)

| 차원 | 현재 | 목표 | 9.5 기준(정성) |
|------|------|------|----------------|
| 사용성 | 6 | ≥9.5 | 무음 실패 0 · 모든 비동기 경계에 상태 표시 · 처리→다음 리듬 |
| 사용자 경로 | 6 | ≥9.5 | 막다른 길 0 · de-navved 화면 완전 흡수 · 분석→액션 전부 링크 |
| 디자인 | 6 | ≥9.5 | 단일 토큰 시스템(인라인 색 0) · 단일 심각도 색 체계 · 충실 데이터 시각화 |

**핵심 5플로우(정본)**: ①아침 현황 진입 ②고객 검색/필터 ③라벨 1클릭 세그먼트 이동 ④연락 기록 추가 ⑤일정 확인.

**측정 방법** — 자동/수동 게이트 분리:

- **자동 게이트(CI)**: `npx eslint app components lib --max-warnings=0` + `tsc` 그린 · 색 토큰 grep 0(아래 A1) · axe-core a11y 스캔 critical 0. all-must-pass.
- **수동 검증(D1)**: 핵심 5플로우를 데스크톱(Chrome latest)+모바일(iOS Safari, 375px portrait)에서 실행했을 때 **(a) 크래시/로딩 무한대기 0건, (b) 각 비동기 경계마다 로딩/완료/실패 피드백 표시, (c) 가로스크롤 강제 0, (d) 액션→응답 체감 2초 이내.** 스크린샷으로 기록.
- **적대 재검증(D2)**: 이전 6.0 평가의 high/medium 이슈 리스트(§9 부록)를 재실행해 confirmed high/medium 신규 0건 확인.

## 3. 범위

- **In**: 현황·고객·기록 3탭과 신규 4기능의 폴리시 + 시스템 일관 + 데이터 충실 + 접근성 + 실QA.
- **Out**: 새 최상위 탭 추가, 어드민 타 영역(견적·딜보드·Analytics) 재구현, 신규 외부 연동/결제. (정본은 어드민에, CRM은 고객 컨텍스트만 — 기존 캐논 유지.)

## 4. 요구사항 (4 워크스트림)

각 항목: **현재 → 요구 → 수용기준(AC) → 주요 파일**.

### WS-A. 시스템 일관화 (점수 기여 최대)

- **A1 디자인 토큰 단일화**
  - 현재: `getCustomerLogTone`은 토큰화했으나 deals·레거시 리드보드·일부 배지에 인라인 hex/Tailwind 신호색 잔존.
  - 요구: 모든 색을 `components/admin/viz/theme.ts` 4톤(neutral/brand/caution/danger) 또는 CSS변수로 참조. 인라인 hex/sky/emerald/amber 0.
  - **범위 확정(grep 실측 2026-06-30)**: `app/admin/crm`+`components/admin/crm` 내 `bg-(sky|emerald|amber)-` **26건** 잔존(리뷰 추정 15/28과 불일치 — 실측 26 기준). raw `#`-hex는 1000+건이나 대부분 SVG 차트 좌표/디자인시스템 정의색이므로 **신호색(상태→의미) hex만** 대상. 의미 없는 장식/차트 색은 제외.
  - **상태→토큰 매핑표(deals/page.tsx)**: `connected→brand` · `configured/draft→neutral` · `approved→caution` · `succeeded→brand` · `failed/error→danger`. theme.ts `TONE[tone].surfaceClass`로 치환.
  - AC: (1) `bg-(sky|emerald|amber)-` grep **0건**(deals·matching·leads 포함), (2) 신호 hex가 `TONE`/`PALETTE` 외 0건, (3) 같은 의미=같은 토큰, (4) **치환 전후 비주얼 diff 스크린샷 첨부**(회귀 검토). grep 게이트를 CI(pre-commit 또는 eslint custom rule)로 자동화.
  - 파일: `components/admin/viz/theme.ts`, `app/admin/crm/page.tsx`, `app/admin/crm/deals/page.tsx`(상태 매핑 신설), `components/admin/crm/leads/shared.tsx`.

- **A2 심각도 색 체계 분리**
  - 현재: 분류 플래그(vip/new/upsell)와 severity(critical/high)가 같은 색을 다른 의미로 사용 → 3초 스캔 깨짐.
  - 요구: 긴급도(critical/expiring/due)=채도색, 분류(vip/new/upsell)=무채색/아웃라인. 4단계 공통 사전으로 라벨·색 1:1.
  - **공용 심각도 사전(명시)**: `critical→danger(red)` · `expiring/high→caution(amber)` · `due/medium→brand` · `normal→neutral(gray)`. 현재 `customer-flags.ts`의 색 중복(`due`=`hot`=`#B85C33`)을 분리: `due`는 채도(danger/caution), 분류 플래그(hot/new/upsell)는 무채/아웃라인으로 강등.
  - AC: (1) `CrmCustomerFlags`·`CrmPriorityQueuePanel` 렌더 시 각 flag가 위 사전의 토큰을 적용(코드 스냅샷 테스트로 색 토큰 검증), (2) 시각 회귀 스크린샷에서 동일 행 내 채도색=긴급/무채=분류로 분리, (3) `due`↔`hot` 동색 0. ("읽힘" 같은 주관 기준 폐기 → 토큰 일치 검증으로 대체.)
  - 파일: `lib/crm/customer-flags.ts`, `components/admin/crm/CrmCustomerFlags.tsx`, `CrmPriorityQueuePanel.tsx`, `Customer360Drawer.tsx`.

- **A3 VIP 보라 제거**
  - 현재: `customer-flags.ts` vip `#4338ca`(인디고) — DESIGN.md "파랑/보라 금지" 정면 위반.
  - 요구: `vip`를 brand green `#084734`(bg `#ECFDF5`, border `#D1FAE5`) 또는 웜뉴트럴 `#615D59`로 교체. **P1 사전작업으로 이동**(다른 색 작업의 전제).
  - AC: (1) `customer-flags.ts`에서 `vip` color/bg/border 모두 `TONE` 팔레트값, (2) CRM 전체(`grep -rE '#(4338ca|[0-9a-f]*(blue|indigo|violet|purple))'`) 파랑·보라 hex **0**, (3) `#4338ca` 의존 코드 grep 0, (4) 교체 후 비주얼 회귀 스크린샷.
  - 파일: `lib/crm/customer-flags.ts`(line 7).

### WS-B. 데이터·분석 충실화

- **B1 매출/수금 추이 실데이터 차트** — *재평가: infeasible 아님. 백엔드 이미 존재.*
  - 현재: 현황 차트가 리드 상태 분포뿐. **단, 시계열 백엔드는 이미 구축됨**: `lib/admin-crm-revenue.ts:706 getAdminCrmRevenueDashboard(months=6)`가 `monthly[]`(월별 revenue/payments/confirmed) 반환, `app/api/admin/crm/revenue/route.ts` 엔드포인트 가동 중. `lib/admin-crm-neo.ts`는 `occurred_at` `gte/lt` 범위쿼리·`month` granularity 지원. → **"NEO 단일기간이라 시계열 불가"는 부정확.** 신규 엔드포인트 불필요.
  - 요구: 신설이 아니라 **기존 `/api/admin/crm/revenue` 결과를 `CrmHomeCharts`에 라인/에어리어로 와이어링.** 현황 `load()`에서 병렬 fetch.
  - AC: (1) 현황에 `revenue.monthly` 기반 월별 매출·수금 추이 차트 렌더, (2) `monthly` 빈 배열 시 섹션 유지 + "표시할 매출 데이터가 없습니다" 안내(섹션 숨김 금지), (3) fetch 실패 시 에러 배너 + 새로고침 버튼, (4) `dynamic ssr:false` 지연 로드 유지.
  - 파일: `app/admin/crm/page.tsx`(병렬 fetch), `components/admin/crm/CrmHomeCharts.tsx`(추이 차트 추가). **신규 repo/엔드포인트 불필요.**

- **B2 insights 현황 흡수**
  - 현재: 인사이트는 "심화 보기" 링크로만 연결 + `CrmSubnav`가 insights 딥링크 시 서브탭 빈칸(위치 단서 0).
  - 요구: `CrmInsightsClient` 핵심 섹션(**전환 퍼널 + 채널 전환율** = MLP)을 분리한 sub-component로 `page.tsx`에 직접 포함. 데이터는 `/api/admin/crm/insights`를 현황 `load()`에서 병렬 fetch(중복 페치 방지 위해 동일 캐시 키 공유). `CrmSubnav`의 별도 `insights` 섹션 제거.
  - AC: (1) 현황에 분석 섹션(퍼널·채널) 인라인 렌더 — 분석 보려 이탈 0, (2) `/admin/crm?section=insights` 딥링크 시 `#insights`로 자동 스크롤, (3) 섹션 헤더에 "이 분석은 insights 페이지와 동기화" 안내, (4) `CrmSubnav` insights 서브탭 빈칸 0(제거). 커버리지 등 풀 insights 동기화는 **선택(9.6)**.
  - 파일: `app/admin/crm/page.tsx`, `components/admin/crm/CrmInsightsClient.tsx`(섹션 분리 export), `CrmSubnav.tsx`(insights 제거).

- **B3 라벨 → 세그먼트 end-to-end**
  - 현재: 라벨 필터가 고객 리스트에만. 현황 홈엔 없어 세그먼트 관찰에 진입 2회.
  - 요구: 현황 `load()`에서 `availableTags` fetch → 상단 필터 영역에 라벨 칩 렌더. 칩 클릭 시 `/admin/crm/customers?tag={labelName}`로 이동, `CrmUnifiedCustomersClient`가 `?tag=` query를 초기 필터로 흡수(현재 line 503-509 라벨 칩 렌더 로직 재사용).
  - AC: (1) 현황에 라벨 칩 표시(데이터 0이면 "라벨 없음" 안내), (2) 칩 1클릭 → 고객 리스트가 해당 태그로 **사전 필터된 상태**로 진입(2회 네비 → 1회), (3) `?tag=` query를 `CrmUnifiedCustomersClient`가 읽어 활성 칩 하이라이트.
  - 파일: `app/admin/crm/page.tsx`(칩 + fetch), `components/admin/crm/CrmUnifiedCustomersClient.tsx`(`?tag=` query 흡수).

### WS-C. 완성도 레이어

- **C1 빈/로딩/에러 상태 전수 + 섹션 격리**
  - 요구: 현황 비동기 섹션 **7개**(개요카드·매출추이차트·리드분포차트·우선큐·주간일정·팀패널·insights)가 각각 로딩/완료/에러를 명시 UI로 표시. 데이터 0일 때 섹션 숨김 금지(헤더+"데이터 없음" 유지). **`page.tsx`의 `setCrmOverviewError`/`setLeadKpisError` 등 catch가 무음 처리되지 않도록 각 섹션 에러 배너 필수**(현재 leadKpi만 toast). 각 섹션은 독립 Suspense + Error Boundary로 격리(한 섹션 크래시가 전체 페이지를 내리지 않음).
  - AC: (1) 7개 섹션 전부 loading/empty/error UI 보유(체크리스트 기록), (2) fetch 실패 시 해당 섹션에 "데이터를 불러오지 못했습니다"+새로고침 버튼, 무음 0, (3) 한 섹션 강제 throw 시 타 섹션 정상 렌더(Error Boundary 동작 확인).

- **C2 접근성 패스**
  - **"주요 인터랙션" 정의(4가지)**: ①라벨 필터 칩 ②상태 토글(완료/미루기) ③연락 기록 추가 ④딜 상태 변경.
  - 요구: 위 4가지에 `aria-pressed`/role, Tab 도달 + Enter/Space 활성화, 터치 타깃 ≥44px, 보조 텍스트 대비 ≥WCAG AA, 모바일 KPI 표 카드 폴백.
  - AC: (1) 4가지 인터랙션 각각 Tab 도달 + 키보드 활성화(수동 체크리스트), (2) **axe-core 스캔 critical/serious 0**(자동, CI), (3) 모바일 375px 가로스크롤 강제 0, (4) iOS Safari VoiceOver 수동 1패스(P5 게이트).

- **C3 낙관적 UI + 일관 피드백**
  - 요구: 모든 act-in-place(완료/미루기/라벨/연락/딜)에 즉시 반영 + 통일 토스트. 처리 후 다음 항목 자동 포커스.
  - AC: 처리→서버재조회 깜빡임 없음 · 모든 성공/실패에 일관 피드백.

- **C4 owner/state 영속 통일**
  - 현재: owner 기본값·영속이 리스트=localStorage, 큐=휘발 '', 주간=휘발 '__me' 3갈래.
  - 요구: 단일 `localStorage` key `crm-owner`로 통일. `useCrmOwners`가 이 key를 읽고/쓰며, 리스트·큐·주간이 모두 동일 기본값 사용. `__me` 센티넬은 유지하되 저장값으로 영속.
  - AC: (1) owner 선택값이 `localStorage['crm-owner']` 단일 저장, (2) `/admin/crm`·`/customers`·`/partners` 진입 시 동일 owner 기본값, (3) **영속 시나리오 테스트**: 현황에서 owner=A 선택 → 고객 탭 이동 → 현황 복귀 시 owner 여전히 A(자동 테스트로 검증).
  - 파일: `components/admin/crm/useCrmOwners.ts`, `CrmUnifiedCustomersClient.tsx`, `CrmPriorityQueuePanel.tsx`, `CrmWeekAheadPanel.tsx`.

- **C5 통화 정합(신규)**
  - 현재: `Customer360Drawer.tsx:1090` LTV는 KRW(₩), `eeoAccounts.balance`(line 1068-1077)는 NEO 출처로 **USD 가능성** — 둘 다 `formatAmount()`로만 렌더해 단위 미표시(원/달러 혼재 위험).
  - 요구: `eeoAccounts` 타입에 `currency` 필드 추가, `formatAmount` → `currency-aware formatMoney(amount, currency)`로 교체.
  - AC: 드로어의 모든 금액에 통화 기호 명시(₩/$), KRW·USD 혼재 표시 0. 통화 미상 시 코드명(예: `USD 1,200`) 표시.
  - 파일: `components/admin/crm/Customer360Drawer.tsx`.

### WS-D. 진짜 검증

- **D0 QA 환경 사전 체크(P0 승격)** — D1 착수 전 확정: (a) 데스크톱 = 로컬 `npm run dev`(과거 포트 3888 IPv6 이슈 확인) 또는 staging deploy + Chrome, (b) 모바일 = iOS 실기기 Safari 또는 불가 시 DevTools 모바일 에뮬(375px)로 대체, (c) Supabase staging/preview 연결 가능 여부(`/about`·prerender Supabase 의존 이슈). **불가 항목은 AC에서 제외하고 점수 기여 0으로 조정.** 결과를 §6 리스크에 기록.
- **D1 실브라우저·모바일 QA** — 핵심 5플로우를 실제 렌더로 데스크톱+모바일 워크스루. §2 측정 방법 (a)~(d) 기준 적용, 스크린샷 기록.
- **D2 적대 재검증** — §9 부록의 이전 high/medium 이슈 리스트를 재실행, confirmed high/medium 신규 0 확인. 결과를 별도 리포트("CRM 9.5 검증 리포트")로 기록.

### WS-E. 정책·범위 명시 (리뷰 누락 보강)

- **E1 부분 입력/벌크 확정 가드** — `LeadRegisterModal.tsx`(line 84-90 isDirty, 250-269 미리보기 상위 5행): 벌크 제출 전 "파싱된 N건을 등록하겠습니까?" 재확인 모달 또는 확정 버튼 toggle(미리보기 후 활성화). 미리보기는 최대 10행 스크롤 컨테이너 + idx 번호 + 빈 필드 회색. AC: 벌크 제출 전 N건 카운트 확인 단계 존재.
- **E2 롤 기반 접근(RBAC) 명시** — 액션×롤 매핑: 리드 등록=admin/manager, 고객 수정=할당 sales+manager, 딜 상태 변경=manager/admin. `page.tsx:206 authMode` 외 세밀 가드 추가. AC: 권한 없는 롤에서 해당 액션 버튼 비활성/숨김.
- **E3 드로어 모바일 컴팩트** — `Customer360Drawer`(실측 섹션 21개): 모바일 800px 이하에서 종류별(위험/돈흐름/연락처) 그룹핑 또는 기본 접힘 섹션 3개로 확대(현재 1개). AC: 모바일 드로어 초기 펼침 섹션 ≤ 그룹 헤더 수준.
- **E4 성능 기준** — 현황 LCP <2.5s, CLS <0.1(home). CRM 섹션 dynamic import 유지, 초기 번들 영향 측정. AC: Lighthouse home LCP <2.5s 기록.
- **E5 테스트 자동화** — 핵심 5플로우 E2E(Playwright) + A1 색 grep·A2/A3 토큰 스냅샷·C4 owner 영속 단위 테스트. AC: 5플로우 E2E 그린, 신규 로직 테스트 추가.
- **E6 i18n·페이지네이션 out-of-scope 확정** — 9.5는 **KO-KR만**(i18n은 9.6 roadmap). 리드 리스트 로딩 전략은 현 구현(무제한/무한스크롤) 유지하되 성능 이슈 시 9.6에서 페이지네이션. 명시적 out-of-scope.

## 5. 실행 계획 (단계·의존·검증)

| Phase | 내용 | 방식 | 의존 | 검증 게이트 |
|-------|------|------|------|-------------|
| **P0** | D0 QA 환경 사전 체크 | 환경 확인 | 없음 | 환경 매핑 기록 |
| **P1** | A3(보라) → A1(토큰) → A2(심각도색) | sweep(grep→치환), 의미단위 | 없음(P0 병렬 가능) | eslint/tsc + 색 grep 0 + 비주얼 diff |
| **P2** | B1 매출추이(**기존 endpoint 와이어링**) + B3 라벨 e2e | 순차 | P1(토큰) | 실데이터 렌더 + 빈/에러 상태 |
| **P3** | B2 insights 흡수(퍼널·채널 MLP) | 순차 | P2 | 딥링크 스크롤·이탈 0 |
| **P4** | WS-C(빈상태·격리·a11y·낙관UI·owner·통화) + WS-E(가드·RBAC·드로어) | sweep + 순차 | P1~P3 | a11y axe 0·피드백·owner 영속 |
| **P5** | E5 E2E + D1 실QA + D2 적대 재검증 | Playwright + 실브라우저 | 전부 | confirmed high/med 0 → 9.5 판정 |

- **병렬성**: P0은 P1과 병렬 가능. P1 내부는 A3→A1→A2 순차(토큰 정의가 전제). P2·P3은 순차.
- **공유 리소스 주의**: `AdminSidebar` 글로벌 NAV·하드웨어는 타 세션 소유 → CRM 토큰 sweep이 sidebar 건드리지 않도록 경로 한정(`app/admin/crm`+`components/admin/crm`만).
- 각 Phase 커밋 템플릿: `feat(crm): P{n} {WS-id} {요약}` + `npx eslint app components lib --max-warnings=0` + `tsc` 통과 후 다음.

## 6. 리스크 & 완화

- **매출 시계열 백엔드(B1)**: NEO 원천에 월별 집계가 없으면 비용↑. → 기존 스냅샷/오더 occurred_at 기반 집계 가능성 우선 조사, 없으면 범위 축소(최근 6개월 단순 합계).
- **토큰 sweep 회귀(A1)**: 색 일괄 치환이 의도치 않은 표면 변경. → 의미 단위 치환 + 비주얼 diff 검토.
- **실브라우저 QA(D1)**: 샌드박스/포트 제약(과거 dev 서버 3888 IPv6·prerender Supabase 의존). → 가능한 범위에서 실행, 불가 시 한계 명시.
- **동시 세션 충돌**: AdminSidebar 글로벌 NAV·하드웨어는 타 세션 소유 → 경로별 커밋으로 분리 유지.

## 7. 점수 기여 매핑 (6 → 9.5) — *근거 기반 재작성*

**평가 차원 정의(6.0 산정 기준)**:
- **사용성** = 무음오류 빈도 + 비동기 상태 피드백 커버리지 + 접근성. 6.0 = "골격 견고하나 무음 실패·피드백 비일관".
- **경로** = 막다른 길 수 + 분석→액션 연결성 + de-navved 화면 흡수도. 6.0 = "insights 링크 단절·라벨 2회 네비".
- **디자인** = 토큰 일관성 + 심각도 색 1:1 + 데이터 시각화 충실도. 6.0 = "인라인 신호색 26건·VIP 보라·리드분포만".

**종합 점수 산식(명시)**: 종합 = min(사용성, 경로, 디자인) 기반 — **가장 약한 차원이 천장**. 세 차원 모두 ≥9.5여야 종합 9.5. (단순 평균 아님 — 한 차원이 막히면 사용자 체감이 그 수준에 갇히므로.)

| 워크스트림 | 사용성 | 경로 | 디자인 | 근거 |
|------------|:-----:|:----:|:------:|------|
| A 일관화 | +0.3 | +0.2 | **+2.0** | 신호색 26건+보라 제거 = 디자인 천장의 주원인 해소 |
| B 데이터 | +0.3 | **+1.5** | +0.7 | 분석→액션 단절(퍼널·라벨) 해소가 경로 주원인 |
| C 폴리시 | **+2.0** | +0.7 | +0.4 | 무음실패·a11y·격리 = 사용성 천장의 주원인 |
| D+E 검증·정책 | +0.9 | +0.9 | +0.4 | 9.5 판정 전제 + RBAC/통화/E2E 마감 |

→ **조건부 목표**: 각 차원 ≥9.5 도달 시 종합 9.5. 단 B1이 fallback(아래 §8)으로 축소되면 경로 기여 -0.7 → **경로 8.8 천장 → 종합 8.8(=revise)**. 즉 종합 9.5는 B1-full·D1 실QA 통과 **조건부**.

## 8. 미해결 결정 → 조건부 AC로 전환

1. **B1 데이터 출처: 사실상 해결.** `getAdminCrmRevenueDashboard` `monthly[]`가 이미 월별 시계열 제공 → 신규 적재 불필요. 단 `monthly` 데이터 밀도(실제 6개월치 채워지는지) P2 착수 시 1차 확인. 비면 **fallback: 최근 3개월 누적 카드(차트 아님)**, 점수 기여 B1-full +1.5 → B1-fallback +0.5.
2. **B2 깊이: MLP 확정.** 핵심(퍼널·채널)만 현황 흡수, 커버리지 등 풀 동기화는 9.6 선택.
3. **P5 QA 범위: D0에서 확정.** 환경 사전 체크 결과로 실기기/에뮬 범위 결정, 불가 항목은 점수 0 처리.

## 9. 부록 — 적대 재검증 기준선(D2용)

이전 "자체평가 + 사용자 입장" 6.0 평가의 confirmed high/medium 이슈를 D2 회귀 기준선으로 기록한다(없으면 P0에서 재수집). 최소 항목: ①인라인 신호색 26건 ②VIP 보라 ③심각도/분류 색 중복(due=hot) ④insights 링크 단절 ⑤라벨 2회 네비 ⑥무음 실패(crmOverviewError 침묵) ⑦통화 혼재 ⑧owner 3갈래. D2는 이 8개 + 신규 발견의 high/medium 0건일 때만 9.5 승인.
