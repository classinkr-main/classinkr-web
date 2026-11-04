# 홈페이지 폼 리드 → Compass 밀어 넣기

- 작성: 2026-11-04
- 상태: 코드 커밋 완료. 운영은 두 서버의 env(아래 §2)를 넣은 뒤부터 동작한다. **DB 마이그레이션은 어드민 쪽에 없다**(Compass 쪽 표 `crm.home_webhook_events` 는 Compass 배포가 만든다).
- 짝 문서: [compass-integration-2026-09-14.md](./compass-integration-2026-09-14.md)(연동 2차 — 소유 경계·`home_lead` 링크 자리), Compass 저장소 `docs/adr/0082-homepage-inquiries-are-pushed-to-compass.md`(Compass 쪽 결정)

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
- **Compass 쪽**(그쪽 ADR-0082): 동일인 잠금 → `crm.lead_refs(system='home_lead')` 링크 또는 전화·이메일 동일인 → 새 리드는 `channel='homepage'`(인바운드 — 광고 성과·KPI 리드 밖, 콜 목록 안)
  + `referrer`=어느 폼(「문의 페이지 · 도입 상담」) · 기존 리드면 재유입(담당·단계·메모 그대로) · 폼 답변은 `system` 기록 · **환영 알림톡은 보내지 않는다**(우리 접수 안내가 간다).
- **실패**: Compass 가 2xx 가 아니면 `Compass: <status>` 가 응답 `warnings` 와 「리드 전달 경고」 인시던트(WeCom·메일)로 간다. 저장은 막지 않는다. Compass 는 실패 때 표식을 남기지 않으므로
  같은 본문을 다시 보내면 새로 처리된다 — 다만 **자동 재전달은 없다**(사람이 Compass 에서 등록하거나, 다음 재문의가 들어오면 그때 붙는다).
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
