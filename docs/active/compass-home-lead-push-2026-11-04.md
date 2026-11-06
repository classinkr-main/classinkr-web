# 홈페이지 폼 리드 → Compass 밀어 넣기

- 작성: 2026-11-04
- 상태: 운영 동작 중(2026-11-06 14:39 KST 부터 — 그 전엔 두 서버 모두 토큰 env 가 없어 조용히 건너뛰었다, 아래 "2026-11-06 운영 켜기"). 매시 대조로 놓친 리드를 다시 민다(아래 "2026-11-06 매시 대조"). **DB 마이그레이션은 어드민 쪽에 없다**(Compass 쪽 표 `crm.home_webhook_events` 는 Compass 배포가 만든다).
- 짝 문서: [compass-integration-2026-09-14.md](./compass-integration-2026-09-14.md)(연동 2차 — 소유 경계·`home_lead` 링크 자리), Compass 저장소 `docs/adr/0083-homepage-inquiries-are-pushed-to-compass.md`(Compass 쪽 결정)

## 0. 한 줄 요약

홈페이지(classin.co.kr) 폼으로 들어온 리드(데모 신청·문의·쇼룸 예약·도입 신청)를 **어드민이 저장한 직후** Compass 의 `POST /api/webhook/home-lead` 로 한 번 보낸다.
어드민이 정본(`public.leads`), Compass 는 사본이다 — 어드민은 `crm` 에 쓰지 않고(연동 2차 §0 "교차 쓰기 0건" 그대로) HTTP 로만 넘긴다. 설계자 2026-11-04 "어드민 홈페이지 유입들 콤파스에도 찍히도록".

## 1. 무엇이 어떻게

| 자리 | 파일 | 동작 |
|---|---|---|
| 보내는 쪽 | `lib/server/compass-lead-push.ts` | 대상(`compassLeadPushTarget`) · 본문(`buildCompassLeadPushPayload`) · 전송(`pushLeadToCompass` — `postJson`, HTTPS·사설 주소 차단, 상한 6초) |
| 부르는 자리 | `lib/server/lead-capture.ts` `runLeadCaptureEffects` | 외부 전달(`externalForwards` 토글) 하나로 — 시트·리드 웹훅·채널톡과 같이 기다린다. `stored && savedLeadId` 이고 소스가 `WEBSITE_FORM_LEAD_SOURCES` 일 때만 |
| 마케팅 집계 사본 | `lib/compass/normalize.ts` `COMPASS_INBOUND_CHANNELS` | Compass 가 이 리드에 붙이는 `channel='homepage'` 를 마케팅 제외 목록에 더했다 — 없으면 「오늘 유입」이 같은 사람을 두 번 센다 |

- **보내는 소스**: `demo_modal` · `contact_page` · `showroom_booking` · `checkout_request`. 뉴스레터는 상담이 아니고, `meta_lead_ads` 는 Compass 가 Meta 웹훅으로 직접 받는다(보내면 두 번).
- **본문**: `{ event_id, kind: "created"|"reinflow", lead_id(어드민 id), source, source_detail, name, org, phone, email, region(branch), message, role, size, page(current_page ?? landing_page), utm{source,medium,campaign} }`.
  `event_id` 는 전환 이벤트 id 와 같은 값(`lead:<id>` · 재문의 `lead:<id>:reinflow:<시각>`) — Compass 멱등 표식. 같은 전달을 다시 보내도 Compass 리드가 두 건 되지 않는다.
- **재문의 병합**(같은 연락처가 응대 대상 소스로 다시 옴 → `last_inflow_at` 만 갱신)이면 `kind: "reinflow"`. Compass 도 그 사람을 재유입으로 올린다(새 리드 아님).
- **Compass 쪽**(그쪽 ADR-0087): 동일인 잠금 → `crm.lead_refs(system='home_lead')` 링크 또는 전화·이메일 동일인 → 새 리드는 `channel='homepage'`(인바운드 — 광고 성과·KPI 리드 밖, 콜 목록 안)
  + `referrer`=어느 폼(「문의 페이지 · 도입 상담」) · 기존 리드면 재유입(담당·단계·메모 그대로) · 폼 답변은 `system` 기록 · **환영 알림톡은 보내지 않는다**(우리 접수 안내가 간다).
- **실패**: Compass 가 2xx 가 아니면 `Compass: <status>` 가 응답 `warnings` 와 「리드 전달 경고」 인시던트(WeCom·메일)로 간다. 저장은 막지 않는다. Compass 는 실패 때 표식을 남기지 않으므로
  같은 본문을 다시 보내면 새로 처리된다. 2026-11-06 부터 매시 대조(아래 절)가 링크 없는 최근 리드를 다시 민다 — 그 전엔 자동 재전달이 없었다.
- **보내지 않는 경우**(조용히): env 둘 중 하나가 없다 · `COMPASS_BRIDGE_URL` 이 HTTPS 가 아니다(로컬 `http://localhost` — 운영 Compass 로 밀지 않게) · 소스가 위 넷이 아니다 · 저장이 실패했다.

## 2. 켜는 순서

1. Compass 배포(`app/api/webhook/home-lead` · `crm.home_webhook_events`) — 그쪽 `docs/deploy.md` §2.
2. 토큰 하나를 만들어 두 서버에: Compass `HOME_LEAD_TOKEN`, 어드민 `COMPASS_LEAD_WEBHOOK_TOKEN`(값 같게). 어드민 `COMPASS_BRIDGE_URL` 은 KR Team 브리지와 같은 Compass 오리진(`https://mkt.classin.co.kr`)이라 이미 있다.
3. 어드민 재배포 뒤 홈페이지 폼으로 한 건 넣어 Compass `/leads` 에 「인바운드 · 홈페이지 (…)」 가 뜨는지 본다. 어드민 응답 `warnings` 에 `Compass:` 가 없어야 한다.
4. 멈추려면 어드민 `COMPASS_LEAD_WEBHOOK_TOKEN` 을 지운다(코드 변경 없이).

값은 채팅·코드·문서에 남기지 않는다.

## 3. 검증

- `tests/server/compass-lead-push.test.ts` — 대상 판정(env·HTTPS) · 소스 판정 · 본문 모양 · 헤더에 토큰 · 2xx 아니면 throw · `runLeadCaptureEffects` 에서 폼 소스만 보내고 뉴스레터·Meta 는 안 보내며 실패가 `errors` 로 간다 · 재문의는 `reinflow`.
- `tests/compass/normalize.test.ts` — `homepage` 가 마케팅 제외 목록에 있다.
- 기존 `tests/api/lead-capture.test.ts`·`tests/server/lead-capture-effects*.test.ts` — env 가 없으면 호출 순서·골든 로그가 그대로다.

## 4. 되받기 — Compass 담당자·기록을 어드민에 (2026-11-04 2차)

설계자 "compass에서 담당자 지정됐고, 추가 기록 찍힌 것들도 같이 트래킹 겸 적용이 돼야 됨". 어드민이 Compass 를 되받는 길은 셋이고 전부 **링크 우선·전화 키 폴백**으로 바꿨다
(`lib/compass/admin-lead-links.ts` — Compass 가 홈페이지 폼 리드를 받으며 거는 `crm.lead_refs(system='home_lead', external_id=어드민 리드 id)` 를 `compass_lead_refs_v` 로 읽는다. 전화가 없거나 더미 번호인 리드도 붙는다).

| 길 | 어디 | 무엇이 바뀌었나 |
|---|---|---|
| 5분 크론 `/api/cron/lead-contact-sync` | `lib/server/lead-contact-compass-sync.ts` · `lib/compass/lead-contact-sync.ts` | 전화 없는 신규·연락함 리드도 대상(링크로 붙는다). **담당 반영**: Compass 담당(콜 담당 → BD 담당 → 오너)을 어드민 담당자 명단(ownerKey·표시명·별칭)으로 풀어 어드민 `assigned_to` 가 **비어 있을 때만** 채운다(`WHERE assigned_to IS NULL`). 이미 다른 담당이면 `owner.conflicts` 로 세기만 한다(사람이 고른 담당은 덮지 않는다 — 데이터 소유 범위를 바꾼다). 명단으로 못 푸는 이름은 `owner.unmapped`, 명단이 건강하지 않으면 담당 반영만 `owner.skipped`. 감사 기록 `payload.assigned`. 기록(콜·메모·미팅…)은 예전처럼 상태(`contacted`) 판정의 근거다 |
| 리드 보드·캠페인 신규 리드 탭의 Compass 칩 | `/api/admin/compass/leads-overlay` · `components/admin/compass/use-compass-overlay.ts` | 요청에 `leadIds` 를 같이 보내고 응답 `byLeadId` 를 먼저 본다. 칩의 「콜 담당」이 Compass 담당이다. 매칭 수는 화면 리드 기준 |
| 고객 360·타임라인 | `lib/repositories/crm-customer-360.ts` · `crm-customer-timeline.ts` | 리드 360 은 링크 ∪ 전화 키로 Compass 리드를 찾아 활동(콜·문자·미팅·메모·재유입·단계 변경·폼 답변)을 병합한다. NEO 360 은 전화 키만 |

- 보고서 칸(크론 응답): `linked`(링크로 붙은 리드 수) · `toAssigned` · `applied.assigned` · `owner.{conflicts,unmapped,skipped}`. `?dryRun=true` 로 먼저 본다.
- **담당을 덮지 않는 이유**: 어드민 `assigned_to` 는 데이터 소유 범위(`matchesDataOwner`)의 열쇠다. Compass 담당이 바뀌어도 어드민에서 사람이 고른 담당은 그대로고, 차이는 `owner.conflicts` 와 칩의 「콜 …」로 보인다. 늘 따라가게 하려면 이 결정을 바꾸는 일이다(설계자 몫).
- 되돌리기: `audit_logs`(`lead.status.compass_sync`) `payload.assigned` 의 id 를 `assigned_to = null` 로(현재 값이 그 `to` 일 때만).
- 테스트: `tests/compass/admin-lead-links.test.ts` · `tests/compass/lead-contact-sync.test.ts`(링크 매칭·담당 계획) · `tests/server/lead-contact-compass-sync.test.ts`(링크·담당·명단 불량·부분 실패) · `tests/compass/leads-overlay-route.test.ts`(byLeadId) · `tests/crm/customer-360-compass.test.ts`(전화 없는 리드의 링크 매칭).

## 2026-11-06 자료 신청·행사 신청 추가

설계자 "홈페이지 연동(홈페이지 문의/ 자료등록/ 행사 신청) 뜰 수 있게". 자료 신청(`newsletter` + `leadMagnet`, `app/resources/[slug]/ResourceDownloadForm.tsx`)도 보낸다 —
`isCompassPushSource(source, leadMagnet)`. 본문에 `event_slug`·`lead_magnet` 을 싣고, Compass 가 경로를 「행사 신청 · slug」·「자료 신청 · slug」로 적는다(Compass ADR-0087).
블로그 자료 게이트(`/api/newsletter/subscribe`)는 리드를 만들지 않아 대상이 아니다.

## 2026-11-06 운영 켜기

- 증상: "자료 신청(가이드) 내역이 Compass 에 안 찍힌다". 원인은 코드가 아니라 env — 어드민 `COMPASS_LEAD_WEBHOOK_TOKEN` 과 Compass `HOME_LEAD_TOKEN` 이
  **둘 다** Vercel 운영 env 에 없었다. 어드민은 env 가 없으면 조용히 건너뛰어(위 "보내지 않는 경우") 경고도 인시던트도 없었다.
- 조치: 같은 값의 토큰을 두 프로젝트 production env 에 `sensitive` 로 넣고 Compass → 어드민 순서로 재배포(코드는 그대로). 빈 본문으로 확인 — 맞는 토큰 400(`event_id required`) · 틀린 토큰 401.
- 지난 리드: 홈페이지 폼 리드 22건(자료 신청 14·문의 8, 2026-07~11) 모두 같은 날 Compass 에 **원래 접수 시각으로** 옮겨졌다(`home_lead` 링크 22 · 폼 답변 기록 · 없던 6명은 새 리드).
  웹훅으로 다시 밀지 않은 이유: Compass 는 받은 시각(now)으로 기록하므로 옛 리드를 밀면 22명 전원이 "오늘 재유입"이 되어 KPI 달·연락 텀이 틀어진다.

## 2026-11-06 매시 대조

설계자 "실시간 연동 + 최소 하루 3번 싱크". 실시간 전달은 제출 순간 한 번뿐이라 Compass 가 잠깐 내려가면 그 리드가 빠졌다. 그래서 매시 다시 맞춘다.

- 실행: `app/api/cron/dispatch/[slot]` 매 슬롯 맨 앞(하루 24회 — 크론 자리가 40개로 차 있어 새 크론 없이 디스패처에 얹었다). 결과는 응답 `compassLeadReconcile` 칸(`ran` 과 따로), `failed` 면 응답 500.
- 본체: `lib/server/compass-lead-reconcile.ts` `reconcileCompassLeadPush`.
  - 대상 = 최근 72시간에 저장된 홈페이지 폼 리드(`isCompassPushSource`) 중 Compass 링크(`compass_lead_refs_v` `home_lead`)가 없는 것. 방금(10분 이내) 들어온 리드는 실시간 전달 몫이라 뺀다.
  - 본문은 저장된 행으로 다시 짓고(`compassPayloadFromLeadRow` — 행사 slug 는 notes `[event:…]` 토큰), `event_id` 는 실시간과 같은 `lead:<id>` — 겹쳐 가도 Compass 가 한 번만 받는다.
  - 링크를 못 읽으면 아무것도 보내지 않는다(`failed` · `compass_links_unavailable`) — "링크 없음"으로 오인해 이미 받은 리드를 다시 밀지 않게.
  - 72시간보다 오래된 리드는 밀지 않는다 — 날짜가 틀어지므로 사람이 원래 날짜로 옮긴다(위 22건 선례).
  - 한 번에 5건·시간 예산 20초. 남은 건은 다음 시간에(`deferred`). 응답에는 건수와 어드민 리드 id·닫힌 오류 문구(`Compass: <상태>` 또는 오류 이름)만 — 이름·연락처·주소·토큰 없음.
  - 재문의 병합(기존 리드에 합친 재유입)의 전달 실패는 대상이 아니다(리드 행에 이미 링크가 있다) — 「리드 전달 경고」로만 보인다.
- 확인: `GET /api/cron/dispatch/<HH>?dryRun=true`(Bearer `CRON_SECRET`) — `compassLeadReconcile.detail` 의 `candidates`·`linked`·`missing`, 보내지 않는다.
- Compass ADR-0087 결정 7("매시 대조·자동 재전달은 두지 않는다 — 재검토 조건")을 어드민 쪽에서 바꾼 것이다. Compass 쪽 코드는 그대로(멱등 표식이 겹친 전달을 막는다).
- 테스트: `tests/server/compass-lead-reconcile.test.ts`(대상·링크 down·미리보기·본문·event_id·실패 문구·상한·기간) · `tests/api/cron-dispatch-route.test.ts`(매 슬롯·ran 분리·failed 500·503 경로·dryRun).
