# 2026-09-21 통합 시점 과제 목록

상태: 현재 기준 운영 문서(통합 1회분의 스냅샷 — 항목이 끝나면 지우지 말고 완료 표시와 날짜를 붙인다)
범위: 같은 시기에 갈라져 있던 작업 줄기 9개를 최신 운영 기준선 위에 한 줄기로 합치면서 드러난 과제. 각 영역의
백로그 정본은 해당 기획 문서이고, 이 문서는 **우선순위와 합치며 내린 판단**만 든다.

## 0. 무엇을 합쳤나

운영 기준선(2026-09-15) 위에 아래 주제를 순서대로 합쳤다.

| 주제 | 규모 | 정본 문서 |
| --- | --- | --- |
| CRM 탭 디벨롭 — UX 라운드 1, §11 1·2단계, §13 Compass 정리, 파트별 에이전트 진입점 | 51커밋·204파일 | [crm-tab-develop-plan](./crm-tab-develop-plan-2026-09-12.md) |
| 마케팅 허브 3층 재구성(한눈에·상세·데이터) | 2커밋 | [marketing-tab-dashboard-restructure](./marketing-tab-dashboard-restructure-2026-09-14.md) |
| 매출 장부 입력 속도 라운드 4 | 16커밋 | [sales-ledger-input-speed-plan](./sales-ledger-input-speed-plan-2026-09-20.md) |
| 하드웨어 탭 입력 가속 P0~P3 + 코드 리뷰 14건 | 9커밋 | [hardware-input-speed-plan](./hardware-input-speed-plan-2026-09-20.md) |
| 컨택·쇼룸 예약·구매 신청 퍼널 Phase A·B·C | 6커밋·55파일 | [contact-showroom-checkout-develop-round2](./contact-showroom-checkout-develop-round2-2026-09-20.md) |
| 리드 마그넷 자료 문구 정리 | 1커밋 | — |
| Compass 패턴 이식(재유입 병합·timing-safe 크론·되돌리기 토스트·한 줄 파싱·광고세트 카드) | 9커밋·49파일 | [compass-admin-feature-exchange](./compass-admin-feature-exchange-2026-09-02.md) |
| Google Ads·네이버 검색광고 연동·귀속 폭포·캠페인 자동 링크 | 9커밋·83파일 | [ad-channel-google-naver-integration](./ad-channel-google-naver-integration-2026-09-14.md) |
| 고객 360 딜 로컬 보정 | 1커밋 | 위 CRM 줄기의 구현이 상위 호환이라 병합 기록만 남기고 흡수 |

추가로 가져온 것: 내부 CS 상담 근거 RPC 오버로드 단일화(수정 + 계약 테스트), 챗봇 골든셋 평가 게이트.

게이트(통합 결과 기준): `typecheck` 0 · `eslint --max-warnings=0` 0 · `vitest` 전체 통과 · `next build` 컴파일·정적 생성 통과.
`postbuild`의 `check:public-content`만 로컬에서 실패했다 — 코드가 아니라 로컬 env가 이관 전 Supabase를 가리켜서다(§1-1).

## 1. P0 — 배포 전 반드시

> **2026-09-21 운영 반영 완료.** 서울 DB 마이그레이션 9개 적용(파일별 안전성 검토·반박 검증 18건 후, 단계마다 읽기 전용 확인) →
> Vercel 운영 배포(main `762e864`, Promote to Production — main push 는 Preview 만 만든다) → 배포 직후 백필 → 라이브 검증
> (공개 페이지 200, 쇼룸 가용성 API 공휴일·쇼룸 캘린더 원천 true, 잘못된 리드 400, 크론 무인증 401, `icn1`, 어드민 접수 큐·
> 마케팅 상세 퍼널·채널 실데이터 렌더). 적용 상세는 [DB 마이그레이션 런북](./db-migration-runbook.md) "2026-09-21 통합 시점".

### 1-1. 환경

- [x] (2026-09-21 완료: Management API 로 서울 URL·publishable·secret·`SUPABASE_PROJECT_REF` 교체, 값 비출력, 백업은 git-ignored `.env.local.bak-20260921-pre-seoul`.) **로컬 `.env.local`을 서울 프로젝트 값으로 교체한다.** 이관 전 호스트는 2026-09-21 실측에서 DNS 조회부터 실패했다.
  이 상태에서는 `check:db`·`check:alpha-db`·`postbuild`·dev 서버의 어드민 화면이 전부 `fetch failed`다.
  근거: [supabase-korea-migration-status](./supabase-korea-migration-status.md) "로컬 개발 환경 점검". — 운영자 수동 조치
- [x] (2026-09-21 확인: 운영 env 에 `SOLAPI_*` 없음 → 접수 확인 문자는 simulated 기록만, 고객에게 나가지 않는다. 켜려면 키 추가 전 이 항목을 다시 본다.) **운영 env에 SOLAPI 키가 있는지 확인하고 접수 확인 문자의 실발송 여부를 정한다.** 쇼룸 예약·도입 신청이 접수되면
  고객 연락처로 확인 문자(템플릿이 있으면 알림톡)를 보낸다. 게이트는 없고 `SOLAPI_API`+`SOLAPI_SECRET` 유무가 곧 스위치다 —
  키가 이미 다른 용도로 들어 있으면 **배포 즉시 고객에게 나간다.** 끄려면 `MESSAGING_DRY_RUN=1`. — 사용자 결정 + 운영자 조치
- [x] (2026-09-21 확인: 운영 env 에 Google 서비스 계정·`SHOWROOM_CALENDAR_ICS_URL` 있음, 라이브 `/api/showroom/availability` 가 `sources.holidays=true, showroomCalendar=true`.) **쇼룸 공휴일 원천 자격을 확인한다.** `GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_PRIVATE_KEY` 또는 `SHOWROOM_CALENDAR_ICS_URL`이
  비면 공휴일 목록이 조용히 빈 배열이 되어 설·추석이 예약 가능일로 열린다(화면에 저하 신호 없음). 도입 신청 희망일 차단도 같은
  원천을 쓴다. 근거: 퍼널 기획 §3-2 S9. — 운영자 확인

### 1-2. 마이그레이션 (서울 프로젝트에, 코드보다 먼저)

적용 목록·순서·미적용 시 증상은 [DB 마이그레이션 런북](./db-migration-runbook.md) "2026-09-21 통합 시점" 표가 정본이다.

- [x] **`20260921_checkout_requests_lead_qualifiers.sql` — 배포 전 필수.** 도입 신청 insert가 `role`·`academy_size`를 무조건 실어
  미적용이면 신청이 500으로 끊긴다.
- [x] 광고 채널 3종(`20260914_ad_channel_daily` → `campaign_links_ad_channels` → `leads_naver_attribution`). 크론이 쓸 테이블이 없으면
  upsert에서 죽고, `leads.naver_ad`가 없는 동안의 네이버 유입 귀속은 소급 복구할 수 없다. 네이버·Google 광고를 켜기 전에.
- [x] `20260914_compass_integration_bridge.sql` → `20260914_leads_phone_key.sql`(이 순서). 브리지는 적용 전 보강판(뷰의 service_role 쓰기 권한 회수, 20260828 기존 뷰 7개 포함)으로 적용했다. 뒤 파일은 앞 파일이 만드는
  `norm_phone_key()`를 부른다. Compass 쪽 선행 배포·재실행 조건은 [compass-integration](./compass-integration-2026-09-14.md) §0·§2.
- [x] `20260828_channel_match_rpc_single_overload.sql`. 적용 전까지 `check:alpha-db`가 이 프로브에서 blocked다(의도된 신호) —
  내부 CS 코파일럿의 "과거 상담 사례" 근거가 2026-07-16부터 빈 배열이었다.
- [x] `20260921_lead_source_intake_split.sql`(멱등 백필 — 배포 직후 실행, 대상 0행). 미적용이면 과거 쇼룸·도입 신청 리드가 계속 `contact_page`로 집계된다.
- [x] 적용 뒤 `npm run check:db -- --strict`, `npm run check:alpha-db`. (2026-09-21: 둘 다 `--strict` 통과 — "DB가 repo 마이그레이션까지 최신", 상담 근거 RPC 프로브 ok.) — 파일별 확인은 읽기 전용 SQL 로 마쳤다. 두 스크립트는 로컬 `.env.local` 이 서울 URL·키로 바뀐 뒤 한 번 돌린다(위 1-1 첫 항목).

### 1-3. 이번 배포에 함께 나가는 동작 변화 (알고 내보낸다)

- **같은 연락처의 재문의가 새 리드 행을 만들지 않는다**(응대 대상 소스 한정 — 데모·문의·쇼룸·도입 신청·Meta 리드폼).
  기존 리드의 `last_inflow_at`만 갱신하고 "재문의(재유입)" 타임라인과 "재문의 · " 접두의 실시간 알림을 남긴다. 담당·상태는 그대로다.
  → 생성 시각으로 세는 화면은 재문의를 세지 못한다(§2-1). 종료·전환된 리드의 재문의도 상태가 다시 열리지 않는다.
- **매출 장부 매트릭스의 셀 직접 커밋은 기본이 "자가 체크"다.** 입력자 = 체크자가 기본값이 된다(옵트아웃 없음).
- **하드웨어 시트 교체 가져오기는 "시트가 이긴다".** 시트가 다시 실은 것과 같은 품목·고객사의 어드민 수기 확정은 void 처리된다(삭제 아님).
- 사이드바 라벨 "캠페인" → "마케팅". 새 어드민 화면: CRM › 고객 › **접수**, **태그**. 공개 헤더에 **쇼룸 예약** 진입.

## 2. P1 — 배포 직후 / 이번 주

### 2-1. 재유입 병합의 후속 공백 (개발)

- [x] (2026-09-21 완료: 판정은 `lib/crm/lead-reinflow.ts`의 `leadInflowInWindow`·`tallyLeadInflow` — 생성이 창 안이면 신규,
  아니면 생성보다 60초 넘게 뒤인 `last_inflow_at`이 창 안일 때 재유입, 둘 다 창 안이면 신규 1건. 마케팅 리드 조회에
  `last_inflow_at`을 선택 컬럼으로 추가(없으면 생성 시각 축으로 강등), "오늘 유입" 캐시 키 v3. 아침 공지·다이제스트·주간 보고서
  "주말 유입"은 재유입이 있을 때만 "신규 N · 재유입 M"을 붙이고, 다이제스트 방치 시간은 최신 유입부터 잰다. 한계: `last_inflow_at`은
  최신 재문의만 담아 직전 기간의 재문의가 나중 재문의로 덮이면 직전 기간 건수에서 빠진다.)
  재문의가 집계에서 빠진다. 어드민 리드를 생성 시각으로만 보는 곳: "오늘 유입" 카드(`lib/marketing/intake-feed.ts`의 어드민 리드
  쪽 — Compass 리드는 이미 `created_at` 또는 `last_inflow_at`으로 센다), 아침 리드 공지(`lib/server/lead-morning-brief.ts`),
  주간·월간 다이제스트(`lib/server/lead-digest-alerts.ts`). `max(created_at, last_inflow_at)` 축으로 옮기고 신규/재유입을 가른다.
- [ ] 재문의한 리드가 보드에서 다시 떠오르지 않는다 — 이식 문서가 후속으로 남긴 `isReinflowAwaitingContact` 배선. 종료·전환
  상태에서 재문의가 오면 어떻게 다룰지(다시 열기 / 배지만 / 담당 알림)부터 정한다.
- [ ] 병합 시 새로 들어온 자격 필드(직책·학원 규모)와 광고 귀속은 기존 리드에 반영되지 않는다(타임라인 본문에만 남는다).
  비어 있을 때만 채우는 coalesce 보강 여부.

### 2-2. 운영 검증·활성화 (운영자)

- [ ] 하드웨어: 운영 배포 → 시트 정리 → 가져오기 → 전시 상태 마이그레이션·샘플 유닛 정리 → 금액·복원 마이그레이션 3종 →
  이중 계상 정책. 순서·근거는 [hardware-scm-tab-reference](./hardware-scm-tab-reference.md) §8(운영 조치 체크리스트)·§6-2.
- [ ] 광고 채널 활성화: env 4세트(Google Ads API, 네이버 검색광고 API, Google 전환 라벨, 네이버 전환 추적) + 네이버 전환 검수 신청.
  [ad-channel-activation-runbook](./ad-channel-activation-runbook-2026-09-14.md) §1~4. 크론 항목은 37개(상한 40).
- [ ] 마케팅 허브 3층 화면의 실데이터 눈검수(1280·390px). 상세 › 소재의 **광고세트별 성과**, 상세 › 퍼널·채널의
  **채널별 집행·커버리지 매트릭스·귀속 폭포**는 옛 요약 탭 배치에서 이 통합 때 옮겨 단 것이다 — 위치가 의도와 맞는지 본다.
- [ ] Compass 로그인 후 화면 검증(이관 문서의 미검증 항목). (2026-09-21: 로그인 페이지 200·무인증 API 401 은 이관 기준과 같고, DB 에서 `postgres`·`service_role` 은 역브리지 뷰를 읽을 수 있음을 확인. 로그인 후 화면은 여전히 미검증 — 팀 비밀번호가 필요해 사람이 본다.) 기존 Supabase 프로젝트의 현재 상태(일시정지 여부)도 대시보드에서 확인.
- [ ] 운영 Production 커밋에 `vercel.json`의 `icn1`이 들어 있는지 배포 직후 1회 확인.

### 2-3. 알려진 결함 (개발, 작음)

- [x] (2026-09-21 완료: 라우트가 `dueAt` 3상태(키 없음=그대로·null/빈 문자열=지움·날짜=설정)를 받고 해석 못 하는 값은 400. "내일로" 되돌리기는 기한이 없던 할 일도 `dueAt: null`로 정확히 복원한다.) 할 일 PATCH가 `dueAt: null`을 못 받아 기한 삭제·"내일로" 되돌리기가 안 된다(`app/api/admin/crm/tasks/[id]/route.ts`가
  `optionalString(raw.dueAt)`로만 받는다. CRM 기획 §10).
  (같은 절의 "우선순위 큐 무효화 함수에 호출자가 없다"는 이미 해소됐다 — `crm-priority-queue.ts`가 리드·할 일·연락 기록 변이에 등록한다.)
- [x] (2026-09-21 완료: `unstable_cache` 60초 + `compass-adsets` 태그, `fresh=1`은 태그 즉시 만료, 절단 판정은 브리지 `truncated`.) `compass/adsets` 라우트는 아직 route-local 메모 + 행 수 근사 절단 판정이다. 같은 계열 `compass/ads`는 Data Cache +
  브리지 `truncated`로 옮겨졌다 — 같은 패턴으로 맞춘다.
- [x] (2026-09-21 제거: 계약 테스트는 `tests/crm/lead-attribution-payload.test.ts`로 옮기고, 수집기 결과를 폼 본문에
  평평하게 펼쳐 보낸 값이 서버 정규화를 그대로 왕복하는지 잠갔다.) 미러링 경로의 귀속 정규화를 `sanitizeLeadAttribution`
  하나로 통일하면서 `lib/marketing-attribution.ts`의 `pickLeadAttribution`은 테스트만 부른다. 제거하거나 위임으로 바꾼다.
- [ ] (2026-09-21 앞의 둘 완료: 태그 행 → 통합 고객 `?tag=` 딥링크(라벨 필터가 URL 상태, 서버 프리페치도 라벨을 싣고 마운트 레인만 시드),
  원천 상태 타일을 팔레트 톤으로. **남은 것: 리드 보드 신선도 캡션.**) 태그 관리 화면의 행 클릭 → 통합 고객 `?tag=` 딥링크 미배선, `customerSourceTone()`의 팔레트 밖 색상, 리드 보드의
  신선도 캡션 생략(`generatedAt` 없음) — CRM 기획 §10의 라운드별 "후속".
- [x] (2026-09-21: `site_settings` 컬럼·overview 카탈로그 프로브 추가, CHECK 전용 `lead_digest_runs`는 주석의 제약 조회로 대체. 서울에서 `check:db --strict` 통과, 제약 정의에 `'daily'`·overview 3인자 한 줄만 있음을 SQL로 확인.) `schema-contract.ts`에 프로브가 없는 최근 마이그레이션 3건(런북 "프로브가 없던 최근 파일").

## 3. P2 — 결정 대기

| 결정 | 질문 | 근거 |
| --- | --- | --- |
| 공개 챗봇 민감 주제 잠금 | 가격·계약·보안·사양 질문을 고정 "확인 필요" 답변으로 잠글 것인가, 큐레이션된 문서로 답할 것인가. 잠금 작업(7월)은 이후 S시리즈 사양·요금제 FAQ를 지식으로 추가한 결정(8월)과 충돌해 이번 통합에서 뺐다(`tests/chatbot/new-docs-relevance.test.ts`가 깨진다) | §5 |
| 리드 유니크 인덱스 | 연락처당 한 행으로 끝까지 갈 것인가. 앱 병합은 들어왔지만 기존 중복·`saveLead` 직접 호출 경로가 남아 여전히 보류 | [런북](./db-migration-runbook.md) 보류 절 |
| 하드웨어 입력 | 어드민 수기 입력 범위(입고만 / +샘플·사무실 / +출고), 고객사 표기 정본(원장 문자열 vs 계정 마스터) | [hardware-input-speed-plan](./hardware-input-speed-plan-2026-09-20.md) §1·§10 |
| 매출 장부 | 시트 역방향 export가 필요한가(D5) — KR Team 밖에서 시트를 읽는 사람이 있는지 확인 후 | [sales-ledger-input-speed-plan](./sales-ledger-input-speed-plan-2026-09-20.md) §6 |
| CRM | 돈흐름을 6번째 작업면으로, `/deals/orders`·`kpi` 재구현, 매출 원장 Phase 2 테이블, NEO `crm_orders` PRD, 리드 소프트 삭제 방식, 되밀기 초안 자동 생성 범위, 문서 아카이브 — 7건 | [crm-tab-develop-plan](./crm-tab-develop-plan-2026-09-12.md) §6 |
| 퍼널 | `/checkout`에 GTM·Pixel·동의 배너 복구(D11, 미결), 쇼룸 헤더 진입 방식(D14), 부가세 표기(D6, 세무 확인), 문의 폼 `role` select 승격(D13 — 결정됐으나 미구현) | [퍼널 기획](./contact-showroom-checkout-develop-round2-2026-09-20.md) §8 |
| 마케팅 허브 | `/admin/marketing` 라우트 정본화(N3) 진행 여부 | [marketing-tab-dashboard-restructure](./marketing-tab-dashboard-restructure-2026-09-14.md) §6 |
| 내부 CS 승인 흐름 | 승인 때 AI 초안을 미리 채우지 않고 고객 전달용 최종 답변을 따로 쓰게 할 것인가(라우트 400 포함), 답변 생성의 첨부 이미지 근거를 담당자 승인 분석만으로 좁힐 것인가(좁히면 캡처를 올리고 바로 만든 초안에 이미지가 빠진다). 구현은 브랜치 `feat/0921-cs-approval-customer-answer`에 있다 — 상담원 작업 방식이 바뀌므로 CS 담당과 정한다 | §6 |
| 알림 발송 시각 UI | "시" 단위만 고르게 한 설계는 Hobby 플랜 전제였다 — Pro에서 분 단위를 열 것인가 | [admin-settings-webhook-toggles](./admin-settings-webhook-toggles-and-schedule-2026-09-07.md) |

## 4. P3 — 백로그 (정본은 각 문서)

- CRM: Wave 1~3, §11 3단계(스키마 동반 — A6·T5·T6·M5). [crm-tab-develop-plan](./crm-tab-develop-plan-2026-09-12.md) §5·§11.5
- 매출 장부: P1-4 매트릭스 인라인 신규 행, P2-8~10, 보드 카드 인라인 편집, 2단계 전환 조건 C1~C6. [sales-ledger-input-speed-plan](./sales-ledger-input-speed-plan-2026-09-20.md)
- 하드웨어: P2-2·P2-3·P3-2~4, 추가형 시트 인제스트 cutover, 읽기 경로 최적화. [hardware-input-speed-plan](./hardware-input-speed-plan-2026-09-20.md), [hardware-scm-tab-reference](./hardware-scm-tab-reference.md) §9
- 퍼널: Phase D 전체(캘린더 상태 표시·접근성·상태 전이 알림·스켈레톤·문의 화면 재구성·디자인 가드·폼 계약 테스트). [퍼널 기획](./contact-showroom-checkout-develop-round2-2026-09-20.md) §4
- 마케팅: Wave 3, Compass 광고 성과표의 Google·네이버 반영, 기타 채널(카카오·YouTube·오프라인)은 수기 입력만. [ad-channel-activation-runbook](./ad-channel-activation-runbook-2026-09-14.md) §6
- Compass↔Admin 교차 이식 미착수 5건(일부는 Compass 저장소 소유). [compass-admin-feature-exchange](./compass-admin-feature-exchange-2026-09-02.md) §6
- 플랫폼: Admin 속도 3라운드 잔여(문서 §7 표의 완료/미완 상충부터 정리), 사장 테이블 드롭 여부, 초기 마이그레이션 5종 멱등성. [admin-performance-round3](./admin-performance-round3-2026-09-10.md), [런북](./db-migration-runbook.md)

## 5. 합치며 내린 판단 (재발 방지 기록)

**같은 문제를 서로 모르고 고친 쌍이 셋 있었다.** 줄기가 오래 갈라져 있으면 또 생긴다.

1. 고객 360 딜의 "방금 쓴 값이 되돌아 보이는" 문제 — 두 줄기가 같은 경로에 이름은 같고 시그니처가 다른 헬퍼를 각자 만들었다.
   할 일까지 덮고, 고객 전환 중 patch 유출을 막고, 회귀 테스트가 있는 쪽을 정본으로 두고 다른 쪽은 기록만 남겼다.
2. 쇼룸·도입 신청 리드의 광고 귀속 누락 — 한쪽은 평평한 필드, 한쪽은 `attribution` 묶음으로 같은 날 고쳤다. 서버 정규화는
   네이버 `n_*`까지 다루는 `sanitizeLeadAttribution` 하나로, 폼은 평평하게 한 번만 보내게 통일했다. `currentPage`는 테스트로
   고정돼 있던 "sourcePage 우선"을 유지했다.
3. 토스트의 `action` 버튼 — 모양이 같아 상위 호환(닫기·실패 톤 포함) 쪽을 채택했다.

**옛 배치에 단 카드는 새 구조의 같은 뜻 자리로 옮겼다.** 광고세트 카드는 소재 카드가 옮겨 간 상세 › 소재로, 채널별 집행·커버리지·귀속
폭포는 "왜·어디서"를 답하는 상세 › 퍼널·채널로. 한눈에 층은 판정과 핵심 숫자만 둔다는 재구성의 원칙을 지켰다.

**합치며 드러나 고친 것.**

- 재유입 병합용 `leads.phone_key` 생성 컬럼이 옛 브리지 뷰의 인라인 치환식을 굳혀, 같은 날 넓어진 TS 정규화·`norm_phone_key()`와
  `"+82 010-…"`·`"1012345678"`에서 키가 어긋났다(병합이 그 번호들을 조용히 놓친다). 함수 호출로 바꾸고 선행 가드를 넣었다.
- 광고세트 API의 기간 키가 사본 목록이라 새 "이번 달" 프리셋에서 400이 났다 → `PERF_PERIOD_KEYS` SSOT.
- 채널 믹스 카드가 읽던 `metaSpendUsd`가 다른 줄기에서 `liveSpend`+`liveCurrency`로 일반화됐다 → 통화를 아는 값만 통화 코드
  그대로, 합계는 통화가 하나일 때만.
- 헬퍼 도입 이후 다른 줄기에서 생긴 크론 라우트 넷이 시크릿을 직접 비교하고 있었다 → `checkCronAuth` + 전 라우트 커버리지 테스트.
- 네오CRM 되밀기 정책의 필수 필드를 넓힌 줄기와, 같은 정책을 최소 payload로 검증하던 줄기의 테스트가 부딪혔다 → 테스트가
  실제 매퍼로 payload를 만든다.
- 마케팅 리드 조회가 새 컬럼(`naver_ad`) 미적용 DB에서 통째로 실패했다 → 없는 선택 컬럼만 빼고 다시 읽는다.
- Windows에서만 실패하던 테스트 11건: CRLF 체크아웃(→ `.gitattributes`로 LF 고정)과 경로 구분자(→ `/`로 통일).

## 6. 가져오지 않은 것

- **로컬에만 있던 작업 3건**(원격에 없다 — 백업이 먼저다): 공개 챗봇 민감 주제 잠금(§3 결정 대기), 내부 CS의 외부 모델 전송 PII
  리댁션 + 검수 답안 필수화(2026-09-21: **리댁션은 main 에 병합** — 외부 모델(생성·비전·회귀 심판·임베딩)로 나가는 질문·히스토리·파일명·요약·OCR·교정본을 `lib/internal-cs-chat/privacy.ts` 경계에서 가린다. 승인 흐름 부분은 §3 결정 대기. 남은 노출: 내부 AI 브리지 dispatch 웹훅은 대화 원문을 그대로 보내고, 캡처 이미지 바이트는 Gemini 비전에 원본으로 간다), CRM 고객 배치·선택 모션
  (통합 고객 화면 재설계로 UI 재작업 필요, `lib/crm/customer-placement.ts` 로직은 그대로 쓸 수 있다).
- **인프라 Phase 0 묶음**(리전·이미지 최적화·캐시 헤더·타임아웃): 리전을 `sin1`로 되돌리는 줄이 들어 있어 통째로 가져오면 안 된다.
  나머지는 항목별로 본다 — Supabase fetch 10초 타임아웃은 긴 RPC(시트 교체 가져오기 등)를 끊을 수 있고, `/l/<slug>/assets`
  1년 immutable은 같은 파일명으로 이미지를 덮어쓰는 현재 랜딩 작업 방식과 충돌하며, Toss 승인 타임아웃은 결제 경로라 실결제
  환경 검증이 필요하다. `/docs` 이미지 최적화 복구(760px 표시에 최대 9MB 원본 전송)는 가장 안전한 후보다.
- 이미 다른 형태로 운영 기준선에 들어가 있던 것: Supabase 최적화 리뷰의 perf 커밋들, 한국 리전 기록, 캘린더 범위 선택.
- 기준선이 그 뒤로 재설계돼 자리가 없어진 것: 공개 페이지 서버/클라이언트 분리(7월), 홈 Overview의 CRM 런처, 캠페인 화면
  스켈레톤·포커스, "죽은 JSON CRUD 정리"(적용하면 `lib/repositories/bugs.ts`가 컴파일되지 않는다 — 전제가 무너졌다).

## 7. 운영 반영 중 새로 발견한 것 (2026-09-21)

- [x] (2026-09-21 수정: 원인은 Next 16 ISR 이 디코드된 한글 경로로 만든 암묵 캐시 태그가 minimal mode(Vercel)에서 `x-next-cache-tags` 헤더에 실려 Node 가 거부한 것. `proxy.ts` 가 헤더에 못 싣는 슬러그만 `/blog/_u8_<base64url>` 토큰 경로로 rewrite 한다 — 주소창 URL·canonical 은 원래 슬러그 그대로, ISR 유지, `revalidatePath` 도 토큰 경로로. `lib/blog-slug-route.ts`.) **한글 slug 블로그 글이 500.** 예: `/blog/naver-2026-06-11-최대-500만원-…`. Vercel 런타임 로그
  `TypeError: Invalid character in header content ["x-next…`. 배포 **전** 빌드(17:20 KST)에서도 같은 오류가 있었고 이번 배포 뒤에도
  재현된다 — 이번 통합의 회귀가 아니다. `app/blog/[slug]/page.tsx` 는 ISR(`revalidate=3600`, `dynamicParams`)이고, 디코딩된
  한글 경로가 Next 내부 헤더에 들어가는 것으로 보인다. 네이버에서 가져온 글이 이 형태라 SEO 영향이 있다. — 개발 작업(별도 세션으로 분리)
- [ ] **Compass 브리지 뷰 권한 보강의 Compass 쪽 반영 확인.** 이번에 20260828 브리지 뷰 7개와 새 뷰 6개에서 service_role 쓰기 권한을
  회수했다. 어드민 앱은 읽기만 하므로 영향이 없지만, Compass 저장소가 같은 뷰에 쓰는 경로가 있는지 한 번 확인한다(없을 것으로 본다 —
  뷰 주석이 "쓰기 금지"다). — Compass 담당 확인
