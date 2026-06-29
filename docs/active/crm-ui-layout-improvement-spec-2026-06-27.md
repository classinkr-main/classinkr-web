## 1. 설계 방향 한 줄 + 원칙

**한 줄:** Admin CRM 탭을 "레퍼런스 CRM의 레이아웃 어휘(하이라이트 패널·단일 타임라인·인라인 편집·우선순위 큐 홈·act-in-place)를 작업대 속도로" 재구성한다 — Lightning/HubSpot/Zoho/Attio의 정보구조는 훔치되 그들의 배달방식(느림·설정 과잉·감시·여백 낭비)은 버린다. 현황 홈은 매니저가 5초 안에 "오늘 누구에게 연락할지"를 보고, 검색으로 1초 안에 고객을 열고, 리스트/큐에서 떠나지 않고 처리하는 화면이다.

> **canon 가드(이 스펙의 1차 웨이브 불변식):** 새 top-level 탭 0개, DESIGN 팔레트만(채도 그린 `#084734`는 한 화면 1점), 모바일 우선, provenance/freshness 계약, 첫 화면 속도 게이트(느린 전수 derive·외부 조회로 첫 페인트 지연 금지). 1차 웨이브는 **기존 데이터·기존 엔드포인트로 닫히는** 변경만 담는다. 백엔드 신설(read model·새 PATCH·새 라우트)이 필요한 패턴은 모두 후속(§5)으로 격리한다.

### 취한 것 (레퍼런스 → 우리 적용)
- **Linear: optimistic local-first + Cmd+K + 슬라이드오버 j/k 순회.** 우리 큐/주간 패널은 이미 optimistic POST+force-refresh가 있다(`CrmPriorityQueuePanel.tsx:161/179/207` 확인). 이를 **큐 행 인라인 처리**와 검색까지 확장하고, 이미 빌드된 `AdminCommandPalette`(⌘K)에 누락된 CRM 라우트를 채운다.
- **HubSpot: Sales Workspace = "Start tasks" 큐러너 + Suggested Tasks.** 우리 `crm_tasks` 1급 객체 + `CrmPriorityQueuePanel` 위에 큐러너를 얹는다. **단, 큐러너 자체(자동 advance chrome + Suggested 엔진)는 후속(§5).** 1차 웨이브는 그 cheap 80%만 — 기존 optimistic 큐 행에 인라인 Complete/Snooze를 붙여 "리스트→처리면"으로 전환한다(C-NEW).
- **HubSpot/Zoho: 하드캡 하이라이트 카드(5필드) 단일 정의 재사용.** 학원명·지역·오너·만료/잔액 위험·다음 액션을 한 번 정의해 큐 행·검색 결과·360 헤더에서 동일하게 쓴다.
- **Attio: 컴팩트 밀도 레시피 + 슬라이드오버 peek.** Inter 13–14px / 1px rgba(0,0,0,0.08) 보더(이미 DESIGN.md 규칙) / 스티키 헤더 / pastel 위험 pill.

### 돈흐름 = read-mostly 매출/정합 뷰 (칸반은 후속·옵트인)
돈흐름 표면은 **매출 rollup + 정합 read 뷰를 1차 정체성으로 유지**한다. 8-stage `STAGE_ORDER`가 코드에 있다는 사실이 그것을 1급 워크플로로 노출할 근거는 아니다(canon §3.3 "딜 단계보다 다음 액션", Salesforce식 무거운 opportunity stage 회피). stage **칸반은 후속(§5)에서 옵트인 보조 토글로만** 도입하고, drag-to-advance는 canon이 Deal Lite를 명시 승인하기 전까지 비범위로 둔다. 1차에서 stage 변경이 필요하면 360 drawer 내 **단일 필드 편집**으로만 노출한다.

### 버린 것 (anti-pattern)
- App Launcher / 7번째 top-level 탭 / 워크스페이스-서브탭 sprawl — **canon 하드 불변식 "top-level 탭 추가 금지"**. 새 표면은 sub-tab → drawer → modal 사다리로만.
- Salesforce 무거운 opportunity stage·required-property 게이트·메타데이터 설정(Canvas/page-layout 빌더) — 우리는 Deal Lite + 코드에 박힌 1–2개 의견형 레이아웃.
- Einstein/SalesSignals식 surveillance auto-capture(이메일 오픈·웹방문 추적) — 우리는 operator-authored 작업로그 + consent-gated. 지사장 화면은 개인 랭킹이 아니라 막힌 고객·놓친 액션.
- 분모 불명확한 weighted-total / balance_ratio / predicted_depletion 추정, 통화·원장 혼합 합산 — **매출 dedup 철칙**(confirmed source_links만), balance_ratio·소진 예측 deferred.
- 첫 화면을 막는 전수 derive·느린 외부 조회 — 홈 위험 **집계 strip은 read model(F5) 영속화 이후로 게이팅**. 그 전까지 위험은 큐 행 reason chip으로만 노출(전수 집계 금지).
- Spinner·modal-per-record 풀리로드·layout-property 애니메이션 — skeleton + 슬라이드오버 + transform/opacity만.

---

## 2. 서피스별 개선

### 2.1 현황 홈 (`app/admin/crm/page.tsx`)

**현재:** 액션밴드(4 KPI) → 매출 패널 → CoverageStrip → (우측 340px) 우선순위 큐 + 주간 → 전폭 NeoCrmTeamPanel → CrmTeamKpiBoard 총/팀/개인 매트릭스 → 수납 리스크. `동기화 매출/확정임박/고객/수금`이 **3곳에서 렌더**(매출 패널 = 머니플로 hero, NeoCrmTeamPanel = 주/월/분기/년 직전 동기간 비교, CrmTeamKpiBoard = 월 타일 + 팀/개인 매트릭스). 검색 0%, 큐는 우측 rail에 묻혀 모바일에서 매출 아래로 떨어짐.

**개선 (canon §4 순서 = 1.오늘 연락 2.검색 3.이번 주 4.최근 성과 5.리스크):**
1. **검색 블록을 메인 컬럼 최상단(액션밴드 바로 아래)에 인라인 추가.** 이미 빌드된 `CrmCustomerPicker.tsx`를 홈에 마운트하고, 선택 시 `Customer360Drawer`를 연다. ⚠️ picker `onPick`은 prefix가 벗겨진 `targetId`를 돌려주므로(`CrmCustomerPicker.tsx:78` `entityIdFromCustomerKey`), 드로어가 요구하는 prefixed key(`lead:`/`neo:`)를 **어댑터로 재구성**(`targetType==='neo_account'?'neo':'lead' + ':' + targetId`)하거나 picker에 `onPickKey`(raw `row.key`) 콜백을 추가한다. 어댑터 없이 `onPick` 출력을 드로어에 직결하면 404. **신규 백엔드 0.**
2. **우선순위 큐를 메인 컬럼 상단으로 승격(전폭), 매출/팀 블록을 아래로 강등.** 큐 행은 인라인 처리(아래 C-NEW)를 갖는다.
3. **NeoKPI 3중 렌더 → 통합(consolidation-with-tradeoff):** 단일 compact 4-tile strip은 **매출 패널의 머니플로 framing을 살린다.** NeoCrmTeamPanel의 **기간 비교(주/월/분기/년·직전 동기간) delta는 strip의 기간 토글로 보존**하고, CrmTeamKpiBoard의 **팀별·개인별 매트릭스는 `<details>` 아코디언(기본 접힘)으로 이동**(잃지 않음). canon §11 중복/느림 게이트. 이는 기계적 dedup이 아니라 framing 선택임을 명시.
4. **service-risk 집계 strip은 read model(F5) 의존 — 후속.** snapshot 영속화 전까지 홈에서 `만료 D-30 N · 잔액 소진 N` 전수 집계 strip을 띄우지 않는다(매 요청 N건 derive = canon §11/§14 속도 게이트 충돌). 그 사이 위험은 **큐 행에 이미 붙는 reason chip**으로 충분하다. 집계 strip은 F5 이후 도입.
5. **반응형:** 2-col 분기를 `xl:` → `lg:`로, <lg에서는 큐+주간을 매출/팀 위에 인라인. KPI 매트릭스 `min-w` 테이블을 sm에서 stacked 카드로.
6. **헤더:** 4개 동급 outline 버튼 → `+ 할 일 추가`(또는 `+ 접점 캡처`) **단일 1차 CTA(그린 `#084734`)** + 나머지 secondary 약화. **한 화면 채도 1점 제약:** 그린은 이 CTA에만 쓰고 큐 reason pill·KPI strip은 모두 neutral/pastel로 유지해 위계가 흐려지지 않게 한다.

### 2.2 고객 리스트 (`CrmUnifiedCustomersClient.tsx`)

**현재:** drawer가 로컬 state(`drawer?.key`)로만 열림 — URL 없음, 딥링크/뒤로가기 불가. 통합 API는 이미 `?q=`·`?view=`·`?lifecycle=` 지원.

**개선:**
1. **drawer를 `?account=` searchParam에 동기화**(NeoCrmCustomersClient의 기존 `?account=` 패턴 미러). ⚠️ 단 통합 client의 `row.key`는 prefixed(`lead:`/`neo:`)라, NeoCrmCustomersClient가 쓰는 bare accountId와 **값 형태가 다르다** — 두 표면은 별개 딥링크 네임스페이스이며 상호 호환되지 않음(drop-in parity 아님). 통합 표면은 prefixed key를 그대로 param 값으로 쓴다.
2. **(후속) Attio식 인라인 편집-온-호버**(오너·다음액션·지역), 360 드로어와 edit 컴포넌트 공유.
3. **(후속) saved view를 sub-tab 칩으로 노출**(만료 임박 / owner 미배정 / 미접촉) — `?view=` 이미 존재.

### 2.3 레코드 상세 — Customer360Drawer (`Customer360Drawer.tsx`)

**현재:** 7개 전폭 카드 + 3개 항상-펼침 add-form이 max-w-xl 단일 스크롤. 타임라인이 맨 아래. 이벤트 20건 하드캡 no load-more(`eventsLimit` 1–50 이미 존재). backdrop 클릭=무가드 닫힘. `crm-customer-360.ts:374` email null. 위험은 **이미 `deriveServiceRisk` 단일 소스**(`crm-customer-360.ts:382`)에서 파생됨.

**개선:**
1. **3개 인라인 add-form을 `+ 딜 / + 할 일 / + 메모` 버튼 뒤로 접기.** 빈 상태 스크롤 ~절반, "폼"이 아니라 "레코드"로 읽힘.
2. **타임라인+composer를 딜/할일 위로 승격**, composer를 카드 상단 pin(activity-as-hero).
3. **이벤트 load-more / "전체 활동 보기"**(`eventsLimit` 1–50 이미 존재) — 무성 truncation 제거.
4. **dirty-state 가드 + focus-trap**(진행 중 회의록/딜 손실 방지).
5. **email: 정직 표기.** `crm-customer-360.ts`의 `email: null`은 **neo account payload에 email 키가 없어서** 그렇다(neo 파싱은 `phone`만 추출; payload에 email 소스 부재 확인). 따라서 1차는 **`이메일 미확인` 폴백 렌더만 무조건 적용**(canon §8 win). 실제 email 값 plumb는 **소스가 없으므로 no-op** — payload에 email 키가 확인되기 전까지 정직한 상태는 "미확인"이며, 존재하지 않는 pass-through를 주장하지 않는다.
6. **위험 chip에 freshness 동반**(`구독 만료 D-18 · NEO 2시간 전`). ⚠️ "두 갈래 통일"은 **비범위** — 드로어 위험은 이미 deriveServiceRisk 단일 파생이다(2차 fork 없음 확인). 실제 잔여 델타는 (5) email 폴백과 (6) freshness 라벨 부착 둘뿐.
7. **헤더 액션 정직화:** `콜`=실제 tel:, `견적/활동기록`=focusSection 스크롤점프이므로 quiet "jump to" 스타일로 강등하거나 실제 composer 포커스로 변경.

### 2.4 내비 / IA (`CrmSubnav.tsx`, `AdminCommandPalette.tsx`)

**현재:** 6탭 불변식 준수(✓). `돈흐름` sub-tab이 거짓말 — `오더·설치`(`deals/orders/page.tsx`)→Partner `PortalHome`, `KPI`(`deals/kpi/page.tsx`)→`PartnerWorkspacePageClient`. 활성 링크에 `aria-current` 없음(색상만). 팔레트 COMMANDS(33개, 운영/성장/지원/분석/시스템 전역)가 라이브 IA와 드리프트 — **통합고객/기록/인사이트/매칭/deals-orders/deals-kpi 누락**.

**개선:**
1. **`돈흐름` sub-tab 라벨 거짓말 수정.** 1차는 **라벨 현실화만**(`매출` / `파트너 포털` / `파트너 워크스페이스`) — zero-redirect, 저위험. ⚠️ `resolveDealsSub`(`CrmSubnav.tsx:135-136`)가 `/deals/orders`·`/deals/kpi`·`/partners/*` 별칭을 함께 매핑하므로, 라벨 변경 시 **이 resolver도 lockstep으로 갱신**(active-state 깨짐 방지). 실제 오더·KPI 페이지 신설 + partner 라우트 재배치는 후속(§5).
2. **`aria-current="page"`를 활성 primary 탭·sub-tab에 추가**(시각 변화 0, SR/키보드 "you are here").
3. **팔레트 COMMANDS에 누락 CRM 6개 라우트를 리터럴로 추가**(통합고객/기록/인사이트/매칭/deals-orders/deals-kpi) + `⌘K` 칩. ⚠️ 팔레트는 **전역**(CRM 외 캠페인·블로그·하드웨어·설정 포함)이므로 "CrmSubnav 배열에서 파생"은 전역 팔레트를 CRM-only로 truncate시킨다 — **1차는 리터럴 추가만**. 배열 파생은 후속에서 **CRM 그룹 slice에만** 한정 적용.

### 2.5 돈흐름 (`app/admin/crm/deals/page.tsx`)

**현재:** read-only 매출·정합 대시보드. 8-stage taxonomy(`lib/portal/repositories/overview.ts`)는 있으나 보드는 0. 행 액션 0. 헤더 4개 동급 sync 버튼(`외부 CRM`/`강제 CRM` 불투명). div-bar 차트가 **KRW/CNY 혼합**(데이터 정합 결함).

**개선:**
1. **돈흐름 1차 정체성 = 매출/정합 read 뷰 유지.** 행에서 360 drawer를 여는 것까지만 1차 범위. stage **칸반·drag-to-advance는 후속·옵트인**(§5, canon Deal Lite 미승인).
2. **div-bar 차트 KRW/CNY 통화 혼합 분리**(C-CUR, 후속 작은 행) — 혼합 막대는 cosmetic이 아니라 데이터 정합 결함이므로 별도 추적. 매출 dedup 철칙(통화 혼합 합산 금지)과 동일 선상.
3. **(후속) sync 컨트롤을 단일 `Sync` overflow 메뉴로** 강등 + 이름 명확화.

### 2.6 인사이트 (`CrmInsightsClient.tsx`)

**현재:** 4 KPI 타일(비인터랙티브) + 3 flat link-list(인라인 액션 0). 떠나야 처리 가능.

**개선 (후속):** 리스트 항목 actionable화(오너·상대 기한·severity 정렬·인라인 call/assign/snooze/dismiss) + KPI 타일 클릭→리스트 필터. 지사장 주간 점검은 개인 랭킹 아닌 막힌 고객·놓친 액션 우선(canon §10).

### 2.7 기록 (`CrmActivityClient.tsx`)

**현재:** 좌측 항상-펼침 capture form. 우측 flat 카드 stack. **next-action은 display-only.** `done` boolean은 존재하나(`CrmActivityClient.tsx:43`) `CrmEventNextAction`의 **임베디드 서브객체** — 자체 id 없음(key=`${event.id}-${action.title}`), events route는 GET/POST만(PATCH 없음). 즉 단일 next-action done 토글을 쓸 **엔드포인트가 없다.**

**개선:**
1. **next-action done 체크박스는 backend-shaped — 후속.** 1차에서 "체크박스 = 간단 UI"는 **거짓**(쓸 곳이 없는 체크박스). 후속에서 (a) next-action에 stable id + PATCH 엔드포인트를 주거나 (b) next-action을 `crm_tasks`로 모델링한다. 대신 **이미 mutable한 닫기 가능 표면**(우선순위 큐 task-done, `/api/admin/crm/tasks/{id}` 경유)에서 act-in-place를 1차로 제공한다 → C-NEW.
2. **(후속) timeline화:** 날짜 sticky divider + 긴 본문 "more" 접기.
3. **(후속) capture form progressive-disclose by mode** + 활성 필터 칩 + 결과 카운트.

---

## 3. 공통 시스템 (cross-cutting acceptance criteria)

Section 3 항목은 **독립 작업이 아니라 1차 웨이브 항목 내부에서 충족되는 횡단 기준**이다:
- **밀도/타이포:** default-compact(comfy 미배송), Inter 13–14px, tabular-nums, `1px solid rgba(0,0,0,0.08)` 보더, 컬렉션은 "N개 then 더보기" 캡. → C2/C3에서 적용.
- **색상/상태:** DESIGN 팔레트만, `#084734` 한 화면 1점, 위험=pastel pill, provenance 3분류(ClassIn/NEO/Derived) + freshness, 없는 NEO는 `미확인`(숨김 금지). → C5/C6에서 적용.
- **속도:** spinner → data-shaped skeleton 행 — **C1(검색)·C2(큐/매출) 표면에 skeleton 적용을 수용 기준으로 명시.** optimistic + 백그라운드 revalidate + 실패 toast 롤백(이미 큐에 존재).
- **키보드/⌘K:** **한글 초성 fuzzy match를 C7이 만지는 팔레트 필터에 포함**(현재 `includes` 단순 매칭 → 초성 매칭 추가). j/k 드로어 순회는 후속.

---

## 4. 1차 구현 웨이브 (즉시 · high-impact · low/med effort · canon-safe · 기존 데이터로 닫힘)

**우선순위 논거(사용자 #1 ask = operator 속도 + 컴팩트):** 가장 thesis-정렬된 패턴은 "큐를 리스트→처리면으로" 전환하는 것이다. 그 full 큐러너는 [L](백엔드 신설)이라 후속이지만, **cheap 80%는 1차로 당긴다(C-NEW)** — 큐 행은 이미 optimistic POST를 갖고 있어 인라인 Complete/Snooze가 runner chrome 없이 day-one에 동작한다. 이것이 후속 칸반보다 leverage-per-effort가 높은 이유: 칸반은 새 뷰 레이어+drag 인프라+canon 승인 대기인데, 인라인 처리는 기존 엔드포인트로 즉시 "이동 없이 처리"를 준다.

1. **C-NEW — 큐 행 인라인 Complete/Snooze** (큐를 리스트→action engine, cheap 80%). 기존 optimistic POST 재사용, runner/Suggested 엔진 없음. canon §3.1/§8 act-in-place. **[S]**
2. **C1 — 홈 인라인 검색** (`CrmCustomerPicker` 마운트 → key 어댑터 → 360 drawer). canon §4.2, 신규 백엔드 0. **[S]**
3. **C2 — 현황 재배치 + NeoKPI 3중 렌더 통합** (큐 전폭 승격, 매출=머니플로 strip 1개, 기간 delta는 토글로·매트릭스는 아코디언으로 보존). canon §4/§11. **[M]**
4. **C3 — 큐 compact 캡 상향 + overflow** (`limit` 인자 상향 + "+N건 전체 보기"). **[S]**
5. **C4 — 드로어 add-form 접기 + 타임라인/composer 상단 승격 + 이벤트 load-more + dirty 가드**. canon §3.1. **[M]**
6. **C5 — 드로어 `이메일 미확인` 폴백 + 위험 chip freshness 라벨** (email plumb는 소스 부재로 비범위; 위험 통일은 이미 단일 소스라 비범위). canon §8/§7.1. **[S]**
7. **C7 — 팔레트에 누락 CRM 6개 라우트 리터럴 추가 + 초성 fuzzy + `aria-current` + `⌘K` 칩** (전역 팔레트 truncate 금지). **[S]**
8. **C8a — 돈흐름 sub-tab 라벨 정직화 + `resolveDealsSub` lockstep 갱신** (zero-redirect). **[S]**
9. **C9 — 고객 리스트 drawer `?account=` URL 동기화** (prefixed key 네임스페이스). **[S]**

---

## 5. 후속 웨이브

- **C8b — 실제 오더·KPI deals 페이지 신설 + partner 라우트 재배치 + redirect 스텁** (`resolveDealsSub` partner-path 갱신). **[L]**
- **C6-be — 기록 next-action done:** stable id + PATCH 엔드포인트 또는 `crm_tasks` 모델링. **[M]**
- **F2 — HubSpot 큐러너** (`Start N tasks` 자동 advance + Suggested Tasks). Suggested는 operator-authored task와 **시각 구분 + `Derived` 태그 + dismiss 가능**, 자동 advance는 매니저가 명시적으로 `Start`를 눌렀을 때만 동작. **[L]**
- **F1 — 돈흐름 stage 칸반(옵트인 보조 토글)** + confirmed-only subtotal + 행 액션. **1차 뷰는 매출 rollup 유지**, drag-to-advance는 Deal Lite 명시 승인 후. **[L]**
- **F3 — 고객 풀페이지 레코드** (`/admin/crm/customers/[key]`). **모바일 단일 컬럼 stack 반응형 계약 명시, 2–3컬럼은 데스크톱 한정 진보적 향상.** 드로어가 명백히 부족하다는 사용성 신호 확인 후 도입. **[L]**
- **F4 — 인사이트 actionable 리스트 + KPI→필터 드릴.** **[M]**
- **F5 — `crm_service_risk_snapshots` read model + 홈 위험 집계 strip.** strip은 이 read model 영속화에 **의존**(그 전 전수 derive 금지). 집계 카운트는 `deriveServiceRisk`가 실제 산출하는 **절대 잔액 reason code(`depleted_balance`, `balance<=0`)에만** 묶고, "30일 내 소진 예상" 등 예측 라벨은 `predicted_depletion`이 실제 생기기 전까지 카운트 표면에서 제외(canon §6.2/§10). migration+RLS+policy 동반. **[L]**
- **C-CUR — 돈흐름 div-bar KRW/CNY 통화 분리** (small-multiples 또는 Recharts grouped). 데이터 정합 결함. **[M]**
- **고객 리스트 인라인 편집-온-호버 + saved-view 칩 / 기록 timeline 그룹 / sync overflow 메뉴.** **[M]**

---

## 6. 비범위

- 7번째 top-level 탭 / 새 독립 페이지 (하드 불변식; 새 표면은 sub-tab→drawer→modal).
- IndexedDB 풀 로컬-퍼스트 싱크 엔진 (cheap-80% optimistic만).
- Salesforce식 무거운 stage·required-property 게이트·page-layout/Canvas 빌더·App Launcher.
- weighted-total / balance_ratio / predicted_depletion (분모 불명확 — deferred, balance≤0 소진만).
- surveillance auto-capture(이메일 오픈·웹방문·통화시간 강제) · 개인별 감시 랭킹 화면.
- HQ 실시간 양방향 write-back (read-mostly 공식 원천 유지).
- 첫 화면을 막는 위험 전수 derive(read model 전까지 집계 strip 금지).
- comfy 밀도 토글 / per-user 위젯 그리드 대시보드 / 다중 render mode.