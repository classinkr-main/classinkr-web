# 어드민 · Compass 점검과 브랜치 통합 기록 (2026-11-25)

기준 시점: 2026-11-25 ~ 11-26 · 대상: 이 저장소의 어드민과 Compass 연결부, 운영 Supabase(서울 프로젝트, 읽기 전용)
상태: 점검 기록 — 각 기능의 정본은 해당 기획·런북 문서다. 이 문서는 "무엇을 합쳤고, 무엇을 찾았고, 무엇을 고쳤고, 사람이 정할 일이 무엇인지"를 남긴다.

읽는 법

- 줄 번호는 통합 직후 `main` 기준이다. 수정 PR 이 들어가면 몇 줄 밀린다.
- 운영 DB 는 `select` · `explain` 만 했다. 쓰기 · DDL · 마이그레이션 적용 · 운영 배포는 하지 않았다. 숫자는 건수와 구조뿐이다.
- §1 은 병합 기록이라 [10-28 통합 기록](integration-followups-2026-10-28.md)과 같은 방식으로 원천 브랜치를 이름으로 적는다.
- §2 본문에는 메인 세션이 코드를 읽거나 실행해 확인한 것만 적었다. 하위 모델이 훑고 상위 모델이 한 번 더 검증했지만 메인 세션이 다시 읽지 않은 항목은 부록에 건수로만 둔다.

---

## 1. 병합 결과

`main` 에 없는 커밋이 있는 원격 브랜치 71개를 분류해 15개를 합쳤다. 통합 PR #112 는 Vercel Preview 성공을 확인한 뒤 merge commit 으로 `main` 에 들어갔다(11-25). 리베이스 · 스쿼시 · force-push 는 쓰지 않았고 원 브랜치는 지우지 않았다.

### 1-1. 합친 브랜치 (15, 오래된 것부터)

| # | 브랜치 | 마지막 커밋 | main 대비 | 내용 | 충돌 |
|---|---|---|---|---|---|
| 1 | `feat/rev-future-week-pending` | 11-12 | +2 | REV 시트 예정 주차 — 행에서 확정 · 제외, 일괄 선택, 되돌리기 | 없음 |
| 2 | `claude/upbeat-mendel-b76vkh` | 11-20 | +4 | 총판 미수금 탭 — 경과일 · 묶음 · 검색 보드, 입금 요약 API | 없음 |
| 3 | `claude/zealous-dirac-zz54vi` | 11-20 | +5 | 견적 작성기 — 총판 견적서 초안 동시 작성, 채널가, 증정 토글, 구간가 추천 | 2 파일 |
| 4 | `cloud_11.08` (PR #106) | 11-23 | +1 | SEO — 수업 녹화 안내 · 도입 상담 제목 | 없음 |
| 5 | `cloud_11.09` (PR #107) | 11-23 | +1 | SEO — 사이트 정체성 표기 | 없음 |
| 6 | `codex/seo-first-week-sitemap-20261123` (PR #105) | 11-23 | +1 | SEO — 첫 주 가이드 sitemap lastmod | 없음 |
| 7 | `fix/crm-sync-cache` | 11-23 | +2 | CRM 동기화 — NEO 시간 예산, 죽은 잠금 해제, 동기화 뒤 캐시 만료 | 없음 |
| 8 | `claude/quad-settlement-board` (PR #108) | 11-23 | +1 | 쿼드러닝 정산 잔액 보드 + Overview 카드 | 1 (문서) |
| 9 | `claude/trusting-mccarthy-dftsk4` (PR #110) | 11-25 | +8 | 전환 계약을 계약서 탭에, 총판 견적서 자동 생성 · 확인 · 금액/할인/문구 수정 | 5 파일 |
| 10 | `claude/fervent-clarke-5h2v1p` | 11-25 | +46 | 챗봇 · 내부 CS 후속 — 핸드오프 재시도, 이벤트 선점, CRM 이벤트 중복 방지, 함수 번들 크기 | 4 파일 |
| 11 | `claude/gifted-johnson-llh28q` | 11-25 | +20 | 매출 장부 시트, KR TEAM 개요, 본사 주간 보고, AI 인사이트, HW 시트 동기화 | 16 파일 |
| 12 | `cloud_11.10` | 11-25 | +10 | Overview 누적 고객 · 누적 판매 | 2 파일 |
| 13 | `claude/blissful-gates-t60cit` | 11-13 | +60 | 콘텐츠 랩 보고서 · 원장(문서만) | 3 (문서) |
| 14 | `claude/elegant-mayer-8m3u82` | 11-11 | +17 | 발표 자료 HTML 2종 | 없음 |
| 15 | `claude/sleepy-ride-7vvu9i` | 11-09 | +12 | 설정 › 주소의 서비스 소개서 주소 그룹 | 2 파일 |

충돌을 푼 방식과 통합 뒤에만 드러나 고친 것(챗봇 답 색인 근거 재고정, 번들 키 겹침 등록, 테스트 픽스처 보강)은 PR #112 본문에 있다.

### 1-2. 건너뛴 것 — 이미 main 에 있음 (33)

스쿼시 · 체리픽으로 들어가 커밋만 다른 경우다. `git cherry` 가 아니라 파일 대조로 확인했다.

`cloud_10.4` · `claude/gifted-johnson-yt0upf` · `claude/campaigns-ia-1106` · `claude/exciting-cori-uob5sa` · `claude/fervent-maxwell-cs18yb` · `claude/gifted-goldberg-81hpm7` · `claude/landing-claims-1106` · `claude/practical-cori-dqrzmi` · `claude/recording-neighbors-tidy` · `claude/stoic-fermi-kcfwws` · `claude/magical-hawking-nj21a8` · `fix/design-guard-zero-1110` · `claude/assignee-change-error-ntx67o` · `claude/confident-goodall-s0zk6b` · `chore/plan-day1-2` · `claude/eloquent-pascal-ki2die` · `feat/chatbot-claude` · `fix/chatbot-lead-capture` · `claude/practical-rubin-wuil8i` · `cloud_11.05` · `cloud_11.07` · `codex/homepage-20261122-public-form-polish` · `claude/hw-home-a2` · `claude/relaxed-davinci-gsfdks` · `ccr-d845026c-1ny1wk` · `claude/lucid-davinci-yakvlr` · `cloud_10.3` · `cloud_11.01` · `worktree-cleanup-dead-json-crud` · `claude/claude-instructions-agent-review-cxzb8l` · `claude/confident-mclean-a3653b` · `codex/remove-unresponded-webhooks` · `codex/supabase-korea-cutover`

### 1-3. 보류 (23)

| 브랜치 | 마지막 커밋 | 이유 |
|---|---|---|
| `claude/laughing-turing-8mkha9` | 11-25 | 챗봇 위젯 답변 화면 개선. main 이 위젯을 여러 모듈로 쪼갠 뒤라 단일 파일 기준 변경을 그대로 합칠 수 없다 — 새 구조 위로 다시 옮겨야 한다 |
| `claude/awesome-thompson-ul3tf0` | 11-20 | 매출 장부 기본 표를 매트릭스형으로 교체. 지금 main 의 시트형 첫 화면과 대체 관계다 |
| `claude/trusting-maxwell-nmppex` | 11-10 | `/expo` 박람회 쇼케이스(정적 자산 약 100MB, 경로 전용 CSP 완화). 충돌은 없으나 2주 경과, 미정 문구 · 공유 링크 결함이 남은 공개 경로 추가 |
| `cloud_11.06` | 11-09 | /product/hw 설치 사례 + 페이지 분리. 그 뒤 main 이 같은 페이지 문구를 여러 번 고쳐 다시 옮겨야 한다 |
| `claude/ecstatic-einstein-4hbjj4` | 11-10 | 하드웨어 재고 홈 위계. main 이 홈 탭을 다시 설계해 4개 파일 충돌 |
| `claude/hopeful-edison-tbjxlb` | 11-10 | 절반은 다른 PR 로 대체됨, 나머지는 리드마그넷 덱 2.8만 줄로 배포 의도가 불분명 |
| `claude/compassionate-lovelace-8pkyg6` | 11-10 | 가이드 탭 재구성 기획 문서 + 소폭 코드(결정 대기) |
| `ccr-9b509232-qt3uck` · `claude/cool-ramanujan-smpryc` · `ccr-a8fe9b96-hdt6jr` | 11-08 · 10-29 · 11-03 | 시안 · 실험 산출물 |
| `ccr-387635ed-t2fnt1` | 11-04 | 기획 문서 2건뿐, 3주 경과 |
| `design/p1-visual` | 11-02 | 핵심은 main 에 있다. 남은 부분은 44개 파일 충돌 |
| `cloud_10.0.4` | 10-29 | +138 커밋, 47개 파일 충돌 |
| `cloud_0923-home4.71` · `cloud_0923-home4.71_hard` | 09-29 | 10-28 통합 때 의도적으로 뺀 줄기, 37~49개 파일 충돌 |
| `claude/gallant-maxwell-r1m2kq` | 09-22 | 2개월 경과, 장부 핵심 파일 10개 충돌 |
| `claude/relaxed-mcnulty-f6c5ba` | 09-25 | 보관용 wip, 같은 목적이 main 에서 다른 방식으로 구현됨 |
| `archive/bigmac-20261001-home-v3` · `-v5` | 08-16 · 09-13 | archive 줄기 |
| `codex/crm-customer-placement-motion` · `claude/admin-campaign-marketing-eval-clfpw2` · `claude/homepage-crm-routes-display-bz3ixc` · `claude/admiring-dirac-9a012d` | 07-03 ~ 07-20 | 4개월 이상 경과, main 과 1,300 커밋 이상 차이 |

### 1-4. 검증

| 단계 | 통합 PR #112 | 수정 PR #113 (§3) |
|---|---|---|
| `npm run typecheck` | 통과 | 통과 |
| `npx eslint app components lib --max-warnings=0` | 통과 | 통과 |
| `npx vitest run tests` | 14,018건 중 5 실패 | 14,096건 중 4 실패 |
| `npm run build` | 통과(정적 534쪽) | 통과(정적 534쪽) |
| `npm run check:vercel-crons` | 통과(40개) | 통과(40개) |

남은 실패는 통합 전 main 에서도 똑같이 난다. `cron-auth` 1건 · `meta-instagram-dashboard-cache` 1건 · `answer-index/assist` 2건은 검증 환경에 설정된 환경변수 때문이고 환경변수를 비우면 통과한다. 다섯 번째였던 `hardware-card-group` 은 KST 00~09시에만 실패하던 실제 결함이라 수정 PR 에서 고쳤다(§2-1 A-9).

### 1-5. 미적용 마이그레이션 (운영 서울 프로젝트, 카탈로그 조회로 확인)

| 파일 | 상태 | 미적용 시 |
|---|---|---|
| `20261123_partner_settlement_snapshots.sql` | 미적용 | 쿼드러닝 보드가 안내 한 줄로 물러난다 |
| `20261124_distributor_settlement_confirm_revise.sql` | 미적용 | 총판 확인 · 발행 후 수정 · 할인/문구 저장만 막힌다 |
| `20261125_chatbot_handoff_claim_retry.sql` | 적용됨 | — |
| `20261125_crm_events_channel_source_unique.sql` | 적용됨(11-25 저녁, 다른 작업자) — 처음 조회 때는 미적용이었다 | — |
| `20261125_internal_cs_event_claim_before_conversation.sql` | 적용됨(11-25 저녁, 다른 작업자) — 처음 조회 때는 미적용이었다 | — |
| `20260915_meta_leadgen_single_receiver.sql` | 뷰 하나만 빠짐 — 다시 돌려도 지금은 만들어지지 않는다(§6-2) | compass 모드 미러가 제출을 못 읽는다 |
| `20261104_meta_crm_signal_events.sql` | 적용함(11-27, §6-2) | — |
| `20261126_branch_rev_period_entries_run_id_idx.sql` | 적용함(11-27, §6-2) | — |
| `20261126_drop_duplicate_indexes.sql` | 미적용(이번에 추가, §3-2) | 어드바이저 경고 3건이 남는다 |

적용 순서와 확인은 [DB 마이그레이션 런북](db-migration-runbook.md)을 따른다. 이 표의 상태는 11-27 기준으로 고쳤다 — 그 뒤의 진행은 §6-2 에 있다.

---

## 2. 점검에서 찾은 것

방법: 어드민 화면 84개 경로를 개발 서버에서 읽기 전용으로 순회했다(브라우저에서 GET 이 아닌 요청과 외부 도메인 요청을 전부 차단). 코드는 33개 범위로 나눠 하위 모델이 훑고 상위 모델이 항목마다 반박을 시도했다 — 248건 중 확정 145 · 가능성 81 · 기각 22. 그중 위험이 큰 51건(P0 1 · P1 50)을 메인 세션이 다시 읽었다.

### 2-1. 운영 장애 · 데이터 오류 위험

고친 것

| # | 문제 | 근거 | 상태 |
|---|---|---|---|
| A-1 | **REV 시트를 비어 있게 읽으면 미러 표 전체가 지워지고 성공으로 기록된다.** 파싱 결과가 0행이어도 `replaceBranchRevDeals` 가 truncate + insert 를 그대로 실행했다. 시트 범위가 비거나 고객 열 머리 이름이 바뀌는 날 매출 화면 전체가 0이 된다 | `lib/branch/sync/sync-rev.ts:32` | 고침 — 0행이면 쓰기 전에 실패 처리, 기존 미러 유지 |
| A-2 | HW 시트 동기화도 같은 구조. 입고 · 출고가 0행이어도 네 표를 교체했다 | `lib/branch/sync/sync-hw.ts:28` | 고침 — 네 표 교체 전에 검사 |
| A-3 | **1000행에서 조용히 잘리는 읽기.** PostgREST 응답 상한이 1000행이다(운영에서 실측: 요청한 표가 1,999행 · 5,655행 · 33,980행이어도 1000행만 온다). `.limit(5000)` 을 붙여도 상한은 그대로다. 아래 A-3a~h 가 여기에 해당한다 | 아래 | 아래 |
| A-3a | 뉴스레터 수신자 목록 — 활성 구독자가 1000명을 넘으면 뒤쪽이 발송에서 빠진다 | `lib/repositories/marketing.ts:310` | 고침(id 키셋) |
| A-3b | 자동화 세그먼트 수신자 — 페이지 없음 + 읽기 오류를 무시해 "대상 0명"으로 정상 종료 | `lib/automation-engine.ts:97` | 고침(페이지 순회, 오류는 던짐) |
| A-3c | 하드웨어 시트 가져오기의 복원 스냅샷 — 1000행에서 잘리면 되돌릴 때 나머지가 사라진다(운영 현재 445행) | `lib/repositories/hardware-inventory.ts:2564` | 고침 |
| A-3d | 리드 채널 집계 — 리드 전체를 페이지 없이 읽는다(운영 리드 751행, 상한에 가깝다) | `lib/repositories/leads.ts:1598` | 고침 |
| A-3e | 확정된 리드→고객 링크 — 오름차순 정렬이라 잘리면 최신 확정이 빠진다 | `lib/repositories/crm-source-links.ts:2097` | 고침 |
| A-3f | NEO 지역 힌트 — 세 읽기가 1000행에서 잘리고, 오류면 빈 힌트를 돌려 스냅샷의 지역 · 과금 유형을 덮어쓴다. 외부 레코드 2만 행 페이지 스캔은 정렬이 없어 행이 겹치거나 빠질 수 있었다 | `lib/repositories/crm-neo-customer-snapshots.ts:299, 429, 446` | 고침 |
| A-3g | 방문 통계 폴백 · 리드마그넷 지표 · 행사 참석 집계 — 상한 초과분 누락, RPC · 조회 오류를 빈 결과로 바꿈 | `lib/admin-visitor-stats.ts:213`, `lib/repositories/lead-magnet-metrics.ts:140`, `lib/repositories/event-attendance.ts:46` | 고침 |
| A-3h | 내부 CS 대화 큐 — 최신 100건만 받고 전체 건수를 무시해 오래된 열린 대화가 큐와 배지에서 빠진다 | `components/admin/cs-chat/InternalCsChatWorkspace.tsx:559` | 고침(전체 건수까지 이어 받고, 못 받으면 화면에 알림) |
| A-4 | 공개 행사 읽기가 실패하면 빈 목록이 1시간 캐시된다 — 행사 목록 · 상세 · 어드민 지점 요약이 그동안 "행사 없음" | `lib/repositories/public-events.ts:343` | 고침 — 실패는 던져 직전 페이지를 유지. 빌드 중 실패만 예전처럼 빈 값 |
| A-5 | 리드 삭제가 DB 오류를 "없음(404)"으로 바꾼다. 연락 이력까지 지우는 삭제인데 감사 기록이 없었다 | `lib/repositories/leads.ts:1490` | 고침 — 500 으로 드러내고 감사 로그 기록(연락처는 싣지 않음) |
| A-6 | 영수증 번호가 "행 수 + 1" — 중간 영수증을 지우면 이미 있는 번호를 다시 만들어 유니크 위반이 반복된다 | `lib/repositories/receipts.ts:15` | 고침 — 최대 순번 + 1, 위반 시 재시도 |
| A-7 | 외부 CRM 동기화 크론이 후속 단계(스냅샷 · 매칭 후보 · 재연락 알림) 실패에도 200 을 돌리고 알림이 없다 | `app/api/cron/sync-external-crm/route.ts:37` | 고침 — 207 + 경고 알림 |
| A-8 | 리드 다이제스트가 채널톡 건수를 저장소에 든 JSON 파일에서 읽고, 챗봇 넘김 조회 실패를 0건으로 보낸다 | `lib/server/lead-digest-alerts.ts:222` | 고침 — DB 에서 읽고, 실패는 "확인 불가"로 표시 |
| A-9 | 대여 경과일이 KST 00~09시에 하루 어긋난다 | `components/admin/hardware/inventory/shared.tsx` | 고침(KST 달력일) |
| A-10 | Overview 가 보조 조회 실패를 0 · 빈 값으로 그려 실제 수치처럼 보인다 | `app/admin/overview/OverviewClient.tsx:708` | 고침 — 이전 값 유지 + 실패 표시 |

남은 것 — 고치지 않았다. 발송 · 결제 · 계약 · 접근 정책이 걸려 있어 사람이 정해야 한다(§5).

| # | 문제 | 근거 |
|---|---|---|
| B-1 | **자동화 지연 발송 큐에 선점이 없다.** 대기 행을 읽어 보낸 뒤에야 `sent` 로 바꾼다. 발송과 상태 기록 사이에서 죽거나 크론이 겹치면 같은 메일이 다시 나간다. 건수 상한과 `maxDuration` 도 없다 | `app/api/cron/automation/route.ts:137`, `lib/repositories/automation-delay.ts:67` |
| B-2 | 자동화 규칙 수동 실행이 중복 방지 · 건수 상한 · `maxDuration` 없이 세그먼트 전원에게 보낸다(두 번 누르면 두 번 나간다) | `app/api/admin/automation/rules/[id]/trigger/route.ts:14` |
| B-3 | 문자 일괄 발송에 중복 발송 방지가 없다. 수신자는 "활성 구독자 중 전화번호 있는 사람"이며 문자 수신 동의를 따로 보지 않는다(1회 상한은 있다) | `app/api/admin/sms/send/route.ts:47, 163` |
| B-4 | 이메일 발송 뒤 단계(캠페인 상태 기록 등)에서 오류가 나면 "잘못된 요청(400)"으로 응답한다 — 실제로는 발송됐는데 실패로 보여 다시 보내게 된다 | `app/api/admin/email/send/route.ts:379` |
| B-5 | **결제 승인 뒤 주문 상태 기록이 실패하면 복구 경로가 없다.** 승인은 끝났는데 주문은 미결제로 남고, 다시 호출하면 결제사가 이미 처리된 결제라고 거절한다. 결제사 웹훅 수신 경로가 없고 승인 호출에 타임아웃도 없다 | `app/api/billing/checkout/confirm/route.ts:139`, `lib/billing/toss.ts:49` |
| B-6 | 계약 서명 경로가 계약 상태를 보지 않는다 — 취소 · 완료된 계약에 서명하면 상태가 서명 단계로 되돌아간다 | `app/api/portal/contracts/[id]/sign/route.ts:83` |
| B-7 | 공개 견적 수락이 공유 링크의 만료만 확인한다. 공유 방식(열람 전용 `view` 인지 응답용 `sign` 인지)과 그 판이 최신인지는 보지 않는다. 문서가 보관 · 만료 상태면 상태 변경만 건너뛰고 수락 기록과 CRM 카드는 남긴다 | `app/api/share/quote/[token]/accept/route.ts:77, 170` |
| B-8 | 외부 CRM 쓰기 실행이 공용 호출기를 쓰는데, 그 호출기는 메서드를 가리지 않고 5xx · 429 · 타임아웃에 최대 4회 재시도한다. 상대가 처리하고 5xx 로 답한 생성 요청은 중복 레코드가 된다 | `lib/external-crm/xiaoshouyi-request.ts:57`, `lib/external-crm/xiaoshouyi-write.ts:934` |
| B-9 | 문서 챗봇 색인 재생성이 "전부 삭제 → 삽입" 두 요청이다. 삽입이 실패하면 색인이 빈 채로 남는다 | `lib/admin-docs.ts:1027` |
| B-10 | 문서 일괄 수정이 게시 검증을 거치지 않는다 — 본문이 빈 초안도 일괄로 게시된다 | `app/api/admin/docs/articles/bulk/route.ts:57` |
| B-11 | Meta 리드 웹훅(어드민 · 그림자 모드)이 리드 저장 실패에도 200 을 돌려 Meta 가 재전송하지 않는다. 상세 조회가 실패하면 내용이 빈 리드를 저장한다 | `app/api/meta/webhook/route.ts:121, 135` |
| B-12 | **크론 경로 두 개가 어디에서도 호출되지 않는다.** 챗봇 핸드오프 재시도와 내부 CS 첨부 보관 기간 정리 — `vercel.json` 에 항목이 없고 시간 슬롯 디스패처도 부르지 않는다. 등록 상한(40개)이 이미 찼다 | `app/api/cron/chatbot-handoff-retry/route.ts`, `app/api/cron/internal-cs-retention/route.ts`, `vercel.json` |
| B-13 | CRM 입력함 적용에 선점이 없다. 활동 기록은 유니크 색인이 막지만 새 리드 생성과 할 일 생성은 "읽고 나서 쓰기"라 동시 제출이면 겹칠 수 있다. 행마다 직렬 호출이고 `maxDuration` 이 없다(중간에 끊겨도 이어서 적용은 된다) | `lib/crm/capture/apply.ts:109`, `app/api/admin/crm/capture/batches/[id]/apply/route.ts:27` |

DB 권한 — 운영 카탈로그에서 확인

| # | 문제 | 근거 |
|---|---|---|
| C-1 | **`leads` · `newsletter_subscribers` 에 "누구나 INSERT 허용(검사 조건 true)" 정책이 있고 anon 역할이 표 권한을 갖고 있다.** 공개 키만으로 폼 검증 · 속도 제한 · 동의 처리를 건너뛰고 행을 직접 넣을 수 있다. 이 저장소의 쓰기는 전부 서버(service role)를 거친다 | `pg_policies` · 표 권한 조회, `supabase/migrations/20260614_alpha_admin_base_schema.sql:180` |
| C-2 | `is_active_admin()` 이 상태만 보고 역할은 보지 않는다. 이 함수가 정책 77개를 받친다. 지금 활성 프로필은 관리자 등급뿐이라 당장 새는 곳은 없지만, 제한 역할 계정을 활성화하는 날부터 브라우저 키로 관리자 표 전부가 열린다 | 함수 정의 · `pg_policies` 조회, 같은 파일 `:25` |
| C-3 | `increment_campaign_open_count` 가 SECURITY DEFINER 이고 anon 이 실행할 수 있으며 `search_path` 가 고정돼 있지 않다. 그런 함수가 29개다(어드바이저) | 어드바이저 · `pg_proc` 조회 |
| C-4 | 비밀번호 유출 대조(leaked password protection)가 꺼져 있다 | 보안 어드바이저 |

### 2-2. 성능

고친 것

| # | 문제 | 근거 | 상태 |
|---|---|---|---|
| P-1 | CS 문의 대시보드가 서로 무관한 읽기 7건을 차례로 기다린다(개발 서버 실측 약 3초) | `lib/cs/inquiry-dashboard.ts:126` 외 | 고침(동시 시작) |
| P-2 | 매출 대시보드 · 지점 요약이 묶음 조회가 끝난 뒤에 독립 읽기를 하나 더 기다린다 | `lib/admin-crm-revenue.ts:1015`, `lib/branch/summary-payload.ts:308` | 고침 |
| P-3 | REV 임포트 읽기가 라인 → 엔트리 직렬이고, 캐시가 비었을 때 동시 요청마다 같은 5~6쪽을 각자 읽는다 | `lib/repositories/sales-ledger-imports.ts:370` | 고침(동시 조회 + 진행 중 요청 공유) |
| P-4 | 하드웨어 판매 대시보드가 부모 데이터 객체가 바뀔 때마다 다시 조회한다 | `components/admin/hardware/inventory/HomeTabPanel.tsx:323` | 고침(명시적 카운터) |
| P-5 | AI 인사이트: Gemini 호출에 타임아웃이 없고 라우트 · 크론에 `maxDuration` 이 없어 플랫폼 상한에 죽는다. 클라이언트만 45초에 끊기면 서버는 계속 돌아 재시도가 유료 호출을 겹친다 | `lib/branch/insights/llm.ts:165`, `app/api/admin/branch/insights/route.ts:17` | 고침(타임아웃 · 시간 예산 · 재시도 조건) |
| P-6 | Meta Graph 호출에 타임아웃이 없다 | `lib/meta/marketing.ts:336` | 고침(15초, 페이징 예산) |
| P-7 | 지점 화면의 Compass 60초 폴링이 매번 로딩 상태로 되돌아가 화면이 깜빡인다 | `components/admin/branch/BranchDashboardClient.tsx:420` | 고침(조용한 재검증) |
| P-8 | 검색 입력마다 요청 · 전체 재계산 — CRM 활동 검색, 장부 검색 | `components/admin/crm/CrmActivityClient.tsx:751`, `components/admin/branch/SalesLedgerWorkbench.tsx:1418` | 고침(디바운스 · 지연 값) |
| P-9 | 고객 검색 · 매출 목표 캐시 키에 CRM 범위가 없어 변경 뒤에도 옛 값이 남는다 | `components/admin/crm/CrmPerformanceCharts.tsx:107` 외 | 고침 |
| P-10 | 견적 탭 · 포털 홈 · 캘린더의 하이드레이션 불일치 — 서버(UTC)와 브라우저(KST)가 다른 탭 · 날짜를 그린다. 11개 경로에서 재현 | 순회 로그 | 고침, 다시 순회해 0건 확인 |

DB 실측 (pg_stat_statements, 2026-09-14 이후 누적)

| # | 관찰 | 수치 | 조치 |
|---|---|---|---|
| D-1 | REV 엔트리 페이지 읽기가 페이지마다 그 실행분 전체를 다시 정렬한다 | 5,701회 · 평균 15.7ms · 최대 3.2초. `explain analyze`: 5쪽째 1000행에 5,526행 비트맵 + 5,000행 정렬, 78ms | 색인 마이그레이션 파일(§3-2) |
| D-2 | `branch_rev_period_entries` 328,787행 중 지금 쓰는 것은 최신 실행분 약 4,400행이다. 임포트 실행 74회분이 그대로 쌓여 있다 | 표 + 색인 75MB(표 42MB) | 보관 기간 결정(§5) |
| D-3 | 문서 목록 조회가 본문까지 넓게 읽는다 | 약 7,400회 · 평균 36~45ms — 서비스 역할 문장 중 누적 시간 1위 | 남김(목록 전용 칼럼 · 캐시 검토) |
| D-4 | Compass 리드 뷰를 전화번호 묶음으로 조회 | 26,569회 · 평균 4.3ms — 호출 수 1위 | 남김(화면당 묶음 크기 · 캐시 검토) |
| D-5 | `external_crm_object_snapshot` 집계 뷰 | 203회 · 평균 171ms · 최대 4.9초 | 남김 |
| D-6 | `public.leads` 순차 스캔 | 17,533회 · 스캔당 평균 624행 | 표가 작아 지금은 무해. 리드가 늘면 목록 조회 색인 재검토 |
| D-7 | 어드바이저 | 색인 없는 외래 키 93 · 중복 색인 3 · 미사용 색인 228 · RLS initplan 정책 22 | 중복 3건만 파일로(§3-2). 나머지는 표가 작아 보류 |

개발 서버에서 1초 넘게 걸린 API(예열 뒤 최댓값): 지점 요약 · 파이프라인 · 히트맵 · KPI 4초대, CRM 매출 4.6초, Overview 누적 4.1초, CRM 건강도 3.8초, CRM 인사이트 3.1초. 히트맵과 CRM 인사이트는 조립 결과 캐시가 없다 — 캐시 정책을 정하면 줄일 수 있다(§5).

### 2-3. 정리

- 미사용 색인 228개, `search_path` 미고정 함수 29개, 같은 표에 겹친 허용 정책 3곳 — 동작에는 영향이 없다.
- `/api/admin/public-page-requests` 503 은 트래픽 토큰 미설정 때의 설계된 응답이다. 화면은 "확인 필요"로 표시한다.
- `/admin/cs-chatbot` 진입 때 나가는 POST 는 쓰기가 아니라 읽기 계산이다.
- 알림 · 리드 배지의 이중 호출은 개발 모드(StrictMode)에서만 보인다.
- 리드 응답 알림 크론 경로는 같은 일을 시간 슬롯 디스패처가 하므로 쓰이지 않는 경로다 — 지워도 된다.

### 부록 — 메인 세션이 다시 읽지 않은 항목

상위 모델 검증에서 "확정"으로 남았지만 메인 세션이 직접 다시 읽지 않은 것은 P2 94건이다. 분류별로는 오류 은폐 27 · 조용한 절단 20 · 타임아웃 없음 18 · 멱등성 11 순이다. "가능성" 81건(P1 16 · P2 65)은 재현하지 못했거나 운영 데이터 조건을 확인해야 하는 것이다. 이 숫자는 다음 점검의 출발점이지 확인된 결함 목록이 아니다.

P1 두 건은 읽었지만 본문에 싣지 않았다. 장부에서 칸 하나를 확정할 때 시트 전체가 다시 그려진다는 지적(`SalesLedgerWorkbench.tsx:1337`)은 측정하지 못했고, 쇼룸 확정이 리드 반영 시간 예산 뒤에 제한 없이 돈다는 지적(`app/api/cron/lead-contact-sync/route.ts:105`)은 실측 소요가 1초 미만이라 위험이 낮다.

---

## 3. 수정한 것

수정은 통합 뒤의 `main` 에서 따로 갈라 PR #113 으로 올렸다. main 에 직접 넣지 않았고 병합하지 않았다(병합 여부는 사람이 정한다). 이 문서를 더한 커밋까지 커밋 42개, 파일 102개(테스트 41개, 문서 · 마이그레이션 7개 포함).

### 3-1. 수정 PR 의 묶음

| 묶음 | 내용 | §2 항목 |
|---|---|---|
| 시트 동기화 | REV · HW 0행 가드 | A-1, A-2 |
| 절단 · 오류 은폐 | 1000행 상한 읽기 10여 곳, 공개 행사 캐시, 리드 삭제, 방문 통계 RPC | A-3 ~ A-5 |
| 운영 | 영수증 채번, 외부 CRM 후속 실패 알림, 리드 다이제스트, LLM · Meta 타임아웃 | A-6 ~ A-8, P-5, P-6 |
| 직렬 읽기 | CS 대시보드, CRM 매출, 지점 요약, REV 임포트 | P-1 ~ P-3 |
| 화면 | 하이드레이션 5건, 폴링, 검색 디바운스, 캐시 키, CS 대화 큐, Overview 실패 표시, 하드웨어 재조회 | A-3h, A-9, A-10, P-4, P-7 ~ P-10 |

하위 모델이 격리된 작업 사본에서 묶음별로 고치고 메인 세션이 변경 전부를 읽은 뒤 가져왔다. 가져오면서 고친 것: 하드웨어 임포트 테스트 14건을 깨뜨린 목 누락, 같은 쿼리 빌더에 정렬이 페이지마다 쌓이던 것, 영수증 조회 상한 주석이 사실과 달랐던 것, 폴링 응답이 화면 전환 뒤의 새 상태를 덮을 수 있던 경합, 행사 상세 페이지가 빌드 중 일시 오류로 배포를 멈출 수 있던 것.

### 3-2. 마이그레이션 파일 (만들기만 했다 — 적용하지 않았다)

| 파일 | 하는 일 |
|---|---|
| `supabase/migrations/20261126_branch_rev_period_entries_run_id_idx.sql` | `(import_run_id, id)` 색인. D-1 의 페이지별 재정렬을 없앤다 |
| `supabase/migrations/20261126_drop_duplicate_indexes.sql` | 정의가 같은 중복 색인 3개 중 운영에만 있는 이름을 지운다. 남길 쪽이 없으면 지우지 않는다 |

둘 다 롤백 파일이 있고 런북에 절을 더했다. 접근 정책을 바꾸는 마이그레이션(C-1 ~ C-3)은 파일을 만들지 않았다 — 이 저장소의 런북은 파일을 날짜순으로 전부 적용하므로, 결정 전에 파일이 있으면 결정 없이 적용된다.

---

## 4. Compass 저장소

처음 점검 때는 저장소를 세션에 붙이는 요청이 권한 단계에서 거절돼 DB 쪽만 봤다. 11-26 에 접근이 열려 코드를 읽기 전용으로 점검했다. **Compass 저장소에는 아무것도 쓰지 않았다 — 수정 · 병합 · 푸시 없음, 목록과 추천까지만이다.**

방법: 10개 범위(DB 핵심 · 스키마와 색인 · 리드 액션 · 그 밖의 액션 · API 와 웹훅 · NEO 동기화 · 그 밖의 크론 · 단체 발송과 AI · 화면 성능 · 인증과 보안)를 하위 모델이 훑고 상위 모델이 항목마다 반박을 시도했다. 68건 중 확정 26(P1 3 · P2 23) · 가능성 30 · 기각 12. 기각 12건은 대부분 저장소의 ADR · 가드 테스트가 이미 의도된 결정으로 적어 둔 것이다 — 이 저장소는 규칙과 근거(ADR 100여 건), 래칫 테스트가 촘촘해 같은 종류의 결함이 어드민보다 훨씬 적다.

### 4-1. 메인 세션이 코드를 읽어 확인한 것

| # | 문제 | 근거 |
|---|---|---|
| K-6 | **NEO 토큰 갱신이 일시 장애를 "거절"로 읽어 푸시 · 활동 동기화를 멈춘다.** 갱신 응답이 JSON 이 아니거나(502 HTML 등) 토큰이 없으면 HTTP 상태와 무관하게 "확정 401"로 던지고, 인증 실패는 연속 실패 횟수를 기다리지 않고 곧장 정지 래치를 켠다. 래치는 사람이 풀 때까지 유지된다. 매시 작업은 경고만 남긴다 | `lib/neocrmApi.ts:263-278`, `lib/neocrmSync.ts:151-163` |
| K-7 | 크론 경로의 NEO 호출에 마감 신호가 없다. 수동 등록 경로는 45초 신호를 넘기는데 크론이 쓰는 호출기는 넘기지 않아, 호출 하나의 상한(25초)과 "호출 사이에만 보는" 예산으로는 함수 상한 60초를 넘길 수 있다. 넘기면 NEO 생성 뒤 표시 전에 끊겨 결과 불명 줄이 남는다 | `lib/neocrmSync.ts:124-126`(크론), `:430`(수동) |
| K-8 | **로그인 없는 공개 화면(`/crew`)의 저장이 KPI 실적 표에 줄을 넣는다.** 업로드 완료 상태로 저장하면 지정된 사람의 미디어 발행 실적이 한 줄 생긴다(마감되지 않은 달이면 지난 달도). 코드 주석은 의도라고 적었지만, 그 화면의 ADR 은 "공개 액션은 작업판 표 둘만 쓴다 · KPI 표는 공개 액션이 쓰게 할 수 없다"고 결정했고 이를 대체한 ADR 이 없다 | `lib/crewKpi.ts:28-48`, `app/crew/actions.ts:31`, `docs/adr/0064-*.md` 결정 2 · 4 |
| K-9 | 리드 수정 헬퍼가 "리드 없음"과 "바뀐 것 없음"을 같은 빈 배열로 돌려줘, 방금 병합 · 삭제된 리드의 열린 탭에서 저장하면 아무것도 쓰지 않고 "저장됨"으로 답한다(호출부 10여 곳) | `lib/audit.ts:110` |
| K-10 | 읽기 전용 MCP 의 리드 검색이 가려진 값이 아니라 원문 칸에 대고 찾고 전체 건수를 돌려준다. 전화 · 이메일은 가려서 내보내지만, 이름과 숫자 조각을 같이 넣어 건수가 0 인지 보면 번호를 한 자리씩 맞혀 볼 수 있다. ADR 의 알려진 한계 목록에 없다 | `lib/mcpTools.ts:227-240`, `lib/taxonomy/search.ts:196-203` |
| K-11 | BD 시트 동기화 스크립트가 고정 범위(200행)만 읽는다. 시트가 그보다 길어지면 뒤쪽 행이 경고 없이 빠진다 | `scripts/sync_bd.mjs:40` |
| K-12 | 단체 발송의 테스트 발송이 받는 번호를 따로 검사하지 않는다(마케팅 권한만 본다). 본문 변수는 대상 첫 리드의 이름 · 학원명으로 채워져 임의 번호로 나간다. 야간 규칙 예외는 문서에 있지만 번호 검사 · 횟수 제한은 없다 | `app/(main)/broadcast/actions.ts:152-177` |
| K-13 | 리드 검색 조건은 여러 칸 ILIKE · 전화 숫자 정규식 · 유사도 · 하위 조회를 OR 로 묶은 한 덩어리라 어떤 색인도 타지 못한다. 스키마 주석이 실측과 함께 "색인을 일부러 만들지 않는다"고 적어 둔 의도된 결정이다. K-3 의 순차 스캔과 75~140ms 는 여기서 나온다. 행 수가 지금(약 5,400)의 몇 배가 되면 다시 재야 한다 | `lib/taxonomy/search.ts:196-236`, `scripts/schema.sql:975-978` |

### 4-2. DB 쪽에서 확인한 것 (읽기 전용)

| # | 관찰 | 근거 |
|---|---|---|
| K-1 | `crm` 스키마 73개 표 중 72개가 RLS 꺼짐. 격리는 스키마 권한(USAGE 가 `postgres` 뿐)에 기대고 있다. anon · authenticated 가 읽을 수 있는 `crm` 표는 0개라 지금 새는 곳은 없다. 스키마 권한을 한 번 잘못 주면 전부 열리는데, 이 자세를 저장소의 어떤 파일도 선언하거나 검사하지 않는다 | `pg_class` · 권한 조회 |
| K-2 | Compass 앱이 `postgres` 역할로 직접 붙는다. 이 역할에는 `statement_timeout` 이 없다(코드의 풀 타임아웃은 클라이언트 쪽에서만 끊는다) | `pg_stat_statements` 의 역할 · 역할 설정 |
| K-3 | 리드 요약 · 건수 · 검색 문장이 평균 75~140ms, 집계 하나는 평균 657ms(55회). `crm.leads` 순차 스캔 75,708회 · 스캔당 평균 2,185행 | `pg_stat_statements` · `pg_stat_user_tables` |
| K-4 | 어드민이 Compass 를 읽는 통로는 `public` 의 `compass_*_v` 뷰 10개(소유자 권한, service role 전용)다. `compass_meta_submissions_v` 는 없다 — 이 뷰가 읽어야 할 `crm.meta_leadgen_submissions` 표가 운영에도, Compass 저장소의 스키마 파일에도 없다(§6-2) | `pg_views` · 권한 조회 · `scripts/schema.sql` |
| K-5 | 백업 표 `crm.focus_items_bak_20260813` 이 남아 있다 | `pg_class` |

### 4-3. 브랜치

`main` 밖의 원격 브랜치 27개 중 25개는 이미 전부 `main` 에 들어가 있다(앞선 커밋 0). 열린 PR 은 없다.

| 브랜치 | 마지막 커밋 | main 대비 | 내용 | main 과 충돌 | 추천 |
|---|---|---|---|---|---|
| `claude/color-tokens` | 11-25 | +3 (파일 202개) | 색 의미 토큰 1단계 — 민트 두 색을 토큰 이름으로 | 없음 | 파일 202개를 건드리는 일괄 치환이라 다른 화면 작업과 겹치기 쉽다. 진행 중인 화면 작업이 없을 때 먼저 합치고, 합친 뒤 라이트 테마 재생성과 저대비 래칫을 다시 돌린다 |
| `claude/home-module-cards` | 11-26 | +2 (파일 24개) | 홈을 숫자 한 줄 + 카드 셋으로 | 없음 | 이틀 안에 올라온 진행 중 작업으로 보인다. 작성자가 마무리(패치 노트 한 줄 포함)한 뒤 저장소의 머지 절차대로 |

이미 들어간 25개(`fix/crm-sync-cache`, `release/buster-1113`, `codex/compass-neocrm-push` 등)는 지워도 잃는 것이 없다. 지우지는 않았다.

### 4-4. 메인 세션이 다시 읽지 않은 것

확정 P2 중 위 표에 없는 17건과 가능성 30건은 건수로만 둔다. 가능성 쪽에서 눈에 띄는 주제: 매시 NEO 활동 단계에 건수 · 시간 상한이 없음, `crm.page_visits` 보관 기간 없음, 일부 크론의 시간 예산이 묶음 사이에서만 검사됨, 요청 화면 폴링이 화면 가시성을 보지 않음. 다음 점검의 출발점이지 확인된 결함이 아니다.

---

## 5. 사람이 정할 일

| # | 결정 | 추천 |
|---|---|---|
| 1 | 수정 PR 병합 | 병합. 동작이 달라지는 곳은 "실패를 실패로 보이게" 한 것들이다 — 시트가 비면 동기화가 실패로 기록되고, 외부 CRM 후속 실패가 207 과 알림으로 온다 |
| 2 | 색인 마이그레이션 2개 적용 | 적용. 임포트가 돌지 않는 때에 |
| 3 | 미적용 마이그레이션 4개(11-23 ~ 11-25) | 총판 확인 · 수정 기능을 쓰기 전에 11-24 를, 나머지는 런북 순서대로 |
| 4 | `leads` · `newsletter_subscribers` 의 anon INSERT (C-1) | 정책 삭제 + anon 표 권한 회수. 먼저 저장소 밖에서 공개 키로 이 표에 쓰는 곳이 없는지 확인 |
| 5 | `is_active_admin()` 역할 조건 (C-2) | 제한 역할 계정을 활성화하기 전에 역할 조건 추가. 정책 77개가 걸려 있어 스테이징에서 먼저 |
| 6 | 발송 중복 방지 (B-1 ~ B-4) | 지연 큐는 "먼저 선점하고 보낸다"로, 수동 실행 · 문자는 최근 실행 확인 추가. 문자 수신 동의를 구독 상태와 따로 볼지는 정책 결정 |
| 7 | 결제 복구 (B-5) | 승인 직후 "승인됨 · 기록 대기" 상태를 먼저 남기고, 결제사 웹훅 수신 경로 추가 |
| 8 | 계약 서명 · 견적 수락의 상태 조건 (B-6, B-7) | 서명은 공유 · 한쪽 서명 상태에서만, 수락은 최신 판 + 응답용 공유에서만 |
| 9 | 크론 미등록 2건 (B-12) | 등록 상한이 찼다. 시간 슬롯 디스패처에 얹거나 쓰지 않는 경로(리드 응답 알림)를 지워 자리를 낸다 |
| 10 | 임포트 실행분 보관 기간 (D-2) | 최근 N회만 남기고 지우는 정리 작업. N 은 되돌리기 요구에 맞춰 |
| 11 | 캐시 정책 — 히트맵 · CRM 인사이트 · 문서 목록 (§2-2) | 조립 결과 캐시 + 동기화 뒤 만료. 신선도 기준이 먼저 정해져야 한다 |
| 12 | Compass 저장소 접근 (§4) | 열어 주면 코드 점검과 브랜치 표를 이어서 한다 |
| 13 | 보류 브랜치 중 결정이 필요한 4개 (§1-3) | `/expo` 는 박람회 일정이 살아 있으면 미완 항목을 닫고 합치고 아니면 닫는다. 매트릭스 장부는 12-01 시트 잠금 결정과 맞지 않으면 닫는다. 챗봇 위젯 · HW 페이지 분리는 새 구조 위로 다시 옮긴다 |
| 14 | 비밀번호 유출 대조 (C-4) | 켠다 |

---

## 6. 후속 진행 기록 (2026-11-26 ~ 11-27)

§5 의 결정 요청에 "전부 진행, 크론은 다시 설명, 보류 브랜치 4개는 보류"로 답을 받아 진행한 기록이다.

### 6-1. 결정별 처리

| §5 # | 결정 | 처리 |
|---|---|---|
| 1 | 수정 PR #113 병합 | 병합함(merge commit, Vercel Preview 성공 확인 뒤) |
| 2 · 3 | 마이그레이션 적용 | 일부 적용, 나머지는 확인 대기 — §6-2 |
| 4 · 5 | anon INSERT 제거 · `is_active_admin()` 역할 조건 | 마이그레이션 파일 작성, 적용은 확인 대기 — §6-2 |
| 6 · 7 · 8 | 발송 중복 방지 · 결제 복구 · 계약/견적 상태 조건 | 후속 수정 PR — §6-3 |
| 9 | 미등록 크론 2건 | 보류(설명만) — B-12 그대로 |
| 12 | Compass 저장소 접근 | 열림. 코드 점검과 브랜치 표 — §4 |
| 13 | 보류 브랜치 4개 | 보류 |
| 10 · 11 · 14 | 임포트 보관 기간 · 캐시 정책 · 비밀번호 유출 대조 | 손대지 않음(기준값을 정해야 하거나 대시보드 설정이다) |

### 6-2. 운영 DB 적용 기록 (서울 프로젝트)

| 파일 | 상태 | 비고 |
|---|---|---|
| `20261104_meta_crm_signal_events.sql` | **적용함(11-27)** | 새 표 하나, 스위치가 꺼져 있어 동작 변화 없음 |
| `20261126_branch_rev_period_entries_run_id_idx.sql` | **적용함(11-27)** | 적용 전 동기화 실행 중 0건 · 긴 트랜잭션 0건 확인. 적용 뒤 같은 문장이 정렬 없이 새 색인을 탄다(5쪽째 1000행: 캐시가 찬 상태에서 4.3ms) |
| `20261125_crm_events_channel_source_unique.sql` · `20261125_internal_cs_event_claim_before_conversation.sql` | 이미 적용돼 있었음 | 11-25 저녁에 다른 작업자가 적용. §1-5 는 그 전 조회 기준이었다 |
| `20261123_partner_settlement_snapshots.sql` | **적용 대기** | DB 도구가 `DROP ... IF EXISTS` 가 든 문장에 사용자 확인을 요구했고, 확인이 오지 않아 적용되지 않았다 |
| `20261124_distributor_settlement_confirm_revise.sql` | **적용 대기** | 같은 이유(`DROP CONSTRAINT IF EXISTS`) |
| `20261126_drop_duplicate_indexes.sql` | **적용 대기** | 같은 이유(`DROP INDEX`) |
| `20261127_leads_newsletter_anon_insert_revoke.sql` | **적용 대기**(새 파일) | 같은 이유(`DROP POLICY` · `REVOKE`) |
| `20261127_is_active_admin_role_condition.sql` | **적용 대기**(새 파일) | 정책 77개를 받치는 함수라 확인을 받고 적용한다 |
| `20260915_meta_leadgen_single_receiver.sql` | **보류** | 빠진 것은 뷰 `compass_meta_submissions_v` 하나다. 이 뷰가 읽을 `crm.meta_leadgen_submissions` 표가 운영에 없고 Compass 저장소의 스키마 파일에도 없어, 다시 돌려도 건너뛴다. Compass 쪽에서 표를 만든 뒤에야 의미가 있다. 전환 모드는 `admin` 이라 지금 영향은 없다 |

확인을 건너뛰려고 SQL 을 고쳐 쓰지 않았다. 적용 대기 다섯 건은 확인 창에 답할 수 있을 때 한 번에 적용한다.

적용 전에 확인한 근거

- anon INSERT 제거: 2026-09-14 이후 anon · authenticated 역할이 실행한 문장은 17종이고 전부 `admin_profiles` · `patch_notes` 읽기다. `leads` · `newsletter_subscribers` 쓰기는 0건.
- `is_active_admin()` 역할 조건: 활성 프로필은 ADMIN 9 · SUPER_ADMIN 1 뿐이라 지금은 모든 계정에서 결과가 같다.

### 6-3. 후속 수정 PR

| §2 항목 | 고친 것 | 일부러 하지 않은 것 |
|---|---|---|
| B-1 | 지연 발송 큐 — 보내기 전에 선점(대기 상태일 때만 한 실행이 가져감), 1회 100건 · 시간 예산 · 동시 5건, `maxDuration`. 발송과 기록 사이에 끊기면 "결과 불명"으로 남고 다시 보내지 않는다 | 상태 값에 "발송 중"을 더하는 스키마 변경(선점은 기존 값 + 안내 문구로 표시) |
| B-2 | 규칙 수동 실행 — 10분 안에 실행 중 · 성공한 실행이 있으면 409, 화면이 확인받고 다시 보낸다. `maxDuration` | 세그먼트 건수 상한 |
| B-3 | 문자 일괄 발송 — 같은 문구 · 같은 대상이 10분 안에 나갔으면 409, 확인 뒤에만 재발송 | 문자 수신 동의를 구독 상태와 따로 볼지(정책 결정 대기). 발송이 도는 동안의 동시 요청은 이력이 발송 뒤에 남아 막지 못한다 |
| B-4 | 이메일 발송 — 메일이 나간 뒤의 오류를 "잘못된 요청"으로 답하지 않고 발송 결과 + 기록 실패 경고로 답한다. 발송 전 서버 오류는 500 | — |
| B-5 | 결제 승인 — 결제사 호출 15초 타임아웃, 주문 기록 재시도, 실패 시 전용 코드 + 재무 알림. 고객이 다시 시도하면 결제사의 "이미 처리됨" 거절에서 승인된 결제를 다시 읽어(주문 · 금액 · 상태 검증) 기록을 잇는다 | 결제사 웹훅 수신 경로(상점 설정과 서명 키가 필요하다) |
| B-6 | 계약 서명 — 취소 · 완료된 계약은 409 | — |
| B-7 | 공개 견적 확인 · 수락 — 응답용 공유에서만(화면과 같은 조건), 보관 · 만료된 견적은 409 | "그 판이 최신인가" 조건 — 어드민이 초안을 고치는 동안 고객의 유효한 링크가 막힐 수 있어 정책 결정이 필요하다 |

### 6-4. 진행하면서 새로 본 것

| # | 관찰 | 근거 |
|---|---|---|
| N-1 | **`admin_profiles` 에 "활성 관리자면 누구든 프로필을 고칠 수 있다"는 UPDATE 정책이 남아 있다.** 최고 관리자 전용 정책이 따로 있지만 허용 정책은 OR 로 합쳐지므로, ADMIN 계정이 브라우저 토큰으로 자기 역할을 SUPER_ADMIN 으로 바꿀 수 있다. 2026-09-14 이후 authenticated 역할의 `admin_profiles` 쓰기는 0건이라 이 정책을 지워도 앱은 영향이 없다. `is_active_admin()` 역할 조건으로는 닫히지 않는다(ADMIN 이 통과한다) — 별도 결정이 필요하다. 쓰기라 실행해 보지는 않았고 정책 · 표 권한 · 트리거 정의로 판단했다 | `pg_policies`(허용 정책 "Admins can update profiles"), authenticated 의 UPDATE 권한(역할 칸 포함), 막는 트리거 없음 |
| N-2 | 저장소 밖 어딘가에서 공개 키로 `patch_notes` 를 읽고 있다(42회). 런북이 경고한 "저장소 밖 anon 소비자"가 실제로 있다는 뜻이다 | `pg_stat_statements` |
| N-3 | 운영 DB 에 다른 작업자의 적용이 같은 기간에 이어졌다(11-25 저녁 2건, 11-26 · 11-27 각 1건). 적용 상태는 조회한 시각 기준으로만 맞다 | 마이그레이션 이력 |

