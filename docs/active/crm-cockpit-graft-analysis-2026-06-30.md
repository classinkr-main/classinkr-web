<!--
문서 성격: 분석·권고(설계 지침). 코드 변경 없음.
작성: 2026-06-30 · 멀티에이전트 분석(레퍼런스 "AI Sales CRM" 목업 A/B/C vs 현재 /admin/crm)
입력 레퍼런스: ~/Downloads/AI 세일즈 CRM 레이아웃.zip (정적 HTML 목업, 더미 데이터)
관련 문서: docs/active/crm-merge-redesign-2026-06-24.md, crm-ia-phase3-plan-2026-06-12.md
-->

> **검증 메모(작성자 직접 확인):** 본 문서의 핵심 발견인 *통화 오표기 버그*는 실제 코드로 검증됨 —
> ① `app/admin/crm/page.tsx`의 지역 함수 `formatCurrency`(기호 없는 만/억)가 **CNY**인 `salesAmountMonth`/`collectionAmountMonth`(line 492·513 등)에 적용됨.
> ② `components/admin/crm/CrmPerformanceCharts.tsx:102`이 `₩{fmtMan(data.total)}`로 하드코딩, 소스는 `getCrmRevenuePerformance`→`listBranchRevDeals`→`branch_rev_deals`(REV 시트=**CNY**, memory `reference_crm_currency_cny`).
> 두 경로 모두 CNY를 원화처럼 표기 중 → Phase 0 소급 교정 대상 확정.

# CRM 코크핏·작업대 그래프트 권고 — 리디자인이 아니라 "기능·레이아웃 이식(graft)"

**핵심 결론:** 레퍼런스 프로토타입(A 워크스페이스 / B 코크핏 / C AI커맨드)이 보여준 가치의 상당 부분은 **현재 `/admin/crm`이 이미 실데이터로 더 강하게 구현**해 두었다. 따라서 이 작업은 새 화면을 그리는 리디자인이 아니라, **현재 앱의 강한 자산을 보존하면서 레퍼런스의 "레이아웃 배치"와 "시각 위계"만 골라 이식**하는 그래프트다. 디자인 팔레트가 양쪽 동일(잉크 `#111110`, 그린 `#084734`, 민트 `#ECFDF5`, 캔버스 `#FAFAF8`, 보더 `#e8e8e4`, Pretendard)이라 토큰 작업은 사실상 0이고, 신규 작업은 **레이아웃 합성 + 통화 표기 교정**에 집중된다.

> **수정된 전제(중요):** 초안은 "현재 앱은 통화 분리 규약이 명문화돼 안전, 레퍼런스만 ₩ 단일이라 함정이 안 보인다"고 단정했으나 **절반만 맞다.** 360 탭(`Customer360DetailShared.tsx`의 `formatKRW`, `money-format.ts`의 `formatCNY`/`formatUSD`)은 분리돼 있으나, **홈 8칸 대시보드(`app/admin/crm/page.tsx`)와 매출추이 차트(`CrmPerformanceCharts.tsx`)는 이미 CNY를 한국식 만/억(또는 ₩)으로 찍는 활성 통화 버그가 있다.** 즉 이 권고가 경고하는 오독은 신규가 아니라 **이미 운영 코드에 존재**한다. 따라서 통화 가드레일의 범위는 "신규 히어로 카드"가 아니라 **기존 그리드·차트 소급 교정까지** 포함해야 한다(§0, §8 참조).

---

## TL;DR — 요소별 평결

| 요소 | 평결 | 채택 핵심 | 노력 |
|------|------|-----------|------|
| **B 코크핏** 대시보드·시각화 | ADAPT (부분) | KPI 히어로 4카드 + 매출추이 막대(당월강조) + 퍼널 재배치는 즉시. 목표선·게이지·승률·건강도 도넛은 **데이터 부재로 보류** | M |
| **우측 사이드바 + 고객360** | 대부분 PRESERVE | 이미 현재 앱이 더 강함. 우측 aside에 "설치·방문 일정" 섹션 추가 + 재무 4타일 시각 승격만 | M |
| **A 우선순위 작업대(투두)** | ADOPT + 재배치 | 엔진(`lib/crm/priority.ts`)은 그대로, **우측 보조 → 본문 좌측 메인으로 승격** | M |
| **현재 기능 융합 + 전역** | PRESERVE 우선 | IA 동결(새 탭 금지), ⌘K 채택, 랭킹/AI코치 후속 백로그, **C 확정 스킵** | L |
| **(횡단) 통화 표기 교정** | FIX (선행) | 홈 그리드·매출추이 차트의 **기존 CNY→₩/만·억 오표기 소급 수정**. 신규 카드만 막으면 미완 | S~M |

---

## 0. 전제 — 이 권고가 딛고 선 사실들

1. **레퍼런스는 정적 목업이다.** A/B/C의 QUEUE·KPI·차트·퍼널·랭킹·코치 값은 **전부 하드코딩 더미**다. "AI 근거", "AI 요약", "AI 자동기록", "AI 통화분석"도 LLM이 아니라 **규칙기반 템플릿 또는 더미**다. C(AI커맨드)는 `matchAi()` 키워드 4분기로 미리 쓴 답 4개를 돌려주는 **가짜 LLM**이다.
2. **현재 앱과 레퍼런스는 동일 팔레트·동일 폰트**를 쓴다 → 색·타이포 추가 작업 없음. 차용 대상은 "레이아웃 배치"와 "시각 위계"뿐.
3. **통화 3종 혼용이 최대 함정이고, 일부는 이미 오표기로 터져 있다.** 코드 규약과 실제 적용 상태:
   - 매출/수금/성과/잔액 = **CNY(¥)** — NEO/REV 원천, `formatCNY` (`lib/crm/money-format.ts`, export 2개: `formatCNY`·`formatUSD`)
   - 오더(Opportunity) = **USD($)** — `formatUSD`
   - 딜(Deal Lite) 예상금액 = **KRW(₩)** — 내부 작업 캐시, 포맷터는 `Customer360DetailShared.tsx`의 `formatKRW`
   - 자체 DB 인식매출/견적/계약/미수 = 자체 집계(만/억 포맷)

   **그러나 규약이 홈에는 지켜지지 않는다.** `app/admin/crm/page.tsx`의 페이지-지역 함수 `formatCurrency`(line 225, **통화기호 없이** 만/억만 출력)가 자체집계 `deliveryTotalAmount`뿐 아니라 **CNY인 `salesAmountMonth`·`collectionAmountMonth`에도 무차별 적용**(line 492/513/628/632/657/664)된다. 결과적으로 ¥를 ₩처럼 보이는 "7,360만" 형태로 찍어 **자체집계 ₩와 시각적으로 구분 불가**하다. 매출추이 차트(`CrmPerformanceCharts.tsx` line 102)도 소스가 `branch_rev_deals`(REV 시트=CNY)인데 `₩{fmtMan(...)}`로 **하드코딩 ₩ 라벨**을 붙인다.
   - 레퍼런스 프로토타입은 전부 ₩ 단일 통화 더미라 이 함정이 안 보일 뿐, **현행 앱에는 이미 같은 사고가 박혀 있다.**
   - **서로 다른 통화 합산(예: "파이프라인 ₩5.2억" 단일 숫자)은 절대 금지.**

4. **존재하지 않거나 위치가 다른 포맷터 주의(초안 오류 교정):**
   - `formatCurrency`는 **공용 export가 아니다.** `page.tsx` 내부 지역 함수일 뿐이며 통화기호를 붙이지 않는다.
   - `formatKRW`는 `lib/crm/money-format.ts`가 아니라 **`components/admin/crm/Customer360DetailShared.tsx`**에 있다.
   - `currencyBadge`·`lib/crm/forecast.ts`는 **현재 코드에 없음 → 신규**(이 표기는 초안이 맞음).
   - 따라서 "카드별 `formatCurrency`/`formatUSD`/`formatCNY` 정확 매칭" 문구는 **위치를 정정**해야 한다: 자체집계는 신규 ₩ 전용 포맷터(또는 `currencyBadge`+기호), CNY는 `formatCNY`, USD는 `formatUSD`, KRW(딜)는 `formatKRW`로 명시.

---

## 1. B 코크핏 대시보드·시각화

**평결:** 코크핏의 가치는 "새 차트 라이브러리"가 아니라 **흩어진 KPI를 단일 상단 밴드로 합성하는 레이아웃 재배치**다. 현재 홈은 이미 Recharts를 쓰지만 *검색 → 액션밴드 → 매출 → 커버리지 → 작업대 → 성과 → 시각화 → 팀보고 → 리스크* 순의 산만한 롱스크롤이라 "한 화면 진단"이 무너져 있다.

### ADOPT (지금 가능 — 실데이터)
| 항목 | 근거 | 적용 위치 |
|------|------|-----------|
| **KPI 히어로 4카드** (이번달 인식매출 / 오더·확정임박 / 동기화 매출·수금 / 미수·이탈위험) | 4개 값 전부 이미 실데이터: `deliveryTotalAmount`(자체DB ₩) · `opportunityAmount`(USD) · `salesAmount+collectionAmount`(CNY) · `outstandingAmount+paymentRiskCount`. 현재는 8칸 그리드 + 하단 risk 스트립에 **분산**돼 "한눈 진단" 불가 | `app/admin/crm/page.tsx` — Action Queue 밴드 위 신규 히어로 섹션. 기존 `CrmMeasurementTile`/`CrmMetricTile` 재사용 |
| **매출추이 막대차트(월별, 당월 강조)** | `CrmPerformanceCharts`가 이미 `/api/admin/crm/performance`의 `monthly[]`를 Area로 그림. 같은 데이터, 표현만 Area→Bar+당월 진한색 | `components/admin/crm/CrmPerformanceCharts.tsx` AreaChart 블록 |
| **우측 340px 작업대 aside 보존** | 코크핏 화면 자체가 우측 rail을 갖는데, 현재 앱은 `minmax(0,1fr)_340px` 그리드로 **이미 더 강하게** 구현. 좌측 본문만 코크핏화하고 aside는 건드리지 않음 | `app/admin/crm/page.tsx` `<aside>` 블록 |

> **차트-카드 인접 비교 함정(신규 리스크):** KPI 히어로의 "이번달 인식매출"(`crm_deals` 자체집계, ₩)과 매출추이 차트(`branch_rev_deals`=REV=**CNY**)는 **서로 다른 테이블·다른 통화**다. 둘을 같은 화면에 ₩로 나란히 두면 사용자가 "추이의 막대 합 ≈ 히어로 카드"라고 **무의식적으로 비교/합산**하게 된다. "서로 다른 통화 합산 금지" 원칙은 카드 내부뿐 아니라 **카드↔차트 간 시각 인접에도 적용**해야 한다. 차트는 반드시 `¥`(`formatCNY` 단위)로 교정하고, 출처 라벨("REV 동기화 매출·CNY")을 명시해 자체집계 ₩와 분리한다(§8 참조).

### ADAPT
| 항목 | 변경 | 이유 |
|------|------|------|
| **매출추이 목표선 오버레이** | 1차는 **목표선 없이** 막대만. 2차로 "월 매출 목표" 입력 소스 선행 후 `ReferenceLine` 추가 | **매출(won) 목표 데이터가 코드 어디에도 없다.** branch KPI의 goal은 활동량(LD/ACC/OPP/SOL/VST) 목표지 매출 목표가 아니므로 재사용 불가 |
| **세일즈 퍼널 가로막대** | 코크핏 5단계(상담→데모→견적→협상→계약)는 현재 데이터에 없음. `CrmHomeCharts`의 기존 **3단계 리드 퍼널**(신규유입→응대→전환)을 코크핏 자리로 끌어올려 "리드 퍼널(건수)"로 정직하게 표기. **금액 폭 막대 금지(통화 혼용)** | 코크핏 5단계 객체가 현재 없음. 리드 status 4값만 실데이터. 단계별 통화가 달라 금액 폭은 오독 위험 |
| **목표 달성률 게이지** | 매출 목표 부재로 "매출 달성률 게이지"는 보류. 대신 실데이터인 **branch KPI 달성률(actual/goal)**을 "활동 목표 달성률" 미니 게이지로 의미를 바꿔 채택 | 게이지 분모(goal)가 매출엔 없고 활동 KPI엔 실재 |
| **히어로 4카드 통화 표기** | 각 카드 값 옆에 **통화 칩(₩/$/¥) 강제** + 카드별 포맷터 정확 매칭: 자체집계 ₩(신규 기호 포맷터/`currencyBadge`) / 오더 `formatUSD` / 동기화 매출·수금 `formatCNY` / 미수 `formatCNY` | 3통화 인접 배치 = 오독 위험 최댓값. **단, 배지만으로는 부족**(§8 포맷터 레벨 분기 참조) |

### DISCARD
| 항목 | 이유 |
|------|------|
| **고객 건강도 도넛**(안전58%/주의29%/위험13%) | 통합 `health` 점수 필드가 **코드에 없음**. `risk.severity`+`serviceRisk.level`+`deriveCustomerFlags`로 룰베이스 근사는 가능하나 임의 %는 신뢰성 훼손. 1차는 실수치인 `paymentRiskCount`/`outstandingAmount`로 대체. health 룰의 **분모·임계값 정의가 선행되지 않으면 후속에서도 더미**가 되므로 Phase 3.3에서 산식 명시 후 도입 |
| **승률 카드**(34% ▲3%p · 업계평균 28%) | win rate 계산 코드 없음. "제안 대비 성사" 분모 미정의, "업계평균"·"전월대비 ▲"는 전부 더미. 4번째 카드는 미수·이탈위험으로 대체 |
| **이탈위험 금액**(7곳·₩1.4억) | 위험 고객 잔여가치 합산 산식 없고 통화도 CNY라 ₩ 합산이 틀림. "곳 수"(`paymentRiskCount`)+"미수 합계"(`outstandingAmount`, ¥)로만 대체 |

---

## 2. 우측 사이드바 + 고객 360

**평결:** 이 요소는 그래프트 대상이라기보다 **현재 앱이 이미 프로토타입보다 강하게 구현한 영역**이다. 프로토타입 C360의 거의 모든 블록이 현재 `Customer360Drawer`(1572줄, 인라인 쓰기)와 `Customer360Detail*`(SSR 읽기 5탭)에 **실데이터로 존재**한다. 핵심 결정은 "흡수 방식"이 아니라 "드로어 유지 vs 풀페이지 승격"이고, 답은 **둘 다 유지(역할 분리 보존)**다.

### ADOPT
| 항목 | 근거 | 적용 위치 |
|------|------|-----------|
| **우측 aside에 "설치·방문 일정" 섹션 추가** | 사용자 명시("우측바에 무엇을 더 넣을지")에 대응. 신규 fetch 불필요 — `crmOverview.business.upcomingThisWeek`(이미 보유) 상위 3건. **단 `kind`는 `install`\|`visit` 2종 한정**이므로 "오늘 일정"이 아니라 "설치·방문 일정"으로 정확히 라벨 | `app/admin/crm/page.tsx` 우측 aside |
| **"추천 다음 액션(실행 버튼)" 동선** | 이미 `Customer360Drawer`에 "다음 액션 추천 · 규칙 기반"으로 구현, "실행·할 일 추가" 버튼이 실제 task POST. 재구현 아님 | `components/admin/crm/Customer360Drawer.tsx` |
| **드로어=작업 / 풀페이지=읽기 역할 분리 보존** | 드로어 인라인 쓰기(메모·콜·문자·회의록·딜·할일·CS모션)가 강점, 프로토타입 풀페이지(빠른기록 textarea 1개)보다 우월. 통합 시 작업 동선 상실 | `Customer360Drawer.tsx` ↔ `app/admin/crm/customers/[key]/page.tsx` |

### ADAPT
| 항목 | 변경 | 이유 |
|------|------|------|
| **재무 4타일**(견적→오더→수납→미수) | 드로어의 세로 리스트(`FunnelRow`)를 **4타일 그리드**(grid-cols-2 sm:grid-cols-4)로 시각 승격. **타일마다 통화 배지(견적 ₩ / 오더 $ / 수납·잔액 ¥) 강제 + 포맷터 정확 매칭.** 미수>0 시 `#B85C33`. **프로토타입 `valueRaw×0.7/0.3` 더미 산식 금지** | 한눈 판독성은 가치 있으나 통화가 단계별로 달라 배지 없으면 오독. `Customer360DetailOverview`는 이미 StatTile 그리드라 드로어만 맞추면 시각 일관 |
| **"AI 고객 요약" 1문단** | AI 호칭·LLM 없이 `priorityReason`+`serviceRisk`+미수+만료D-day 분기 문자열로 룰베이스 요약. **"규칙 기반(Derived)" 라벨 유지** | 프로토타입 AI요약은 전부 규칙기반 더미. 현재 앱의 Derived 표기 방침 유지가 C 스킵과 일치 |
| **우측 aside 일정 배치** | 340px 폭에 탭 3개는 빡빡 → 탭은 2개 유지하고 **일정은 aside 하단 별도 컴팩트 섹션으로 스택** | 반응형 안전(xl 단일열 폴백 시에도 자연 정렬) |

### DISCARD
| 항목 | 이유 |
|------|------|
| **풀페이지 단일화로 드로어 폐기** | 드로어 인라인 쓰기 mutation이 핵심 작업 자산. 폐기 시 "클릭→상세에서 바로 작업" UX 손실 |
| **`valueRaw×(won 0.7/협상 0.3)` 수납·미수 더미 산식** | 현재는 NEO orders(USD)/collections(CNY)/EEO잔액(CNY)/Deal Lite(KRW) 실원천 분리. 더미 비율은 실데이터 후퇴 |
| **"AI 자동기록" 배지 타임라인 항목** | 통화 STT/감정분석 백엔드 미보유. 현재 타임라인은 `crm-events` 실데이터로 이미 strong. 가짜 배지는 신뢰성 훼손 |
| **헤더 "건강도 배지" 단일 health 점수** | 프로토타입 health<55 더미. 현재는 `serviceRisk`+`Customer360Severity`+미수+만료D-day 다축 실신호로 더 정밀. 단일 점수 신규 도입 보류 |

---

## 3. A 우선순위 작업대(투두)

**평결:** A-todo는 "신규 구현"이 아니라 **이미 존재하는 강한 자산의 강화**다. 현재 `CrmPriorityQueuePanel` + `lib/crm/priority.ts`는 프로토타입 HOME-A 큐의 핵심 4요소(SCORE 숫자·근거 1줄·완료/내일로/열기·sev 정렬)를 **전부 실데이터 + 실 mutation으로 이미 구현**. 프로토타입 QUEUE는 더미, 현재 앱은 룰엔진 — 프로토타입 분석 자체가 "score는 가중합 룰엔진으로 충분, LLM 불필요"라 명시. **변경할 것은 오직 배치(layout)와 표현(presentation) 둘뿐.** (이 평결은 코드와 일치함을 재확인했다.)

### ADOPT (엔진 그대로 — 코드 확인 완료)
| 항목 | 적용 위치 |
|------|-----------|
| **3소스 통합 룰베이스 스코어링**(`clampScore` 0~100, `severityFromScore` critical/high/medium/low, bucket today/renewal/watch/**stale_recovery**) | `lib/crm/priority.ts` — **변경 없음** |
| **룰베이스 reason 템플릿** = 프로토타입의 "AI 근거 1줄"("48시간 이상 미응답"·"N일 지연된 팔로업"·"N일 내 만료"·"N일 수업 없음·잔액 보유") | `lib/crm/priority.ts` reason 필드 |
| **완료/내일로 인라인 액션이 실제 mutation** (리드 연락완료=로그 POST+상태 PATCH / 태스크 complete·snooze PATCH + force 재조회) | `CrmPriorityQueuePanel.tsx` + `/api/admin/leads/[id]/logs` · `/api/admin/crm/tasks/[id]` |
| **서버측 큐 + SWR + owner/source/bucket 필터** | `app/api/admin/crm/home/priority-queue/route.ts` |

### ADAPT (배치 + 표현만)
| 항목 | 변경 | 이유 |
|------|------|------|
| **작업대 배치 승격** | 우측 340px aside 컴팩트(탭 뒤 4건) → **본문 좌측 상단 메인**으로 승격. 본문에선 `compact=false`(풀 모드, 10~12건). 우측 aside는 `CrmWeekAheadPanel` 전용으로 단순화(탭 제거) | 프로토타입 HOME-A 본질 = "좌측 메인 작업대 + 우측 rail 일정". 현재는 작업대가 우측 보조로 눌려 "0초 판단" 효과 약함 |
| **compact 카드 시각 위계** | 프로토타입 항목 구조([세만틱 아이콘 타일][액션·고객][근거 배지+사유][SCORE 16px][3버튼]) 차용. 아이콘 타일 28~34px 격상(severity별 bg/fc: critical `#FEF3EE`/`#B85C33`, high `#ECFDF5`/`#084734`), reason 앞 "근거" 키커, SCORE tabular-nums | 판독성 강점은 "한 숫자 + 세만틱 색 일관성"에서 옴. 색 규약은 이미 보유 |
| **"AI 근거" 명칭** | UI는 "AI"가 아니라 **"근거"/"우선순위 근거"**로 표기, 헤더에 "규칙 기반 우선순위(Derived)" 보조 문구 | 360 풀페이지가 이미 확립한 Derived 라벨 패턴과 일관. C 스킵 방침과 정합 |

> **week-ahead 진입점 약화 리스크(신규):** 현재 aside 2탭(오늘 연락/이번 주 할 일) 중 priority만 본문으로 승격하면, `CrmWeekAheadPanel`의 task 버킷(overdue/today/week) 가시성이 떨어질 수 있다. aside를 "`CrmWeekAheadPanel` 전용"으로 두되, **본문 작업대(액션 큐)와 aside 주간 패널의 역할 경계를 명시**해야 한다(본문=소진할 단일 액션 큐, aside=주간 일정/버킷 조망). Phase 1.1에서 두 패널의 중복·혼동 여부를 검증한다.

### 룰베이스 스코어 설계 (현행 확인 — 코드와 일치)
현행 `lib/crm/priority.ts` 가중 규칙(확인됨): 응답대상 소스 `RESPONSE_TARGET_SOURCES = {demo_modal, contact_page, meta_lead_ads}`면 base 가중, 48h+ 미응답·24h+ 가중, 계정 만료 D-day·잔액·미수업일·태스크 priority/due 가중, `clampScore` 0~100 → `severityFromScore`. 강화 시 주의: reason에 **금액을 덧붙이지 말 것**(현재는 일수·건수만이라 통화 안전). 금액 추가가 꼭 필요하면 neo=¥(`formatCNY`) / opportunity=$(`formatUSD`) / deal=₩(`formatKRW`)를 **한 카드 안에서 단위 라벨 없이 섞지 말 것.**

### DISCARD
- 프로토타입 QUEUE 하드코딩 sev/score/reason (실엔진으로 완전 대체, 옮기면 퇴행)
- `completed[]` 로컬 push 후 큐 제거 흉내 (현재는 서버 mutation+force 재조회로 영속, 로컬 흉내는 데이터 불일치 유발)
- 목표 nudge 스트립(₩7,360만/8,000만)을 작업대 카드에 묶기 (B 코크핏 소관, A 작업대는 "소진하는 액션 큐" 한 역할로 순수 유지)

---

## 4. 현재 기능 융합 & 전역 결정

**핵심 통찰:** 현재 `/admin/crm`이 이미 A의 절반(우측 작업대 + 3소스 점수화)과 B의 절반(Recharts 대시보드)을 강하게 구현. 따라서 전역 방침은 **"리디자인 금지, 보존·증분 그래프트"**.

### 반드시 보존(PRESERVE)할 자산
| 자산 | 위치 | 이유 |
|------|------|------|
| 우선순위 작업대 3소스 점수화 + 실 mutation | `lib/crm/priority.ts` + `CrmPriorityQueuePanel.tsx` | A 큐가 여기에 흡수 |
| 우측 340px aside 탭 작업대 | `app/admin/crm/page.tsx` + `CrmWeekAheadPanel.tsx` | "간이 정보 사이드바" 그대로 |
| Customer360Drawer 인라인 쓰기 + 풀페이지 5탭 이중구조 | `Customer360Drawer.tsx` + `customers/[key]/page.tsx` | "클릭→고객360" 채택 의향에 정확 대응 |
| CNY/USD/KRW **분리 포맷터** (`formatCNY`·`formatUSD` @ `money-format.ts`, `formatKRW` @ `Customer360DetailShared.tsx`) | (각 파일) | 코크핏 그래프트의 필수 안전장치. **단 홈 대시보드·차트에는 미적용 상태**(아래 FIX 참조) |
| snapshot RPC + live_query 폴백 + SWR + Recharts 지연로드 | `lib/admin-crm-overview.ts` | 성능/회복력 백본 |
| 규칙기반 "다음 액션 추천"을 Derived로 라벨 | Overview `nextActionLabel` + `priority.ts` reason | C 스킵 방침과 신뢰성 표기 일관 |
| 매칭 인박스·capture 참석자 입력·이벤트 attribution·통합 고객검색 | `app/admin/crm/matching` · `capture` · 통합검색 API | 레퍼런스에 없는 고유 자산 |

### FIX(소급 교정) — PRESERVE에서 분리된 항목
| 대상 | 현 상태 | 교정 |
|------|---------|------|
| 홈 8칸 그리드 | `formatCurrency`(기호 없음)가 CNY `salesAmountMonth`/`collectionAmountMonth`에 적용(line 492/513/628/632/657/664) | 동기화 매출·수금은 `formatCNY`(¥)로 교체, 자체집계는 ₩ 기호 명시 |
| 매출추이 차트 | `₩{fmtMan(data.total)}`(line 102) — 소스는 `branch_rev_deals`=REV=CNY | `¥`로 교정 + "REV 동기화·CNY" 출처 라벨 |

> 초안은 이 두 영역을 **PRESERVE로 분류했으나**, 활성 통화 오표기가 있으므로 **소급 교정 대상**이다. "신규 카드만 통화 배지" 가드레일은 이 기존 버그를 못 잡으므로 미완이다.

### IA 결정 — 동결
**crmDrill 4탭(현황/고객DB/기록/참석자입력)을 1차 탐색으로 유지. 새 탭/새 라우트 만들지 않음.** B 코크핏은 **"현황" 탭 홈 상단의 KPI 히어로 영역으로만 합성**. `CrmSubnav`·`resolveSection` 6섹션 enum은 보조탭으로 그대로 둠. deals/insights/revenue/matching 라우트는 현황 딥링크로 귀속.

**경계 기준(미결 → 확정):** "코크핏 영역"과 "보조탭"의 경계는 다음 룰로 고정한다 — (1) **단일 화면 진단에 필요한 집계·큐·추이**(KPI 히어로 4카드, 작업대, 매출추이·리드퍼널)는 현황 홈 상단 코크핏에 합성. (2) **드릴다운/원장/관리 화면**(deals 리스트, insights 상세, revenue 원장, matching 인박스)은 보조탭/딥링크로 유지. `resolveSection`이 흡수하는 라우트는 **"홈에서 클릭해 들어가는 상세"**로 한정하고, 홈 자체는 보조탭 enum에 포함하지 않는다.

### ⌘K 커맨드 팔레트 — ADOPT (순수 프론트, 백엔드 의존 0)
- `navCmds` = `CRM_CHILD_NAV` 라우트 인덱스, `custCmds` = `CrmCustomerPicker`의 `/api/admin/crm/customers/unified?q=` 재사용
- **C의 AI 자연어 입력은 통합하지 않음** — 순수 내비/고객검색 팔레트로만
- 신규: `components/admin/crm/CrmCommandPalette.tsx`. **Ctrl/⌘+K 핸들러는 CRM 스코프 내에만 바인딩, input 포커스 시 무력화**(브라우저 단축키 충돌 방지)

### 랭킹 / AI 코치 — 후속 백로그 (스킵 아님)
- **랭킹:** 공유화면이지만 `REPS` 전부 더미. 단 실소스(branch KPI·`CrmPerformanceCharts` 팀/개인 집계)는 이미 있음 → 룰베이스 재구성으로 **후속 채택 보류(백로그)**
- **AI 코치 통화분석:** 다크헤더+감정배지+벤치마크 전부 더미, STT/감정분석/벤치마크 백엔드 전제 → **LLM/STT 필요로 명시 보류**

### C(AI커맨드) — 확정 스킵
가짜 LLM(`matchAi()` 하드코딩 키워드 4분기). 실작동엔 RAG/함수호출/환각방어 백엔드 필요(최대 의존성·리스크). 실질 가치(우선순위·코칭)는 A 작업대 + 규칙추천이 이미 더 구조화된 형태로 흡수. 다크 아이콘 레일(66px)은 라벨 소거로 식별성도 A/B보다 낮음. **향후 LLM 준비 시 ⌘K 팔레트에 자연어 입력으로 합치는 형태(별도 다크크롬 없이)로 재도입이 합리적.**

---

## 5. 버릴 것 — 명시적 DISCARD 종합

| # | 버리는 것 | 한 줄 이유 |
|---|-----------|-----------|
| 1 | C(AI커맨드) 전체 (자연어창·프롬프트칩·다크레일·`matchAi()`) | 가짜 LLM, 백엔드 의존 최대, 가치는 A가 흡수 |
| 2 | 고객 건강도 도넛 (안전/주의/위험 %) | 통합 health 필드 없음, 임의 % = 신뢰성 훼손 |
| 3 | 승률 카드 (34%·업계평균 28%) | win rate 계산 코드·외부 벤치마크 없음 |
| 4 | 이탈위험 **금액**(₩1.4억) | 잔여가치 합산 산식 없고 CNY를 ₩로 합산 = 오류 |
| 5 | 매출추이 **목표선**(1차) | 매출 목표 데이터 부재. 목표 입력 소스 선행 필요 |
| 6 | 풀페이지 단일화로 드로어 폐기 | 인라인 쓰기 작업 동선 손실 |
| 7 | `valueRaw×비율` 수납·미수 더미 산식 | 실 NEO/Deal 분리 원천 후퇴 |
| 8 | "AI 자동기록" 배지 타임라인 | STT/감정분석 미보유 |
| 9 | 헤더 단일 health 점수 배지 | 현 다축 severity가 더 정밀 |
| 10 | 3방향 SPA 셸(A/B/C 크롬 전환) | 단일 IA(crmDrill 4탭)가 이미 안정 |
| 11 | 순수 CSS/하드코딩 차트(conic-gradient·고정 px 막대) | 현재 Recharts가 실데이터 바인딩·반응형 우월 |
| 12 | ⌘K에 C의 AI 자연어 입력 통합 | LLM 부재 상태 = 가짜 응답 리스크 |
| 13 | 작업대에 목표 nudge 묶기 | B 코크핏 소관, 작업대는 액션 큐 한 역할로 순수 유지 |

---

## 6. 데이터 가용성 매트릭스

| 기능 | 필요 데이터 | 상태 |
|------|-------------|------|
| KPI 히어로: 이번달 인식매출 | `deliveryTotalAmount`(자체DB) | ✅ **지금 가능** (₩ — 기호 명시 필요) |
| KPI 히어로: 오더·확정임박 | `opportunityAmount` | ✅ **지금 가능** (`formatUSD`, $) |
| KPI 히어로: 동기화 매출·수금 | `salesAmount`+`collectionAmount` | ✅ **지금 가능** (¥ — **현재 ₩처럼 오표기, `formatCNY`로 교정 필요**) |
| KPI 히어로: 미수·이탈위험 카운트 | `outstandingAmount`+`paymentRiskCount` | ✅ **지금 가능** (¥+건수) |
| 매출추이 막대(당월 강조) | `/api/admin/crm/performance` `monthly[]` (소스 `branch_rev_deals`=REV) | 🟡 **데이터는 가능하나 통화 오표기**: 현재 `₩{fmtMan}`(line 102) — 소스가 CNY라 **¥로 교정 선행** |
| 우선순위 작업대(score/reason/액션) | `lib/crm/priority.ts` 3소스 | ✅ **지금 가능** (실 mutation) |
| 재무 4타일(견적→오더→수납→미수) | Deal Lite(₩ `formatKRW`)/NEO orders($ `formatUSD`)/collections·EEO잔액(¥ `formatCNY`) | ✅ **지금 가능** (타일별 통화 배지·포맷터 정확 매칭) |
| 우측 "설치·방문 일정" | `crmOverview.business.upcomingThisWeek` (`kind`=install\|visit 한정) | ✅ **지금 가능** (라벨은 "설치·방문 일정") |
| ⌘K 팔레트 | `CRM_CHILD_NAV` + 통합검색 API | ✅ **지금 가능** |
| 360 "AI 요약" 1문단 | `priorityReason`+`serviceRisk`+미수+만료 | 🟡 **룰베이스**(Derived 라벨, LLM 보류) |
| 세그먼트 칩(이탈위험/VIP) + health<55 | 세그먼트·카운트는 실데이터, health 점수 | 🟡 **룰베이스 근사**(사용량 로그 연동은 후속) |
| 활동 목표 달성률 게이지 | branch KPI actual/goal | 🟡 **룰베이스**(매출 아닌 "활동" 라벨) |
| 매출추이 목표선 / 매출 달성률 게이지 | 월 매출 목표 | ⛔ **데이터 신설 선행**(`crm_revenue_target` 1행 테이블 + API) |
| "예상 104% 초과달성" 메시지 | 가중 파이프라인 추정 | 🟡 **룰베이스**(`lib/crm/forecast.ts` **신규**, LLM 불필요) |
| 건강도 도넛 / 승률 / 이탈위험 금액 | 통합 health·win rate·잔여가치 | ⛔ **보류**(필드 부재, health는 분모·임계값 정의 선행) |
| AI 자동기록 / AI 통화분석 / AI 코치 | STT+감정분석+벤치마크 | ⛔ **LLM/STT 보류** |
| C(AI커맨드) | RAG+함수호출+환각방어 | ⛔ **스킵** |

---

## 7. 단계별 로드맵

### Phase 0 — 통화 표기 소급 교정 (FIX, 신규 작업 선행)
| # | 작업 | 파일 | 노력 |
|---|------|------|------|
| 0.1 | 홈 8칸 그리드의 CNY 값(`salesAmountMonth`·`collectionAmountMonth`)을 `formatCurrency`→`formatCNY`(¥)로 교체, 자체집계는 ₩ 기호 명시 | `app/admin/crm/page.tsx` (line 492/513/628/632/657/664) | S |
| 0.2 | 매출추이 차트 `₩{fmtMan}`→`¥`(CNY) 교정 + "REV 동기화·CNY" 출처 라벨 | `CrmPerformanceCharts.tsx` (line 102) | S |
| 0.3 | **통화기호 분기 포맷터/`currencyBadge` 신설** — 만/억 단위는 ₩(자체집계)에만, CNY는 `formatCNY`의 ¥만단위 규칙 유지(중국 매출은 万 환산 의미가 달라 한국식 만/억 단위 재사용 금지) | `lib/crm/money-format.ts` (신규 export) | S |

### Phase 1 — 저비용 즉효 (실데이터, 통화 함정 주의)
| # | 작업 | 파일 | 노력 |
|---|------|------|------|
| 1.0 | **가드레일:** PR 체크리스트에 "모든 금액 숫자에 통화 기호/배지·출처 라벨 강제, 다른 통화 합산 0건, **기존 코드 포함 소급 점검**" 명문화 | (PR 템플릿) | S |
| 1.1 | **A 작업대 본문 메인 승격** + 우측 aside를 `CrmWeekAheadPanel` 전용으로 단순화(탭/`setSidebarTab` 제거) + **본문↔aside 역할 경계 검증**(week-ahead 진입점 약화 여부) | `app/admin/crm/page.tsx` + `CrmPriorityQueuePanel.tsx` | M |
| 1.2 | 작업대 카드 시각 위계(아이콘 타일 28~34px, "근거" 키커, SCORE tabular-nums) + "규칙 기반(Derived)" 헤더 문구 | `CrmPriorityQueuePanel.tsx` | S |
| 1.3 | **KPI 히어로 4카드 합성**(8칸 그리드 → 4카드, 각 통화 기호/포맷터 정확 매칭, 이탈위험 카드 `#B85C33`+`?view=risk` 딥링크) | `app/admin/crm/page.tsx` | M |
| 1.4 | 우측 aside 하단 "설치·방문 일정" 컴팩트 섹션(`upcomingThisWeek` install/visit 상위 3건) | `app/admin/crm/page.tsx` | S |
| 1.5 | ⌘K 커맨드 팔레트(내비+고객검색, CRM 스코프 바인딩) | 신규 `CrmCommandPalette.tsx` | M |

### Phase 2 — 시각화·360 보강
| # | 작업 | 파일 | 노력 |
|---|------|------|------|
| 2.1 | 매출추이 AreaChart → **BarChart + 당월 강조** (Phase 0.2 통화 교정 위에서) | `CrmPerformanceCharts.tsx` | S |
| 2.2 | 리드 퍼널을 코크핏 자리로 재배치, "리드 퍼널(건수)" 라벨 (금액 폭 금지) | `CrmHomeCharts.tsx` | S |
| 2.3 | 재무 4타일 그리드 승격(드로어 리스트→그리드, 타일별 통화 배지·포맷터, 미수>0 `#B85C33`) | `Customer360Drawer.tsx` (+ `Customer360DetailOverview.tsx` StatTile 통일 검토) | M |
| 2.4 | 360 "Derived 요약 1문단" 민트 헤더 카드 | `Customer360Drawer.tsx` / `Customer360DetailOverview.tsx` | M |
| 2.5 | 세그먼트 칩 + 라이브 카운트(risk/vip 추가) — **본체 미정독 컴포넌트 재확인 후** | `AdminSidebar.tsx` `CRM_SEGMENTS` + `CrmUnifiedCustomersClient.tsx` | M |
| 2.6 | **중복 차트 정리**(`CrmPerformanceCharts` vs deals/kpi SSOT, 8칸 그리드 슬림화) | `app/admin/crm/page.tsx` + deals 라우트 | M |
| 2.7 | 활동 목표 달성률 게이지(branch KPI, "활동" 라벨 명시) | `CrmPerformanceCharts.tsx` 헤더 | M |

### Phase 3 — 데이터 신설 선행 / 백로그
| # | 작업 | 파일 | 노력 |
|---|------|------|------|
| 3.1 | **월 매출 목표 소스 신설**(`crm_revenue_target` 1행 테이블 + API) → 매출추이 `ReferenceLine` 목표선 + 매출 달성률 게이지 | `lib/crm` + 신규 API + `CrmPerformanceCharts.tsx` | L |
| 3.2 | "예상 초과달성" 룰추정 함수 | 신규 `lib/crm/forecast.ts` | M |
| 3.3 | **health 점수 룰 정의**(분모·임계값 명시: 최근 접촉일·계약단계·미수·만료D-day 가중 → 임계 55 등 확정 → 후에 NEO 사용량 로그 연동) → 건강도 도넛 | `lib/crm` | L |
| 3.4 | 랭킹 보드(branch KPI·팀/개인 집계 룰베이스 재구성) | 신규 | L |
| 3.5 | Customer360Drawer 1572줄 섹션 컴포넌트 분할 리팩터 | `Customer360Drawer.tsx` | L |
| 3.6 | (LLM 준비 후) AI 고객요약·통화분석·코치·⌘K 자연어 재도입 | — | XL |

**전 Phase 공통 검증:** `npx eslint app components lib --max-warnings=0 && npm run build`

---

## 8. 리스크 & 함정

| 리스크 | 영향 | 완화책 |
|--------|------|--------|
| **기존 코드의 활성 통화 오표기 (1순위)** | 현행 홈 8칸 그리드·매출추이 차트가 **이미** CNY를 ₩/만·억으로 표기 중. 신규 카드만 막아도 기존 오독은 그대로 남음 | **Phase 0 소급 교정 선행.** `formatCurrency`(line 225, 기호 없음)를 CNY 값에서 제거하고 `formatCNY`로, 차트 `₩`→`¥`로. 가드레일 범위에 "기존 코드 점검" 포함 |
| **포맷터가 통화기호를 아예 안 붙이는 구조** | `formatCurrency`/`fmtMan`는 "만/억" 한국 단위만 출력 → `currencyBadge`를 옆에 붙여도 숫자 자체(예: ¥7,360만)는 한국 독자에게 원화로 읽힘. 게다가 중국 매출에 한국식 만/억 환산은 의미가 다름 | **배지 부착만으론 부족** → **포맷터 레벨 분기**: CNY는 `formatCNY`(¥, 万 규칙) 강제, ₩ 자체집계만 만/억 허용 |
| **차트↔카드 인접 비교 오독** | KPI 히어로 "인식매출"(crm_deals, ₩)과 매출추이(branch_rev_deals, CNY)가 같은 화면에 ₩로 보이면 비교/합산 충동 | 차트는 ¥+출처 라벨로 분리. "다른 통화 합산 금지" 원칙을 **카드↔차트 간 시각 인접에도 적용** |
| **더미↔실데이터 갭** | 목표선·게이지·승률·건강도를 그대로 옮기면 "가짜 숫자판" | 데이터 신설(매출 목표)·health 룰 정의(분모·임계값) **선행 없이는 채택 보류**. 1차엔 실수치(미수·이탈위험 카운트)만 노출 |
| **IA 비대화 (롱스크롤)** | "현황" 홈이 이미 매우 김. 히어로를 더하면 더 길어짐 | 상단 KPI로 응축하면서 **하단 중복 블록(revenue 8칸·`CrmHomeCharts`) 반드시 슬림화/위임** |
| **Derived를 AI로 오표기** | 360 요약카드를 민트헤더+자동문단으로 만들면 AI처럼 보임 | "규칙 기반(Derived)" 배지 누락 금지 — C 스킵 방침과 모순 방지 |
| **week-ahead 진입점 약화** | priority만 본문 승격 시 `CrmWeekAheadPanel` task 버킷 가시성 하락 | 본문=액션 큐 / aside=주간 일정·버킷으로 역할 경계 명시, Phase 1.1에서 중복 검증 |
| **드로어 vs 풀페이지 혼동** | 사용자가 "왜 둘 다?" 혼동 | "자세히 보기" 카피로 "작업은 여기, 전체 이력은 자세히 보기" 의도 명시 |
| **⌘K 전역 핸들러 충돌** | 브라우저·기존 단축키 충돌, admin 외 누출 | CRM 스코프 내에만 바인딩, input 포커스 시 무력화 |
| **우측 aside 340px 폭 압박** | 일정 섹션/탭 추가 시 줄바꿈·오버플로 | 탭 2개 유지 + 일정 하단 스택, **`minmax(0,1fr)` 규약 준수** |
| **snapshot RPC 폴백 비용** | KPI 히어로 4값 전부 `crmOverview`(snapshot RPC `admin_crm_business_overview`)에서 옴. 미적용/실패 시 live_query 다중 폴백 → 히어로를 무겁게 할수록 폴백 초기 로드 비용·warning 노출이 코크핏 첫인상 훼손 | 히어로는 snapshot 필드만 재배치(추가 쿼리 0), 폴백 경로에서 warning 표기·스켈레톤 유지. 신규 fetch 도입 금지 |
| **`upcomingThisWeek`는 install/visit 2종만** | "오늘 일정"으로 라벨하면 콜/미팅 누락돼 불완전 | **"설치·방문 일정"으로 정확히 라벨**하거나 task today 버킷과 병합 검토 |
| **미정독 컴포넌트** | `LeadRegisterModal`·`CrmInsightsClient`·`CrmUnifiedCustomersClient`·`LeadsBoardClient` 본체 미확인 | 세그먼트 칩·딥링크 그래프트 전 실제 props/기능 범위 **재확인 필수** |

---

**한 줄 요약:** 현재 앱은 이미 A(작업대)·B(코크핏)의 엔진을 실데이터로 보유하므로 이번 작업의 핵심은 **레이아웃 재배치(작업대 본문 승격 + KPI 히어로 합성)**다. 단 "통화 분리 규약이 안전하게 적용돼 있다"는 전제는 절반만 맞고, **홈 대시보드·매출추이 차트에는 CNY를 ₩로 찍는 활성 오표기가 이미 있어 Phase 0 소급 교정이 선행돼야 한다.** 데이터 신설(매출 목표·health 분모) 항목과 C/AI코치/랭킹은 백엔드 준비 전까지 명시적 보류다.

(관련 핵심 파일 — 모두 repo-relative. **포맷터 위치 정정 반영**: `app/admin/crm/page.tsx`(지역 `formatCurrency`, 기호 없음), `lib/crm/priority.ts`, `lib/crm/money-format.ts`(`formatCNY`·`formatUSD`만 export), `components/admin/crm/Customer360DetailShared.tsx`(`formatKRW`), `components/admin/crm/CrmPriorityQueuePanel.tsx`, `components/admin/crm/CrmPerformanceCharts.tsx`(line 102 `₩`+`fmtMan`), `components/admin/crm/CrmHomeCharts.tsx`, `components/admin/crm/Customer360Drawer.tsx`, `components/admin/crm/Customer360DetailOverview.tsx`, `components/admin/crm/CrmWeekAheadPanel.tsx`, `lib/crm/revenue-performance.ts`(`listBranchRevDeals`→`branch_rev_deals`=CNY), `lib/admin-crm-overview.ts`, `components/admin/AdminSidebar.tsx`. 신규 예정: `lib/crm/money-format.ts` `currencyBadge`, `lib/crm/forecast.ts`, `components/admin/crm/CrmCommandPalette.tsx`, `crm_revenue_target` 테이블)

---

## 9. 구현 현황 (2026-06-30 적용)

본 권고를 같은 날 코드로 적용함. 품질 게이트(`npm run typecheck` · `eslint app components lib --max-warnings=0` · `npm run build`) 전부 통과.

### 적용 완료
| Phase | 항목 | 변경 파일 |
|-------|------|-----------|
| 0.1 | 홈 8칸 그리드 CNY → `formatCNY`(¥), 자체집계 → `formatKRWAbbrev`(₩), 로그 금액 종류별(`formatLogAmount`) | `app/admin/crm/page.tsx` |
| 0.2 | 매출추이 `₩`→`¥`(CNY) + "REV 동기화·¥" 출처 라벨 + Y축 ¥ | `components/admin/crm/CrmPerformanceCharts.tsx` |
| 0.3 | `formatKRWAbbrev` + `CRM_CURRENCY_BADGE`(₩/$/¥) 신설 | `lib/crm/money-format.ts` |
| 1.1 | A 작업대 본문 메인 승격 + 우측 aside를 WeekAhead 전용 단순화 | `app/admin/crm/page.tsx` |
| 1.2 | 작업대 헤더 "규칙 기반(Derived)" 표기 | `components/admin/crm/CrmPriorityQueuePanel.tsx` |
| 1.3 | KPI 히어로 4카드(통화 칩 강제, 미수 카드 `?view`→Deals 딥링크) | `app/admin/crm/page.tsx` (`CrmCockpitHero`) |
| 1.4 | 우측 aside "설치·방문 일정"(`upcomingThisWeek` install/visit) | `app/admin/crm/page.tsx` |
| 1.5 | ⌘K 커맨드 팔레트(내비+고객검색, CRM 스코프) | `components/admin/crm/CrmCommandPalette.tsx`, `app/admin/crm/layout.tsx` |
| 2.1 | 매출추이 Area→Bar(당월 강조) | `CrmPerformanceCharts.tsx` |
| 2.2 | 리드 퍼널 "건수" 라벨 명시 | `CrmHomeCharts.tsx` |
| 2.3 | 재무 4타일 그리드 + 통화 배지 + **미수=CNY 잔액으로 통화혼용 교정**(기존 USD−CNY 버그 회피) | `Customer360Drawer.tsx` (`MoneyTile`) |
| 2.4 | 360 규칙기반 요약 1문단(Derived) | `Customer360Drawer.tsx` (`derivedSummary`) |
| 2.5 | (이미 구현) `CrmUnifiedCustomersClient`의 SAVED_VIEW_FILTERS + `viewCounts` 세그먼트 라이브 카운트 — 변경 없음 | — |
| 2.6 | 매출 상세 대시보드 접이식(히어로와 중복 제거) | `app/admin/crm/page.tsx` |
| 2.7 | 활동 목표 달성률 게이지(branch KPI, "활동" 라벨) | `app/admin/crm/page.tsx` (`ActivityGoalGauge`) |
| 3.3 | 건강도 룰 SSOT(분모·임계값 정의) + 360 헤더 "건강도 NN·band" 배지 | `lib/crm/customer-health.ts`, `Customer360Drawer.tsx` |
| 3.4 | 활동 목표 달성 랭킹 보드(branch KPI 룰베이스) | `app/admin/crm/page.tsx` (`CrmRankingBoard`) |
| 3.1 | 월 매출 목표 스캐폴드 — 마이그레이션 + repo(graceful) + API + 차트 목표선/달성률(null-safe) | `supabase/migrations/20260630_crm_revenue_target.sql`, `lib/crm/revenue-target.ts`, `app/api/admin/crm/revenue-target/route.ts`, `CrmPerformanceCharts.tsx` |
| 3.2 | 월말 추정 룰(런레이트) | `lib/crm/forecast.ts` |

### 미적용(의도적 보류 · 사유)
- **3.1 운영 활성화 대기:** 목표선/달성률/월말추정은 **`crm_revenue_target` 마이그레이션 적용 + 월 목표(CNY) 입력** 후에만 표시됨(미적용 시 자연 degrade, 에러 없음). 적용: `supabase/migrations/20260630_crm_revenue_target.sql` → `INSERT` 예시는 파일 하단 주석.
- **3.3 건강도 도넛(집계):** 코크핏 집계 도넛은 overview 서버 집계(안전/주의/위험 분포) 신설이 선행 필요 → 보류. 단 **per-고객 건강도 점수는 360 헤더에 적용 완료**, 룰 SSOT(`customer-health.ts`)도 확보.
- **3.5 드로어 컴포넌트 분할 리팩터:** 동작 변화 없는 순수 리팩터 + 회귀 위험 큼 → 보류.
- **3.6 LLM(AI 요약/통화분석/코치/⌘K 자연어):** LLM/STT 백엔드 부재 → 보류(C 스킵 방침과 동일).
