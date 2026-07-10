# 발송 레이어 (solapi) 설정 가이드 — 2026-07-03

SMS/LMS/카카오 알림톡 발송을 위한 solapi 연동 백엔드 운영 문서.
발송 엔진은 [lib/messaging](../../lib/messaging)에 있고, 모든 발송 결과는
`message_logs` 테이블에 per-recipient로 정직하게 기록된다(성공/실패/시뮬레이션을 부풀리지 않음).

## 환경 변수

`.env.local`(로컬) / 배포 환경 변수에 설정한다. 이 문서는 값을 담지 않고 키만 안내한다.

| 키 | 필수 | 설명 |
|----|------|------|
| `SOLAPI_API` | 예 | solapi API Key. 미설정 시 발송은 자동으로 `simulated` 처리(무음 실패 아님). |
| `SOLAPI_SECRET` | 예 | solapi API Secret. |
| `SOLAPI_SENDER_NUMBER` | 아니오 | 기본 발신번호. 미설정 시 `01059118522`(등록 확인된 번호)로 폴백. 하이픈 없이 저장 권장. |
| `SOLAPI_KAKAO_PF_ID` | 아니오 | 카카오 발신프로필(pfId). 미설정 시 확정 채널 상수(`KA01PF2607030241141841Yu8RL3EQMB`, searchId "클래스인코리아")로 폴백. |
| `MESSAGING_DRY_RUN` | 아니오 | `1`이면 실발송 없이 모든 발송을 `simulated`로 기록. 스테이징/리허설용. |

`SOLAPI_API` / `SOLAPI_SECRET`가 없거나 `MESSAGING_DRY_RUN=1`이면
[lib/messaging/send.ts](../../lib/messaging/send.ts)가 실발송을 건너뛰고
`status: "simulated"`로 기록한 뒤 정직한 결과(sent=0, simulated=N)를 반환한다.

## 발신번호 등록 절차 (solapi console)

SMS/LMS를 보내려면 발신번호가 solapi에 사전 등록되어 있어야 한다.

1. solapi 콘솔(console.solapi.com) 로그인.
2. 발신번호 관리 → 발신번호 등록.
3. 통신사 서류 또는 ARS 인증으로 번호 소유를 증명.
4. 승인되면 해당 번호를 `SOLAPI_SENDER_NUMBER`로 설정.

> 현재 `01059118522`는 등록·검증 완료 상태다(2026-07-03 실발송 e2e에서 `registeredSuccess:1` 확인).
> 미등록 번호로 보내면 solapi가 접수 단계에서 실패를 반환하며, 그 에러 메시지는
> `/api/admin/messaging/test-send` 응답의 `error` 필드에 원문 그대로 전달된다.

## 알림톡 템플릿 승인 절차 (solapi console)

현재 승인된 알림톡 템플릿은 **0개**다. 알림톡 발송을 하려면 템플릿을 먼저 등록·승인받아야 한다.

1. solapi 콘솔 → 카카오 비즈니스 → 알림톡 템플릿.
2. 발신프로필(pfId, "클래스인코리아") 선택 후 템플릿 작성.
3. 변수는 `#{변수명}` 문법으로 정의.
4. 카카오 검수 제출 → 승인(보통 영업일 기준 수일).
5. 승인된 `templateId`를 `sendKakaoAlimtalk({ templateId, variables })`에 전달.

승인 전에는 알림톡 실발송이 불가하다. 발송 코드는 준비되어 있으나 템플릿 승인이 선행 조건이다.

## 발송 API 사용

### 서버 코드에서 직접

```ts
import { sendSmsMessages, sendKakaoAlimtalk } from "@/lib/messaging/send"

// SMS/LMS (autoTypeDetect — solapi가 바이트 기준 자동 판별, 90자 하드코딩 없음)
const r = await sendSmsMessages({
  messages: [{ to: "010...", text: "내용" }],
  context: { source: "sms-campaign" },
})
// r.sent / r.failed / r.simulated 로 정직한 집계 확인

// 알림톡 (disableSms 기본 true — 실패 시 SMS 대체발송 차단)
await sendKakaoAlimtalk({
  to: "010...",
  templateId: "승인된_템플릿_ID",
  variables: { name: "홍길동" },
  context: { source: "automation" },
})
```

### 어드민 API (`app/api/admin/messaging`)

세 엔드포인트 모두 `verifyAdmin()` + `createSupabaseAdminClient()` 를 쓴다.

- `GET /api/admin/messaging/status` — 잔액/카카오 채널/알림톡 템플릿/발신번호/이메일 프로바이더.
  solapi 원격 호출은 모듈 레벨 60초 캐시. 응답 `{ data: { provider, configured, balance, kakaoChannels, templates, senderNumber, emailProvider } }`.
- `POST /api/admin/messaging/test-send` — 단건 실발송(테스트). body `{ channel:"sms"|"kakao", to, text?, templateId?, variables? }`.
  응답 `{ data: { status, messageId?, error? } }`. solapi 에러 원문이 `error`에 담긴다.
- `GET /api/admin/messaging/logs?channel=&status=&limit=50&offset=0` — 발송 로그(수신자 마스킹).

### 캠페인 발송 (`POST /api/admin/sms/send`)

`targetTags`로 서버가 `newsletter_subscribers.phone`을 직접 조회해 발송한다.
`testMode:true`면 `testPhone` 1건만 발송한다. `recipientCount`(body)는 무시하고 서버 조회 결과를 사용.
`sms_campaigns`에 정직한 `status`(sent/partial/failed/simulated) + `sent_count`/`failed_count` 기록.

## message_logs 테이블 구조

정의: [supabase/migrations/20260703_message_logs.sql](../../supabase/migrations/20260703_message_logs.sql)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | uuid | PK |
| `channel` | text | `sms` \| `lms` \| `kakao_alimtalk` \| `kakao_friendtalk` \| `email` |
| `provider` | text | 기본 `solapi` |
| `recipient` | text | 수신자(원본 저장 — 재발송·진단용. API 응답에서만 마스킹) |
| `template_id` | text | 알림톡 템플릿 ID |
| `group_id` | text | solapi 그룹 ID |
| `status` | text | `requested` \| `sent` \| `failed` \| `simulated` |
| `status_code` | text | solapi 상태 코드 |
| `error` | text | 실패 메시지 |
| `context` | jsonb | 발송 출처 등(`{ source, ... }`) |
| `created_at` | timestamptz | |

RLS는 관리자 전용(정책 미부여 = anon/authenticated 전면 차단, service role만 우회).

## 마이그레이션 적용

이번 작업으로 아래 마이그레이션이 추가되었다. **적용 필요**:

- `supabase/migrations/20260703_message_logs.sql` — 신규 `message_logs` 테이블(+인덱스+RLS).
- `supabase/migrations/20260703_sms_campaigns_honesty.sql` — `sms_campaigns`에 `sent_count`/`failed_count` 추가, status CHECK를 `simulated`/`partial` 포함으로 교체.
- `supabase/migrations/20260703_email_campaigns_backfill.sql` — 고아 테이블 `email_campaigns`를 `IF NOT EXISTS`로 백필(코드 근거 컬럼만, 프로덕션 무해).

적용 명령(프로젝트 관례):

```bash
# Supabase CLI가 링크된 환경에서
supabase db push
```

또는 각 파일을 Supabase 대시보드 SQL 에디터에서 순서대로 실행한다.
모든 파일은 `IF NOT EXISTS` / 조건부 DDL이라 재실행 및 기존 프로덕션에 무해하도록 작성되었다.

## 검증 (읽기전용 프로브 / e2e)

- 읽기전용 프로브: `node --env-file=.env.local tmp/solapi-probe.mjs` — 잔액/채널/템플릿/메시지 API 접근 확인(발송 없음).
- 실측 e2e(SMS 1건 실발송): `node --env-file=.env.local tmp/messaging-e2e.mjs` — 발신번호 등록/자격증명 확인.

2026-07-03 e2e 결과: `registeredSuccess:1`, `failedMessageList:[]`, groupId 발급 → 발송 인프라 정상.
