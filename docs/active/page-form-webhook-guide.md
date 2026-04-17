# Page Form Webhook Guide

기준 시점: 2026-04-15  
문서 목적: 홈페이지 내부 폼과 외부 랜딩페이지 폼을 같은 리드 파이프라인으로 연결하는 방법을 운영팀과 개발팀이 빠르게 확인할 수 있도록 정리한다.

## 1. 이번 작업 요약

2026년 4월 15일 기준으로 아래 항목이 반영되었다.

- 공개 웹훅 엔드포인트 추가: `/api/webhook/page`
- 기존 리드 수집 로직 공용화: `lib/server/lead-capture.ts`
- 기존 홈페이지 문의/데모와 외부 랜딩페이지 폼이 같은 CRM 리드 저장 흐름을 사용
- `/admin/settings`의 `외부 연동` 탭에 웹훅 URL, 경로, 예시 요청을 바로 복사할 수 있는 안내 카드 추가
- 외부 랜딩페이지 브라우저 `fetch` 호출을 위해 CORS 허용 추가

## 2. 언제 쓰는가

이 웹훅은 아래 상황에서 사용한다.

- 홈페이지 `문의하기`와 같은 형태의 외부 캠페인 폼을 만들 때
- 별도 도메인의 랜딩페이지에서 `데모 신청하기`를 받을 때
- 홈페이지 방문 여부와 상관없이 같은 리드 DB와 어드민 CRM에 저장하고 싶을 때

핵심 원칙:

- 내부 홈페이지 폼은 기존처럼 `/api/lead`를 계속 사용해도 된다.
- 외부 페이지나 외부 스크립트는 `/api/webhook/page`를 사용하면 된다.
- 두 경로 모두 최종적으로 같은 서버 처리 로직을 타므로 CRM, 외부 웹훅, ChannelTalk, Google Sheet, 구독자 동기화 흐름이 동일하다.

## 3. 엔드포인트

- 절대 URL 예시: `https://<your-domain>/api/webhook/page`
- 상대 경로: `/api/webhook/page`
- 메서드: `POST`
- CORS: 허용됨

헬스체크 용도로 `GET /api/webhook/page`를 호출하면 지원 타입과 필수 필드를 JSON으로 확인할 수 있다.

## 4. 타입 매핑 규칙

외부 폼에서는 `formType` 또는 `source` 둘 중 하나를 보내면 된다.

| 외부 입력 | 내부 리드 source |
| --- | --- |
| `formType: "demo"` | `demo_modal` |
| `formType: "contact"` | `contact_page` |
| `formType: "newsletter"` | `newsletter` |
| `source: "demo_modal"` | `demo_modal` |
| `source: "contact_page"` | `contact_page` |
| `source: "newsletter"` | `newsletter` |

주의:

- `formType`과 `source`를 동시에 보내는 경우 서로 값이 맞아야 한다.
- 값이 충돌하면 400 응답을 돌려준다.

## 5. 지원 필드

기본 필드:

- `name`
- `org`
- `role`
- `size`
- `email`
- `phone`
- `message`
- `marketingConsent`

같이 지원하는 별칭:

- 기관명: `organization`, `company`
- 연락처: `tel`, `mobile`
- 문의 내용: `content`, `note`
- 수신 동의: `marketing_consent`
- 직책: `position`, `jobTitle`
- 규모: `studentCount`, `teamSize`

## 6. 필수값 규칙

### 데모 신청

필수:

- `name`
- `org`
- `role`
- `size`
- `email`
- `phone`

### 문의하기

필수:

- `org`
- `name`
- `phone`
- `message`

### 뉴스레터

필수:

- `email`

## 7. 예시 요청

### 7-1. 데모 신청

```json
{
  "formType": "demo",
  "name": "홍길동",
  "organization": "무궁화학원",
  "role": "원장",
  "size": "120",
  "email": "demo@example.com",
  "phone": "010-1234-5678",
  "message": "도입 상담 요청",
  "marketingConsent": true
}
```

### 7-2. 문의하기

```json
{
  "formType": "contact",
  "name": "홍길동",
  "organization": "무궁화학원",
  "phone": "010-1234-5678",
  "message": "문의 남깁니다.",
  "marketingConsent": false
}
```

### 7-3. 외부 랜딩페이지 fetch 예시

```js
await fetch("https://<your-domain>/api/webhook/page", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    formType: "demo",
    name: "홍길동",
    organization: "무궁화학원",
    role: "원장",
    size: "120",
    email: "demo@example.com",
    phone: "010-1234-5678",
    message: "도입 상담 요청",
    marketingConsent: true,
  }),
})
```

## 8. 저장 이후 흐름

`/api/webhook/page`로 들어온 요청은 내부적으로 기존 리드 처리와 동일하게 동작한다.

1. 리드 저장
2. Google Sheet Webhook 전달
3. Generic Lead Webhook 전달
4. ChannelTalk Webhook 전달
5. 마케팅 수신 동의 시 구독자 DB 동기화
6. 알림 이벤트 발행

즉, 홈페이지 내부 폼과 외부 랜딩페이지 폼의 후속 운영 흐름은 동일하다.

## 9. 어드민 확인 위치

운영자는 아래 경로에서 바로 값을 확인하고 복사할 수 있다.

- 경로: `/admin/settings`
- 탭: `외부 연동`
- 카드명: `페이지 폼 웹훅`

이 카드에서 바로 할 수 있는 작업:

- 절대 웹훅 URL 복사
- 상대 경로 복사
- `fetch` 예시 복사
- 데모 신청 JSON 예시 복사
- 문의하기 JSON 예시 복사

## 10. 운영 지침

- 공개 폼 연결은 가능하면 이 웹훅으로 표준화한다.
- 외부 랜딩페이지를 새로 만들 때는 `formType`만 먼저 맞추고 필드명을 별칭 규칙 안에서 정리한다.
- 운영팀은 연결 전에 `/admin/settings`의 `페이지 폼 웹훅` 카드에서 예시 요청을 복사해 전달한다.
- 보안 강도가 더 필요한 캠페인은 추후 origin allowlist 또는 서명 검증을 추가한다.
- CRM에서 내부 홈페이지 유입과 외부 랜딩 유입을 구분해야 하면 다음 단계에서 별도 채널 필드를 추가한다.
