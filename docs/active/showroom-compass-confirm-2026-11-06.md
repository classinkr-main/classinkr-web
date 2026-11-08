# 쇼룸 방문: 신청 → Compass 컨펌·담당 지정 → 확정 → 확정 문자 (2026-11-06)

설계자 요청(2026-11-06): "classin.co.kr/showroom 문의 오면, 바로 확정이 아니라 신청 → compass에서 컨펌 및 담당 지정 → 확정 → 확정 문자 가는 로직으로".

## 1. 흐름

| 단계 | 어디서 | 무엇이 일어나나 |
| --- | --- | --- |
| ① 신청 | 공개 `/showroom` | `showroom_bookings.status = requested`. 고객에게 **접수 문자**("방문 신청이 접수되었습니다 … 확정되면 문자로 다시 알려드립니다"). 화면도 "신청"·"확정되면 문자"로 말한다. 운영 위컴 방에 **신청 알림**(§4) |
| ② Compass 로 전달 | 어드민 → Compass | 신청은 리드(`source = showroom_booking`)로 미러되고 `POST /api/webhook/home-lead` 로 Compass 에 들어간다. Compass 가 `crm.lead_refs(system='home_lead')` 링크를 건다 — [compass-home-lead-push-2026-11-04.md](./compass-home-lead-push-2026-11-04.md) |
| ③ 컨펌·담당 지정 | **Compass** | 매니저가 그 리드에서 데모 예약 → 방식 **「쇼룸 데모」**, 날짜·시각, **담당**을 고른다. Compass 는 이 회차를 쇼룸 구글 캘린더에도 잡는다(Compass ADR-0086) |
| ④ 확정 | 어드민 크론(5분) | `app/api/cron/lead-contact-sync` 가 이어서 `lib/server/showroom-compass-confirm.ts` 를 돈다. 링크된 Compass 리드의 「쇼룸 데모」·잡힘 회차를 찾아 예약을 `confirmed` 로 올린다 — 담당(`assigned_to`)·확정 일시(`visit_date/time`, 다르면 처음 신청 일시는 `requested_visit_*` 에 보존)·회차 id(`compass_demo_id`) |
| ⑤ 확정 문자 | 어드민 | 확정된 예약마다 **한 번**: "[클래스인] 목동 쇼룸 방문이 확정되었습니다. 일시 · 담당 · 장소(806호) · 변경·취소 번호" |
| ⑥ 확정 알림 | 어드민 → 운영 위컴 방 | 크론이 확정한 예약마다 **한 번**, 문자 결과까지 담아 운영 방에 남긴다(§4) |

어드민 접수 큐(`/admin/crm/customers/intake`)에서 직접 "확정"으로 바꿔도 같은 확정 문자가 한 번 나간다(같은 함수·같은 선점). 이때 운영 위컴 방의 **확정 알림은 보내지 않는다** — 관리자가 이미 어드민에서 처리하고 있다.

Compass 에 새 버튼을 만들지 않았다. Compass 저장소는 이번 세션에서 쓰기 권한이 없었고, 매니저가 이미 쓰는 「데모 예약」이 날짜·시각·담당을 모두 갖고 있어 확정 신호로 충분하다. 교차 쓰기 0건 규칙(어드민은 `crm` 에 쓰지 않는다)도 그대로다.

## 2. 판정 규칙 (`lib/showroom/compass-confirm.ts`, 테스트 `tests/showroom/compass-confirm.test.ts`)

- 확정 신호: `crm.lead_demos` 회차 중 `kind = demo` · `memo = '쇼룸 데모'`(Compass `lib/demoTypes.ts` 라벨 그대로) · `status = booked` · 담당 있음 · 시각(`at`) 있음.
- 매칭은 **링크만**(`compass_lead_refs_v`, 어드민 리드 id ↔ Compass 리드). 전화 키 추측 매칭은 하지 않는다 — 고객에게 문자가 나가는 경로라서.
- 회차 날짜가 오늘(KST) 이후이고 신청 접수일 이후여야 한다. 신청 접수 45일 안의 `requested` 만 본다.
- 후보가 여럿이면 신청 일시에 가장 가까운 회차. 한 회차는 한 예약만 확정한다(부분 유니크 인덱스 + 판정).
- 확정은 `status = requested` 조건부 UPDATE — 그 사이 사람이 취소·확정했으면 덮지 않는다.
- 확정 문자는 방문일이 오늘 이후일 때만, `confirmation_sent_at` 을 조건부 UPDATE 로 선점한 뒤 보낸다. 결과는 `message_logs`(`source = showroom_booking_confirmed`)와 감사 로그(`showroom_booking.confirm_from_compass`).

## 3. 켜는 순서 (외부 발송 안전 규칙 — operational-failure-handling-guidelines.md §3)

1. **마이그레이션** `20261106_showroom_booking_compass_confirm.sql` 을 서울 프로젝트에 적용한다([db-migration-runbook.md](./db-migration-runbook.md) 2026-11-06 절). 미적용이면 크론은 매번 건너뛰고(failed) 접수 큐는 확정 칸 없이 읽는다.
2. 코드 배포. 스위치 `SHOWROOM_CONFIRM_ENABLED` 는 **비워 둔 채**(기본 꺼짐 — 판정만 하고 쓰지도 보내지도 않는다).
3. **dry-run 확인**: `GET /api/cron/lead-contact-sync?dryRun=true`(Bearer `CRON_SECRET`) 응답의 `showroomConfirm` — `scanned`·`linked`·`planned` 를 본다. `planned` 가 실제로 Compass 에 쇼룸 데모가 잡힌 신청 수와 맞는지. 켜는 순간 `planned` 만큼 확정·확정 문자·확정 알림이 나간다(10 넘으면 `over_cap` 으로 0건).
4. Vercel Production 에 `SHOWROOM_CONFIRM_ENABLED=1`. (선택) 알림톡 승인 뒤 `SOLAPI_TEMPLATE_SHOWROOM_CONFIRMED` — 변수 `#{일시}`·`#{담당}`·`#{장소}`. 비어 있으면 문자로 나간다. 이때부터 들어오는 신청의 위컴 알림이 "Compass 컨펌 대기" 안내로 바뀐다(§4).
5. 다음 5분 실행부터 확정·확정 문자·운영 방 확정 알림. 실행당 상한 `SHOWROOM_CONFIRM_MAX_PER_RUN`(10)을 넘으면 한 건도 처리하지 않고 `over_cap`(500) — 대상을 확인한 뒤 정리한다. 확정 알림 결과는 응답 `showroomConfirm.alerts`.

끄기: `SHOWROOM_CONFIRM_ENABLED` 를 지우면 다음 실행부터 판정만 한다(확정 알림도 없다). 어드민 접수 큐의 확정도 문자를 보내지 않는다(상태만 바뀐다). 새 신청의 위컴 알림은 "수동 확정 대기" 안내로 돌아간다.

## 4. 위컴 알림

사업 담당 요청(2026-11-08): "쇼룸 신청 → Compass 승인 받는 것들, 위컴에도 알림까지 가게".

| 이벤트 | 언제 | 목적지 | 문구(요지) |
| --- | --- | --- | --- |
| `showroom.booking_requested` | 공개 `/showroom` 신청이 저장될 때마다 한 번(`lib/showroom/bookings.ts`) | 운영 방 | 머리 "목동 쇼룸 방문 신청이 1건 들어왔습니다" + **할 일** 두 줄, 그 아래 희망 일시·학원·담당자(고객)·연락처·이메일·인원·규모·관심사·메모·접수 경로·접수 번호·확인 링크. 인앱 제목 "쇼룸 방문 신청: 학원" |
| `showroom.booking_confirmed` | 5분 크론의 조건부 UPDATE 가 **실제로 확정한** 예약마다 한 번, 확정 문자 결과가 정해진 뒤(`lib/server/showroom-compass-confirm.ts`) | 운영 방 | 머리 "목동 쇼룸 방문이 Compass 에서 확정되었습니다", 확정 일시(옮겼으면 처음 신청 일시도)·학원·고객(직책)·연락처·담당(Compass 회차 담당)·방문 인원·확정 문자 결과·Compass 리드 링크·어드민 확인 링크·접수 번호. 인앱 제목 "쇼룸 방문 확정: 학원" |

- **목적지**: 둘 다 `wecom_webhook` = 운영 방 하나다. URL 은 설정 > 웹훅의 운영 방(`site_settings.wecom_ops_webhook_url`)이 먼저, 없으면 env `WECOM_OPS_WEBHOOK_URL`. 운영 방 토글을 끄면 두 알림 모두 보내지 않는다(인앱은 남는다). 다른 방으로 우회하지 않는다.
- **신청 알림의 할 일은 스위치 `SHOWROOM_CONFIRM_ENABLED` 를 따른다**(신청이 저장되는 순간의 값 — payload `confirmFlow`).
  - 켜짐: "(Compass 컨펌 대기)" · "Compass 에서 이 리드에 데모 회차를 추가하고 방식 「쇼룸 데모」·날짜·시각·담당을 넣어 주세요" · "다음 5분 동기화에서 확정되고 고객에게 확정 문자가 자동으로 나갑니다".
  - 꺼짐: "(수동 확정 대기)" · 자동 확정이 꺼져 있으니 고객과 일정을 맞춘 뒤 **어드민 접수 큐에서 직접 확정**, 확정 문자가 자동으로 나가지 않으니 확정 안내는 직접 — 접수 큐 링크를 붙인다. 꺼져 있을 때 자동 확정을 약속하면 아무도 확정하지 않는다.
  - 스위치를 켜기 전에 들어온 신청은 "수동 확정 대기" 문구로 나갔어도, 켠 뒤 Compass 에 「쇼룸 데모」 회차가 생기면 크론이 확정한다(접수 45일 안).
- **확정 문자 결과**(확정 알림의 `확정 문자:` 줄): 보냄 / 모의 발송 — 실제 문자는 나가지 않음 / **실패 — 고객에게 직접 연락 필요** / 보내지 않음 — 이미 보냈거나 지난 방문. 실패면 머리에도 "(확정 문자 실패 — 고객에게 직접 연락 필요)"를 붙이고 `severity = warning`·`notificationType = action_required` 로 올린다(그래도 운영 방이다 — 긴급 방은 `critical` 만). 나머지는 `info`·`status_update`.
- **확정 알림이 나가지 않는 경우**: 스위치 꺼짐·`?dryRun=true`(판정만) · 상한 초과(`over_cap` — 한 건도 확정하지 않는다) · 조건부 UPDATE 가 null(그 사이 사람이 바꿨다) · 확정 UPDATE 실패 · 어드민 접수 큐의 수동 확정(PATCH `app/api/admin/showroom-bookings/[id]`).
- **멱등·상한**: 확정 알림은 `requested → confirmed` 조건부 UPDATE 가 성공한 자리에서만 생긴다 — 같은 예약은 두 번 확정되지 않으니 알림도 한 번이다(`source = showroom_booking`, `source_id` = 예약 id). 실행당 확정 상한(10)이 알림 상한이다.
- **실패 처리**: 알림은 모든 확정·문자가 끝난 뒤 한꺼번에 보낸다(위컴이 느려도 다음 예약의 확정·문자를 밀지 않게). 알림이 던지거나 전달이 실패해도 확정·문자 결과와 보고서 `status` 는 그대로이고, 응답 `showroomConfirm.alerts`(`sent`·`failed`·`skipped`)에만 센다 — `skipped` 는 운영 방이 꺼졌거나 URL 이 없을 때. 전달 기록은 `notification_delivery_logs`.
- 켜는 순서는 §3 그대로다. 알림만 따로 켜는 스위치는 없다 — 신청 알림은 예전부터 나가고, 확정 알림은 확정이 일어날 때만(= `SHOWROOM_CONFIRM_ENABLED` 켜짐) 나간다.
- 테스트: `tests/notifications/emit-event.test.ts`(두 문구 — 진짜 빌더 → 진짜 `emitNotificationEvent`) · `tests/showroom/compass-confirm.test.ts`(확정당 한 번·dryRun/상한/null 0건·실패 삼킴) · `tests/showroom/bookings.test.ts`(신청 제목·스위치) · `tests/api/cron-lead-contact-sync-route.test.ts`(알림 실패가 응답 코드를 바꾸지 않음).

## 5. 남은 것

- **Compass 쪽(별도 저장소 `classinkr-main/crm`)**: `scripts/admin-bridge-contract.json` 의 `lead_demos` 에 `at` 을 더한다 — 어드민이 이제 `compass_demos_v.at` 을 읽으니, Compass 가 그 칸을 바꿀 때 경고가 울리게. 이번에는 쓰기 권한이 없어 반영하지 못했다.
- Compass 화면 개선(선택): 「쇼룸 예약」 유입 리드에서 데모 예약 창을 열 때 방식 「쇼룸 데모」·신청 일시를 미리 채우면 컨펌이 한 번에 끝난다.
- 확정 뒤 Compass 에서 회차를 옮기거나 취소해도 어드민 예약은 따라가지 않는다(확정 문자는 이미 나갔다). 필요하면 변경·취소 문자까지 같은 방식으로 잇는다.
- 어드민 캘린더에서는 확정된 신청(`showroom_booking`)과 Compass 가 쇼룸 구글 캘린더에 잡은 같은 일정(`showroom`, ICS)이 나란히 보일 수 있다.
