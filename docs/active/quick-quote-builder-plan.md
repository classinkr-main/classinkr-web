# Quick Quote Builder Plan

기준 시점: 2026-04-10

이 문서는 현재 흩어진 견적서 생성 흐름을 `새 문서 -> 옵션 선택 -> 수량/가격 자동 계산 -> 즉시 발송` 경험으로 재정의하기 위한 실행 기획안이다.

관련 파일:

- [문서 허브 빠른 생성](/Users/clmagi/Desktop/Projects/classin_home/app/partner/(portal)/documents/page.tsx)
- [관리자 표준 견적 템플릿 에디터](/Users/clmagi/Desktop/Projects/classin_home/components/admin/partners/StandardQuoteTemplateEditor.tsx)
- [표준 견적 템플릿 유틸](/Users/clmagi/Desktop/Projects/classin_home/lib/standard-quote-template.ts)
- [파트너 포털 구형 견적 작성기](/Users/clmagi/Desktop/Projects/classin_home/components/partner-portal/crud/QuoteEditor.tsx)
- [파트너 단독 견적 편집기](/Users/clmagi/Desktop/Projects/classin_home/app/partner/(portal)/quote-editor/[id]/page.tsx)
- [견적 라이프사이클 실행안](/Users/clmagi/Desktop/Projects/classin_home/docs/active/quote-lifecycle-execution-plan.md)
- [문서 허브 와이어프레임](/Users/clmagi/Desktop/Projects/classin_home/docs/active/partner-portal-document-hub-wireframes.md)
- [견적 문서 스펙](/Users/clmagi/Desktop/Projects/classin_home/docs/hardware-ops/quote-document-spec.md)

## 1. 현재 UX 진단

현재 견적서 생성 경로는 4개로 갈라져 있고, 서로 다른 데이터 구조를 사용한다.

### 1-1. 문서 허브 quick create는 너무 얇다

- 문서 허브의 빠른 생성은 `고객명 / 거래명 / 견적서 제목 / 금액`만 받는다.
- 품목, 수량, 옵션, VAT, 설치비, 별도 청구 행을 설정할 수 없다.
- 생성 직후 바로 `send` 모드로 넘어가므로, 실제 견적 내용을 채우기 전에 발송 준비 큐로 이동한다.

결론:

- 현재 quick create는 견적서 초안이 아니라 `거래 + 빈 견적 문서`를 만드는 수준이다.
- 사용자가 기대하는 `빠른 견적 빌더` 역할을 하지 못한다.

### 1-2. 관리자 표준 템플릿 에디터는 데이터는 맞지만 조작성이 얕다

- 표준 견적 템플릿 에디터는 샘플 견적서 레이아웃과 공급자 고정 정보, 수량/단가 수정, 자동 합계를 이미 지원한다.
- 하지만 템플릿은 `camera_t1`, `board_75`, `board_86` 세 가지 고정 세트뿐이다.
- 행 추가, 행 복제, 옵션 토글, 액세서리 번들, 이전 버전 복제가 없다.
- 현재 편집 철학이 `품목명과 설명은 고정하고, 수량과 단가만 조정`이라 실제 영업 현장의 옵션 조합 속도를 감당하기 어렵다.

결론:

- 인쇄용 표준 문서 생성기로는 적합하다.
- `빠른 생성기`로 쓰기에는 옵션 선택 레일과 반복 작업 자동화가 부족하다.

### 1-3. 파트너 포털 구형 견적 작성기는 계산은 되지만 모델이 레거시다

- `QuoteEditor`는 템플릿 선택, 품목 추가, 수량/단가 수정, VAT 별도 토글, 합계 계산을 지원한다.
- 그러나 구조는 `structured_json.items` 중심의 구형 모델이다.
- `product_key`, `product_name`, `unit_price` 같은 단순 행 구조를 쓰고, 표준 견적서용 `quoteDetails.lineItems`와 다르다.
- 공유/버전/표준 A4 미리보기와 자연스럽게 이어지지 않는다.

결론:

- 사용성이 가장 가까운 구현은 여기에 있다.
- 하지만 그대로 확장하면 새 표준 견적 모델과 또 분기된다.

### 1-4. 단독 quote editor는 빠른 추가가 있지만 메타가 부족하다

- 개별 견적 편집기는 빠른 추가 프리셋, 기본 수량, 합계 계산, 저장/공유를 지원한다.
- 하지만 `recipientCompanyName`, `validUntil`, `lineItems` 정도만 저장한다.
- 행 타입, 별도 청구, VAT 정책 라벨, 공급자/수신자 메타, 특약사항 템플릿이 없다.
- 표준 견적서 A4 레이아웃과 동일한 편집 경험이 아니다.

결론:

- 이 화면은 `빠른 품목 입력`의 좋은 단서를 제공한다.
- 그러나 현재 표준 견적 문서 모델을 완전히 표현하지 못한다.

## 2. 왜 자동 계산 / 수량 조절 / 옵션 선택이 불편한가

핵심 원인은 기능 부족이 아니라 `모델 분산`이다.

### 2-1. 생성 경로마다 저장 구조가 다르다

- 문서 허브 표준 경로: `quoteDetails.lineItems`
- 파트너 구형 작성기: `structured_json.items`
- 단독 quote editor: `lineItems`를 PATCH로 보내지만 필드가 축약돼 있다
- 관리자 quotes 페이지: 레거시 `quotes` / `quote_items` 테이블 흐름

문제:

- 한 경로에서 만든 템플릿/옵션 로직을 다른 경로에서 재사용하지 못한다.
- 계산 로직이 여러 군데 중복되고, 어느 화면이 정답인지 불명확하다.

### 2-2. 템플릿이 `문서 레이아웃 템플릿`이지 `옵션 빌더 템플릿`이 아니다

현재 `STANDARD_QUOTE_TEMPLATES`는 완성 행 배열을 정의한다.

- 템플릿 선택
- 정해진 line preset 생성
- 수량/단가만 수정

빠진 것:

- 옵션 그룹
- 추천 번들
- 의존 옵션
- 설치 방식 선택
- 행 표시/숨김
- 액세서리 묶음 토글
- 고객 유형별 기본 세팅

문제:

- 사용자는 실질적으로 `구성 선택`을 먼저 하고 싶다.
- 현재 템플릿은 `완성품 레이아웃`만 제공해 시작 속도는 빠르지만 조합 유연성이 낮다.

### 2-3. quick create가 문서 생성과 견적 편집을 분리해버린다

현재 문서 허브에서 `새 문서`는:

1. 고객 생성
2. 거래 생성
3. 견적 문서 생성
4. 바로 발송 큐 전환

빠진 단계:

- 템플릿 선택
- 옵션 선택
- 수량/가격 확인
- 자동 계산 검증
- 미리보기 확인

문제:

- 사용자는 견적서를 만들었다고 느끼지만 실제론 빈 문서를 만든 것이다.
- 이후 다른 화면으로 다시 이동해야 하므로 흐름이 끊긴다.

### 2-4. 기존 스펙에서 요구한 UX 일부가 아직 미구현이다

이미 스펙 문서에는 아래가 필요하다고 적혀 있다.

- 품목 추가
- 행 복제
- 행 순서 변경
- 금액 자동 계산
- 미확정 금액 행 지원
- VAT 포함/별도 전환
- 고객사 정보 불러오기
- 공급자 템플릿 적용
- estimateNumber 자동 발번
- 특약사항 템플릿 불러오기
- 저장 후 미리보기

현재 구현은 이 중 일부만 충족한다.

## 3. 목표 UX

기준 경험은 아래 한 문장이다.

`새 문서`를 누르면 바로 `빠른 견적 빌더`가 열리고, 고객사/템플릿/옵션/수량만 선택하면 합계와 미리보기가 즉시 갱신되며, 저장과 동시에 공유까지 이어진다.

### 3-1. P0 경험

1. `새 문서` 클릭
2. 플로팅 drawer 또는 widescreen modal 열림
3. 좌측: 빠른 설정
4. 우측: A4 미리보기
5. 하단 sticky action:
   - 임시 저장
   - 저장 후 링크 복사
   - 저장 후 미리보기

### 3-2. 빠른 설정 블록

- 고객사 선택 또는 신규 고객 입력
- 발행일
- 유효기간 사용 / 없음
- 템플릿 선택
- 옵션 그룹 선택
- 수량 입력
- 단가 override
- VAT 정책
- 기타사항 preset
- 최근 견적 복제

### 3-3. 우선 제공할 옵션 그룹

- 본체
  - 전자칠판 86
  - 전자칠판 75
  - 카메라 T1
- 설치
  - 설치 포함
  - 별도 청구
  - 추후 협의
- 액세서리
  - 스탠드
  - 벽걸이
  - 전용 스위치
  - 교육/세팅
- 지원
  - 유지보수 포함
  - 보증 메모

### 3-4. 반복 작업 최적화

- 최근 발송 견적 복제
- 같은 고객사 마지막 설정 불러오기
- 같은 템플릿 마지막 수량 유지
- 고객사만 바꾸는 연속 발행 모드

### 3-5. 실제 화면 구조

- 상단 헤더
  - 고객사 검색/선택
  - 거래 선택 또는 `새 거래로 생성`
  - 템플릿 선택
  - 최근 견적 복제
- 좌측 `Quick Setup`
  - 템플릿 카드
  - 옵션 그룹
  - 수량 stepper
  - VAT 정책
  - 기타사항 preset
- 중앙 `Item Builder`
  - 최종 반영된 행 목록
  - 행 복제
  - 행 순서 변경
  - 별도 청구 / 금액 미확정 행 추가
  - 수동 가격 override
- 우측 `A4 Preview`
  - 실제 발송본과 동일한 표 구조
  - 합계 / 기타사항 / 특약사항 포함
  - 페이지 넘침 경고
- 하단 sticky action
  - 취소
  - 임시 저장
  - 저장 후 링크 복사
  - 저장 후 미리보기
  - 저장 후 발송 레일로 이동

### 3-6. 2026-04-10 확정 UX 규칙

- Quick add 기본 순서는 좌측부터 `전자칠판 86" -> 전자칠판 75" -> T1 카메라 -> 스탠드 -> 벽걸이`로 고정한다.
- 상단 quick add 버튼은 `패스트푸드 POS`처럼 동작한다.
  - 버튼을 한 번 누르면 해당 품목을 추가한다.
  - 같은 버튼을 연속으로 누르면 새 행을 만들지 않고 수량이 누적 증가한다.
  - 하단 line item 테이블에서도 수량을 직접 다시 조절할 수 있다.
- 유효기간은 `날짜 선택`과 `유효기간 없음`을 모두 지원한다.
  - `유효기간 없음`이 켜지면 `validUntil`은 비우고 공개/인쇄 레이아웃에서도 만료 문구를 숨긴다.
- 기본 단가 기준은 아래로 고정한다.
  - 전자칠판 86": `5,800,000`
  - 전자칠판 75": `4,900,000`
  - T1 카메라: `1,200,000`
  - 스탠드: `500,000`
  - 벽걸이: `500,000`
- `번들`은 카메라 번들과 별개 개념으로 정의한다.
  - 번들 = `전자칠판 86" + T1 카메라 + 벽걸이`
  - 기본 번들 단가는 `7,500,000`
  - 번들을 누르면 구성 행 3개를 생성하는지, 번들 단일 행으로 넣는지는 UI 단계에서 선택할 수 있지만 계산 기준은 항상 동일해야 한다.

## 4. 제품 구조 제안

핵심은 `문서 템플릿`과 `옵션 빌더`를 분리하는 것이다.

### 4-1. Quote Template

역할:

- 인쇄용 문서 레이아웃의 기본 틀
- 공급자 정보
- 기본 본문 문구
- 기본 기타사항/특약사항
- 기본 라인 순서

예:

- `camera_t1`
- `board_75`
- `board_86`

### 4-2. Quote Option Set

역할:

- 실제 조합 가능한 항목 묶음
- 사용자가 켜고 끄는 선택 단위

예:

- `main_product`
- `installation_mode`
- `mounting_option`
- `support_package`

각 옵션은 아래를 가진다.

- id
- label
- affects line item(s)
- default quantity
- default price
- editable 여부
- mutually exclusive 여부
- visible 조건

### 4-3. Quote Preset

역할:

- 자주 쓰는 조합 저장본
- 템플릿 + 옵션 + 수량 + 메모의 스냅샷

예:

- `86인치 교실 기본형`
- `75인치 + 카메라 세트`
- `T1 카메라 2대형`

### 4-4. 재사용 소스 우선순위

새 견적 시작 시 사용자가 먼저 고를 수 있어야 하는 source는 아래 순서가 좋다.

1. 표준 템플릿에서 새로 시작
2. 같은 거래의 마지막 견적 복제
3. 같은 고객사의 마지막 발송 견적 복제
4. 최근 내가 만든 견적 복제
5. 빈 커스텀 견적

이 우선순위를 따르면 `새 문서`를 눌러도 실제로는 대부분 복제/이어쓰기 경로를 타게 된다.

## 5. 컴포넌트 구조 제안

### 5-1. 새 핵심 컴포넌트

- `QuickQuoteComposer`
  - 문서 허브와 관리자 워크스페이스에서 공통 사용
- `QuoteOptionPicker`
  - 옵션 그룹 / 토글 / 라디오 / stepper
- `QuoteLineItemsTable`
  - 최종 계산 결과 편집
- `QuotePreviewPanel`
  - 기존 A4 미리보기 재사용
- `QuoteReuseStrip`
  - 최근 견적 복제 / 마지막 설정 불러오기

### 5-2. 기존 컴포넌트 재사용

- `StandardQuoteTemplateEditor`
  - A4 미리보기와 표준 데이터 정규화 로직 유지
- `buildStandardQuoteDetails`
  - 합계 계산 및 기본값 채우기 유지

### 5-3. 정리 대상

- `app/partner/(portal)/documents/page.tsx`의 초경량 quick create 모달
- `components/partner-portal/crud/QuoteEditor.tsx`의 독자 템플릿/옵션 정의
- `app/partner/(portal)/quote-editor/[id]/page.tsx`의 축약 line item 모델

원칙:

- 새 기능은 하나의 canonical quote builder 위에 얹고, 나머지는 점진적으로 그쪽을 호출하게 바꾼다.

### 5-4. 엔트리 포인트 정리

- 문서 허브 `새 문서`
  - 기본 진입점
  - 항상 `QuickQuoteComposer`를 연다
- 문서 허브 `빠른 발송`
  - 공유 가능한 최신 draft가 없으면 composer를 먼저 연다
- 거래 상세 `문서 추가`
  - deal context를 미리 주입한 composer를 연다
- 단독 `quote-editor/[id]`
  - 1차는 유지
  - 2차에 composer wrapper 또는 redirect로 대체
- 관리자 워크스페이스 문서 모달
  - 기존 `StandardQuoteTemplateEditor`를 composer 내부 섹션으로 흡수

## 6. 데이터 모델 제안

`PartnerQuoteDetailsInput`를 canonical 모델로 유지하되, 옵션 조립용 메타를 추가한다.

### 6-1. 추가 권장 필드

- `presetId`
- `optionSelections`
- `pricingSource`
- `generatedFromVersionId`
- `generatedFromTemplateVersion`

### 6-2. line item 보강

- `optionGroupId`
- `optionId`
- `isOptional`
- `isUserAdded`
- `priceLocked`
- `quantityLocked`

이렇게 해야:

- 어떤 옵션이 어떤 행을 만든 건지 추적 가능
- 복제 및 diff 요약 가능
- 가격 정책 변경 시 재계산 기준 유지 가능

### 6-3. canonical draft 예시

```json
{
  "templateId": "board_86",
  "presetId": "board_86_classroom_default",
  "recipientCompanyName": "권경옥어학원",
  "issuedAt": "2026-04-10",
  "validUntil": "2026-04-17",
  "optionSelections": {
    "main_product": "board_86",
    "installation_mode": "separate_billing",
    "mounting_option": "wall_mount",
    "camera_bundle": true
  },
  "lineItems": [
    {
      "lineNumber": 1,
      "itemType": "hardware",
      "itemCode": "board-86",
      "itemName": "전자칠판 86\"",
      "quantity": 2,
      "unitPrice": 5000000,
      "lineSupplyAmount": 10000000,
      "optionGroupId": "main_product",
      "optionId": "board_86",
      "quantityLocked": false,
      "priceLocked": false
    },
    {
      "lineNumber": 2,
      "itemType": "installation",
      "itemCode": "wall-mount",
      "itemName": "벽걸이 설치",
      "quantity": 2,
      "unitPrice": null,
      "lineStatus": "separate_billing",
      "billingMode": "separate_invoice",
      "optionGroupId": "installation_mode",
      "optionId": "separate_billing"
    }
  ],
  "subtotalAmount": 10000000,
  "vatAmount": 0,
  "grandTotalAmount": 10000000
}
```

핵심은 `optionSelections`가 사용자의 선택 상태를 보존하고, `lineItems`가 실제 발송/미리보기/버전 diff 기준이 되는 것이다.

## 7. 자동 계산 규칙

### 7-1. 계산 우선순위

1. 템플릿 기본 단가
2. 옵션별 override 단가
3. 사용자 수동 단가
4. `separate_billing` / `pending_price`는 합계 제외

### 7-2. 합계 규칙

- `lineSupplyAmount = quantity * unitPrice`
- `pending / separate billing`이면 합계 제외
- VAT 포함이면 `vatAmount = 0`
- VAT 별도면 subtotal 기준 10%

### 7-3. UX 규칙

- 수량 변경 즉시 행 금액/총액 갱신
- 옵션 ON/OFF 즉시 행 추가/제거
- 수동 단가 수정 시 `manual override` 표시
- 별도 청구 행은 합계 옆에 안내문 자동 노출

### 7-4. 수량 규칙

- 각 템플릿은 `baseQuantityDriver`를 가진다
  - 예: `본체 대수`
- 각 옵션은 `quantityMode`를 가진다
  - `follow_base`: 본체 수량을 그대로 따른다
  - `fixed_one`: 항상 1
  - `manual`: 사용자 직접 입력
  - `derived`: 다른 옵션/공식 기준
- 설치/거치류는 대체로 `follow_base`
- 교육/초기 세팅은 대체로 `fixed_one`
- 유지보수는 템플릿 정책에 따라 `fixed_one` 또는 `follow_base`

이 규칙이 있어야 사용자가 본체 수량만 바꿔도 관련 행이 함께 갱신된다.

### 7-5. 빠른 클릭 규칙

- quick add 버튼으로 들어간 품목은 `lastAddedItemCode`를 기억한다.
- 같은 품목 버튼을 연속 클릭하면:
  - 동일 행이 이미 있으면 `quantity += 1`
  - 해당 품목이 수량 잠금 상태면 새 행이 아니라 quantity 조절 가능한 행으로 전환한다.
- 다른 품목 버튼을 누르면 새 품목이 추가되거나, 기존 동일 품목 행을 찾아 수량을 증가시킨다.
- 본체 수량이 바뀌면 `follow_base` 옵션 행도 즉시 재계산한다.

### 7-6. 유효기간 규칙

- 기본값은 `발행일 + 7일`이다.
- 사용자가 `유효기간 없음`을 켜면:
  - 입력 필드를 비활성화한다.
  - `validUntil`은 `undefined` 또는 `null`로 저장한다.
  - 공개 견적서와 PDF/인쇄 미리보기에서는 만료일 표시를 생략한다.

## 8. 생성/버전/공유/계약 연계 규칙

빠른 견적 빌더가 버전/공유 흐름과 충돌하면 안 된다.

### 8-1. 생성

- 새 견적 저장 시 `QuoteDocument`가 없으면 생성
- 첫 저장은 `v1 draft`
- 임시 저장도 version 단위로 남길지, draft overwrite로 갈지 정책 필요

권장:

- 최초 저장은 `v1`
- 이후 `임시 저장`은 current draft version update
- 외부 공유 직전 `발송용 버전 고정` 생성

### 8-2. 공유

- 빠른 생성 후 `저장 후 링크 복사`는 현재 편집본을 바로 공유하지 않는다.
- 먼저 발송용 version snapshot을 만든 뒤 share token을 생성한다.

### 8-3. 확인

- 공개 견적은 지금처럼 version-fixed share를 사용
- 수락/검토 완료는 activity log에 남김

### 8-4. 계약 전환

- 계약 전환은 최신 draft가 아니라 accepted version 우선
- 빠른 견적 빌더는 계약 전환 데이터가 흔들리지 않게 source metadata를 유지해야 한다

### 8-5. API 변화 제안

1차는 기존 API를 최대한 재사용하고, 필요한 얇은 확장만 추가한다.

- `POST /api/partner/quotes`
  - 최초 draft 문서 + v1 생성
  - `quoteDetails` canonical payload 허용
- `PATCH /api/partner/quotes/:id`
  - 새 버전 생성이 아니라 `draft save mode`를 지원하도록 확장 검토
  - 최소한 `quoteDetails`, `optionSelections`, `presetId` 저장 허용
- `POST /api/partner/quotes/:id/share`
  - 현재와 동일
  - 단, composer에서 `저장 후 링크 복사`를 직접 호출
- `GET /api/partner/documents?kind=quote&recent=...`
  - 최근 견적 복제 strip용 query 필요

주의:

- 공개 견적/계약 전환 쪽 API는 이미 라이프사이클이 정리돼 있으므로, 빠른 생성 때문에 응답 구조를 다시 흔들지 않는다.

## 9. 구현 단계 제안

### Phase 1. 생성 UX 통합

- 문서 허브 quick create를 `QuickQuoteComposer`로 교체
- 고객사/템플릿/수량/옵션/미리보기 지원
- 저장 시 `quoteDetails` canonical 모델로만 저장

### Phase 2. 반복 작업 가속

- 최근 견적 복제
- 같은 고객사 마지막 설정 불러오기
- 연속 발행 모드

### Phase 2.5. Quick Quote Composer UI/UX 디벨롭

- quick add rail을 `86 -> 75 -> T1 -> 스탠드 -> 벽걸이 -> 번들` 순으로 재배치
- 버튼 연타 기반 수량 누적 로직 추가
- line item 테이블에서 plus / minus 조절 지원
- `유효기간 없음` 토글 추가
- 번들 버튼과 일반 옵션 버튼의 시각적 구분
- 기준 단가 badge 및 합계 반영 규칙 노출
- 모바일에서도 한 손 조작이 가능한 sticky quantity / action 바 정리

### Phase 3. 발송 일체화

- 저장 후 링크 복사
- 저장 후 카카오/메일용 메시지 텍스트 생성
- 재발송 시 마지막 공유 버전 표시

### Phase 4. 레거시 경로 정리

- `QuoteEditor`를 새 composer wrapper로 교체
- 단독 quote editor도 같은 line item 모델 사용
- admin quotes legacy 페이지는 유지보수 모드로 축소

### 9-1. 파일 단위 착수안

- `app/partner/(portal)/documents/page.tsx`
  - 기존 quick create 모달 제거
  - `QuickQuoteComposer` 호출로 교체
- `components/partner-portal/quotes/QuickQuoteComposer.tsx`
  - 신규
  - 허브/거래 상세 공용 진입 컴포넌트
- `components/partner-portal/quotes/QuoteOptionPicker.tsx`
  - 신규
  - 옵션 토글, 라디오, 수량 stepper
- `components/partner-portal/quotes/QuoteReuseStrip.tsx`
  - 신규
  - 최근 견적 복제, 마지막 설정 불러오기
- `lib/standard-quote-template.ts`
  - optionGroups, pricingRules, preset metadata 확장
- `app/api/partner/quotes/route.ts`
  - 최초 저장 payload를 canonical `quoteDetails` 기반으로 수용
- `app/api/partner/quotes/[id]/route.ts`
  - draft save / version create 정책 정리

### 9-2. 1차 구현 범위 밖

- 카카오/메일 실제 발송
- PDF 렌더러 완전 교체
- 관리자 legacy quotes 제거
- 계약 작성기 UI 전면 재구성

## 10. 수용 기준

아래를 만족하면 `Phase 1` 완료로 본다.

- `새 문서` 클릭 후 별도 페이지 이동 없이 고객사/템플릿/옵션/수량 설정이 가능하다
- 수량과 옵션 변경 시 합계가 즉시 갱신된다
- `별도 청구 예정`과 `미확정 금액` 행이 합계에서 올바르게 제외된다
- 최근 견적 복제가 가능하다
- 저장 후 즉시 공유 링크 복사가 가능하다
- 저장된 견적은 공개 견적 페이지에서 기존 표준 레이아웃으로 문제없이 렌더링된다
- 이후 accepted version -> 계약 전환 흐름이 깨지지 않는다

## 11. 바로 실행할 P0 작업 목록

1. `QuickQuoteComposer` 요구 필드 확정
2. `QuoteOptionSet` 데이터 스키마 설계
3. `standard-quote-template.ts`를 옵션 지원 구조로 확장
4. 문서 허브 quick create를 composer로 교체
5. 최근 견적 복제 API 또는 list query 추가
6. 저장 후 share 생성까지 one-click action 추가

## 11-1. 다음 개발 스프린트 우선순위

1. quick add 품목 rail 순서와 기준 단가를 새 운영 규칙으로 고정한다.
2. `연타 = 수량 누적` 로직과 하단 수량 stepper를 동시에 제공한다.
3. `유효기간 없음` 토글과 공개/인쇄 표시 규칙을 정리한다.
4. 번들 버튼을 별도 preset으로 추가하고 `86 + T1 + 벽걸이` 계산을 공통 유틸로 묶는다.
5. line item 테이블에서 수량/가격 수동 조정이 quick add 결과와 충돌하지 않게 override UX를 다듬는다.

## 12. 결론

현재의 불편함은 폼이 작아서가 아니라, 견적 생성 경험이 `거래 생성`, `표준 문서 편집`, `구형 품목 계산기`, `버전/공유`로 분절돼 있기 때문이다.

해결 방향은 분명하다.

- 표준 견적 문서 모델 하나로 통일한다.
- 빠른 생성은 그 위에 얹는 옵션 빌더로 재구성한다.
- 저장/공유/계약 전환은 기존 version-fixed lifecycle을 그대로 탄다.

즉 다음 구현은 `새 문서 모달 개선`이 아니라 `canonical quick quote builder 도입`으로 보는 것이 맞다.
