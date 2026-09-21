# 마케팅 탭 대시보드 재구성 기획 (2026-09-14)

상태: 현재 기준 마케팅 허브 실행 로드맵 — Wave 0~2 + N1·N2·G10·G11 구현 완료(2026-09-14, §10), N3·N5 보류
범위: `/admin/campaigns` 허브 전체(`/admin/marketing`이 이 화면으로 리다이렉트된다) — 재구성 전 요약·신규 리드·행사·광고·메시지 5탭 → 한눈에·상세·데이터·메시지 4탭(§10), `components/admin/campaigns/**`, `lib/marketing/**`, Overview의 `MarketingPerfStrip`, 사이드바 "마케팅·분석" 그룹의 라벨
정책 상위 문서: [Admin OS 운영 결정](admin-os-operating-decisions-2026-07-11.md) › [어드민 탭 재구성](admin-tab-restructure-2026-07-29.md) › [그로스 플레이북](playbook/04-growth-crm.md) › [마케팅 퍼포먼스 대시보드 설계](marketing-performance-dashboard-design-2026-08-20.md)
외부 시스템: Compass(`mkt.classin.co.kr`, `classinkr-main/crm`) — 마케팅팀의 상세 작업면. 어드민은 브리지 뷰 7장(`supabase/migrations/20260828_compass_bridge_views.sql`)을 읽기 전용으로만 쓴다.
시안: [mockups/marketing-tab-glance-2026-09-14.html](mockups/marketing-tab-glance-2026-09-14.html) — "한눈에" 층 실물 비율 시안 + 상세·데이터 층 와이어. 수치는 전부 샘플이다.

---

## 0. 한 줄 요약

요약 탭은 이미 퍼포먼스 대시보드지만, 카드 8개가 같은 무게로 나열되고 정직 각주가 본문만큼 많아 "한눈에"가 되지 않는다. 허브를 **한눈에 → 상세 → 데이터** 세 층으로 재편하고, 한눈에 층은 **판정 한 문장 + 핵심 숫자 4개 + 지금(오늘 유입) + 추이·퍼널·Top 3 캠페인**으로 압축한다. 리드 단위 콜·케어, 소재 히스토리, 과정지표 KPI는 Compass에 두고 어드민은 딥링크로 보낸다. 새 API·스키마는 없다 — 기존 perf·insights·intake-today·compass 라우트를 재배치한다.

## 1. 현황 진단

### 1.1 지금의 "마케팅 탭"이 무엇인가

- `/admin/marketing`은 `/admin/campaigns?tab=summary`로 리다이렉트된다(`app/admin/marketing/page.tsx`). 사이드바 라벨은 "캠페인", 섹션은 "마케팅·분석"(`components/admin/admin-nav.ts`). `marketing` 프리셋의 상시 항목은 staff 공통 + 캠페인 + 콘텐츠(`admin-nav-access.ts`).
- 탭 5개(`app/admin/campaigns/page.tsx` `CAMPAIGN_TABS`): 요약 / 신규 리드 / 행사 / 광고 / 메시지. 기본 탭은 요약(2026-08-21).
- 요약 = 콕핏 2단(`components/admin/campaigns/tabs/SummaryTab.tsx`): 좌측 KPI 5칸·일자 추이·캠페인 스코어보드·소재별 CPL, 우측 384px 레일에 브리핑·오늘 유입·퍼널·업데이트 피드. 원천은 perf 단일 응답(`/api/admin/marketing/perf`) + insights + intake-today + `compass/ads`.
- Overview에 같은 perf 응답을 읽는 4칸 스트립이 있다(`components/admin/overview/MarketingPerfStrip.tsx` — 광고비·리드·CPL·전환율, 같은 cacheKey).

### 1.2 세 목표 대비 어긋난 점

| 목표 | 현재 | 원인 |
|---|---|---|
| 한눈에 | 첫 화면에 카드 8개. 카드마다 정의·정직 각주 1~3줄. 큰 숫자는 KPI 5칸(34px)뿐이고 오늘 유입·퍼널·Compass 수치는 13~28px | 모든 카드가 같은 셸(rounded-2xl 흰 카드 · 14px 제목). "먼저 읽을 것"이 브리핑 카드 하나인데 우측 레일 두 번째 자리다 |
| 강조 | 강조 수단이 델타 색뿐. 판정(좋다/나쁘다)이 문장으로만 있고 크기·배치로는 없다 | 히어로 숫자 없음. KPI 5칸이 6열 그리드에 span으로 끼워 맞춰져 행 높이가 갈린다(`KpiStrip.tsx` 주석) |
| 상세는 mkt | 요약 탭 안에 소재별 CPL 표(Compass 브리지)·업데이트 로그·채널 믹스가 함께 있다. 광고 탭은 라이브 캠페인 표·차트·광고 리드·채널 예산·성과 입력·AI 소재 제안이 한 스크롤이다 | 탭 축이 "보기 방식"(요약) · "큐"(신규 리드) · "도메인"(행사·광고) · "도구"(메시지)로 섞여 정보 층위가 없다 |

추가로 확인한 것:

- **같은 말, 다른 숫자**: 리드 KPI = 우리 `leads` 전 소스 / 스코어보드 리드 = Meta 캠페인 귀속 / 소재 CPL 리드 = Compass의 Meta 리포트 / 오늘 유입 = leads + Compass를 전화 키로 접은 수. 각주가 이를 정직하게 밝히지만, 그 각주가 곧 화면의 소음이다. 정의는 바꾸지 않고 **화면에서 자리를 나눠** 해결한다(한눈에는 전 소스 리드 하나만, 나머지는 상세로).
- **일자 추이가 이중축 콤보**(`DailyTrendSection.tsx`: 막대 USD 좌축 + 선 리드 우축). 두 스케일이 한 판에 얹혀 추이를 읽으려면 축을 번갈아 봐야 한다.
- **첫 페인트가 스켈레톤**: `page.tsx`가 `"use client"`라 요약 탭은 마운트 뒤 fetch 3개(perf·insights·intake)를 기다린다. Overview·CRM 홈은 서버 프리페치(`lib/admin/overview/prefetch.ts`, `lib/admin/crm/home-prefetch.ts`) 패턴이 이미 있다.
- **탭 재구성 문서와 코드 불일치**: 탭 재구성 스펙 §4는 캠페인의 기본 탭을 "메타 광고"로 적었으나 코드는 2026-08-21에 요약으로 바꿨다. §8에서 정리한다.

### 1.3 Compass가 이미 하는 것 — 어드민이 다시 만들지 않을 것

| Compass 화면 | 내용 | 어드민의 태도 |
|---|---|---|
| `/dashboard` | 월·분기 선택, KPI 4타일(전월 같은 기간 대비), 일별 유입 차트, 퍼널 4단(INTAKE→CONTACT→ACCOUNT→PAYMENT), 광고세트 표, 48시간 라이브 유입 | 어드민 한눈에는 **소스 통합**(메타·홈페이지·자료실·행사·이메일) 관점만 맡는다. Meta 파이프라인 상세는 Compass로 보낸다 |
| `/leads`, `/leads/care` | 콜·고객관리·BD인계 리드 단위 워크플로 | 리드 칩 → `compassLeadUrl()` 딥링크(`lib/compass/normalize.ts`, 이미 구현) |
| `/ads` | 캠페인·소재 월별 집행 이력, 별칭 편집, 크리에이티브 라이트박스 | 상세 층에 소재 Top/Bottom 요약(`CreativeCplCard`)만 둔다 |
| `/kpi` | 사람별 과정지표 달성률·등급 | 복제하지 않는다. 필요해지면 브리지 뷰 1장 추가(§5 Wave 3) |
| `/tasks` | 미션 보드 | 복제하지 않는다 |

어드민만 할 수 있는 중앙화: 전 소스 리드, 행사 성과, 이메일 캠페인 성과, KRW 채널 예산, AI 주간 브리핑·이상 감지, 주간 보고서, 그리고 Compass 브리지 롤업(오늘 데모·다음 액션·BD인계 — CRM 홈 `CompassPipelineBand`가 이미 그린다).

## 2. 기획 제약 (변경 불가)

1. 정직 규칙 전부 계승(퍼포먼스 대시보드 설계 §정직 규칙): 종합 ROAS·채널 ROI 미표기, Meta 금액 USD 네이티브, `null ≠ 0`, AI 브리핑은 sanity 통과분만.
2. `DESIGN.md`: Classin Green 유일 포화색, 밀집 화면에서 파스텔 채움·둥근 pill 라벨 지양(어드민 라벨 단순화), 신호색은 상태 의미가 있을 때만, 헤어라인은 한 화면에 한 값.
3. 탭 재구성 P1 "삭제하지 않는다, 접는다": 라우트·딥링크(`?tab=summary|meta|email|leads|events`, `?perf=`, `?message_to=`)·⌘K 검색 전부 보존.
4. 새 top-level nav 항목을 만들지 않는다. 라벨은 `ADMIN_NAV`에서만 바꾼다.
5. Notion·Compass 원천은 읽기 전용, 미러링 금지.
6. 숫자 정의는 기존 SSOT(`lib/marketing/perf.ts`, `lib/crm/lead-attribution.ts`, `lib/marketing/intake-feed.ts`) 그대로. 새 집계 정의를 만들지 않는다 — 중앙화란 "같은 숫자를 한 곳에서 보는 것"이지 다섯 번째 숫자를 만드는 것이 아니다.

## 3. 재구성안 — 세 층

### 3.1 층 정의

| 층 | 탭 id | 답하는 질문 | 내용 | 원천 |
|---|---|---|---|---|
| **한눈에** | `summary`(id 유지, 라벨 변경) | 지금 어떤가, 뭘 봐야 하나 | 판정 문장 · 핵심 숫자 4 · 오늘 유입 · 추이 · 퍼널 · Top 3 캠페인 · Compass 파이프라인 3칸 | perf · insights · intake-today · crm/compass-pipeline |
| **상세** | `detail`(신설) | 왜 그런가, 어디서 | 캠페인 스코어보드 전체 · 소재별 CPL · 퍼널+채널 예산·믹스 · 행사 성과 비교 · 메시지 성과 · AI 소재 제안 | perf · compass/ads · 코어(행사·지표) · 이메일 캠페인 |
| **데이터** | `data`(신설) | 목록·입력·내보내기 | 신규 리드 큐 · 광고 리드(가져오기·전환) · Meta 캠페인 라이브 표(재개/중지) · 채널 예산·성과 입력 · 업데이트 로그 · 주간 보고서 · CSV | leads(marketing scope) · meta/campaigns · event-metrics · channel-budgets · weekly-report |
| 메시지(도구) | `email`(유지) | 보내기 | SendCenter 그대로 | — |

메시지는 정보 층이 아니라 행동면이라 세 층 밖에 두되, 같은 탭 띠의 우측 끝에 아이콘과 함께 분리 배치한다(§6-2).

### 3.2 기존 탭·컴포넌트 재배치표

| 지금 | 어디로 | 비고 |
|---|---|---|
| 요약 › `KpiStrip` 5칸 | 한눈에 › 히어로 4칸 | 예산 집행률(KRW 수기)은 상세 › 채널로 |
| 요약 › `BriefingCard` | 한눈에 › 판정 밴드(최상단, 전폭) | 헤드라인 22px, 액션 3개 가로 |
| 요약 › `TodayIntakeCard` | 한눈에 › 우측 "지금" 카드 | 44px 숫자 |
| 요약 › `DailyTrendSection` | 한눈에 › 추이(2단 소형 다중) | 이중축 해소 — 리드 스택 위, 광고비 아래, x축 공유 |
| 요약 › `FunnelCard` | 한눈에 › 가로 퍼널 5단 | 세로 원본은 상세에 유지 |
| 요약 › `CampaignScoreboard` | 한눈에 Top 3 + 상세 전체 | |
| 요약 › `CreativeCplCard` | 상세 › 소재 | |
| 요약 › `UpdatesFeed` | 데이터 › 업데이트 로그(작성 폼 포함) | 한눈에엔 스코어보드 행의 최근 1줄만 남긴다 |
| 요약 › `WeeklyReportDialog` | 데이터 › 주간 보고서 섹션 | 한눈에 헤더의 "주간 보고서" 버튼은 유지 |
| 신규 리드 탭 (`NewLeadsTab`) | 데이터 › 신규 리드 큐 | `?tab=leads` → `?tab=data#new-leads` |
| 행사 › 성과 비교 차트·캘린더 타임라인 | 상세 › 행사 | |
| 행사 › 리스트/갤러리 · `MetricsEditor` | 데이터 › 행사 성과 입력 | 행사 자체의 관리는 `/admin/events` 그대로 |
| 광고 › `MetaPerformanceCharts` | 상세 › 캠페인 | |
| 광고 › `MetaCampaignPanel`(표 · 재개/중지) | 데이터 › Meta 캠페인 | 쓰기 액션은 데이터 층에서만 |
| 광고 › `AdLeadsPanel` | 데이터 › 광고 리드 | |
| 광고 › `ChannelBudgetTable` · 성과 입력 | 데이터 › 예산·성과 입력 | 상세 › 채널 믹스는 읽기 전용 표시 |
| 광고 › AI 소재 제안 | 상세 › 소재 | |
| CRM 홈 › `CompassPipelineBand` | 한눈에 › Compass 3칸 | `buildCompassPipelineBand`·라우트 재사용, 컴포넌트는 공용 위치로 이동 |

레거시 딥링크 매핑: `?tab=leads` → `data#new-leads`, `?tab=events` → `detail#events`, `?tab=meta` → `detail#campaigns`. 단 코드 안에서 "채널 예산표"를 뜻하는 두 링크(`KpiStrip.tsx` 예산 채우기, `WeeklyReportDialog.tsx`)는 `data#budgets`로 바꾼다.

### 3.3 한눈에 층 — 화면 구성

데스크톱 1280px에서 한 스크린 안에 0~4가 들어오는 것을 목표로 한다. 시안은 상단 링크 참조.

0. **헤더**: h1 "마케팅" · 동기화 · 주간 보고서. "행사 관리" 링크는 데이터 층 행사 섹션으로 내린다.
0′. **탭 띠**: 한눈에 | 상세 | 데이터 ‖ 메시지(우측, 아이콘). 같은 띠에 기간 토글(7·30·90·분기, §6-5의 "이번 달" 추가 시 5개)과 스냅샷 시각.
1. **판정 밴드**(전폭): 상태 점(정상·주의·경고) + 헤드라인 한 문장(22px) + 이상 배지 + 번호 액션 최대 3(가로) + 출처("AI · 생성시각" 또는 "규칙 기반") + 다시 생성. 원천은 지금의 `composeBriefing` 그대로.
2. **히어로 4칸**: 리드(전 소스) · 광고비 USD · CPL USD · 전환율. 값 44px, 델타 배지, 14포인트 스파크라인. 리드 타일에는 소스 분해 미니바(메타·홈페이지·자료실·기타 — `leadDailyBySource` 합산이라 API 변경 없음). Overview `MarketingPerfStrip`의 4개와 같은 정의·같은 순서다.
3. **추이(2/3) + 지금(1/3)**: 추이는 위에 리드 소스 스택(상위 4그룹 + 기타로 접기), 아래에 광고비 USD 막대, x축 공유. 지금 카드는 오늘 유입 44px + 어제 동시각 대비 + 최근 5건 + 미컨택 수.
4. **퍼널(가로 5단, 전폭) + Top 3 캠페인**: 퍼널 단계 사이에 전환율, 리드→컨택 0이면 그 구간만 danger. Top 3는 이름(굵게) · 리드 · CPL · 페이싱 바 · 이상 스트립, 아래에 "전체 N개 → 상세".
5. **Compass 파이프라인 3칸**: 오늘 데모 · 다음 액션 임박(48h) · BD인계 진행 → `mkt.classin.co.kr` 새 탭.
6. **각주**: "이 화면의 숫자 정의" 링크 하나 → 드로어에 정의 전문. 타일 각주는 11px 한 줄로 제한한다. 미측정(—)·미수집·스냅샷 지연 표기는 지금처럼 값 자리에 남긴다.

### 3.4 강조 규칙 — 크기 · 배치 · 굵기

| 요소 | 크기 | 굵기 | 색 |
|---|---|---|---|
| 히어로 값 4개 · 오늘 유입 | 44px, tracking −0.03em, 기본 숫자폭 | 700 | `#111110` — 리드 타일만 `#084734` |
| 판정 헤드라인 | 22px | 600 | `#111110` |
| 델타 배지 | 12px | 600 | 개선 `#084734` · 악화 `#B85C33` · 중립 `#615D59` |
| 섹션 제목 · 캠페인명(Top 3) | 14px · 13px | 600 | `#111110` |
| 표 값 · 본문 | 13px, `tabular-nums` | 400~500 | `#111110` / `#615D59` |
| 각주 | 11px | 400 | `#A39E98` |

- **굵기 예산**: 위 표의 700·600 외에는 굵게 하지 않는다. 지금처럼 12px 굵은 글자가 카드마다 흩어지면 위계가 없다.
- **색 예산**: 신호색(테라코타 `#B85C33`·앰버 `#A8741A`)은 이상 신호 · 미컨택 · 미수집 세 맥락에만. 델타의 개선은 그린, 악화는 테라코타 — `TONE`(`components/admin/viz/theme.ts`) 그대로.
- **박스 예산**: 첫 스크린의 박스는 5개 이하(판정, 히어로 그룹, 추이, 지금, 퍼널·Top 3 그룹). 히어로 4칸은 `StatTile variant="bare"`로 한 패널 안에 둔다 — 카드 4개가 아니라 패널 1개.
- **배치 원리**: 판정 → 숫자 → 지금·추이 → 근거(퍼널·Top 3) → 참조(Compass). 아래로 갈수록 참조 정보다. 우측 레일은 없앤다 — 384px 레일은 xl 미만에서 인터리브 order 트릭이 필요했고, 판정이 두 번째 자리로 밀리는 원인이었다.
- **큰 숫자는 `tabular-nums`를 쓰지 않는다**(등폭 숫자는 큰 크기에서 자간이 벌어져 보인다). 표 안 숫자만 tabular.

### 3.5 상세 · 데이터 층

- **상세**: 스티키 섹션 내비(캠페인 · 소재 · 퍼널·채널 · 행사 · 메시지). 각 섹션은 기존 컴포넌트를 옮겨 그대로 쓰고, 섹션 헤더에 정의 한 줄만 둔다. 차트 위주.
- **데이터**: 섹션 내비(신규 리드 · 광고 리드 · Meta 캠페인 · 예산·성과 입력 · 업데이트 로그 · 주간 보고서). 표·폼·내보내기(`CampaignExportButton`)만. Meta 재개/중지, 리드 전환, 예산 저장 같은 **쓰기 액션은 이 층에서만** 한다.
- 두 층 모두 기간 축은 탭 띠의 토글 하나를 따른다(행사 기간 필터 `active|30d|90d|all`은 행사 섹션 안으로 내린다).

## 4. 개선 후보 총람

### 4.1 한눈에 (G)

| ID | 내용 | 파일 |
|---|---|---|
| G1 | 판정 밴드 승격 — `BriefingCard`를 전폭 헤드라인 밴드로, 액션 가로 배치, 상태 점 규칙(§6-7) | `perf/BriefingCard.tsx`, `tabs/SummaryTab.tsx` |
| G2 | 히어로 4칸 — 5→4, 값 44px(`StatTile` `valueSize`에 `"xl"` 추가 또는 지역 렌더), `variant="bare"` 패널 | `perf/KpiStrip.tsx`, `viz/primitives.tsx` |
| G3 | 리드 타일 소스 분해 미니바 — `leadDailyBySource` 합산, 상위 4 + 기타 | `perf/KpiStrip.tsx` |
| G4 | 오늘 유입 승격 — 44px 값 + 최근 5건 + 미컨택 | `perf/TodayIntakeCard.tsx` |
| G5 | 추이 이중축 해소 — 리드 스택(상위 4 + 기타) / 광고비 2단, x축 공유, 크로스헤어 툴팁 | `perf/DailyTrendSection.tsx` |
| G6 | 가로 퍼널 5단 | `perf/FunnelCard.tsx`(변형 prop) |
| G7 | Top 3 캠페인 스트립 + "전체 N개 → 상세" | `perf/CampaignScoreboard.tsx`(compact 변형) |
| G8 | Compass 파이프라인 3칸 재사용 | `crm/home/CompassPipelineBand.tsx` → `components/admin/compass/`, `/api/admin/crm/compass-pipeline` |
| G9 | 지표 정의 드로어 — 각주 집약, 타일 각주 한 줄 제한 | 신규 `perf/MetricDefinitionsDrawer.tsx` |
| G10 | 서버 프리페치 — `page.tsx`를 서버 셸로 나누고 `getCachedMarketingPerf`·insights·intake를 `settleWithinBudget`으로 첫 HTML에 싣는다(Overview 패턴) | `app/admin/campaigns/page.tsx`, 신규 `lib/admin/marketing/glance-prefetch.ts` |
| G11 | 기간 프리셋 "이번 달"(MTD) — Compass 월 축·KPI 월 주기와 정렬. `resolvePerfPeriod`의 `calendar_aligned` 규칙을 월에 적용 | `lib/marketing/perf.ts`, `perf/route.ts`, `page.tsx` `PERF_PERIOD_KEYS` |

### 4.2 상세 (D)

| ID | 내용 |
|---|---|
| D1 | `detail` 탭 신설 + 스티키 섹션 내비(`AdminTabs variant="underline"` 재사용) |
| D2 | 캠페인 섹션 — 스코어보드 전체 + `MetaPerformanceCharts` |
| D3 | 소재 섹션 — `CreativeCplCard` + AI 소재 제안(`AiCreativeSuggestSection`) |
| D4 | 퍼널·채널 — 세로 퍼널 원본 + 채널 믹스(읽기) + 예산 집행률 타일 |
| D5 | 행사 섹션 — `EventsTab`의 성과 비교 차트·타임라인 |
| D6 | 메시지 성과 — 이메일 캠페인 오픈율 요약(`HistoryTab` 데이터 재사용, 클릭률은 미수집이므로 표기하지 않음) |

### 4.3 데이터 (T)

| ID | 내용 |
|---|---|
| T1 | `data` 탭 신설 + 섹션 내비 + 레거시 id 매핑(§3.2) + 앵커 스크롤 |
| T2 | 신규 리드 큐 — `NewLeadsTab` 이동(URL 필터 `nl*` 유지) |
| T3 | 광고 리드 — `AdLeadsPanel` |
| T4 | Meta 캠페인 표 — `MetaCampaignPanel`(재개/중지) |
| T5 | 예산·성과 입력 — `ChannelBudgetTable` · 행사 목록 + `MetricsEditor` |
| T6 | 업데이트 로그 — `UpdatesFeed`(작성 폼 포함) |
| T7 | 주간 보고서 — 다이얼로그 본문을 섹션으로(복사·다운로드 유지) |
| T8 | CSV 내보내기 위치를 데이터 층으로 통일 |

### 4.4 IA · 내비 (N)

| ID | 내용 |
|---|---|
| N1 | 탭 라벨·순서: 한눈에 · 상세 · 데이터 ‖ 메시지. h1 "마케팅" |
| N2 | 사이드바 라벨 "캠페인" → "마케팅"(`ADMIN_NAV` 1줄 + keywords). 프리셋·접근 정책 영향 없음 |
| N3 | `/admin/marketing` 정본화(라우트 스왑, `/admin/campaigns` → 리다이렉트) — §6-3 결정 사항. 사이드바 hover 예열 URL(`nav-warmup-contract` 테스트)·⌘K·ops 페이지 링크가 걸려 있어 Wave 3 |
| N4 | Overview `MarketingPerfStrip` 4칸 = 한눈에 히어로 4칸 정합 확인(정의·순서·cacheKey 동일) |
| N5 | `/admin/analytics`(리드·소스·콘텐츠)와 상세 › 퍼널·채널의 중복 — 접근 정책이 다르므로(`RESTRICTED`) 통합하지 않고 크로스링크만 |

## 5. 실행 로드맵 (Wave)

| Wave | 기간(추정) | 항목 | 조건 |
|---|---|---|---|
| **0 정리** | 1~2일 | N1, G1, G2(5→4 — 예산 집행률은 하단 접힘), G6, G9(각주 접기 1차). 소재 CPL·업데이트 피드는 요약 하단 "더 보기" 접힘으로 임시 이동 | 스키마·API 변경 없음. 기존 `tests/campaigns` 전부 통과 |
| **1 한눈에 재구축** | 약 1주 | G3, G4, G5, G7, G8, G10, G11, 시안 정합 QA(1280 · 1440 · 390) | §6-4 · §6-5 · §6-7 결정 |
| **2 상세·데이터** | 1~2주 | D1~D6, T1~T8, `page.tsx`의 탭별 로더 트리거 재배선(코어·meta·adLeads·channelBudgets가 새 탭 id를 따르게), 레거시 딥링크 매핑 테스트 | §6-1 · §6-2 결정 |
| **3 선택** | 결정 후 | N2, N3, N5, Compass KPI 달성률 브리지 뷰 | — |

Wave 0만으로도 "판정이 맨 위, 숫자 4개가 한 줄, 퍼널이 가로" 세 가지가 바뀌어 체감이 크다. Wave 2는 컴포넌트 이동이 대부분이지만 `page.tsx`가 탭 id로 데이터 로딩을 게이트하므로(`activeTab === "meta"` 등) 로더 재배선을 함께 해야 한다.

## 6. 사용자 결정 항목 — 2026-09-14 확정

"진행" 지시로 권장안 전부를 채택했다. 아래 표의 권장 열이 곧 결정이다.

| # | 질문 | 권장(= 결정) |
|---|---|---|
| 1 | 탭 명칭 — "한눈에 · 상세 · 데이터" vs "요약 · 분석 · 목록" | 전자(요청 표현 그대로, 층위가 이름에 드러난다) |
| 2 | 메시지 탭 — 4번째 탭 유지 vs `/admin/messages` 분리 | 유지. `?tab=email`·`message_to=` 프리필(고객 360)·⌘K "이메일 자동화"가 걸려 있다 |
| 3 | 사이드바 "캠페인" → "마케팅", `/admin/marketing` 정본화 | 라벨만 먼저(N2). 라우트 스왑(N3)은 예열·테스트 계약이 얽혀 보류 |
| 4 | 히어로 4개 확정 — 리드(전 소스) · 광고비 · CPL · 전환율 | 이 4개(Overview와 동일). "광고 리드"는 리드 타일의 분해 바로 보인다 |
| 5 | 기본 기간 — 30일 유지 vs "이번 달" | 30일 유지 + "이번 달" 프리셋 추가(G11). 마케팅팀의 KPI·Compass 축이 월이다 |
| 6 | Compass 파이프라인 3칸을 한눈에에 둘지 | 둔다. 마케팅팀에겐 중복이지만, Compass를 열지 않는 관리자에겐 유일한 창이다 |
| 7 | 판정 상태 점 규칙 | 이상 신호 0 = 정상 / 1건 이상 = 주의 / "리드→컨택 0" 또는 CPL 급등 = 경고. `lib/marketing/anomaly.ts` 임계 그대로 |

## 7. 검증 · 완료 조건

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
npx vitest run tests/campaigns
```

- 딥링크 회귀: `?tab=summary|meta|email|leads|events`, `?perf=`, `?message_to=&message_name=`(고객 360), `app/admin/ops/page.tsx`·⌘K의 `?tab=email` 링크.
- Overview 스트립과 한눈에 히어로 4칸의 숫자가 같다(같은 cacheKey `marketing-perf:{period}`).
- 시각: 1280에서 판정·히어로·지금이 첫 스크린에 보인다. 390에서 히어로 2×2, 지금 카드가 히어로 바로 다음이다.
- 정직 회귀: `null` → "—", 스냅샷 미적재·Compass 연결 끊김 배지, USD·KRW 분리 유지.
- `DESIGN.md` 게이트: 신호색은 세 맥락 외 사용 0, 파스텔 채움 0, 헤어라인 한 값(`#E8E8E4`).
- 추이 차트: 이중축 0, 스택 색은 5개 이하(상위 4 + 기타), 범례에 기간 합계 병기, 표로 보기 제공.
- 스택 색 검증(2026-09-14, dataviz 팔레트 검증 스크립트 · 라이트 표면): 메타 `#378ADD` · 홈페이지 `#1D9E75` · 자료실 `#BA7517` 세 색은 전 항목 통과. 기타는 `SOURCE_GROUP_DOT`의 `#888780`이 자료실 앰버와 인접 ΔE 12.2로 미달이라 차트에서만 `#B5B1AA`(ΔE 18.4)를 쓴다 — 리드 목록의 색점(`SOURCE_GROUP_DOT`)은 바꾸지 않는다.

## 8. 문서 정리 제안

- 채택되면 [마케팅 퍼포먼스 대시보드 설계](marketing-performance-dashboard-design-2026-08-20.md) Phase 2의 "위→아래" 목록은 이 문서 §3.3으로 대체된다고 그 문서 상단에 표기한다. Phase 1(데이터 스파인)·Phase 3(AI 레이어)은 그대로 유효하다.
- [캠페인·마케팅 IA 디벨롭 분석](campaign-marketing-ia-develop-analysis-2026-07-23.md)의 R3(탭 명칭·경계)·R4(워크스페이스 관점)는 이 문서 N1·N2로 흡수한다.
- [어드민 탭 재구성](admin-tab-restructure-2026-07-29.md) §4의 "캠페인 — 메타 광고를 기본 탭으로"는 코드(2026-08-21 요약 기본)와 어긋난다. 이 문서 채택과 무관하게 정정한다.

## 10. 진척 기록

### 2026-09-14 — Wave 0·1·2 + N1·N2·G10·G11 구현

- **탭 재편(N1)**: `lib/marketing/hub-tabs.ts`가 탭·섹션·레거시 매핑의 순수 정본. 옛 `?tab=leads|events|meta`는 `data#new-leads`·`detail#events`·`detail#campaigns`로 착지하고 URL을 새 id로 정정한다. `CampaignTab` 타입은 `tabs/types.ts`에서 재수출.
- **한눈에(G1~G9)**: `SummaryTab`을 밴드 순서로 재조립(판정 → 히어로 4 → 추이·지금 → 가로 퍼널·Top 3 → Compass → 각주). `BriefingCard`는 전폭 밴드(상태 점 규칙 `lib/marketing/verdict.ts`), `KpiStrip`은 4칸 단일 패널(`StatTile` `valueSize="xl"`·`variant="plain"`·`footer` 슬롯 신설), 소스 분해·추이 스택의 접기 규칙은 `lib/marketing/source-fold.ts`. `DailyTrendSection`은 이중축을 버리고 2단 소형 다중(syncId). `FunnelCard layout="horizontal"`, `CampaignScoreboard compact`, `TodayIntakeCard variant="hero"`, `MetricDefinitionsDrawer` 신설. `CompassPipelineBand`는 `components/admin/compass/`로 이동(CRM 홈 import 갱신, 타입은 `crm/home/shared.tsx`에서 재수출).
- **상세(D1~D6)**: `tabs/DetailTab.tsx` — 섹션 내비(`SectionNav`·`HubSection`·`useScrollToHash`), 스코어보드 전체 + `MetaPerformanceCharts`, `CreativeCplCard` + `creative/AiCreativeSuggestSection`, 세로 퍼널 + `ChannelMixCard`(신설, 예산 집행률 타일 포함), `events/EventPerformanceSection`, `EmailPerformanceCard`(신설, `/api/admin/email` 재사용).
- **데이터(T1~T8)**: `tabs/DataTab.tsx` — `NewLeadsTab`(embedded), `AdLeadsPanel`, `meta/MetaCampaignPanel`(+Meta CSV), `ChannelBudgetTable`·`EventMetricsQuickTable`·`events/EventListSection`(행사 CSV·행사 관리 링크), `UpdatesFeed`, `WeeklyReportSection`(다이얼로그와 본문 공유 — `perf/weekly-report-view.tsx`). `MetaTab.tsx`·`EventsTab.tsx`는 삭제.
- **G10 서버 프리페치**: `app/admin/campaigns/page.tsx`는 서버 셸이 되어 `?tab`이 한눈에일 때 `lib/admin/marketing/glance-prefetch.ts`(perf·insights·intake, 1.2초 예산, BRANCH_READ 역할)를 첫 HTML에 싣는다. 클라이언트 본체는 `components/admin/campaigns/CampaignsHubClient.tsx`. 오늘 유입 로더는 `lib/marketing/intake-today.ts`로 승격(라우트와 공유).
- **G11 "이번 달"**: `PerfPeriodKey`에 `month`(MTD, 전월 1~N일 비교) 추가. `PERF_PERIOD_KEYS/LABEL/BADGE`·`isPerfPeriodKey`가 SSOT — perf·compass/ads 라우트, 탭 띠 토글, 배지가 이를 읽는다. `prevBasisLabel`은 key로 전월/전분기 문구를 가른다.
- **N2**: 사이드바 라벨 "캠페인" → "마케팅"(keywords 확장). 라우트 스왑(N3)·Analytics 통합(N5)은 미착수.
- **링크 갱신**: `KpiStrip`·`WeeklyReport` 링크는 `campaignHubHref()`로 상세/데이터 섹션에 착지. 사이드바 예열은 한눈에 층 넷(perf·insights·intake·Compass 파이프라인)으로 교체.
- **검증**: `npm run typecheck`·`npx eslint app components lib --max-warnings=0`·`npx vitest run --dir tests`(524 파일·4,076개) 통과. 신규 테스트: `tests/campaigns/{hub-tabs,verdict,source-fold,glance-render}.test.ts(x)`, `perf.test.ts` month 케이스, `tests/admin/nav-warmup-contract.test.ts` 예열 목록 갱신.
- **남은 것**: 실서비스 화면 눈검수(1280·390)는 배포 후 운영자 로그인으로 한다 — 이 환경은 Supabase에 닿지 않아 실데이터 렌더를 못 봤다. 시안(`mockups/marketing-tab-glance-2026-09-14.html`)과 정적 렌더 테스트로 대신했다.

## 9. 근거 (조사 원문 위치)

- 리다이렉트·탭 정의·기본 탭·로더 게이트: `app/admin/marketing/page.tsx`, `app/admin/campaigns/page.tsx`(`CAMPAIGN_TABS`, `useUrlState("tab","summary")`, `activeTab` 기반 `load`/`loadMeta`/`loadAdLeads`/`loadChannelBudgets`).
- 콕핏 2단·order 인터리브: `components/admin/campaigns/tabs/SummaryTab.tsx` 본체 주석.
- KPI 5칸 6열 배치·34px·스파크라인 정직 규칙: `components/admin/campaigns/perf/KpiStrip.tsx`.
- 이중축 콤보: `components/admin/campaigns/perf/DailyTrendSection.tsx` 상단 주석.
- 판정 카드 승격 조건(AI일 때만 그림자·16px): `components/admin/campaigns/perf/BriefingCard.tsx`.
- Overview 4칸 스트립과 cacheKey 공유: `components/admin/overview/MarketingPerfStrip.tsx`.
- perf 계약·기간 해석·`calendar_aligned`: `lib/marketing/perf.ts`; Data Cache 60초: `lib/marketing/perf-assemble.ts` `getCachedMarketingPerf`, `app/api/admin/marketing/perf/route.ts`.
- 서버 프리페치 패턴: `lib/admin/overview/prefetch.ts`, `app/admin/crm/page.tsx` + `lib/admin/crm/home-prefetch.ts`.
- Compass 브리지·밴드: `lib/compass/bridge.ts`, `lib/compass/home-band.ts`, `components/admin/compass/CompassPipelineBand.tsx`(2026-09-14 공용 위치로 이동), `app/api/admin/crm/compass-pipeline/route.ts`.
- Compass 화면 실측: `classinkr-main/crm` `app/(main)/dashboard/page.tsx`, `ads/page.tsx`, `kpi/page.tsx`, `components/SideNav.tsx`.
- 시각 토큰: `DESIGN.md` §2·§4(어드민 라벨 단순화), `components/admin/viz/theme.ts`(`TONE`·`CHART`), `lib/crm/lead-attribution.ts`(`SOURCE_GROUP_DOT`).
