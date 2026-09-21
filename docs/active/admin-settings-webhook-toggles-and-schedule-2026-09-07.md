# 설정 화면 — 일반 탭 접기 · 웹훅 켜고 끄기 · 발송 시각 (2026-09-07)

기준 시점: 2026-09-07
대상 화면: `/admin/settings`
관련 정본: [운영 장애·Cron·Webhook 안전 지침](./operational-failure-handling-guidelines.md), [어드민 탭 재구성](./admin-tab-restructure-2026-07-29.md)

## 1. 왜 손댔나

프로덕션 실측에서 나온 세 가지다.

1. **일반 탭 6개 필드에 소비처가 없다.** `demoFormEnabled`, `demoBannerEnabled/Text`,
   `blogSectionEnabled`, `noticeBannerEnabled/Text` 를 읽는 코드가 공개 사이트에 한 줄도
   없다. 배너 컴포넌트 자체가 없고 공개용 settings API 도 없다. 그런데 이 탭이 기본 진입
   탭이었고 "즉시 반영" 배지가 붙어 있었다.
2. **웹훅을 끌 방법이 없었다.** 켜고 끄기는 `wecom_ops_webhook_enabled` boolean 하나뿐인데
   그 컬럼을 바꾸는 UI 가 없었다. 그래서 프로덕션 `wecom_ops_webhook_url` 에 문자열
   `'disabled'` 가 들어 있었다 — URL 칸에 그렇게 적어서 끈 것이다. 나머지 8개는 URL 을
   지워야 했는데, GET 이 값을 마스킹하고 `updateSettings` 가 빈 문자열을 "유지"로 읽어서
   그것도 되지 않았다.
3. **발송 시각이 두 곳에 나뉘어 박혀 있었다.** `vercel.json` 의 크론(트리거)과
   `lead-morning-brief.ts` 의 `REPORT_HOUR_KST`(집계 창). 한쪽만 바꾸면 리드가 이중
   집계되거나 빠진다.

## 2. 일반 탭 접기

`cta`·`history` 와 같은 처리다. `NAV_ITEMS` 에서 빼고, 타입·`SECTION_FIELDS`·렌더 블록과
DB 컬럼은 남긴다(`?tab=general` 직접 진입 보존, 나중에 배너를 실제로 구현할 때를 위해).

- 기본 진입 탭: `general` → `integrations` (`DEFAULT_SETTINGS_TAB`)
- 리드·폼 탭의 "현재 활성 설정" 카드 삭제 — 죽은 플래그를 "켜짐"으로 표시하고,
  편집 버튼이 이제 숨긴 탭으로 보낸다.

배너를 실제로 구현하기로 하면 그때 탭을 다시 노출하고 공개 사이트 소비처를 함께 붙인다.
지금 상태에서 탭만 되살리면 같은 문제로 돌아간다.

## 3. 웹훅 켜고 끄기

### 데이터

`site_settings.webhook_enabled_json` (jsonb, 기본 `{}`). 키는 `SiteSettings` 의 웹훅 키
(`wecomOpsWebhookUrl` 등), 값은 `false` 만 저장한다. **키가 없으면 켜짐**이다 — 켜짐을
굳이 적어두면 나중에 기본값을 바꿔도 옛 행이 옛 값을 붙든다.

옛 `wecom_ops_webhook_enabled` 컬럼은 드롭하지 않는다. 마이그레이션과 배포 사이 구간에서
이전 코드가 여전히 읽고, `rowToLegacy` 도 새 컬럼이 없을 때 그 값으로 폴백한다.

### 판정 위치

알림 이벤트의 발송 차단은 [emit-event.ts](../../lib/notifications/emit-event.ts)의
`resolveWebhookTarget`에서 한다. 리드 직접 전달 세 경로(Google Sheet·범용 리드·채널톡)는
[lead-capture.ts](../../lib/server/lead-capture.ts)에서 같은 활성 맵을 확인한다. `mergeResolvedSettings` 에서 URL 을 지우던
wecomOps 특례는 제거했다 — 거기서 지우면 연동 상태 화면에서 "URL 없음"과 "꺼둠"이 같은
모양이 된다.

발송 규칙:

- **끄기는 폴백으로 새지 않는다.** 정본 채널이 꺼져 있으면 거기서 멈춘다. 새게 두면
  운영 방을 껐을 때 일상 알림이 통째로 긴급 방으로 쏟아진다.
- **다른 용도의 방으로 우회하지 않는다.** 긴급·운영·CS·리드 보고는 URL이 없어도 서로 대체하지 않는다.
- **설정 조회 실패 시 기본 켜짐으로 복구하지 않는다.** 실패 결과를 캐시하지 않고 다음 요청에서 재조회한다.
- 새 JSONB 맵이 있으면 그 값을 정본으로 읽고, 컬럼이 없는 경우에만 옛 boolean을 읽는다.
  저장할 때 옛 운영 boolean도 맞춰 직전 배포와 활성 상태를 공유한다.

전달 로그의 사유도 갈라진다: 꺼진 채널은 `관리자가 끈 채널입니다.`, 미설정은 기존
`Notification channel is not configured.` 그대로. 로그만 보고 원인을 구분할 수 있어야 한다.

### 화면

값은 계속 마스킹한다. 대신 `GET /api/admin/settings` 가 `webhookMeta` 를 함께 내려보내
행마다 `설정됨 · DB` / `설정됨 · env` / `미설정` 칩을 그린다. 이게 없으면 새로고침 후
전부 빈 칸이라 스위치를 켜고 끄면서도 그 채널에 URL 이 있는지 알 수 없다.

`source` 판정 순서는 `mergeResolvedSettings` 의 실제 우선순위와 같다 — **DB 값이 있으면
그게 쓰이고, 없을 때만 env**. 연동 상태 패널도 같은 함수(`getWebhookConfigMeta`)를 쓰도록
바꿨다. 이전에는 env 를 먼저 봐서, 실제로는 DB 값이 나가는데 "env" 라고 표시했다.

### 남은 것

소비처가 없는 이메일 Webhook 입력은 화면에서 숨긴다. 이메일 알림의 실제 발송은 기존 이메일
제공자와 알림 수신자 목록을 사용하며, 저장된 레거시 URL과 스위치 데이터는 유지한다.

빈 문자열은 여전히 "유지"다. 즉 **저장된 URL 을 화면에서 지울 수는 없다.** 발송을 멈추는
수단이 스위치로 생겼으니 급하지 않지만, 값 자체를 지우려면 명시적 삭제 경로가 따로 필요하다.

## 4. 발송 시각 — 시간 슬롯 크론

### 제약

작성 당시(2026-09-07 API 확인) Vercel 은 **Hobby** 였다. 크론은 경로당 하루 1회, 트리거 정확도 ±59분이라
**분 단위 예약이 불가능**했고 "시"만 고르게 설계했다. 기존 "매일 10:10" 도 이미
근사치였다 — 크론은 11:10 에 뜨고 실제 도착은 11:25 였다.

> 2026-09-14 Pro 전환으로 분 단위 실행이 가능해졌다(`AGENTS.md` "배포 / Cron 안전 규칙"). 슬롯 크론을 5분 크론 하나로 합치는 후속 설계는 `docs/superpowers/specs/2026-09-14-vercel-pro-cron-freshness-design.md` 다. 이 화면의 "시" 단위 선택은 Hobby 제약에서 나온 설계이므로 재검토 대상이다.

### 구조

```
vercel.json          /api/cron/dispatch/00 … /23   (24개, 각 "0 H * * *")
                     └ 슬롯 = UTC 시. 경로가 달라야 "경로당 하루 1회"에 안전하게 맞는다.
app/api/cron/dispatch/[slot]/route.ts
                     └ 슬롯 → KST 시로 바꾸고, 그 시각이 발송 시각인 잡만 실행
site_settings.notification_schedule_json
                     └ { leadDaily: { deliveryHourKst, windowEndHourKst,
                                      windowEndMinuteKst, weekdaysOnly } }
```

`/api/cron/lead-response-alerts` 의 크론 엔트리는 제거했다(라우트는 수동 실행용으로 존치).
남겨두면 하루 두 번 나간다.

### 시각이 둘인 이유

`deliveryHourKst`(카드가 나가는 시간대)와 `windowEndHourKst/MinuteKst`(집계 창이 닫히는
시각)는 원래 다른 값이었고, 하나로 합치면 둘 중 하나가 조용히 어긋난다. 기본값은
2026-09-07 이전 고정 동작과 같다(11시대 발송 / 10:10 마감).

`REPORT_HOUR_KST`·`REPORT_MINUTE_KST` 상수는 설정 주입으로 바뀌었고, 기본값이 옛 상수와
같아서 스케줄을 넘기지 않는 호출부는 예전 그대로 동작한다.
[weekly-report-builder.ts](../../lib/marketing/weekly-report-builder.ts) 도 같은 스케줄을
읽는다 — 여기만 고정 시각으로 두면 주간 보고서의 "주말 유입" 이 어긋난다.

### 중복 발송

기존 `lead_digest_runs` 의 창 단위 claim 이 그대로 막는다. 디스패처가 재시도돼도 같은 창은
한 번만 나간다. 발송 실패는 500, 설정·집계 조회 장애는 503으로 구분한다. 외부 오류 원문은 응답에 노출하지 않는다.
`?dryRun=true`는 실행 선점이나 발송 없이 집계 창·대상 건수·최대 발송 1건을 확인한다.
수동 재실행의 중복은 기존 원장이 막는다.

### 주간·월간이 범위 밖인 이유

`sendLeadDigestAlert("weekly"|"monthly")` 에는 중복 방지 원장이 없다. 원장 없이 디스패처로
옮기면 재시도 때 같은 리포트가 두 번 나간다. 화면에는 현재 스케줄을 읽기 전용으로 적어
두었다. 옮기려면 원장을 먼저 붙인다.

### 크론 안전 검사

`scripts/check-vercel-crons.mjs` 가 동적 세그먼트(`[slot]`)를 해석하도록 고쳤다.
`/api/cron/dispatch/07` 은 리터럴 디렉터리가 없으므로, 그 자리의 `[param]` 디렉터리로
내려가서 route 파일을 찾는다. 안 고치면 슬롯 24개가 전부 "missing route file" 로 잡힌다.

## 5. 프로덕션 적용 순서

1. [설정 마이그레이션](../../supabase/migrations/20260907_site_settings_webhook_toggles_and_schedule.sql) 적용
   (컬럼 2개 추가 + wecomOps 스위치 백필 + 비활성 유지 + `'disabled'` 문자열 정리).
   [일일 카드 타입 마이그레이션](../../supabase/migrations/20260907_lead_digest_runs_daily_type.sql)의
   `daily` 허용 제약도 확인한다.
2. 배포
3. 확인: 설정 → 외부 연동 → 웹훅 링크에서 WeCom 운영이 `설정됨 · DB` 대신 `미설정` +
   `발송 꺼짐` 으로 보이면 `'disabled'` 정리가 반영된 것이다.
4. 다음 영업일 아침, `lead_digest_runs` 에 창이 하나만 생기고 위컴 카드가 한 장만 도착하는지 확인.

**순서를 지킬 것.** 마이그레이션 없이 배포해도 읽기는 옛 boolean 컬럼으로 폴백해서 동작하지만,
저장하면 없는 컬럼에 upsert 해서 실패한다.

## 6. 배포 전 회귀 점검 보강 (2026-09-10)

- 기존 운영 스위치가 꺼진 행에서 다시 켜고 읽어도 새 값이 유지되는지 검증한다.
- URL이 없는 비활성 채널, 미설정 긴급 방 모두 다른 방으로 전달되지 않아야 한다.
- 리드 직접 전달을 꺼도 리드 저장은 수행하며, 저장 실패를 전달 성공으로 감추지 않는다.
- 설정 DB 오류가 발생하면 기본 켜짐을 캐시하지 않는다.
- 디스패처 dry-run은 집계만 수행하며 선점·발송을 호출하지 않는다.
