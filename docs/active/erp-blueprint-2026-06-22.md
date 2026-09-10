# 지사 운영 OS(ERP) 청사진 & 실행 로드맵

기준 시점: 2026-06-22
상태: 기획(승인 대기) — 본 문서는 이 이니셔티브의 **로드맵 단일 문서**다.
출처: FY26-27 팀 사업계획(BD/사업개발 · MKT/마케팅 · CSM/고객성공 · CS/기술지원)을 현재 어드민 코드와 대조해 도출.

---

## 0. 한 줄 결론

새 탭을 늘리는 게 ERP가 아니다. **흩어진 3개 장부(구글시트 목표·실적 / Portal V2 딜 / 샤오셔우이·NEO 리뉴얼)를 하나의 학원(Account) 360 스파인으로 합치고, 팀 매출이 한 번만 집계되게(이중계상 제거) 하고, 그 위에 "오늘 할 일"을 띄운다.** 8명이 25명처럼 일하게 만드는 레버리지.

이 OS가 가장 먼저 비춰야 할 두 실존 리스크:
- **HW 매출 상위 10개사 = 전체 ~70% 편중** (HW 단독 상위10 = 77.55%)
- **SW 활성화 ~12%** (과사람 97대 도입, 사용 12대) — 우리는 HW를 팔지만 장기 수익은 SW 활성화·리뉴얼에서 난다.

---

## 1. 현재 상태

### 이미 있는 것 (어드민 ≈ ERP의 60%)
- `/admin/crm/**` — Portal V2 파이프라인(contact→quote→contract→confirmed→installation→payment→closed), 딜 테이블, 퍼널
- `/admin/branch/**` — 팀별 KPI 스코어카드(LD/ACC/OPP/SOL/VST 목표vs실적), 매출 게이지, HW 재고, 지역 히트맵, 데이터 품질
- `/admin/analytics/**`, `/admin/marketing/**` — 리드 퍼널·소스·콘텐츠·캠페인, MQL→SQL, 채널 기여
- 샤오셔우이/NEO 야간 싱크(`external_crm_records`), `crm_source_links`(아이덴티티 매칭, 자동확정 0.92), 이벤트 로깅(`client_events`)
- `/admin/calendar` — 멀티소스 머지 캘린더([lib/calendar-data.ts](../../lib/calendar-data.ts): 팀 JSON + 파트너 + 공개행사)

### 빠진 것 = "통합"
OKR/목표(구글시트에만 존재), 예산/집행, 학원 360 통합 뷰, 리뉴얼 캘린더·헬스등급, **팀 간 매출 귀속(이중계상)**, 거점 관리, KA 케이스 라이브러리, CS 티켓 영속화.

### ⚠️ 키스톤 리스크
스파인·귀속·HW→SW·리뉴얼이 전부 `crm_source_links` 매칭에 의존한다. **커버리지가 낮으면 스파인이 매출 절반을 조용히 누락한다. → 무엇보다 먼저 커버리지를 측정한다.**

---

## 2. 목표 아키텍처 (린 버전)

원칙: **자동 산출 우선, 수기 입력 최소.** 입력할 명시 오너가 없는 테이블은 만들지 않는다. (1~3인 팀에서 수기 필드 = 미래의 데이터 공백)

- **스파인**: `account_master`(읽기 뷰) — `customers` + `branch_rev_deals` + `external_crm_records`를 `crm_source_links`(status=confirmed)로 조인. 한 학원 = 생애 CNY, HW 대수, SW 활성, 만료일, 헬스등급, 오너, 귀속 체인.
- **귀속**: `branch_rev_deals`에 자문형 `{team: pct}` jsonb 1컬럼 + 리포트단 합산 검증. **하드 차단 금지**(100/0으로 우회·게임됨). 정책 단일 오너 1명.
- **목표**: `branch_kpi_targets`로 이관(시트 → DB), `pacing.ts` DB 우선 읽기 + 시트 체크섬 폴백.
- **모듈**(전부 스파인 위 뷰): 리뉴얼/헬스(CSM), 거점(BD), 예산(BD·MKT), 케이스 라이브러리(CSM·BD), CS 티켓(CS).

준수 규칙(MEMORY): 모든 스키마 변경 = `supabase/migrations/` 마이그레이션 파일 필수 · 어드민 API는 `createSupabaseAdminClient()`(RLS) · `app/api/admin/**`는 `verifyAdmin()` · 재무/귀속 테이블은 deny-all RLS(20260416 패턴), 운영 테이블은 `is_active_admin()`.

---

## 3. 실행 TODO (Phase별)

> 효과/노력 표기: **S**=하루 이내, **M**=수일~1주, **L**=수주. `[MIG]`=마이그레이션 필요.

### Phase 0 — 무마이그 퀵윈 + 키스톤 측정 (지금)
- [ ] **(S) `crm_source_links` 커버리지 지표** — verified/needs_review/unmatched %(매출보유 학원 기준)를 `/admin/crm/matching` 또는 `/admin/overview`에 노출. *모든 통합 숫자의 신뢰 전제. 가장 먼저.*
- [ ] **(S) 골든타임 24h 노출** — CRM 데이터에서 계산해 `/admin/crm` 액션밴드에 24h 카드를
  노출한다. 폐기된 `unresponded_24h` Webhook 상태와 `lead-response-alerts` 발송 모듈에 의존하지 않는다.
- [ ] **(S) 파이프라인 커버리지 타일** — open 파이프라인 ÷ (목표−확정), 2.0배 미만 빨강. `/admin/branch` CoreKpiGrid + `/api/admin/branch/summary`.
- [ ] **(S) HW 218세트 진척바 + Direct YoY 라벨** — `branch_hw_outbound`/`by_channel` 이미 적재. HardwareSection·DealMixSection.
- [ ] **(M) 채널 리드 KPI(UTM 정규화)** — analytics 소스 그룹핑을 자유문자 source → `utm_source/utm_medium` 채널(meta/naver/kakao/youtube/google)로. 목표 Meta20/N15/K10/Y5 대비. (leads UTM 컬럼 존재 → 무마이그)
- [ ] **(S) 콘텐츠/행사 목표선** — 블로그 48편/년, 행사 12회/년 진척. BlogPost·PublicEvent 카운트 이미 라이브.
- [ ] **(M) 챗봇 CS 자동종결 카드** — `getChatbotStats`에 `csAutoResolvedCount`/24h내 재문의 판정 추가 → `/admin/chatbot` 'CS 자동화' 블록.
- [ ] **(M→연동) 마케팅 노션 캘린더 ↔ 어드민 캘린더 라이브 연동** — §4 참조. *Supabase 백업 없음.*

### Phase 1 — 스파인 (키스톤, 이후 전부 여기서 읽음)
- [ ] **(L) Account 360 읽기뷰** — `account_master` 뷰 + `GET /api/admin/account/[id]` + 계정 리스트. `NeoCrmCustomersClient`에 통합 렌즈. unmatched는 'needs link'로 표시(절대 0으로 합치지 않음). `[MIG]`(뷰)
- [ ] **(M) 리뉴얼 캘린더 v1** — 기존 `external_crm_records.expireAt` 위 월별 D-90/60/30 뷰. 신규 `/admin/crm/customers/renewals`. *CSM 최대 ROI, 무마이그.*

### Phase 2 — 숫자 신뢰 (이중계상 정지 + 시트 강등)
- [ ] **(M) 귀속 1컬럼(자문형)** — `branch_rev_deals` ALTER `attribution_split jsonb` + `contributing_team`, 합산 경고(차단 X), `/admin/crm/matching` 리콘실 뷰. `[MIG]`
- [ ] **(M) `branch_kpi_targets`** — REV/HW_SETS/LD/ACC/OPP/VST/SOL 목표 DB화, `pacing.ts` DB 우선 + 시트 체크섬 폴백. 시트는 점진적 import-only로 강등. `[MIG]`

### Phase 3 — CSM/전략
- [ ] **(M) HW→SW 30일 활성화 리스트** — 설치일(`InstallationEvent`/`branch_hw_outbound`) → 30일 내 SW활동(`lastClassAt`). 'Early Success at risk'. *과사람 12% 직접 공략.*
- [ ] **(M) `customer_csm_profile` A/B/C 헬스** — 자동 신호 3개만(storage>0, lastClass, balance). login/class 카운트 컬럼은 **만들지 않음**(데이터 부재, HQ 소관). `[MIG]`
- [ ] **(M) `customer_transfers`** — 자동이관 후보(소비<1000 CNY/yr + age>365) 플래그 → 원클릭 확인(80/20). 자동 재배정 금지. `[MIG]`
- [ ] **(M) Morning Brief v1** — 결정론적 액션카드 2종(BD 골든타임, CSM D-30 무접촉 리뉴얼). LLM은 문구만. `/admin/overview`.

### Phase 4 — 모듈 (수기 최소)
- [ ] **(M) BD 거점(21곳) + 레퍼런스→소개 1:2 엔진** — `bd_territory` + `bd_referral`(crm_source_links 재사용). 히트맵 탭. `[MIG]`
- [ ] **(M) 예산/집행** — 단일 `marketing_spend`(category=media|agency|tool|travel로 MKT+BD 출장 통합). 별도 bd_expense/bd_budget은 보류. 채널 CPL/집행률. `[MIG]`
- [ ] **(M) 케이스 라이브러리** — `case_studies`(case_study|course_template|ka_proposal). docs 에디터 패턴 재사용. CSM Content KPI(24+6). `[MIG]`

### Phase 5 — CS
- [ ] **(M) `cs_tickets` 영속화** — `data/channel-conversations.json` → Supabase. category·first_response_at·hq_escalated·is_revenue_linked·deal_id. *현재 JSON은 서버리스 비영속 = 실제 데이터 유실 버그.* `[MIG]`
- [ ] **(M) CS 스코어카드** — branch teams enum에 'CS' 추가하되 **월간 funnel 페이싱 엔진에 욱여넣지 말 것**(분기·정성 지표). 전용 `/api/admin/cs/summary`. `roadmap`(team=CS)로 분기 이행률.
- [ ] **(S) 온보딩/HW 커버리지 패널** — `docs_articles`(product_area in onboarding/hardware) 집계. `/api/track/event` ALLOWED_EVENTS에 `view_onboarding_video`/`complete_onboarding_course` 추가(allowlist 누락 시 무음 드랍).

### Vision (FY27+)
전 직군 Morning Brief · 편중/활성 레이더 · 목표 100% DB화(시트=읽기전용 과거) · 검증 후 "ClassIn Branch OS"를 과사람급 대형학원에 외부 제품화.

---

## 4. 마케팅 노션 캘린더 ↔ 어드민 캘린더 라이브 연동 (확정 방향)

**결정: Supabase 복제 없음.** 노션이 마케팅 캘린더의 system-of-record로 남고, 어드민은 `NOTION_API_TOKEN`으로 **직접 읽어 표시만** 한다(읽기전용). 이미 [lib/calendar-data.ts](../../lib/calendar-data.ts)가 멀티소스를 머지하므로 **4번째 소스 추가**로 끝난다.

소스 노션 DB: `Marketing Operations Calendar(마케팅 캘린더)` — 컬럼 Name(title)/Date/Status(기획·제작중·컨펌중·배포대기·완료)/Channel/Content Type/Person in Charge/분기/선행·후속 작업. DB id `2b29585602f9806bbef0e250df7df14d`.

### 구현 단계
- [ ] **(S) env** — `NOTION_API_TOKEN`(이미 `.env.local`에 존재) + `NOTION_MARKETING_CALENDAR_DB_ID` 추가. 토큰은 서버 전용(절대 클라이언트 노출 금지, `NEXT_PUBLIC_` 금지).
- [ ] **(M) `lib/notion-marketing-calendar.ts`** — 서버 전용. 노션 DB query → `CalendarEvent`로 매핑:
  - Name→`title`, Date→`date`(+ endDate), Status→`description`/배지, Channel·Person→`assignees`/`description`, 노션 페이지 URL→`href`.
  - `source: "notion"`, `sourceLabel: "마케팅(노션)"`, `readonly: true`.
  - **인메모리 TTL 캐시(~5분)** 로 레이트리밋 보호. 실패 시 빈 배열(다른 소스와 동일한 graceful 패턴).
- [ ] **(S) `lib/calendar-data.ts` 확장** — `EventSource` 유니온에 `"notion"` 추가; `getAllEvents()`/`getEventsByMonth()` 머지에 노션 소스 포함(읽기전용이라 create/update/delete 경로는 손대지 않음).
- [ ] **(S) `app/admin/calendar/page.tsx`** — `SOURCE_FILTERS`에 `마케팅(노션)` 칩 + 색/타입 매핑. 읽기전용이라 편집 다이얼로그 비활성(클릭 시 노션 href로 이동).
- [ ] **(S) 신뢰성** — 노션 장애/토큰 만료 시 캘린더의 다른 소스는 정상 표시(부분 실패 격리). 선택: 수동 "새로고침"으로 캐시 무효화.

### 명시적 비범위
- Supabase 테이블/백업 없음. 양방향 쓰기 없음(노션→어드민 읽기만). 콘텐츠 status 편집은 노션에서.

---

## 5. 거버넌스 결정 (CEO 확정 필요)

빌드가 흔들리지 않으려면 아래 3가지를 먼저 못 박아야 한다.

1. **매출 book-of-record** — 돈은 `branch_rev_deals`(시트 싱크), 단계는 Portal 딜. (미확정 시 통합 포캐스트가 두 숫자를 보임)
2. **귀속 정책 단일 오너 + 자문형** — 30/70·70/30·80/20·50/50·100 판정자 1명. '주는 건/받는 건'은 팀마다 반대로 태깅 가능 → 자문형 + 리포트 검증.
3. **목표 소스 단일화** — 시트 → `branch_kpi_targets` 이관. (둘 다 쓰기 가능하면 그게 바로 없애려던 이중장부)

---

## 6. 하지 말 것 (과설계 컷)

- ❌ 풀 귀속 원장(`attribution_entries`+정책테이블+sum100 하드차단, 15개 신규 테이블) → 자문형 1컬럼으로 대체
- ❌ A/B/C에 `login_6mo`/`class_open_3mo` 컬럼 → 데이터 부재(HQ 소관). 파생 3신호만
- ❌ 노션 94행 캘린더를 Supabase로 복제 → §4 라이브 연동으로 대체(노션 유지)
- ❌ 오너 없는 수기 테이블(bd_activity_log·번역로그 등) 남발
- ❌ 처음부터 CRM/티켓/BI 재구축 → 기존 ~150 어드민 API·`crm_source_links` 확장

---

## 7. 부록 — 팀별 KPI → 어드민 배선 (요약)

| 팀 | 핵심 목표 | 어드민 배선 |
|---|---|---|
| BD | 6,011,255 CNY(HW80/SW20), 218세트, KA/SME 퍼널, 커버리지 2배, 거점 21 | branch 매출게이지·파이프라인(deals/branch_rev_deals 존재) + 커버리지 타일 + 거점 테이블(P4) |
| MKT | 200기관·SW 1.5M+α, 채널 리드 1,200/년, CPL≤$10, 콘텐츠 144·행사 12 | analytics 채널 KPI(UTM)·예산 탭·콘텐츠 목표선 + 노션 캘린더 연동(§4) |
| CSM | 1.0M CNY(SW40/HW60), 리뉴얼 80%+, 케이스24·템플릿6 | 리뉴얼 캘린더·A/B/C 헬스·이관/귀속·케이스 라이브러리(모두 Neo CRM 위) |
| CS | CS 부담 ▼25%, 당일해결 65→70%+, AI 1차 15-20% | 채널톡→cs_tickets·챗봇 자동종결·docs 온보딩/HW 커버리지 |

---

## 관련 문서
- [admin-growth-os-ia.md](../archive/admin-growth-os-ia.md) — 과거 어드민 정보구조 기록
- [crm-sheet-revenue-sync-plan.md](./crm-sheet-revenue-sync-plan.md) — 시트↔매출 싱크(목표 DB 이관과 직접 연관)
- [korean-crm-admin-integration-plan-2026-06-10.md](./korean-crm-admin-integration-plan-2026-06-10.md) — NEO/샤오셔우이 통합
- [branch-dashboard-development-log.md](./branch-dashboard-development-log.md) — 브랜치 대시보드 개발 로그
- [architecture-schema-erd.md](./architecture-schema-erd.md) — 스키마/ERD 입구
