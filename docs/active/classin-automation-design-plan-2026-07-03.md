# Classin 자동화·데이터화·가속 설계 기획서

> **생성일: 2026-07-03**
> **상태: 기획(설계) 단계 — 구현 아님.** 이 문서는 "무엇을 어떻게 설계할지"의 청사진이며, 실제 코드·테이블·라우트를 변경하지 않는다.
> **선행 순서: 데이터화 파운데이션(척추) 먼저 → 켜기 → 최적화 → 가속.** 6개 워크스트림 병렬 착수를 금지하고, 공통 데이터 계약을 CI로 못박은 뒤에만 영역별 자동화를 켠다.
> **아키텍트 판단 원칙:** 설계(A)와 비평(B)이 충돌하면, 실측 코드베이스 대조 결과를 최종 근거로 삼아 아키텍트가 결론을 내린다. 아래 §0.4는 비평이 사실과 어긋난 지점까지 교정한 "정본 사실표"다.

---

## 0. 목적 · 범위 · 설계 원칙

### 0.1 목적
Classin의 8명 운영팀이 "25명처럼" 일하도록, **감(感)으로 돌던 운영을 기준(데이터)으로 전환**하고, 반복 판단을 룰엔진 자동화로 걷어내며, 사람 시간을 판단·승인·통화에만 쓰게 하는 것. 핵심은 새 기능을 늘리는 것이 아니라 **"이미 배선된 것을 켜고, 안 보이던 숫자를 보이게" 하는 것**("만들지 말고 켜라").

### 0.2 범위
- **포함:** SW 활성화·LTV(W1), 리드·세일즈 파이프라인(W2), 마케팅 자동화(W3), 콘텐츠 플라이휠(W4), 데이터 파운데이션(W5), 운영 지휘 루프(W6).
- **제외(이 문서에서 결정하지 않음):** 신규 제품 기능, EDB MAKER(별개 프로젝트), 하드웨어 인벤토리 재설계(별도 트랙).
- **표면:** `/admin/*`, 공개 `/`·`/l`·`/docs`, 공유 `/share/{quote,contract}/[token]`, 포털/어드민 흡수 API.

### 0.3 설계 원칙 (7대 철칙)

| # | 원칙 | 구체 강제 방식 |
|---|------|----------------|
| P1 | **SSOT (Single Source of Truth)** | 지표·룰·통화 포맷은 각 1곳에만 정의. 산식 1곳 수정 → 전 표면 반영. `formatCNY` 3중복 같은 파편화 재발 금지. |
| P2 | **룰엔진 우선, LLM은 문안 보조만** | 우선순위·분류·게이트·의사결정은 결정론적 룰. LLM은 이메일/문서/캠페인 초안 문구 생성에만. 자동 발송·자동 게시 절대 금지. |
| P3 | **Human-in-the-loop** | deal 매칭·계약 전환·대표 서명·가중치 반영·콘텐츠 게시·발송은 **항상 사람 원클릭**. 자동은 후보 생성·집계·랭킹까지만. |
| P4 | **통화 규범** | 딜=KRW · 오더=USD · 매출=CNY. grand-total 혼합 절대 금지. 금액 지표 행에 `currency` 동반 필수(데이터층 CHECK). |
| P5 | **감 → 기준** | 목표·임계는 계측이 선행. 계측 없는 목표(예: W1 "12%→40%")는 "가정"으로 명시 마킹하고 표본 축적 후 확정. |
| P6 | **오너 없는 테이블 금지** | 신설 테이블마다 소비 화면을 함께 붙인다. 고아 테이블·중복 테이블(예: crm_tasks vs inbox_items) 금지. |
| P7 | **무음 실패 금지** | 게이트에 걸린 이벤트·커버리지 결손·미매칭은 "조용히 0행"이 아니라 격리·경고·별도 카드로 노출. |

### 0.4 정본 사실표 — 비평(B) 교정 포함 (실측 대조 결과)

비평(B)은 대부분 정확하나, **가장 치명적이라던 #1 주장은 실측 결과 틀렸다.** 아키텍트로서 이를 교정한다.

| 주장(출처) | 실측 검증 결과 | 아키텍트 판정 |
|-----------|----------------|---------------|
| **B: client_events에 anonymous_id/lead_id/user_id/session_id 컬럼 추가 마이그레이션 부재** | **틀림.** `20260615_public_material_downloads.sql` 86–90행이 `ALTER TABLE client_events ADD COLUMN IF NOT EXISTS anonymous_id/lead_id/user_id/session_id`로 **실제 추가함.** 인덱스도 92행+에 존재. | **비평 오류 확정.** 신원 컬럼은 존재. TS↔DDL drift 없음. **W2 Engagement·W5 identity·W6 stage_transition의 최우선 블로커는 해소된 상태.** 단, 백필은 여전히 필요(§4). |
| B: `event_id`가 client_events 컬럼으로 존재하지 않음 | **맞음.** `event_id`는 `analytics.ts` 97–109·204행에서 **params 내부로만** 배선됨. client_events에 전용 컬럼·UNIQUE 제약 없음. | **비평 정확.** 컬럼 승격 + UNIQUE 제약이 필요(dedup SSOT). 플러밍은 이미 있음(순신규 아님). |
| B: `consent_state` 컬럼 부재 | **맞음.** 어떤 마이그레이션·코드에도 client_events.consent_state 없음. 동의 게이트는 발화 시점 코드(`analytics.ts` 217·228·241)에만 존재 → 사후 감사 불가. | **비평 정확.** 컬럼 추가 필요. Engagement 분모 편향(§4.4) 정면 대응. |
| B: `lib/lead-scoring/` 미존재, W2는 "재보정"이 아니라 "구축" | **맞음.** `lib/lead-scoring/` 디렉터리 0건. 실존은 `lib/crm/priority.ts`(CRM 액션큐, 리드스코어링 아님). | **비평 정확.** **W2를 "최적화"에서 "구축" 워크스트림으로 재분류.** 캘리브레이션은 데이터 축적 후. |
| B: `crm_orders` write 코드 전무 | **맞음.** `crm_orders` create 마이그레이션·insert/upsert 코드 0건. | **비평 정확.** W1 편중·W6 매출 delta의 SSOT를 crm_orders로 잡을 수 없음. **과도기 정본 = `branch_rev_deals`+`external_crm_records`+`crm_source_links`.** |
| B(W4): chatbot_answer_events "스키마 미배포 가정" / B(W6): "이미 존재" | `20260421_z_chatbot_analytics.sql`로 **배포됨.** `service.ts`·`channel-handoff.ts`·`admin-docs.ts`가 SELECT 중. | **W6이 옳고 W4가 틀림.** W4는 "신규 계측"이 아니라 "스키마 확장(zero_result/csat 컬럼 추가)"으로 축소. |
| B: 이벤트 등록이 2곳이 아니라 3곳 | **맞음.** `EventNames` union(`analytics.ts`) + `ALLOWED_EVENTS` Set + `ALLOWED_PARAM_KEYS`(`track/event/route.ts` 25행). 3번째 누락 시 `sanitizeParams`(155행)가 params 전량 strip. | **비평 정확.** 6개 설계 전부 "2곳"→"3곳"으로 정정. §4 collector가 코드젠으로 단일화. |
| B: NEO 크론 `01:00 UTC` 앵커링 오류 | **맞음.** `vercel.json` 정본은 `10 1 * * *`(01:10 UTC). | **비평 정확.** 시각 하드코딩 대신 "크론 완료 이벤트 구독"으로 배선. |
| B: `crm_tasks` "Phase2 미승격" 서술 오류 | **맞음.** `lib/repositories/crm-tasks.ts` + `20260627_crm_tasks.sql` 실존. | **비평 정확.** crm_tasks가 액션 큐 스파인 정본. inbox_items 신설 대신 crm_tasks 확장. |
| B: `download_materials` 정본, W5의 `material_download` 리네임 제안은 파편의 진원 | **맞음.** `analytics.ts`·`materials.ts`·`lead-magnet-metrics.ts`가 `download_materials` 사용. | **비평 정확.** **W5의 리네임 제안 폐기.** wire명 동결, 필요 시 표시 alias만. |
| B: formatCNY 3중복 | **부분 확정.** `lib/crm/money-format.ts`(정본) + `lib/repositories/crm-unified-customers.ts`에 중복 존재 확인. | **비평 정확.** money-format.ts 단일화가 metric_definitions 신뢰성의 선례 리팩터. |

**결론(아키텍트):** 비평의 방향(공통 선행 먼저, 8명 규모 현실성, 무음 함정)은 전적으로 옳다. 다만 "identity 컬럼 부재"라는 최우선 블로커는 **이미 해소되어 있으므로**, Phase 0의 무게중심을 "컬럼 추가"에서 **"event_id·consent_state 2개 컬럼 + 3곳 계약 코드젠 + 백필/표본 기준선 + 통화 CHECK + 커버리지 측정"**으로 이동한다. 이는 로드맵을 1개 스프린트 앞당긴다.

**두 비평의 종합 판정:** 비평 A는 "낙관적 오독(이미 배선됨이 스키마 부재를 가림)"과 "50명 팀 전제의 비현실성"을 지적했고, 비평 B는 "명목상 척추 뒤의 파편화(W5가 오히려 리네임으로 신규 파편 유발)"와 "미구현 코드 위의 최적화 프레이밍(W2)"을 지적했다. 두 비평은 **동일한 근본 결함의 두 얼굴**이다 — 6개 설계가 "무엇을 만들지"는 정교하나 "무엇이 이미 있고 무엇이 아직 없는지"의 실측 지도를 공유하지 않았다. 본 기획서 §0.4 정본 사실표가 그 지도이며, 이 표를 CI 게이트로 굳히기 전에는 어떤 영역별 착수도 금지한다. 아키텍트가 비평과도 갈라지는 유일 지점은 **identity 컬럼 존재 여부**이며, 이는 실측이 최종 심판이다(20260615 마이그레이션 86–90행).

---

## 1. 데이터화 파운데이션 (척추) — 왜 이게 먼저인가

### 1.1 왜 척추가 선행인가 (병렬 착수 금지의 논증)

6개 설계는 서로의 데이터 자산에 의존한다. W2 Engagement·W3 attribution·W4 CTA→intent·W6 stage_transition·W1 헬스는 **전부 동일한 이벤트 스트림·아이덴티티 결합·지표 정의·통화 규범** 위에 선다. 이 공통 계약을 먼저 못박지 않고 8명이 6개를 병렬 착수하면:

- 각자 자기 테이블·자기 이벤트명·자기 지표식을 낳아 **formatCNY 3중복의 대규모 재현**(비평 확정 리스크).
- 신규 이벤트 params가 `ALLOWED_PARAM_KEYS` 미등록으로 **전량 stripped → 다운스트림 지표 전부 null**.
- 마이그레이션 충돌·RLS 누락·고아 테이블 필연(8명이 분기당 현실 착수량 3~5 테이블인데 25개+ 요구).

따라서 **파운데이션(W5)은 명목상 척추가 아니라 하드 선행 게이트**다. 아래 5개 계약이 CI로 강제되기 전에는 영역별 스키마 증설을 금지한다.

### 1.2 5대 공통 계약 (sharedFoundation)

| 계약 | 내용 | 현 상태(실측) | Phase 0 작업 |
|------|------|--------------|--------------|
| **C1 통합 이벤트 택소노미 + 3곳 계약** | 명명규약 동결(기존 wire명 유지), `EVENT_CONTRACT`(event_name→required params 화이트리스트) 신설, EventNames·ALLOWED_EVENTS·ALLOWED_PARAM_KEYS 3곳을 **1소스에서 코드젠**, CI가 drift를 fail | 3곳 수동 등록, drift 위험. event_id는 params로만 배선 | EVENT_CONTRACT 테이블+코드젠 도입. `SELECT event_name,count(*)` 실측 사전으로 union drift 노출(퀵윈) |
| **C2 아이덴티티 그래프** | cln_aid↔lead_id↔user_id↔customer_account_id 결정적 결합의 물리 그래프. 리드스코어·헬스·attribution·리마케팅이 재사용 | client_events 신원 컬럼 **존재(20260615)**, `lib/identity/stitch.ts` 결합 로직 가동, `identity_stitch_logs` 감사 존재. 명시 그래프 테이블은 없음 | `identity_graph`는 **append-only 감사가 아니라 resolve 결과 상태 테이블**로(아키텍트 판정, §1.4). edges는 감사 로그로 별도 |
| **C3 지표/시맨틱 레이어** | `metric_definitions`(metric_key→formula→grain→owner_area→currency→guardrail) SSOT. 홈·CRM개요·행사funnel·브리프가 같은 formula 참조 | 지표식이 코드 산발, formatCNY 중복 | money-format.ts 단일화(선행 리팩터) → metric_definitions 스캐폴드 |
| **C4 통화·동의·PII 강제층** | currency ENUM(USD/CNY/KRW) NOT NULL CHECK + grand-total 단일통화 CHECK. consent_state 컬럼으로 사후 감사. raw IP → sha256 | 통화 게이트 없음(런타임만), consent 발화 시점만, ip 원문 미저장이나 규범 없음 | client_events에 `consent_state jsonb`·`event_id uuid` 추가, 금액 컬럼 currency CHECK |
| **C5 커버리지 키스톤** | `source_link_coverage_pct`를 metric_definitions에 등재, 데이터-헬스 배지 상시 노출. 미달 시 매출·편중 지표를 "착시(NOT_TRUSTED)"로 마킹 | `crm_source_links` 존재(20260610), 커버리지 측정 뷰 없음 | 커버리지 측정 뷰 + 헬스 배지(퀵윈) |

### 1.3 통합 이벤트 택소노미 (동결된 wire명 기준)

**규약: wire명 절대 변경 금지, 필요 시 표시 alias만.** W5의 `material_download` 리네임 제안은 폐기.

| 이벤트(wire명) | 상태 | required params(EVENT_CONTRACT 예시) | 소비 워크스트림 |
|----------------|------|--------------------------------------|-----------------|
| `download_materials` | 정본 존재 | anonymous_id, lead_magnet(slug), sourceDetail | W3·W4 |
| `submit_demo_request` | 등록 필요(3곳) | anonymous_id, source, consent_state | W2 |
| `view_demo_video` | 등록 필요 | anonymous_id, video_id | W2·W4 |
| `page_view`(/pricing) | 등록 필요 | anonymous_id, page | W2 |
| `public_quote_view` / `_review_confirmed` / `_accepted` | activity_logs SSOT | quote_id, version_id | W2 |
| `email_sent/open/click/bounce/unsubscribe` | 신규(발송 언블록 후) | subscriber_id, campaign_id, event_id | W3 |
| `sequence_enter/step_sent/exit` | 신규 | lead_id, sequence_id, step_no | W3 |
| `chatbot_answer_events`(zero_result·csat) | **배포됨(20260421)**, 컬럼 확장 | question, segment, is_zero_result, csat | W4·W6 |
| `stage_transition` | 신규 | from, to, latency_ms | W6 |
| `sw_class_started`(있으면) | EEO 텔레메트리 의존 | account_key, class_at | W1 |

### 1.4 아이덴티티 그래프 — 아키텍트 판정 (스냅샷 vs 실시간 그래프 충돌 해결)

비평은 "append-only 감사 그래프면 매 요청 순회 → CRM 스냅샷 RPC 원칙과 성능 충돌"을 지적했다. 아키텍트 결론:

- **`identity_graph`는 resolve 결과 상태 테이블(1 계정 = 1 행, 최신 결합 결과)로 둔다.** 조회는 단일 행 lookup — 그래프 순회 없음. 스냅샷 원칙과 정합.
- **`identity_edges`는 append-only 감사 로그로 분리.** 결합 이력·confidence·source만 기록, 실시간 조회 경로에서 제외.
- stitch.ts는 이미 결정적 결합(검증 이메일)을 수행 → 그 결과를 identity_graph에 upsert하는 얇은 어댑터만 추가. **그래프 DB 도입 아님**(8명 팀에 운영 부담 없음).

### 1.4.1 EVENT_CONTRACT 스키마 설계 (코드젠 1소스)

3곳 수동 등록의 drift를 없애기 위해 계약을 1개 소스로 못박고 나머지를 파생시킨다. 제안 스키마:

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `event_name` | text PK | wire명(동결, 리네임 금지) |
| `required_params` | text[] | 없으면 collector가 reject |
| `optional_params` | text[] | ALLOWED_PARAM_KEYS 파생 소스 |
| `internal_only` | bool | INTERNAL_ONLY_EVENTS 파생 |
| `consent_required` | enum(none/analytics/marketing) | 동의 게이트 파생 |
| `owner_area` | text | 단일 오너(무주공산 이벤트 금지) |
| `schema_version` | int | 계약 변경 이력 |

코드젠 파이프: `event_contract` 테이블(또는 TS 상수) → (a) `EventNames` union, (b) `ALLOWED_EVENTS` Set, (c) `ALLOWED_PARAM_KEYS` map을 빌드타임 생성. CI가 3 산출물과 소스의 drift를 `--max-warnings=0`로 fail. **이로써 비평이 지목한 "누가 3곳에 등록하는가"의 단일 오너 부재가 구조적으로 해소된다** — 오너는 `owner_area`, 등록은 1행 추가.

### 1.4.2 아이덴티티 결합률 측정 (신규 테이블 없이 즉시)

`identity_stitch_logs.action` 분포(noop/explicit_lead/verified_email/anonymous_only)가 그래프 건강도의 프록시다. 익명 세션 중 lead 결합률, lead 중 customer 결합률을 `SELECT action, count(*)`로 즉시 타일화(퀵윈). ERP 블루프린트가 지목한 "매출 절반 무음 누락"의 근인인 `crm_source_links` 커버리지도 여기서 교차 측정.

### 1.5 통화·동의·RLS

- **통화:** 모든 금액 지표 행에 `currency ENUM('USD','CNY','KRW') NOT NULL`. grand-total 시 단일 통화 CHECK. 화면은 방어 코드 대신 데이터층 CHECK를 신뢰.
- **동의:** client_events에 `consent_state jsonb`(marketing/analytics) 추가. **§4.4 편향 경고:** 현재 trackEvent는 `consent.analytics`일 때만 내부 적재 → 미동의 방문자 행동은 애초에 client_events에 없다. Engagement 분모가 "동의한 소수"로 편향됨을 지표 정의에 명시.
- **RLS:** 신규 테이블 전부 기본 거부, 서비스롤 collector만 write. anon insert는 client_events 패턴 유지.

---

## 2. 워크스트림 설계 (W1~W4)

각 워크스트림을 **[심화분석·최적화·자동화·데이터화·가속]** 5렌즈로 요약하고, 비평 교정을 반영한 핵심 설계를 붙인다.

### 2.1 W1 — SW 활성화·리뉴얼·LTV 엔진

| 렌즈 | 요약 | 비평 교정 |
|------|------|-----------|
| 심화분석 | 유일 SW 활동 신호 = NEO `LastClassDate__c`→`last_class_at`. "97대 도입 12대 사용(~12%)"을 `last_class_at`로 재현 검증. 상위10사 편중(HHI, top10 share)은 커버리지 의존 | 편중 분모를 crm_orders로 잡을 수 없음(write 코드 0). **과도기 정본=branch_rev_deals+crm_source_links** |
| 최적화 | `computeCustomerHealth`(실측 5입력: riskSeverity/serviceLevel/hasOutstanding/daysToExpire/lastContactDays)에 `activationSignal` 6번째 입력 추가 | 진단 정확(5입력 실측 확인). 단 "12%→40%"는 근거 없음 → "목표 미확정(가정)"으로 마킹 |
| 자동화 | 트리거 A(설치+14 무수업)·B(리뉴얼 D-90/60/30)·C(헬스 밴드 하향 전이). 룰만으로, 견적 금액은 상담 확정 | 발송 라스트마일은 §4 공유 블로커(홀딩). 언블록 전엔 인앱/시뮬만 |
| 데이터화 | `crm_account_activation_snapshots`(account_key, installed_at, first_class_at, last_class_at, active_days_30d, activation_band, renewal_expire_at). 활성화 룰 SSOT=`lib/crm/activation.ts`(신설) | seat/기능/크레딧은 EEO 텔레메트리 미확정 의존성 → 단일 신호 운영 전제로 설계 |
| 가속 | 활성화/헬스/리뉴얼을 1 룰 SSOT로 → 홈·Customer360·renewals·챗봇이 같은 숫자 | activation-lift **자동 비활성**은 §2.5 자동/수동 경계 위반 → **제안만, 사람 승인** |

**핵심 설계:** 
- **자동/수동 경계 교정(아키텍트 판정):** W1의 "효과 없는 넛지를 스스로 끈다(자동 비활성)"는 W6의 "가중치 재보정은 사람 승인" 원칙과 충돌. **결론: activation-lift는 저성과 스텝을 `홀드아웃 후보`로 제안만 하고, 비활성화는 사람 원클릭.** (P3 준수)
- **퀵윈(마이그레이션 무): `computeCustomerHealth`에 last_class_at 활동 축 추가** — "돈 냈는데 안 쓰는" 계정 즉시 위험 검출.

### 2.2 W2 — 리드·세일즈 파이프라인 (★"최적화"→"구축"으로 재분류)

| 렌즈 | 요약 | 비평 교정 |
|------|------|-----------|
| 심화분석 | 마감 리드 이벤트 시퀀스 역추적(전환 경로), golden hour 실증, 견적 열람→계약 예측 | **핵심 교정: `lib/lead-scoring/`·calcScore·leads.lead_score/grade/fit/engagement·first_response_at·rules_version 전부 0건.** W2는 재보정이 아니라 **신규 구축** |
| 최적화 | 스코어 임계·priority.ts 가중·소스별 SLA 튜닝 | 튜닝 대상이 아직 없음. **캘리브레이션은 스코어 계층이 최소 1분기 데이터 축적 후** |
| 자동화 | S1 Hot Lead 실시간 알림(요청경로 인라인, cron 백스톱)·S2 스코어링(증분+배치)·S3 견적→계약 카드 | 첫 응답은 항상 사람. 라우팅만 자동 |
| 데이터화 | leads 컬럼 신설(fit/engagement/grade/lifecycle_stage/first_response_at/rules_version), `hot_lead_alerts`, `lead_score_outcomes`. client_events 신원 컬럼 **존재(백필만 필요)** | **비평 #1 교정: 신원 컬럼 이미 존재.** Engagement 축 블로커 해소. event_id UNIQUE·consent_state만 선행 |
| 가속 | 자동 트리아지(priority.ts 가동)·라운드로빈+에스컬레이션·마감 outcome 캘리브레이션 복리 | 초안만 LLM, 우선순위·의사결정 룰엔진 |

**핵심 설계:**
- **W2를 "구축 워크스트림"으로 재분류.** 로드맵 순서 = **계측 구축(스코어 계층 신설) → 데이터 축적(1~2분기) → 재보정.** "기존 가중치 재보정"이라는 최적화 프레이밍 폐기.
- **TTFR write trigger 설계(비평 갭 대응):** `leads.first_response_at`은 컬럼만으로는 영구 null. **write 지점 = 어드민 액션큐 "첫 응답 완료" 카드 클릭 시 stamp** + `lead_contact_logs` 최초행 파생 폴백. 이 UI 액션을 함께 설계해야 계측이 산다.
- **golden hour:** `POST /api/lead` 인라인 동기 판정(fit-only 프리스코어) → 담당자 알림 + 큐 상단 강제. `hot_lead_alerts`에 alerted_at/first_response_at로 SLA 자동 집계.

### 2.3 W3 — 마케팅 자동화 엔진

| 렌즈 | 요약 | 비평 교정 |
|------|------|-----------|
| 심화분석 | 채널×인텐트별 CPL/전환/LTV 종단 링크 부재. 13종 마그넷 4-인텐트 사다리 태깅 없음. 드립 single-shot | 통화 혼합 위험(광고비 KRW·매출 CNY·오더 USD). 4-인텐트 매핑은 **사람 편집 병목**(자동화 레버 아님) |
| 최적화 | CPL≤$10·유효리드율·다운로드→SQL·드립 완주율. 세그먼트 프리뷰 게이트, 채널 예산 재배분 루프 | LTV 통화는 채널별 CNY 표기, grand-total 금지 |
| 자동화 | 트리거(유입/cron/다운로드/광고비 sync)·세그먼트 해석·인텐트 태깅·시퀀스 스테이트머신·옵트인 게이트 | 발송 §4 공유 블로커. JSON→Supabase 이관 선행(서버리스 FS 유실) |
| 데이터화 | `newsletter_subscribers`·`email_sequences/steps/enrollments/events`·`channel_economics`(통화 컬럼 분리). leads.intent_tier/event_id | **LeadMagnet 신규 필드는 인터페이스+normalizeLeadMagnet 둘 다** 수정(화이트리스트 함정). email 이벤트는 3곳 등록 |
| 가속 | 시퀀스 템플릿 라이브러리·CTA/폼 자동 부착·에이전트 문안·세그먼트 프리뷰 | attribution 커버리지가 키스톤 복리 |

**핵심 설계:**
- **인텐트 사다리(awareness/diagnosis/comparison/pre_adoption) 라우팅** → pre-adoption은 D+0/D+1/D+3/D+5 드립(W1·W4와 정합).
- **JSON→Supabase 이관을 P0 선행**(subscribers.json/email-campaigns.json). 서버리스 read-only FS 유실 방지.
- **4-인텐트/22질문 매핑은 사람 편집 선행**임을 명시 — 자동화 임팩트로 계상 금지(비평 리스크).

### 2.4 W4 — 콘텐츠·원장언어 플라이휠 (★입력 0 공회전 정면 대응)

| 렌즈 | 요약 | 비평 교정 |
|------|------|-----------|
| 심화분석 | `mineFaqSuggestions`는 완성이나 소스 `data/channel-conversations.json`이 **빈 배열([], 4바이트 실측)** → 플라이휠 공회전 | **채널톡 원문 적재를 P0로 승격.** channel.io API 인증·rate limit·export 권한이 하드 선행(열린 결정 아님) |
| 최적화 | 갭 리드타임≤14일·zero-result≤3%·CSAT≥80%·faithfulRate≥0.97. 블로그 CTA→intent 루프 | `chatbot_answer_events`는 **배포됨(20260421)** → "미배포 가정" 폐기, "컬럼 확장(zero_result/csat)"으로 축소 |
| 자동화 | sync 크론(신규 `scripts/sync-channel-conversations.ts`)·검토 게이트(자동 게시 금지)·voice-lint 게이트 | voice-lint 하드/소프트 경계: **한자=하드, 과장어=소프트**(오탐 빌드 붕괴 방지) |
| 데이터화 | `channel_conversations`·`question_clusters`. chatbot_answer_events **컬럼 확장**. redactSensitiveText DB 적재 전 강제 | 이벤트 3곳 등록. raw IP sha256 |
| 가속 | 1질문→N표면 프랜차이즈·마이닝→초안 자동화(승인만)·voice-lint 리뷰어 대체 | LLM은 초안 문안만 |

**핵심 설계:**
- **P0 = 채널톡 원문 적재.** sync 스크립트+DB 이관+channel.io 권한 확보 없이는 마이닝·갭맵·플라이휠 전체가 공수 낭비.
- **chatbot_answer_events는 기존 테이블 확장**(zero_result bool·csat 컬럼 ADD COLUMN)으로 설계. 신규 계측 프로젝트 아님.
- **voice-lint 게이트:** 한자(`[一-鿿]`)는 하드 차단, 과장어·조사깨짐은 소프트 경고(오탐으로 발행 속도 역효과 방지).

### 2.5 워크스트림 간 충돌 — 아키텍트 판정 요약

| 충돌 | 판정 |
|------|------|
| 자동/수동 경계 (W1 자동 비활성 vs W6 사람 승인) | **사람 승인으로 통일.** W1 activation-lift는 홀드아웃 제안만 |
| 액션 큐 SSOT (W2 crm_tasks vs W6 inbox_items) | **crm_tasks가 스파인(실존 20260627).** inbox_items는 뷰로 근사, 이중 저장 금지 |
| 이벤트 리네임 (W5 material_download vs W3/W4 download_materials) | **download_materials 동결.** wire명 불변, 표시 alias만 |
| 매출 정본 (W1 crm_orders vs branch_rev_deals) | **crm_orders write 미구현 → branch_rev_deals+source_links 과도기 정본.** metric_definitions가 CEO 3결정 후 확정 |
| identity 실시간성 (W5 append-only vs 스냅샷 원칙) | **상태 테이블(단일 행 lookup) + 감사 edges 분리** |

---

## 3. 최적화·실험·가속 루프 (W6)

### 3.1 3중 피드백 루프

| 루프 | 주기 | 산출물 | 자동/수동 |
|------|------|--------|-----------|
| **L1 스코어 루프** | 주간 | `scoring_calibration_weekly`(week, grade, realized_conversion, sample_n) | 가중치 diff 제안 → **사람 승인**(통화·정책과 동급 안전선) |
| **L2 시퀀스/콘텐츠 루프** | 격주 | 매출귀속 감쇠 곡선, 저성과 홀드아웃 후보 | 홀드아웃 등재 → 사람 승인 |
| **L3 챗봇/KB 루프** | 상시 | golden-set·faithfulRate≥0.97 게이트 결과 카드 | 신규 DocArticle 승인 → KB reindex |

**비평 교정:** L1은 스코어 계층(W2)이 **최소 1분기 데이터를 쌓은 뒤에만** 가능. 조기 착수 금지.

### 3.2 데일리 브리프·액션 스파인

- **단일 지휘 화면(데일리 브리프):** 상단=북극성 3숫자(목표 대비 delta), 중단=오늘의 액션 큐(crm_tasks 스파인), 하단=에이전트 초안 인박스(승인 대기).
- **아키텍트 판정(신규 /admin/command vs /admin/overview 확장):** 탭 IA 동결 원칙(감사 문서)과 충돌 → **/admin/overview 확장으로 v0 착수**, 기존 lead-weekly/monthly-digest cron 위에 daily_brief 스냅샷을 얹어 신규 배관 최소화.
- **RPC 스냅샷:** `get_daily_brief_snapshot`(라이브 재집계 금지, CRM 스냅샷 RPC 선례). 실패 시 전날 스냅샷 + 배너.

### 3.3 실험 프레임워크 — 3순위로 유예 (비평 반영)

리드 유입량 대비 A/B 각 arm 통계 유의성 확보에 수개월. **경량 exposure/outcome 로깅조차 첫 2분기 표본 부족.** 결론: **스파인(crm_tasks 물리화)과 브리프 v0만 먼저**, 실험·`agent_drafts` 채택률은 트래픽 임계 넘고 초안 생성 행위가 실재할 때 착수(계측 대상 행위가 아직 없음 = 순서 역전 방지).

### 3.4 에이전트 보조 가속

사람 시간은 **판단(승인/편집/예외)**에만. 수집·정렬·초안·집계는 전부 기계. 신설 테이블마다 브리프 화면에 소비처를 붙인다(P6 고아 테이블 금지).

---

## 4. 통합 자동화 아키텍처 — 트리거 버스 → 룰엔진 → 액션 큐 → 사람 승인

### 4.1 파이프라인

```
[트리거 버스]                [룰엔진]                  [액션 큐]              [사람]
리드/이벤트/견적/sync완료 → collector(계약검증·      → crm_tasks(스파인)   → 원클릭 액션
                            동의·아이덴티티·통화)       (severity·bucket)      (응답/전환/승인)
NEO cron 완료 이벤트     → identity/source 재계산   → metric_snapshots    → 데일리 브리프
초안 요청(수동)          → LLM 초안(pending)        → agent_drafts        → 승인/편집/폐기
```

### 4.2 collector 단일 레버 (파편화 방지)

**모든 이벤트 write는 collector 한 곳을 통과**하고, 여기서 계약 검증·동의 스탬프·아이덴티티 결합·통화 가드를 상속. 6영역 전체가 자동으로 규범을 상속(파편화 방지 = 비평 데이터정합성 핵심).

- **계약 검증:** `EVENT_CONTRACT`로 required params 통과분만 적재. 위반은 `client_events_rejected`에 사유와 격리(무음 드랍 금지, P7).
- **3곳 코드젠:** EventNames·ALLOWED_EVENTS·ALLOWED_PARAM_KEYS를 EVENT_CONTRACT 1소스에서 파생. CI가 drift fail.
- **크론 체인:** 시각 하드코딩(`01:00`) 금지 → **"NEO 크론 완료 이벤트 구독"**(vercel.json 정본 `10 1 * * *` 변경돼도 하위 트리거 불변).

### 4.3 액션 큐 스파인 단일화

**crm_tasks가 유일 물리 스파인.** W1 리스크카드·W2 respond_lead/convert_to_contract·W3 시퀀스·W6 계약전환을 각자 테이블로 만들지 않고 crm_tasks로 materialize. inbox_items는 필요 시 뷰로만(중복 저장 금지, P6).

### 4.4 Engagement 분모 편향 (비평 갭 정면 대응)

trackEvent는 `consent.analytics` 동의 시에만 client_events 적재 → **미동의 방문자 행동은 데이터에 애초에 없음.** Engagement 스코어 분모가 "동의한 소수"로 편향됨을 **지표 정의(§7)에 명시**하고, 스코어 해석 시 커버리지 주석 필수. consent_state 컬럼으로 편향률을 사후 측정.

### 4.5 백필·표본 리드타임 (비평 갭 정면 대응)

신규 컬럼(consent_state·event_id·intent_tier)은 과거 행이 null. 캘리브레이션·top-decile lift·attribution_coverage는 **최소 1~2분기 축적 후 유의미.** 각 지표 옆에 "믿을 수 있는 시점"을 §7에 못박아 조기 의사결정 차단. 신원 컬럼(anonymous_id 등)은 **20260615부터 적재 중이므로** 그 이후 데이터는 이미 유효 — 백필 부담이 비평 가정보다 작다.

---

## 5. 단계별 로드맵 — Phase 0 데이터기반 → 1 켜기 → 2 최적화 → 3 가속

### Phase 0 — 데이터 파운데이션 (하드 선행 게이트, 병렬 착수 금지)

| 산출물 | 의존성 | 선후 |
|--------|--------|------|
| event_id·consent_state 컬럼 추가 + currency CHECK | 플랫폼&데이터 파트 마이그레이션 규율 | 최선행 |
| EVENT_CONTRACT + 3곳 코드젠 + CI drift 게이트 | C1 | event_id 후 |
| money-format.ts 단일화(formatCNY 중복 제거) | — | 병렬 가능(저위험) |
| metric_definitions 스캐폴드 + source_link_coverage 배지 | C3·C5, 커버리지 뷰 | money-format 후 |
| identity_graph(상태 테이블) + edges(감사) 어댑터 | stitch.ts 재사용 | 컬럼 후 |
| 백필·표본 기준선 문서화 | — | 병렬 |
| **CEO 3결정: 매출 book-of-record / 귀속 오너 / 목표 소스** | 거버넌스 | metric_definitions 확정 블로커 |
| **CEO 1결정: 발송 서비스(Resend 등)** | 거버넌스 | W1/W2/W3/W6 라스트마일 언블록 |

### Phase 1 — 켜기 (마이그레이션 최소, 룰만)

| 산출물 | 의존성 | 선후 |
|--------|--------|------|
| computeCustomerHealth 활동 축(activationSignal) | Phase 0 없이 가능(퀵윈) | 즉시 |
| Hot Lead 인라인 판정 + hot_lead_alerts + TTFR write UI | leads 컬럼 신설, admin_profiles 라우팅 값 | Phase 0 후 |
| 리뉴얼 D-90/60/30 액션카드 | renewals 화면 | Phase 0 후 |
| 채널톡 원문 적재(sync+DB 이관) | channel.io 권한 확보 | W4 하드 선행 |
| JSON→Supabase 이관(subscribers/campaigns) | 플랫폼&데이터 | W3 선행 |
| 데일리 브리프 v0(/admin/overview 확장, digest cron 위) | crm_tasks 스파인 | Phase 0 후 |

### Phase 2 — 최적화 (데이터 축적 후)

| 산출물 | 의존성 | 선후 |
|--------|--------|------|
| 리드스코어 계층 구축(lib/lead-scoring 신설) | Phase 1 이벤트 축적 | W2 구축 |
| 인텐트 사다리 드립 + 세그먼트 프리뷰 게이트 | 발송 언블록, 4-인텐트 매핑(사람) | Phase 1 후 |
| voice-lint 게이트(한자 하드/과장 소프트) | content-pub 저장 훅 | 병렬 |
| L3 챗봇 루프(golden-set 카드 재소스) | chatbot_answer_events(존재) | 즉시 가능 |

### Phase 3 — 가속 (트래픽 임계 후)

| 산출물 | 의존성 | 선후 |
|--------|--------|------|
| L1 스코어 캘리브레이션(scoring_calibration_weekly) | 스코어 계층 1분기 축적 | Phase 2 후 |
| 실험 프레임워크(경량 exposure) | 트래픽 임계 | 최후행 |
| agent_drafts 채택률 계측 | LLM 초안 생성 행위 실재 | 최후행 |
| 시퀀스/템플릿 레지스트리 복리 루프 | 커버리지·attribution 성숙 | 최후행 |

---

## 6. 의사결정 레지스터 — 대표 판단 필요한 열린 결정

| # | 영역 | 열린 결정 | 블로킹 대상 | 리스크 |
|---|------|-----------|-------------|--------|
| D1 | 거버넌스 | 매출 book-of-record: 시트(REV/DSH) vs Portal, 분모 crm_orders vs branch_rev_deals | W1·W3·W5·W6 매출·LTV·편중 지표 | 미결 시 6개가 각자 분모로 굳음 → 재작업 |
| D2 | 거버넌스 | 발송 서비스 단일 결정(Resend/카카오) | W1 넛지·W2 알림·W3 드립·W6 발송 | 1결정이 4개 라스트마일 동시 블록 |
| D3 | W1 | '사용중' 활성화 임계(last_class_at 며칠=active/dormant/이탈) | 활성화 밴드·헬스 | 계측 없는 목표(40%)는 가정 |
| D4 | W1 | EEO 본사 seat/기능/크레딧 텔레메트리 공유 가능 여부 | seat 단위 계측 | 불가 시 단일 신호 영구 운영 |
| D5 | W2 | golden hour SLA(5분/15분) + 스코어 임계(A≥70)를 하드코딩 vs DB 정책 | 스코어 계층 | 하드코딩 시 튜닝 경직 |
| D6 | W2/W6 | 스코어 가중치 재보정: 자동 반영 vs 사람 승인(diff만) | L1 루프 | **아키텍트 권장: 사람 승인**(통화·정책 동급) |
| D7 | W3 | 구독 옵트아웃(현 자동구독) → 명시적 옵트인 전환 | 유입량 vs 법적 리스크 | 법무 확인 필요 |
| D8 | W4 | 채널톡 적재 소스·주기(channel.io API vs 수동 export) | W4 플라이휠 전체 | 미확보 시 공회전 |
| D9 | W4 | voice-lint 하드/소프트 경계 | 발행 속도 | **아키텍트 권장: 한자 하드/과장 소프트** |
| D10 | W5 | 이벤트 계약 위반 정책: reject 격리 vs quarantine 재처리 | collector | 데이터 손실 0 vs 단순성 |

**리스크 총괄:** (a) 플랫폼&데이터 파트가 identity_graph·metric_definitions·EVENT_CONTRACT의 단일 병목 → 지연 시 6개 정체. (b) 4-인텐트/22질문 매핑은 사람 편집 병목(자동화 아님). (c) 커버리지 미측정 상태의 모든 매출 지표는 착시.

---

## 7. 지표 정의 — 북극성 / 가드레일 / 실험

| 유형 | 지표(name) | 정의 | 소스(SSOT) | 통화 | 믿을 수 있는 시점 |
|------|-----------|------|------------|------|-------------------|
| 북극성 | `lead_to_contract_cycle_p50` | 첫 문의→계약 사이클 타임 중앙값 | leads + crm_tasks | — | Phase 2 축적 후 |
| 북극성 | `actions_per_operator_weekly` | 주간 사람당 유효 액션(8명 레버) | crm_tasks | — | Phase 1 즉시 |
| 북극성 | `active_account_count` | last_class_at 임계 내 활성 학원 수 | crm_account_activation_snapshots | — | Phase 1 |
| 가드레일 | `source_link_coverage_pct` | 매출행↔account 귀속 커버리지(키스톤, ≥90%) | crm_source_links(confirmed) | — | 즉시(퀵윈) |
| 가드레일 | `first_response_p50` (TTFR) | 첫 문의→첫 응답 중앙값 | leads.first_response_at + lead_contact_logs | — | write UI 후 |
| 가드레일 | `event_contract_valid_rate` | 필수 params 통과율(≥0.99) | collector | — | Phase 0 후 |
| 가드레일 | `currency_mismatch_count` | 통화 혼합(=0 하드게이트) | metric_snapshots CHECK | 3종 | 즉시 |
| 가드레일 | `chatbot_faithful_rate` / `zero_result_rate` | 충실도≥0.97 / zero-result≤3% | chatbot_answer_events(배포됨) | — | 즉시 |
| 가드레일 | `identity_link_rate` | 익명→lead 결합률 | identity_stitch_logs.action | — | 즉시(퀵윈) |
| 실험/최적화 | `renewal_defense_win_rate` | D-90 진입 대비 갱신 성사율 | external_crm_records.expireAt | — | Phase 2 |
| 실험/최적화 | `top10_revenue_share` / `revenue_hhi` | 매출 편중(과도기 branch_rev_deals) | branch_rev_deals + source_links | CNY | 커버리지 성숙 후 |
| 실험/최적화 | `cpl_by_channel` | 채널별 유효리드 CPL | channel_economics | KRW(비용) | 발송·광고 sync 후 |
| 실험/최적화 | `ltv_by_channel` | 채널별 LTV(채널 표기, grand-total 금지) | channel_economics | CNY | 커버리지·축적 후 |
| 실험/최적화 | `download_to_sql_rate` | 마그넷→SQL 전환 | client_events + leads | — | 인텐트 태깅 후 |
| 실험/최적화 | `content_gap_lead_time_days` | 질문 임계 빈도→커버 콘텐츠 발행 | question_clusters | — | 채널톡 적재 후 |
| 실험/최적화 | `draft_approval_rate` | 에이전트 초안 승인율 | agent_drafts | — | Phase 3(행위 실재 후) |

**편향 주석(§4.4):** Engagement 파생 지표는 `consent.analytics` 동의자만 분모 → "동의 커버리지" 함께 표기 필수.

---

## 부록 — 즉시 착수 가능한 퀵윈 (마이그레이션 무·저위험)

1. `computeCustomerHealth`에 last_class_at 활동 축 추가 — "돈 냈는데 안 쓰는" 계정 즉시 검출.
2. `source_link_coverage_pct`를 데이터-헬스 배지로 상시 노출 — 매출 무음 누락 가시화.
3. `formatCNY`/`formatUSD` 중복(crm-unified-customers.ts)을 money-format.ts로 통합 — "같은 숫자" 선례.
4. `SELECT event_name, count(*)` 실측 사전 → EVENT_CONTRACT 초안 + union drift 노출.
5. `identity_stitch_logs.action` 분포로 아이덴티티 결합률 타일 — 신규 테이블 불필요.
6. chatbot golden-set 게이트 결과를 성과 카드로 재소스 — 신규 계측 없이 L3 루프 시작.
