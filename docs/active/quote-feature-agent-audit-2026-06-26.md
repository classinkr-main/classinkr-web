# Quote Feature Agent Audit

기준 시점: 2026-06-26

이 문서는 견적 기능을 `작성/저장`, `발송/공유`, `기록/상태`, `응답/수락`, `열람/접근` 축으로 나눠 에이전트 점검 결과를 합친 실행 큐다.

관련 기준 문서:

- [partner-portal-redistribution-plan-2026-06-26.md](./partner-portal-redistribution-plan-2026-06-26.md)
- [quote-lifecycle-execution-plan.md](./quote-lifecycle-execution-plan.md)
- [quick-quote-builder-plan.md](./quick-quote-builder-plan.md)
- [partner-portal-master-spec.md](./partner-portal-master-spec.md)

관련 구현:

- [QuickQuoteComposer.tsx](../../components/portal/quotes/QuickQuoteComposer.tsx)
- [HardwareQuotesPanel.tsx](../../components/admin/documents/HardwareQuotesPanel.tsx)
- [quote-documents.ts](../../lib/portal/repositories/quote-documents.ts)
- [documents.ts](../../lib/portal/repositories/documents.ts)
- [activity.ts](../../lib/portal/repositories/activity.ts)
- [portal quotes create route](../../app/api/portal/quotes/route.ts)
- [portal quote share route](../../app/api/portal/quotes/[id]/share/route.ts)
- [public quote page](../../app/share/quote/[token]/page.tsx)
- [public quote accept route](../../app/api/share/quote/[token]/accept/route.ts)

## 1. Agent Assignment

| Agent | 점검 축 | 핵심 질문 |
| --- | --- | --- |
| A | 작성/저장 | 리드 없이 견적을 만들 수 있는가, 저장이 원자적인가, 고객/거래 생성이 안전한가 |
| B | 발송/공유 | 링크 생성과 실제 발송이 분리되어 있는가, 채널/수신자/실패 기록이 남는가 |
| C | 응답/수락 | 고객 확인, 진행 요청, 질문, 거절, 수정 요청이 기록되는가 |
| D | 기록/상태 | 버전, 수락 기준, 상태 전이, 계약 전환 기준이 일관적인가 |
| E | 열람/접근 | 공개 링크, 관리자, 파트너 접근 권한과 진입 경로가 안전한가 |

## 2. Current Behavior

### 작성/저장

- `/admin/quotes/new`, `/admin/quotes/recording-studio`, `/admin/quotes/ai-suite`는 `/admin/quotes?tab=hardware&action=...`로 redirect한다.
- [QuickQuoteComposer.tsx](../../components/portal/quotes/QuickQuoteComposer.tsx)는 기본적으로 새 고객 생성 흐름을 연다. 홈페이지 리드가 없어도 고객명만으로 견적을 시작할 수 있다.
- 새 고객은 `POST /api/portal/customers`, 새 거래는 `POST /api/portal/deals`, 견적 문서는 `POST /api/portal/quotes`로 생성된다.
- 관리자 흐름에서는 고객 생성 시 `Classin Direct Sales` partner account를 자동 생성/재사용한다.
- 새 견적 문서는 `quote_documents.status = draft`로 생성되고, 버전 본문은 `quote_document_versions.structured_json.quoteDetails`에 저장된다.

### 발송/공유

- 현재 UI의 `발송`은 실제 서버 발송이 아니라 공개 링크 생성과 클라이언트 공유 시트 열기다.
- `POST /api/portal/quotes/:id/share`는 현재 버전에 대한 `quote_document_shares` 토큰을 만들거나 재사용하고, 문서 상태를 `shared`로 바꾼다.
- Kakao, SMS, mailto, Web Share는 브라우저 클라이언트 동작이다. 서버에는 수신자, 채널, 발송 성공/실패, 재발송 기록이 남지 않는다.
- `save_and_preview`도 공유 링크를 만들기 때문에 실제 발송 전에도 목록에서는 `발송됨`처럼 보일 수 있다.

### 기록/상태

- 생성은 `activity_logs`에 남지만, 버전 생성, 공유 링크 생성, 상태 변경, 수락 상태 업데이트, 계약 전환 후 archive는 표준 상태 이벤트로 일관되게 기록되지 않는다.
- 공개 열람/확인/수락은 `public_quote_view`, `public_quote_review_confirmed`, `public_quote_accepted` activity로 남는다.
- 수락 기준 버전은 `activity_logs.after_json.version_id`에만 있고, `quote_documents.accepted_version_id` 같은 물리 컬럼은 없다.
- 문서 목록은 현재 버전과 최신 share 기준으로 interaction을 요약하므로, 과거 버전이 수락된 뒤 새 버전/share가 생기면 목록에서 수락 신호가 숨을 수 있다.

### 응답/수락

- 공개 견적 페이지는 `확인`, `이 견적으로 진행 요청`, `출력(PDF)`만 제공한다.
- `확인`은 중복 방지 후 `public_quote_review_confirmed`를 기록한다.
- `진행 요청`은 `public_quote_accepted`를 기록하고 문서 상태를 `accepted`로 바꾸려고 한다.
- 질문, 거절, 수정 요청, 담당자 알림, 고객 메모 입력, 명시적 확인 문구 입력은 아직 없다.
- 수락 로그 저장과 문서 상태 업데이트는 트랜잭션으로 묶여 있지 않다.

### 열람/접근

- 공개 견적은 token bearer 방식이다. 토큰과 `expires_at`만 주로 확인한다.
- 공개 조회에서 `share.access_mode === "view"`와 문서 상태의 share 가능 여부를 강하게 확인하지 않는다.
- 관리자 목록은 V2 `quote_documents`를 보지만, legacy `/api/admin/quotes`와 `quotes` 저장소도 남아 있어 경로 의미가 섞여 있다. (2026-07-02: legacy `/api/admin/quotes` V1 라우트 3종 삭제 완료 — `lib/repositories/quotes.ts`는 잔존)
- 관리자 직접보기는 최초 조회 때 `x-portal-scope: admin`을 강제하지만, 내부 확인 버튼 호출은 admin scope 헤더를 유지하지 않을 수 있다.
- 파트너용 별도 `/partner` quote UI는 현재 명확히 노출되어 있지 않고, API 권한 스코프만 존재한다.

## 3. P0 Fix Queue

1. 발송 용어와 상태를 분리한다.
   - `shared`: 공개 링크 준비
   - `copied`: 링크 복사
   - `sent`: 실제 외부 채널 발송 성공
   - `opened`: 고객 열람
   - `reviewed`: 고객 확인
   - `accepted`: 진행 요청 또는 수락

2. 공개 링크 접근을 강화한다.
   - `getPublicQuoteByToken`에서 `share.access_mode === "view"` 확인
   - `quote_documents.status`가 `archived`, `expired`이면 차단
   - revoked/terminal share 개념 추가 전까지 최소한 상태 regression을 막는다.

3. `save_and_preview`가 `shared` 상태를 만들지 않게 한다.
   - 관리자 미리보기는 `/admin/quotes/:id/view` 또는 임시 preview 렌더링으로 처리한다.
   - 공개 링크 생성은 `링크 준비` 또는 `실제 발송` 액션에서만 수행한다.

4. 수락을 원자화한다.
   - `public_quote_accepted` 로그 생성과 `quote_documents.status = accepted` 업데이트를 하나의 저장소 함수 또는 RPC로 묶는다.
   - 상태 업데이트 실패를 성공으로 숨기지 않는다.

5. 수락 상태를 물리화한다.
   - `quote_documents.accepted_version_id`
   - `quote_documents.accepted_share_id`
   - `quote_documents.accepted_at`
   - `quote_documents.first_opened_at`
   - `quote_documents.last_opened_at`
   - `quote_documents.public_view_count`

6. 관리자 목록의 계약 전환 CTA를 실제 액션으로 연결한다.
   - accepted 상태 row에서 `POST /api/portal/quotes/:id/convert` 호출
   - 성공 후 계약서 링크 또는 계약서 탭 이동 CTA 표시

## 4. P1 Fix Queue

1. 배송/발송 모델을 추가한다.
   - 후보 테이블: `quote_document_share_deliveries`
   - 필드: `share_id`, `recipient_name`, `recipient_email`, `recipient_phone`, `channel`, `status`, `sent_at`, `failed_at`, `provider_message_id`, `metadata`, `created_at`

2. 고객 응답 종류를 확장한다.
   - `question`
   - `decline`
   - `request_changes`
   - `accepted`
   - 각 응답은 공개 route와 activity/event model을 가진다.

3. 버전 번호 생성을 서버에서 원자적으로 처리한다.
   - `/api/portal/quotes/:id/versions`는 caller-provided `version_number`를 믿지 않는다.
   - 저장소 함수가 최신 version_number + 1을 계산한다.

4. 고객 생성 중복 방지를 추가한다.
   - partner account + name/phone/email/business_number 기준 후보를 제시하거나 merge한다.
   - 기존 고객 모드에서 선택값이 비어 있으면 첫 고객으로 fallback하지 않는다.

5. 파트너 UI 정책을 결정한다.
   - 파트너가 quote list/view를 쓸 예정이면 `/partner` 또는 제한형 action portal을 만든다.
   - 아니면 unused `QuoteEditor`와 관련 경로를 quarantine한다.

6. legacy `quotes` 방향을 결정한다.
   - V2로 proxy/migrate
   - 또는 legacy-only로 명시하고 새 admin quote UX에서는 사용하지 않는다.

## 5. Test Queue

- `tests/api/portal-quotes-create.test.ts`
  - title 누락, totals 음수, structured_json shape 오류, failed version insert
- `tests/api/portal-quote-share.test.ts`
  - preview는 shared 상태를 만들지 않음
  - expired/revoked/access_mode mismatch token 차단
  - accepted/archived/expired 상태 regression 방지
- `tests/api/public-quote-response.test.ts`
  - confirm idempotency
  - accept idempotency
  - status update 실패 시 실패 반환
  - question/decline/request_changes 저장
- `tests/repositories/quote-documents-lifecycle.test.ts`
  - accepted_version_id materialization
  - older accepted version + newer current version 목록 표시
  - contract conversion source quote/version 선택
- `tests/api/portal-customers-create.test.ts`
  - admin direct sales account fallback
  - duplicate customer candidate handling

## 6. Implementation Order

1. Security/lifecycle guard
   - 공개 token access guard
   - status regression 방지
   - admin confirm scope header 수정

2. UX semantics cleanup
   - `발송됨`을 `링크 준비`와 `발송 완료`로 분리
   - preview가 shared를 만들지 않게 변경

3. Response hardening
   - accept transaction
   - accepted state materialization
   - question/decline/request changes 추가

4. Delivery tracking
   - delivery table
   - server-side email 우선
   - SMS/Kakao는 provider 확정 전까지 copy/share action 기록만 남김

5. Admin detail
   - quote detail/history/version/share/delivery panel
   - accepted row contract conversion CTA

6. Partner/legacy decision
   - partner UI 최소 경로 추가 또는 명시 제거
   - legacy admin quotes API 정리
