# Quote Lifecycle Execution Plan

기준 시점: 2026-04-09

이 문서는 견적서의 `생성 -> 공유 -> 확인 -> 수락 -> 계약 전환` 흐름을 실제 운영 기준으로 정리한 실행안이다.
목표는 다음 세 가지다.

- 같은 견적 문서 안에서도 `어떤 버전이 고객에게 전달되고 확정됐는지` 흔들리지 않게 한다.
- 공개 링크 기반 확인 흐름을 운영 로그로 남긴다.
- 계약 전환 시 `최신 초안`이 아니라 `확정된 견적 버전`을 우선 사용한다.

관련 파일:

- [quote-documents.ts](/Users/clmagi/Desktop/Projects/classin_home/lib/partner-portal/repositories/quote-documents.ts)
- [contract-documents.ts](/Users/clmagi/Desktop/Projects/classin_home/lib/partner-portal/repositories/contract-documents.ts)
- [activity.ts](/Users/clmagi/Desktop/Projects/classin_home/lib/partner-portal/repositories/activity.ts)
- [quote public API](/Users/clmagi/Desktop/Projects/classin_home/app/api/partner/quote/route.ts)
- [public quote page](/Users/clmagi/Desktop/Projects/classin_home/app/partner/quote/[id]/page.tsx)
- [quote share route](/Users/clmagi/Desktop/Projects/classin_home/app/api/portal/quotes/[id]/share/route.ts)
- [quote convert route](/Users/clmagi/Desktop/Projects/classin_home/app/api/portal/quotes/[id]/convert/route.ts)

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
