# Compass ↔ Admin 기능 교차 적용·분할 판정 — 2026-09-02

기준 시점: 2026-09-02
대상: Compass(`classinkr-main/crm`, 마케팅팀 앱)와 이 저장소의 Admin OS. 화면·알고리즘·운영 규칙·기반 코드 단위.
질문 세 가지: (1) Admin의 알고리즘·편의 기능 중 Compass에 적용하면 좋은 것, (2) Compass에서 Admin이 가져오면 좋은 것, (3) 소유권을 나누거나 중복 작업을 끊어도 되는 것.
방식: 서브 에이전트 4개(상위 티어 2: 방향별 이식 판정, 하위 티어 2: 소유권·중복 판정, UX 비교)가 두 저장소를 읽고 판정했고, 오케스트레이터가 근거 파일을 재확인해 통합했다. 데이터 도메인의 A/B/C 분류와 통합 금지 15건은 [공용 Supabase DB 최적화·통폐합 분석](./supabase-shared-db-consolidation-analysis-2026-09-02.md) §4를 전제로 한다. 이 문서는 그 위에 기능 단위 판정을 얹는다.

관련 문서: [Admin 속도 진단과 개선 계획](./admin-performance-plan-2026-09-02.md), [ADR-009](../adr/ADR-009-site-admin-deployment-boundary.md), [홈페이지·Admin 실행 경계 분리 계획](./site-admin-separation-plan-2026-08-28.md), [마케팅/그로스/CRM 파트 가이드](./playbook/04-growth-crm.md)

---
## 1. Admin → Compass: 적용하면 좋은 것

Admin에는 성숙한데 Compass에는 없거나 약한 것만 골랐다. 오케스트레이터가 상위 3건의 근거를 코드로 재확인했다.

| # | 항목 | Admin 근거 | Compass 현재 | 이득 | 방식 | 노력 | 영향 |
|---|---|---|---|---|---|---|---|
| 1 | 연락처 정규화 단일화 | `lib/crm/phone.ts`, `lib/compass/normalize.ts` | `lib/format.ts`에 `normPhone`이 있는데 Meta 웹훅(`app/api/webhook/meta/route.ts`)이 인라인 재구현을 쓴다. 82 접두 처리에 `length >= 11` 게이트가 있어 서울 9자리 번호(+82 2 …)는 정규화되지 않고 `822…`로 저장돼 시트 임포트분(`02…`)과 중복 판정이 어긋난다 | 광고 유입 중복 리드가 조용히 새로 생기는 경로 차단 | C. 함수는 이미 있으므로 호출부만 교체 | S | M |
| 2 | 중복 탐지 인덱스 | 이 저장소의 `20260902_leads_dedupe_…` 마이그레이션 | `crm.leads`는 `phone` 인덱스만 있고 `lower(email)` 인덱스가 없어 리드 생성·웹훅마다 전체 스캔 | 웹훅 지연 감소. Admin 브리지 조회도 같이 빨라짐 | C | S | M |
| 3 | 미응답 SLA 알림 + 쿨다운 | `lib/server/lead-response-alerts.ts`, `lib/repositories/lead-alert-states.ts`, `app/api/cron/lead-response-alerts` | 화면 표시(uncontacted/missed 탭, 재통화 지남 배지)만 있고 아웃바운드 알림 채널이 0개다(외부 호출은 Graph·Google OAuth뿐) | 리드를 보러 들어가야만 아는 상태에서 밀린 건이 먼저 찾아오는 상태로 | C | M | H |
| 4 | 리드 우선순위 점수 | `lib/crm/lead-ranking.ts`(5축, 긴급도 봉우리 감쇠), `lib/crm/priority.ts` | 정렬이 `coalesce(last_inflow_at, created_at) desc` 하나 | "오래 방치 = 위" 착시 제거. 큰 학원·반응 있는 건이 위로 | C(3축 축소판) | M | H |
| 5 | 오늘의 콜 쿼터 믹스 | `lib/crm/today-calls.ts`(성격별 슬롯 선배정) | 가상 탭 4개로 분산, 합친 "오늘 할 5건" 없음 | 아침에 열면 오늘 칠 5건이 골라져 있음 | C | M | M |
| 6 | Meta 폼 커스텀 답변 보존 | `lib/crm/lead-message.ts`의 필드 라벨표 | 웹훅이 이름·전화·이메일·학원·지역 5개만 뽑고 나머지 `field_data`를 버린다. 삽입문에 원문 컬럼 없음 | 지금 버려지는 답변은 소급 복구가 안 된다. 폼 질문을 추가하는 순간 유실 | C. `activities(kind='inflow')` 본문에 `라벨: 값`으로 append하면 스키마 변경 0 | S | M |
| 7 | 원장 헤더 기반 열 해석 | `lib/branch/parsers/rev.ts`의 `REV_HEADER_ALIASES`·`resolveRevColumns`(열 밀림 사고 이력 주석) | `lib/revenue.ts`는 좌측 메타 열을 고정 인덱스(`row[0]/[5]/[6]/[7]/[9]`)로 읽는다. 리드 시트 파서는 이미 헤더 기반이라 원장만 남았다 | 회사 원장 열이 또 밀려도 사람별 달성·팀 분류가 조용히 틀리지 않음 | A(공용 패키지) 또는 C. 별칭 미인식 시 현재 인덱스로 폴백해 기본 동작 변화 0 | M | H |
| 8 | 시트 범위 절단 경고 | `lib/branch/sync/range-truncation.ts` | KPI 탭(`A1:P200`, `A1:AB140`)에 상한이 있다 | 시트가 커졌을 때 조용한 누락 대신 경고 | C | S | L |
| 9 | 붙여넣기 벌크 리드 등록 | `lib/crm/lead-paste.ts`(헤더 인식, 내용 추론, 제외 사유 미리보기) | `leads/new`는 단건 폼 | 설명회 현장 명단을 시트 경유 없이 즉시 투입 | A 또는 C | S | M |
| 10 | 전역 커맨드 팔레트 | `components/admin/crm/CrmCommandPalette.tsx` | 페이지별 즉시 검색만, 화면 간 점프·전역 리드 검색 없음 | 콜 중 학원명 한 번에 리드 상세로 | C | S | M |
| 11 | 월말 런레이트 추정 | `lib/crm/forecast.ts`(순수 함수) | 목표·달성만 있고 월말 착지 없음 | 월중에 "이대로면 미달"이 보임 | A | S | M |
| 12 | 주간 다이제스트 푸시 | `lib/server/lead-digest-alerts.ts`, `lead-weekly-digest` 크론 | `cron/focus-report`는 JSON 반환만 | 주간보고 자료가 시간 되면 채널에 도착 | C(#3 채널 재사용) | S | M |
| 13 | 중복 리드 병합 UI | `lib/crm/lead-conversion.ts`의 멱등 마커·링크 단일화 패턴 | 일회성 스크립트(하드코딩 10쌍) + 하드 삭제 | 중복 발견 시 화면에서 병합 | C | M | M |

이식하지 않는 것: RBAC·capability 전체(Compass는 BD 경로 화이트리스트로 필요한 만큼 갈라 놓았고 90일 세션이 콜 도구 UX의 핵심이다. 상한은 개인 비밀번호와 TTL 단축까지), 확정 매출 정의(사용자 확정 규칙. 파서 견고성만 가져간다), 스키마 프로브(Compass에는 `schema-diff.mjs`가 맞다. 필요한 건 CI 게이트화), 고객 건강도·서비스 리스크(NEO 입력이 Compass에 없다), Customer 360 타임라인 병합(병합할 두 번째 원천이 없다), 알림 채널 3종 전부(1개면 된다), 클라이언트 SWR 3계층 캐시(Compass는 RSC 구조라 이중 캐시가 된다), 담당자 자동 배정(Admin도 "추측 금지" 게이트라 이식할 알고리즘이 없다).

먼저 할 5개와 첫 PR 범위:
1. 정규화 단일화 + `lower(email)` 인덱스. 웹훅 인라인 블록을 `normPhone` 호출로 교체하고 `schema.sql`에 인덱스 한 줄. 기존 행 재정규화 백필은 dry-run 리포트 뒤 별도 PR.
2. Meta 폼 답변 원문 보존. 신규·재유입 분기 모두 `activities(kind='inflow')`에 나머지 답변을 `라벨: 값` 줄로 남긴다. 스키마 변경 0.
3. 미응답·재통화 지남 알림. `crm.lead_alert_states` 테이블 하나와 `/api/cron/lead-alerts` 라우트 하나, 웹훅 채널 1개. 쿨다운 로직은 Admin 것을 복사. `hourly-sync.yml`에 한 줄.
4. 원장 헤더 기반 열 해석. 합격 기준은 이식 전후 최근 3개월 사람별 달성 금액 바이트 일치.
5. 리드 우선순위 점수 v0. 같은 PR에서 vitest와 typecheck 스크립트를 도입하고, 순수 모듈 3축 + 테스트 + `?sort=priority` 옵트인 정렬만. 기본 정렬은 그대로.

정정: Compass의 actor는 자유 텍스트가 아니라 HMAC 서명된 세션 이름이다. 다만 공용 비밀번호로 고른 이름이라 신원 증명은 못 하며, Admin의 `lib/crm/compass-timeline.ts`도 같은 판단을 적어 두었다.

## 2. Compass → Admin: 가져오면 좋은 것

이미 브리지로 소비 중인 것(데모 회차, 캘린더 미러, 소재별 성과, 매출 대조, 리드 오버레이)은 제외했다. 전제 하나: 이 저장소에는 아직 `packages/`가 없으므로 "공용 패키지" 방식은 모노레포화 뒤의 일이다. 지금은 브리지 확대(A)와 재구현(C)만 가능하다.

| # | 항목 | Compass 근거 | Admin 현재 | 이득 | 방식 | 노력 | 영향 |
|---|---|---|---|---|---|---|---|
| 1 | 재유입 병합(연락처 일치 시 새 행 대신 `last_inflow_at` 갱신 + inflow 활동) | `app/api/webhook/meta/route.ts` 재유입 분기 | 병합하지 않는다. `lib/server/lead-capture.ts`의 중복 방지는 몇 분 창의 이중 제출 차단이고, `lib/repositories/leads.ts`의 저장 주석이 "같은 연락처가 다시 와도 행을 새로 만든다(병합 없음)"고 명시한다. `findLeadsByContacts()`는 있으나 공개 저장 경로가 부르지 않는다 | 같은 사람의 문의 3회가 3행으로 갈라져 담당·상태·메모가 분산되는 문제 해소. `lib/crm/lead-reinflow.ts`의 사후 추정이 그제야 참이 된다 | C | M | H |
| 2 | "응대 필요" 판정을 마지막 유입 이후 접촉으로 자르기 | `lib/leadFilter.ts`의 UNCONTACTED·MISSED 조건 | `lib/crm/lead-response-status.ts`는 `status === 'new'`와 생성 시각 경과만 본다. 재유입 리드가 옛 통화 때문에 목록에서 사라진다 | 재유입 건이 "응대 완료"로 숨는 것 차단 | C | S | M |
| 3 | 한 줄 입력 파싱(제목·담당·기간·완료) | `lib/taskParse.ts`(순수, 의존성 0), `lib/aiTask.ts`(Gemini 폴백) | `lib/crm/lead-paste.ts`는 표 붙여넣기용이라 다른 것. 태스크는 제목→타입 추론만 | `crm_tasks` 등록이 한 줄로 끝난다. 입력 마찰이 등록률을 정한다 | C | S | M |
| 4 | 광고세트(adset) 축 소비 | 브리지 뷰 `compass_adsets_v` | `lib/compass/bridge.ts`의 `getCompassAdsetsDaily` 소비처 0건 | 소재와 캠페인 사이 예산·타겟 단위 성과가 비어 있다. 이미 뚫린 뷰가 놀고 있다 | A | S | M |
| 5 | 전환 계정 수 = 최초 결제월에 1회만 | `lib/adReport.ts` | `lib/crm/revenue-performance.ts`는 월별 금액 합산만, 계정 수 개념 없음 | 구독 갱신이 매달 "전환"으로 중복 계상되는 것 방지 | C | S | M |
| 6 | 방문 버킷(QR 직접/광고/기타) | `app/api/webhook/page-visit/route.ts` | `lib/crm/lead-attribution.ts`는 UTM 축, 무-UTM은 유입 묶음으로 흡수 | 오프라인 광고(우편·전단 QR)를 온라인 트래픽에서 분리 | C | S | M |
| 7 | 소재 원본 이미지 | 뷰의 `creative_image` | `lib/marketing/compass-creative.ts` 입력에 썸네일만 | 소재 카드에서 확대 확인 | A | S | L |
| 8 | 미팅 레벨 사다리(팀원→팀장→대표→결제) | `lib/careStages.ts` | Compass 리드분은 라벨만 표시. Admin 자체 딜에는 축이 없음 | 데모 이후 딜이 어느 결정권자에서 막혔는지 | C | M | M |
| 9 | 구매확률 → 배지·정렬 파서 | `lib/bdStages.ts`(오타 흡수) | 브리지 `bd_prob`는 숫자로만 옴 | BD 인계 건을 성사·임박·진행·초기로 접어 보기 | C | S | L |
| 10 | 주간 미션 보고(완료·진행·차주, "8월 1주" 표기) | `app/api/cron/focus-report/route.ts`, `lib/week.ts` | `lib/marketing/weekly-report.ts`는 광고 성과만, 사람·미션 축 없음 | 누가 이번 주 무엇을 했고 할 것인지가 보고에 들어옴 | C | M | M |
| 11 | 회의록 → 태스크 인제스트(멱등 `source_key`) | `app/api/cron/mission-ingest/route.ts` | 없음 | 회의록을 재투입해도 태스크가 안 늘어남 | C | S | L |
| 12 | 사람 계정 OAuth 캘린더 쓰기 폴백 | `lib/gcal.ts`(Workspace가 서비스 계정의 보조 캘린더 변경을 차단한다는 주석) | `lib/google-calendar-sync.ts`는 서비스 계정 전용 | 같은 정책 벽에 걸려 있다면 Admin 캘린더 쓰기가 무음 실패 중일 수 있다. 먼저 `GOOGLE_CALENDAR_ID` 소유 계정 확인 | C | M | 해당 시 H |
| 13 | NeoCRM XLSX 폴백 + 오너 코드 맵 | `lib/neocrm.ts`, `app/api/export/neocrm` | API 쓰기와 승인 큐만, 수기 업로드 폴백 없음 | API 차단·승인 지연 시 우회 경로 | C | S | L |

가져오면 안 되는 것: `DEMO_OVERRIDE`·`ACCOUNT_SWITCH_YM` 같은 보고 연속성 상수(Admin이 복제하면 두 앱이 다른 시점에 소급 재산정한다. Compass에 남기고 결과만 읽는다), 설명회 회차→주최 표와 광고 탭 목록(`source_tab`에 묶인 값이라 Admin에 그 컬럼이 없다. 이식 대신 브리지 뷰에 분류 결과 컬럼을 추가해 읽는 것이 맞다), `MKT_PERSONS`·`PERSON_SINCE`·`MKT_EXCLUDE`(원장 색이 원천이고 Admin은 `is_mkt` 결과를 이미 읽는다), 설명회 재제출·수동 재유입 SQL(`last_ad_id`와 활동 테이블에 의존해 브리지로 재현 불가), 지역 정규화(Admin의 `lib/regions/korea-regions.ts`가 더 성숙하다. 역방향 후보), 소재 별칭 편집 UX(쓰기 소유권은 Compass).

먼저 할 5개: 재유입 병합(1)과 마지막 유입 이후 게이트(2)를 한 PR로, adset 축 소비(4), 캘린더 쓰기 권한 확인(12, 조사 먼저), 한 줄 태스크 파싱(3).

첫 PR 범위(1+2): `lead-capture.ts`가 저장 전에 `findLeadsByContacts()`로 일치 행을 찾고, 있으면 insert 대신 `last_inflow_at`을 갱신하고 리드마그넷·랜딩·UTM을 담은 inflow 활동 1건을 남긴다. 기존 행의 `status`·`assigned_to`·`follow_up_at`은 건드리지 않는다(Compass도 `coalesce`로만 채운다). `lead-response-status.ts`는 "마지막 유입 이후 접촉 없음" 조건을 더하고 경과 기준을 `coalesce(last_inflow_at, timestamp)`로 바꾼다. 기존 중복 행의 소급 병합은 별도 마이그레이션이다.

## 3. 소유권 분할·중복 제거: 나눌 것과 끊을 것

[공용 Supabase DB 최적화·통폐합 분석](./supabase-shared-db-consolidation-analysis-2026-09-02.md) §4의 도메인 판정(A 브리지 확대, B 어댑터, C 통합 금지)을 기능·엔지니어링 작업 단위로 내린 것이다. 하위 티어 에이전트의 판정을 오케스트레이터가 파일 단위로 재확인했고, 코드 밖 확인이 필요한 것만 `[추정]`으로 남겼다. Compass 경로는 Compass 저장소 기준 상대 경로다.

### 3.1 기능 소유권 16건

| # | 기능 | Compass | Admin | 정본 | 반대편 소비 | 끊을 중복 |
|---|---|---|---|---|---|---|
| 1 | 리드 유입(Meta Lead Ads 웹훅) | `app/api/webhook/meta`. HMAC fail-closed, `crm.leads` 직접 insert, 재유입 병합 | `app/api/meta/webhook`(관리자 경로 밖). `timingSafeEqual` 서명 검증 뒤 `submitLeadCapture()`로 자체 `leads` insert. 서로 모르는 수신기 둘 | 광고 리드=Compass(공용 DB 분석 §4.2 유지) | Meta 앱의 leadgen 구독 URL이 몇 개인지 `[추정]`. 둘 다 구독돼 있으면 같은 리드가 두 앱에 각각 행으로 생기고 있다 | 구독 확인 전까지 두 웹훅의 필드 매핑을 각자 넓히는 일 |
| 2 | 전화 정규화·중복 키 | 구현 4개, 동작 3가지. `lib/format.ts`(0082·82 처리), `lib/sheet.ts`(8210·10만 처리, 0082 미처리), `lib/bdSeminars.ts`(0082·82·10), 웹훅 인라인(82에 길이 게이트) | 구현 3개. `lib/compass/normalize.ts`(브리지 SQL과 바이트 일치 계약), `lib/crm/phone.ts`(표시용), `lib/repositories/leads.ts`의 `digitsOnly`(국가코드 미처리, 연락처 조회 키) | `normalizePhoneKey` 알고리즘 | 같은 함수 사본을 양쪽에 두고 계약 테스트로 고정(§3.3 #1) | 버그 있는 사본 위에 기능을 더 얹는 일 |
| 3 | 매출 원장 파싱 | `lib/revenue.ts` 한 파일에 파싱과 동기화. 고정 열 인덱스. A열 주황(허용오차 포함)=마케팅 유입 플래그 | `lib/branch/parsers/rev.ts`(헤더 별칭 폴백) + `lib/branch/google-sheets.ts`. 같은 갈색을 빨강 판정에서 명시적으로 제외 | 열 해석=Admin, 색상 정책=각자 | 파서만 공용(§3.3 #4), 판정 정책은 각자 뷰 계층 | 열 밀림 사고를 양쪽에서 따로 재발견·재수정하는 일 |
| 4 | 확정 매출 정의 | 주간 셀 빨강 합산(인라인) | `lib/branch/computations/rev-confirmed.ts`가 파일 상단에 스스로 유일한 SSOT라고 명시 | 각자(사용자 확정 규칙) | 대사 리포트만 | 없음. 정의를 맞추려는 시도 자체를 하지 않는다 |
| 5 | 광고 성과 수집 | `cron/meta`: adset 레벨 + 소재(썸네일·제목·본문) | `lib/meta/marketing.ts`: campaign 레벨 + reach/CTR/CPC/CPM, IG 오가닉 별도 | 소재·광고세트=Compass, 캠페인·IG=Admin | `compass_ads_v`, `compass_adsets_v` | 없음(레벨이 달라 실질 중복 아님) |
| 6 | 광고 성과 리포트 | `lib/adReport.ts`: 4원천 결합, 수기 보정 상수, 콜=리드 수 가정 | `lib/marketing/perf-assemble.ts`: "종합 ROAS 계산 금지", "0 아니면 null"을 상단에 명문화 | 각자 | 대사 지표만 | 없음(병합하면 한쪽 확정 정책 위반) |
| 7 | 데모 일정 | `lib/gcal.ts` 사람 OAuth 읽기 전용, `crm.cal_events` 미러 | `admin_calendar_events` + `lib/google-calendar-sync.ts` 서비스 계정 push | 각자 | `compass_cal_events_v` | 없음 |
| 8 | 팀 일정·미션 | `crm.focus_items`(고객 없는 사내 미션 칸반) | `crm_tasks`(고객 연결), `marketing_projects`(캠페인) | 각자 | 없음 | 없음(병합 시 우선순위 큐 오염) |
| 9 | 주간 보고 | `cron/focus-report`: 미션 done/doing/next | `lead-weekly-digest`: 리드 기준 | 각자(이름만 비슷한 다른 보고서) | 없음 | 없음 |
| 10 | NeoCRM 등록 | `lib/neocrm.ts` 하드코딩 오너 5명 + XLSX 내보내기 + 머신 바운드 MCP 스크립트 | `crm_write_requests` 승인 큐 + `lib/external-crm/xiaoshouyi-write.ts` | 승인 큐(장기), XLSX 폴백 유지 | 3자 대사 리포트 | 두 등록 표식을 서로 모른 채 각자 대사 스크립트를 만드는 일 |
| 11 | 담당자 명부 | `lib/neocrm.ts`의 `NEOCRM_OWNER`, `scripts/push_neocrm.mjs`의 `OWNERS`, `lib/members.ts`의 3중 하드코딩. 이번 세션에 실제 드리프트(한 명 누락)를 고쳤다 | `crm_xiaoshouyi_owner_names` 테이블(`lib/external-crm/owner-names.ts`) + `admin_profiles` | Admin DB | `team_directory_v` 역방향 뷰(공용 DB 분석 §4.3) | Compass 안에서 사본 2개를 따로 고치는 일 |
| 12 | 고객 360 / 리드 상세 | `components/LeadDetailBody.tsx` 리드 단건 | `lib/repositories/crm-customer-360.ts` 계정 통합 단위 | 각자(단위가 다름) | `compass_activities_v` 병기 | 없음 |
| 13 | 방문 분석 | `crm.page_visits` 설명회 랜딩 전용 | `client_events` 사이트 전체, 인덱스 16개 | 각자(origin이 다름) | 없음 | 없음 |
| 14 | 설명회 명단 | `lib/bdSeminars.ts`: 시트 탭 증분을 `crm.leads`로 리드화 | `event-attendance`: `crm_customer_events`의 출신 태그 위 조회 계층(별도 테이블 아님) | 각자(모델이 다름) | 없음 | 없음 |
| 15 | 캘린더 쓰기 인증 | 사람 OAuth만(Workspace가 외부 서비스 계정의 보조 캘린더 쓰기를 막는다는 주석) | 서비스 계정 | 각자(정책 제약) | 없음 | 없음. 단 §2 #12의 소유 계정 확인은 필요 |
| 16 | AI 보조 | `lib/taskParse.ts` + `lib/aiTask.ts` 한 용도 | 마케팅·지사·챗봇·내부 CS·자동화 약 24개 파일 | 각자 | 없음 | 없음(범주만 겹침) |

### 3.2 엔지니어링 중복 10건

| 영역 | Compass | Admin | 공용화 가치 | 판단 |
|---|---|---|---|---|
| 인증 | HMAC 쿠키 90일 + 공용 비밀번호 | Supabase Auth + `admin_profiles` RBAC | 없음 | 보안 모델 하향 위험. 별칭 매핑만 |
| DB 접근 | raw `pg` 풀 | `supabase-js` service role | 없음 | 스키마·RLS 모델이 다르다 |
| 캐시 계층 | 사실상 없음(`revalidatePath` 몇 개, 토큰 캐시 1개) | 명시적 캐시 모듈 4개 이상, 참조 파일 24개 | 없음 | 대칭 대상이 아니다. Compass 규모에 계층이 필요 없다 |
| Google API 클라이언트 | 8개 파일이 각자 RSA JWT를 손으로 서명(`createSign`): `lib/gcal.ts`, `lib/revenue.ts`, `lib/bdSeminars.ts`, `scripts/` 5개. `googleapis` 미설치 | `lib/google.ts` 한 곳 | 있음 | 토큰 발급만 얇게 공용(§3.3 #5) |
| 크론 인증 | `Bearer ${CRON_SECRET}` 문자열을 `!==`로 비교하는 코드를 라우트마다 복붙(7곳) | 같은 패턴 11곳(`app/api/cron/*`) | 있음(가장 쉬움) | 두 앱 도합 18곳의 timing-safe 아닌 비교. 헬퍼 1개면 끝(§3.3 #2) |
| Gemini 클라이언트 | 1모듈 | 5개 하위 영역에 분산 | 낮음 | 성숙도 격차가 크다 |
| 스키마 도구 | `scripts/migrate.mjs` 16줄, 버전 테이블 없음(이번 세션에 `schema-diff.mjs` 추가) | 마이그레이션 166개 + 프로브 스크립트 8종 | 낮음 | 스키마가 달라 코드 공유는 무의미. 패턴만 이식 |
| 측정·게이트 | vitest·eslint 없음 | vitest 3,700건 이상, eslint, 디자인 토큰·크론 검사 | 낮음 | Compass는 최소 게이트부터(§1 먼저 할 5개의 #5와 한 묶음) |
| 디자인 시스템 | three.js 장식 HUD | `DESIGN.md` 토큰 | 없음 | 청중이 다르다 |
| 배포 설정 | `vercel.json` 크론 2개 + GitHub Actions 3개 | `vercel.json` 크론 11개 | 없음 | 코드가 아니라 플랜 차이 `[추정]` |

### 3.3 공용 후보 5개와 순서

전제는 §2와 같다. 이 저장소에 `packages/`가 없으므로 모노레포 전까지 "공용"은 같은 순수 함수 사본을 두 저장소에 두고 같은 픽스처로 계약 테스트를 돌리는 것이다. `lib/compass/normalize.ts`가 브리지 SQL과 바이트 일치를 계약으로 잡은 방식 그대로다.

| 순서 | 후보 | 시그니처 | 정본 | 대체 대상 | 근거 강도 |
|---|---|---|---|---|---|
| 1 | phone-key | `normalizePhoneKey(raw) → string \| null` | `lib/compass/normalize.ts` | Compass 4곳(`lib/sheet.ts`는 확인된 버그), Admin `lib/repositories/leads.ts`의 `digitsOnly`. `lib/crm/phone.ts`는 표시용이라 유지 | 가장 강함. 구현 7곳, 확인된 결함 2곳 |
| 2 | cron-auth | `verifyCronSecret(req) → boolean`(timing-safe) | 신규. Compass 웹훅의 `timingSafeEqual` 패턴 재사용 | 두 앱 18개 크론 라우트 | 가장 싸고 위험이 낮다 |
| 3 | owner-directory | `resolveOwner(nameOrAlias) → {ownerKey, neoOwnerId, label}` | `crm_xiaoshouyi_owner_names` + `admin_profiles` | Compass 하드코딩 3벌을 DB 장애 폴백으로 축소 | 실제 드리프트 이력 |
| 4 | ledger-parser | `parseRevRow(cells, colMap) → {customer, team, manager, status, product, amount, colorTag}` | Admin `rev.ts`의 열 해석 + Compass의 색상 상수(허용오차) | 양쪽 원장 파서의 열 인덱싱. 확정 매출 계산은 밖 | 열 밀림 사고 이력 |
| 5 | google-service-auth | `getAccessToken(scopes) → Promise<string>`(캐시 포함) | 결정 필요. Compass 수제 서명은 지금 동작 중이라 급하지 않다 | Compass 8곳 | 유지보수 부담만, 결함 없음 |

### 3.4 하지 않아도 되는 것 6

- 두 앱 UI·디자인 시스템 통일. 내부 운영 툴 HUD와 소비자 브랜드 토큰은 청중이 다르다.
- Compass의 Supabase Auth 이관. 90일 세션이 콜 도구 UX의 핵심이다. `admin_profiles.crm_owner_aliases` 매핑으로 충분하다.
- 태스크 시스템 병합. 고객 유무 축이 반대라 병합하면 사내 업무가 고객 우선순위 큐를 오염시킨다.
- 광고 성과 리포트 병합. 한쪽은 "종합 ROAS 금지"를, 다른 쪽은 수기 보정 상수를 확정 정책으로 둔다.
- 캐시 계층 통합. Compass에 실질 캐시가 없어 대칭 대상이 없다.
- Meta Graph 클라이언트 완전 공용화. 레벨과 필드셋이 달라 얇은 인증 계층 이상을 공유하면 응답 스키마가 서로 오염된다.

### 3.5 결론 3·3·3

지금 중단할 중복 3개:
1. 담당자 명부를 Compass 안에서조차 2벌 따로 손보는 일. 드리프트가 실제로 있었다.
2. 전화 정규화 결함 경로(Compass `lib/sheet.ts`, Admin `leads.ts`의 `digitsOnly`) 위에 새 기능을 얹는 일.
3. Compass에서 새 스크립트마다 Google JWT 서명을 또 복붙하는 일. 이미 8곳이다.

다음 분기 공용화 3개: phone-key, owner-directory(+ `team_directory_v`), cron-auth.

영구 분리 3개: 태스크·미션 시스템, 광고 성과 리포트 조립, 디자인 시스템·UI.

## 4. 편의 기능(UX) 교차 적용

기준은 "같은 일에 손이 몇 번 줄어드는가"다. 알고리즘·데이터 소유권은 §1~§3에서 끝냈고 여기서는 상호작용만 본다. 화면 7쌍을 하위 티어 에이전트가 읽기 전용으로 비교했고, 오케스트레이터가 파일 존재·줄 수·핵심 동작을 재확인했다. 스타일은 가져오지 않는다. Admin은 `DESIGN.md` 토큰, Compass는 자체 HUD를 유지하고 동작만 옮긴다.

### 4.1 화면 쌍 비교

| 쌍 | Compass가 나은 점 | Admin이 나은 점 |
|---|---|---|
| 리드 목록 | URL에 필터 전부 보존, 카드 클릭 시 같은 페이지 인라인 펼침, 250ms 디바운스 검색 | 일괄 작업(할당·종료), `/` 검색 단축키, SWR 캐시 즉시 그리기, 로드 실패와 빈 목록 구분, 모바일 44px 타깃 |
| 리드 상세 | 필드별 연필 클릭 인라인 편집(칸 단위 저장), 부재중 오조작 즉시 `-1` 되돌리기 | 포커스 트랩 + 이탈 확인(`guardedClose`), `aria-modal`, 드로어 전용 스켈레톤 |
| 케어·오늘 콜 | 셀 호버 편집(엑셀식), 즉시 제출 셀렉트 | 우선순위 큐 로직 분리, 컨택 로그 폼, 스켈레톤 |
| 대시보드 | 숫자 카운트업, 60초 자동 새로고침, 스파크라인 | 수동 새로고침 스피너, cmd+K 빠른 실행 |
| 캘린더·미션 | 한 줄 입력 AI 파싱, 칸반 드래그앤드롭, 라우트 스켈레톤 | 전역 단축키(기간 이동·오늘·뷰 전환·검색), 월·주·레일·스윔레인 4뷰, hover 프리페치 |
| 공통 셸 | 상단 네비게이션 진행바 | 사이드바 접힘 영속, hover 예열, cmd+K 팔레트, 알림 벨, 모바일 반응형 |
| 내보내기·입력 | 단일 다이얼로그(기간·목록·배분·다운로드, 페이지 이동 없음) | 붙여넣기 일괄 등록(헤더 자동 인식 + 행별 검증), bulk-convert |

### 4.2 Admin이 가져올 것 5

| # | 항목 | Compass 근거 | Admin 현재 | 노력 | 효과 |
|---|---|---|---|---|---|
| 1 | 탭 활성 시 60초 자동 새로고침 | `components/AutoRefresh.tsx` 15줄 | `components/admin/crm/home/CrmHomeClient.tsx` 수동 버튼만 | S | 상시 모니터링 화면(우선순위 큐)에서 새로고침 클릭이 사라진다 |
| 2 | 상시 노출 되돌리기 | `components/LeadDetailBody.tsx`의 `undoMissedCall` 폼 | `components/admin/crm/leads/LeadsBoardClient.tsx` 주석이 "되돌리기가 없다"고 적고 다건 실행 전 확인으로 대신한다 | S(단일 필드)~M(상태 전반) | 오조작 정정을 활동 로그가 아니라 그 자리에서 |
| 3 | 필드별 연필 인라인 편집 | `components/EditableBasics.tsx`, `components/InstantField.tsx` | `components/admin/crm/drawer/DrawerContactsSection.tsx`는 전화·이메일 읽기 전용. `LeadDrawer.tsx`는 담당자·팔로업만 onBlur 저장 | M | 오탈자 정정에 별도 화면이 필요 없다 |
| 4 | 네비게이션 진행바 | `components/NavProgress.tsx` 64줄(클릭·GET 폼·뒤로가기 감지, 12초 안전장치) | `components/transitions/RouteTransition.tsx` 34줄, 진입 후 페이드만 | S | 클릭 직후 피드백으로 재클릭 방지 |
| 5 | 한 줄 자연어 입력 | `app/tasks/BoardView.tsx`(로컬 규칙 파서 즉시 프리뷰, 500ms 뒤 AI 정리로 교체) | `LeadRegisterModal.tsx` 464줄, `calendar/EventForm.tsx` 463줄의 다필드 폼만 | L | 폼 5~6칸이 타이핑 1회로. §2 #3의 파서 이식과 같은 작업 |

### 4.3 Compass가 가져올 것 5

| # | 항목 | Admin 근거 | Compass 현재 | 노력 | 효과 |
|---|---|---|---|---|---|
| 1 | 붙여넣기 일괄 리드 등록 | `lib/crm/lead-paste.ts` 93줄 | `app/(main)/leads/new` 단건 폼만 | M(파서 이식 뒤 저장부만 `crm.leads`에 맞춤) | 10건 수기 입력이 붙여넣기 1회로. §1 #9와 같은 작업 |
| 2 | 전역 캘린더 단축키 | `lib/admin-calendar/hotkeys.ts` 66줄(다이얼로그 열림 시 비활성 가드 포함) | `app/tasks/CalendarView.tsx`, `BoardView.tsx`에 Enter 제출 외 전역 단축키 0건 | S~M | 월 전환 등 클릭을 화살표 키로 |
| 3 | cmd+K 팔레트 + 알림 벨 | `components/admin/AdminCommandPaletteLauncher.tsx` 46줄, `CrmCommandPalette.tsx`, `AdminNotificationsBell.tsx` | `components/SideNav.tsx` 클릭 내비만 | M | 목록·검색·클릭 3단계가 입력 1회로. §1 #10과 같은 작업 |
| 4 | 포커스 트랩 + 이탈 확인 규약 | `components/admin/use-dialog-focus.ts` 94줄, `LeadDrawer.tsx`의 `guardedClose` | `DateRangePicker.tsx`, `DateTimeInput.tsx`에 외부 클릭·Escape는 있으나 포커스 트랩 없음. `EditableBasics.tsx`는 이탈 경고 없음 | S | 클릭 수보다 작성 중 메모 유실 방지 |
| 5 | 로드 실패와 빈 목록 구분 | `LeadsBoardClient.tsx`의 `loadError` 상태 분기 | 실패 시 빈 목록과 같은 화면 | S | "리드가 0건"과 "못 불러옴"을 사용자가 구분 |

하위 티어 에이전트는 Admin의 다단 클라이언트 캐시(`adminFetchJsonCached`)도 후보로 올렸으나 채택하지 않았다. Compass는 서버 컴포넌트와 서버 액션 구조라 클라이언트 캐시를 두면 이중 캐시가 되고, §1의 이식 제외 판정과도 어긋난다. 필요하면 서버 쪽 `unstable_cache` 태그 2~3개가 맞는 도구다.

### 4.4 가져가면 안 되는 것

- Compass의 three.js 장식(`ParticleField`, `JarvisCat`, `Scene3D`, `ParticleGull`, 의존성 `three`). Admin `DESIGN.md` 규약과 충돌한다.
- Compass 로그인의 "이름 선택 + 팀 공용 비밀번호"(`app/login/page.tsx`의 `TEAM_PASS`, `BD_PASS`). Admin은 `admin_profiles` 개인 인증·역할이 정본이라 가져가면 감사 추적이 무너진다.
- Admin의 단일 클라이언트 보드(`LeadsBoardClient.tsx` 1,897줄) 통째 이식. Compass의 서버 컴포넌트 구조와 팀 규모에 과하다.
- Admin `AdminSidebar.tsx`(1,021줄)의 hover 프리페치·예열 시스템 통째 이식. Compass는 `loading.tsx` 스켈레톤으로 이미 체감 속도를 확보했다.
- Admin Customer 360의 다중 소스 병합 구조. Compass는 리드 단일 테이블이라 병합할 두 번째 원천이 없다.

확인과 추정의 구분: 상호작용 유무, 되돌리기 존재, 단축키 목록, three.js 의존, 로그인 방식, 파일 줄 수는 코드로 확인했다. "하루 몇 번 줄어드는가"는 사용 로그가 아니라 화면 성격에 근거한 어림이다.

## 5. 실행 순서와 결론

### 5.1 PR 단위 실행 순서

§1·§2·§4의 "먼저 할" 목록과 §3의 3·3·3을 저장소별 PR로 묶었다. 한 PR은 하루 안에 리뷰가 끝나는 크기로 자른다.

| 순서 | 저장소 | 범위 | 출처 | 노력 |
|---|---|---|---|---|
| 1 | Compass | 웹훅 인라인 정규화를 `normPhone` 호출로 교체, `lib/sheet.ts` 사본 제거, `lower(email)` 인덱스, Meta 폼 나머지 답변을 inflow 활동 본문에 보존 | §1 #1·#2·#6 | S |
| 2 | Admin | 재유입 병합 + "마지막 유입 이후 접촉 없음" 게이트. `findLeadsByContacts()`의 키를 `normalizePhoneKey`로 교체 | §2 #1·#2, §3.3 #1 | M |
| 3 | 양쪽 | timing-safe 크론 시크릿 헬퍼 1개를 각 저장소에 두고 18개 라우트 교체. 동작 변화 0 | §3.3 #2 | S |
| 4 | Admin | `compass_adsets_v` 소비 화면 1개, 소재 원본 이미지 확대 | §2 #4·#7 | S |
| 5 | Compass | 미응답·재통화 지남 알림 크론(`lead_alert_states` 테이블 1개, 라우트 1개, 채널 1개) | §1 #3 | M |
| 6 | Admin | 자동 새로고침, 네비게이션 진행바, 단일 필드 되돌리기 | §4.2 #1·#4·#2 | S |
| 7 | Compass | 붙여넣기 일괄 등록, 캘린더 단축키, 포커스 트랩 규약, 로드 실패 구분 | §4.3 #1·#2·#4·#5 | S~M |
| 8 | Compass | 원장 헤더 기반 열 해석(합격 기준: 최근 3개월 사람별 달성 금액 바이트 일치) | §1 #7, §3.3 #4 | M |
| 9 | Compass | 리드 우선순위 점수 v0 + vitest·typecheck 게이트 도입 | §1 #4·#5 | M |
| 10 | Admin | `team_directory_v` 역방향 뷰. Compass 하드코딩 명부 3벌을 폴백으로 축소 | §3.3 #3 | M |
| 11 | Admin | 한 줄 태스크 파싱, 전환 계정 수 최초 결제월 1회, 방문 버킷 | §2 #3·#5·#6 | S~M |

### 5.2 코드 밖에서 먼저 확인할 것

- Meta 앱 대시보드의 leadgen 웹훅 구독 URL 개수. 두 앱 모두 구독돼 있으면 순서 1 전에 Admin 쪽 구독을 끊을지 결정해야 한다(§3.1 #1).
- `GOOGLE_CALENDAR_ID` 소유 계정과 서비스 계정 쓰기 권한. Compass와 같은 정책 벽이면 Admin 캘린더 쓰기가 무음 실패 중이다(§2 #12).
- Compass Vercel 플랜. GitHub Actions 크론 우회가 플랜 상한 때문인지 확인해야 §3.2 배포 설정 판정이 닫힌다.

### 5.3 결론

Admin에서 Compass로 갈 것은 데이터 위생(정규화 단일화·인덱스·폼 답변 보존)과 "찾아오는" 운영(알림·우선순위·오늘 콜)이고, Compass에서 Admin으로 올 것은 재유입 병합과 그 위의 응대 판정, 그리고 손이 덜 가는 상호작용(자동 새로고침·되돌리기·인라인 편집)이다. 통합하지 않을 것은 명확하다. 인증, 태스크 시스템, 광고 리포트 조립, 확정 매출 정의, 디자인 시스템은 각자 두고 브리지 뷰와 대사 리포트로만 만난다. 공용화는 순수 함수 5개로 한정하고 그중 phone-key와 cron-auth는 이번 분기에 끝낸다.
