# Quote Lifecycle Execution Plan

기준 시점: 2026-04-09

이 문서는 견적서의 `생성 -> 공유 -> 확인 -> 수락 -> 계약 전환` 흐름을 실제 운영 기준으로 정리한 실행안이다.
목표는 다음 세 가지다.

- 같은 견적 문서 안에서도 `어떤 버전이 고객에게 전달되고 확정됐는지` 흔들리지 않게 한다.
- 공개 링크 기반 확인 흐름을 운영 로그로 남긴다.
- 계약 전환 시 `최신 초안`이 아니라 `확정된 견적 버전`을 우선 사용한다.

관련 파일:

- [partner-portal-redistribution-plan-2026-06-26.md](./partner-portal-redistribution-plan-2026-06-26.md)
- [quote-documents.ts](../../lib/portal/repositories/quote-documents.ts)
- [contract-documents.ts](../../lib/portal/repositories/contract-documents.ts)
- [activity.ts](../../lib/portal/repositories/activity.ts)
- [public quote page](../../app/share/quote/[token]/page.tsx)
- [public quote confirm route](../../app/api/share/quote/[token]/confirm/route.ts)
- [public quote accept route](../../app/api/share/quote/[token]/accept/route.ts)
- [quote share route](../../app/api/portal/quotes/[id]/share/route.ts)
- [quote convert route](../../app/api/portal/quotes/[id]/convert/route.ts)

2026-06-26 운영 메모:

- 현재 구현 경로는 `app/share/quote/[token]`, `app/api/share/quote/[token]/confirm`, `app/api/share/quote/[token]/accept`, `app/api/portal/quotes/*`, `lib/portal/*` 기준으로 본다.
- 새 하드웨어 견적은 `quote_documents` 계열을 기준 모델로 삼고, legacy `quotes / quote_items`는 조회/호환/마이그레이션 대상으로 둔다.

## 1. 운영 원칙

- `QuoteDocument`는 견적 업무 단위다.
- `QuoteDocumentVersion`은 외부 전달 가능한 스냅샷이다.
- `QuoteDocumentShare`는 특정 버전에 묶인 공개 링크다.
- 고객의 확인/진행 요청은 문서 전체가 아니라 `버전 기준`으로 남겨야 한다.
- 계약 전환은 기본적으로 `accepted version`을 우선 사용한다.

## 2. 현재 스키마 제약과 대응

현재 V2 스키마에는 아래 전용 컬럼이 없다.

- `accepted_version_id`
- `first_opened_at`
- `last_opened_at`
- `public_view_count`
- `source_quote_document_id`
- `source_quote_version_id`

따라서 v1에서는 전용 컬럼 추가 대신 `activity_logs.after_json`을 이용해 운영 기준을 고정한다.

## 3. Activity Log 표준 이벤트

견적 공개 링크 기준으로 아래 action_type을 사용한다.

- `public_quote_view`
- `public_quote_review_confirmed`
- `public_quote_accepted`

공통 payload 예시:

```json
{
  "version_id": "quote-version-id",
  "share_id": "quote-share-id",
  "token": "share-token"
}
```

accept 이벤트에는 아래를 추가한다.

```json
{
  "version_id": "quote-version-id",
  "share_id": "quote-share-id",
  "token": "share-token",
  "requested_action": "convert_to_contract"
}
```

## 4. 상태 전이

견적 문서 상태:

- `draft`: 내부 작성 중
- `shared`: 외부 전달 가능한 링크 생성 및 발송 완료
- `accepted`: 특정 공개 버전 기준으로 진행 요청 또는 수락 확인
- `expired`: 유효기한 또는 링크 만료
- `archived`: 계약 전환 완료 또는 운영 종료

운영 규칙:

- 새 버전을 만들어도 이전 share는 그대로 살아 있어야 한다.
- `accepted`는 문서 전체 상태이지만, 실제 기준 버전은 activity log에서 찾는다.
- 계약 전환 후 견적서는 기본적으로 `archived` 처리한다.

## 5. 공개 견적 동작

GET `/api/partner/quote?token=...`

- share token으로 문서/버전 조회
- 만료 share 차단
- 구조화된 quote details 반환
- 관련 interaction summary 함께 반환
- 반복 새로고침으로 로그가 폭증하지 않도록 view는 dedupe window를 둔다

POST `/api/partner/quote`

- `action = review_confirmed`
- `action = accept_quote`

둘 다 token 기반으로 동작한다.

accept 동작 시:

- 해당 share의 version을 accepted candidate로 기록
- quote document 상태를 `accepted`로 업데이트
- 이후 계약 전환은 이 버전을 우선 사용한다

## 6. 계약 전환 규칙

POST `/api/portal/quotes/:id/convert`

우선순위:

1. 명시적으로 전달된 `quote_document_version_id`
2. latest accepted interaction의 `version_id`
3. document.current_version_id
4. 최신 version_number

계약 버전의 `structured_json`에는 source 정보를 남긴다.

```json
{
  "source_quote": {
    "quote_document_id": "qd_x",
    "quote_document_version_id": "qv_y",
    "quote_number": "Q-2026-001"
  }
}
```

이 값은 이후 계약 상세, 감사 추적, 재작성 판단의 기준이 된다.

## 7. UI 원칙

작성기 진입·종료(2026-10-21):

- `/admin/quotes`의 작성 유형은 SW 단독, HW, AI Suite 통합으로 나눈다. SW 단독은
  ClassIn Business 충전형이며 HW 품목을 기본으로 붙이지 않는다.
- AI Suite는 전자칠판·카메라·소프트웨어가 이미 포함된 월 구독 패키지다. 별도 HW 구매
  견적을 자동 추가하지 않고 견적서 1장으로 작성한다. 별도 HW 구매와 Business 충전 조합만
  기존 공급자별 분리 견적을 유지한다.
- 유형을 전환하면 품목 구성을 교체하고 수신·참조 등 공통 입력은 유지한다.
- 작성기에는 항상 보이는 `나가기` 버튼과 Esc 종료를 제공한다. 작성 진입 파라미터는
  한 번 소비한 뒤 URL에서 지워, 닫고 새로고침했을 때 작성기가 다시 열리지 않게 한다.
- 저장·공유 요청 처리 중에는 종료를 막고, 하위 확인창의 Esc는 작성기 종료로 전파하지 않는다.

작성 화면 정리(2026-10-22):

- 최근 견적과 템플릿은 기본 3개씩만 표시하고 더보기로 펼친다. 팀이 저장한 템플릿을 먼저 표시하며, 별도 HW·SW 구매 조합은 접어서 둔다.
- 작성기와 템플릿 관리의 `보기 설정`에서 최근 견적서·템플릿 영역을 각각 숨길 수 있다. 표시 설정과 개별 템플릿 숨김은 로그인 계정별로 이 브라우저에 저장해 다음 접속에도 복원한다. 저장값은 버전과 형태를 검증하며 견적 내용이나 인증 토큰을 포함하지 않는다.
- 기본 템플릿은 개인 목록에서 숨기거나 다시 표시한다. 저장한 팀 템플릿은 기존 소유자·관리자 권한으로 삭제할 수 있으며, 기존 DELETE API의 보관 처리를 사용해 이미 발행한 견적을 보존한다.

문서 허브/공개 페이지에서 반드시 읽혀야 하는 값:

- 현재 버전
- 마지막 공유 버전
- 마지막 열람 시각
- 진행 요청 여부
- 계약 전환 기준 버전

공개 견적 페이지 CTA:

- `검토 완료`
- `이 견적으로 진행 요청`

관리 화면 CTA:

- `최신 버전 공유`
- `확정 버전으로 계약 전환`

## 8. 다음 단계

P0

- 공개 견적 interaction API/로그 도입
- accepted version 우선 계약 전환
- contract structured_json에 source quote/version 저장

P1

- 문서 상세 화면에서 interaction summary 표시
- accepted version badge 표시
- 계약 상세에서 원본 견적 버전 링크 표시

P2

- 별도 컬럼 도입 여부 검토
- view_count / accepted_version_id materialization
- 리마인드 및 후속 자동화 연결

### 견적서 문서 디자인 (2026-10-21)

작성 화면, 관리자 미리보기, 고객 공유 견적서는 `QuoteDocumentPreview`와 `quote-paper.module.css`를 공통으로 사용한다. 성남여고 승인 견적서의 Paperlogy Regular/SemiBold, A4 여백, 수신처·공급자 두 열, 품목 표와 녹색 합계 영역을 기준으로 한다. 폰트는 `public/fonts/paperlogy/`에 포함하며 PDF 출력은 폰트 로드 후 실행한다. 인쇄 시 관리자·사이트 UI를 제외하고 문서와 페이지 번호만 출력한다. 구조화된 견적 데이터가 없는 기존 HTML 문서는 기존 본문을 유지한다. 공급자, 금액, VAT 정책은 각 견적의 저장값을 유지한다.
