# Quote Document Spec

기준 시점: 2026-04-06  
참고 자료: 사용자 제공 견적서 예시 2건  
관련 문서: [데이터 계약](./data-contracts.md), [운영 건 상세](./operation-case-workspace.md), [상태 흐름](./state-flow.md)

## 1. 문서 목적

이 문서는 실제 견적서 예시를 기준으로,  
하드웨어 운영 허브에서 `견적서`를 어떤 데이터와 UX로 다뤄야 하는지 정리한다.

핵심 판단은 아래와 같다.

`견적서`는 단순 PDF 첨부나 `quoteAmount` 숫자가 아니라,  
`발행 정보 + 수신자 + 공급자 사업자 정보 + 품목 표 + VAT/합계 + 기타사항/특약사항 + 공유/버전`을 가진 구조화 문서다.

## 2. 예시에서 확인된 공통 구조

사용자가 제공한 예시 두 장은 각각 2026년 1월 12일, 2026년 3월 30일 발행본이며, 서로 품목 수와 하단 상세 정도는 다르지만 구조는 매우 유사하다.

공통 구조:

1. 문서 제목
2. 좌측 헤더 정보
3. 우측 공급자 정보
4. 안내 문구 + 단위/VAT 표기
5. 품목 표
6. 합계
7. 기타사항
8. 담당자 footer 또는 특약사항

즉 견적서는 레이아웃상으로도 아래 구조를 가진다.

```text
[견적서 제목]
[발행일 / 수신 / 참조]   [상호명 / 사업자등록번호 / 대표이사 / 주소 / 담당자]
[안내 문구]              [단위, VAT 정책]
[품목 표]
[합계]
[기타사항]
[담당자 footer]
[특약사항]
```

## 3. 견적서가 특별한 이유

견적서는 일반 문서와 달리 아래 성격을 동시에 가진다.

- 문서
- 가격 제안
- 수량 기준
- 설치/배송 범위 정의
- 계약 전 협상 버전

따라서 견적서는 단순 `DocumentKind = quote`만으로 처리하기보다, quote 전용 child model을 두는 편이 맞다.

## 4. 견적서 전용 데이터 블록

## 4-1. 헤더 메타

예시를 기준으로 아래 필드가 필요하다.

- `estimateNumber`
- `issuedAt`
- `validUntil`
- `subjectText`
- `currency = KRW`
- `currencyUnitLabel`
- `vatIncluded`
- `vatPolicyLabel`

메모:

- 스크린샷에는 견적번호가 보이지 않더라도 실제 운영상 `estimateNumber`는 거의 필수다.
- `(단위: 원, VAT포함)` 같은 표기를 문서 레벨에서 제어할 수 있어야 한다.

## 4-2. 수신자 스냅샷

- `recipientCompanyName`
- `recipientContactName`
- `recipientPhone`
- `recipientEmail`
- `referenceName`
- `deliveryLocation`

메모:

- `수신`과 `참조`는 고객사 기본 정보에서 끌어오되, 견적서 단위 override가 가능해야 한다.

## 4-3. 공급자 스냅샷

- `supplierBusinessName`
- `supplierBusinessRegistrationNumber`
- `supplierRepresentativeName`
- `supplierAddress`
- `supplierContactName`
- `supplierContactPhone`
- `supplierContactEmail`

메모:

- 예시처럼 공급자 정보는 문서 상단 우측 고정 블록으로 들어가므로, 발행 당시 스냅샷을 보관해야 한다.

## 4-4. 본문 안내/하단 조건

- `introText`
- `deliveryLocationNote`
- `paymentTerms`
- `installationPolicy`
- `warrantyNote`
- `generalNotes`
- `specialTerms`
- `footerContactText`
- `internalMemo`

메모:

- `기타사항`과 `특약사항`은 별도 블록으로 구분한다.
- `footerContactText`는 담당자 이름/전화/메일이 들어가는 출력용 서명 블록이다.
- `internalMemo`는 문서에는 출력되지 않는 내부 메모다.

## 4-5. 합계 블록

- `subtotalAmount`
- `vatAmount`
- `discountAmount`
- `grandTotalAmount`
- `vatIncluded`
- `hasPendingAmounts`
- `pendingAmountNote`

메모:

- 예시는 VAT 포함 총액만 단순하게 보이지만, 시스템은 VAT 분리형도 수용해야 한다.
- 일부 행이 `별도 청구 예정`이면 합계가 완전하지 않을 수 있으므로 `hasPendingAmounts`가 필요하다.

## 5. 품목 표와 line item 모델

견적서의 중심은 품목 표다.

예시 기준 주요 컬럼:

- `No`
- `품목`
- `세부내역`
- `단가`
- `수량(대)`
- `공급가액`

제품 모델에서는 아래 필드를 권장한다.

### Quote Line Item

- `id`
- `quoteDocumentId`
- `sortOrder`
- `lineNumber`
- `itemType`
- `itemCode`
- `itemName`
- `itemDescription`
- `unitPrice`
- `quantity`
- `quantityUnit`
- `lineSupplyAmount`
- `vatIncluded`
- `lineStatus`
- `billingMode`
- `remark`
- `linkedQuantityRowId`
- `linkedChecklistTemplateId`

### itemType 예시

- `hardware`
- `installation`
- `shipping`
- `service`
- `discount`
- `note_only`

### lineStatus 예시

- `priced`
- `pending_price`
- `separate_billing`
- `informational`

### billingMode 예시

- `included_in_quote`
- `separate_invoice`
- `tbd`

### 중요한 예외 케이스

예시처럼 아래 행을 반드시 수용해야 한다.

- 설치비
- 배송비
- 금액 미확정 행
- `별도 청구 예정` 행

즉 모든 line item이 `unitPrice`와 `lineSupplyAmount`를 항상 가져야 하는 것은 아니다.

## 6. 견적서와 수량 원장의 연결

견적서 예시에서 이미 `수량(대)`가 핵심 컬럼으로 보인다.  
따라서 견적서 line item은 가능하면 수량 원장과 연결돼야 한다.

연결 원칙:

- 하드웨어 행은 `Quantity Ledger Row`와 연결 가능해야 한다.
- 설치/배송 행은 수량보다 checklist와 더 강하게 연결될 수 있다.
- `quotedQty`는 견적서 line item 수량과 동기화 가능한 값이어야 한다.

좋은 효과:

- 견적서 수정 시 수량 탭에도 영향 표시 가능
- 계약 전환 시 `quotedQty -> contractedQty` 비교 가능
- 설치 준비 시 `quoted item -> checklist` 흐름 생성 가능

## 7. 견적서 상태 흐름

일반 문서 상태보다 quote는 더 많은 상태가 필요하다.

- `draft`
- `ready`
- `sent`
- `viewed`
- `revised`
- `accepted`
- `rejected`
- `expired`
- `converted`
- `archived`

### 상태 의미

- `revised`: 수정본이 생성되었거나 이전 버전이 최신본에서 내려온 상태
- `accepted`: 고객이 견적안을 수용한 상태
- `rejected`: 고객이 거절한 상태
- `converted`: 계약 문서 또는 다음 운영 단계로 전환된 상태

## 8. 견적서 작성 화면 UX

견적서 작성은 표 하나 입력하는 폼이 아니라 `Quote Builder`에 가깝다.

### 화면 블록

1. 헤더 메타
2. 공급자 정보
3. 수신자 정보
4. 품목 표 편집기
5. 합계/VAT 정책
6. 기타사항/특약사항
7. 우측 A4 미리보기

### 필수 UX

- `품목 추가`
- `행 복제`
- `행 순서 변경`
- `금액 자동 계산`
- `미확정 금액 행 지원`
- `VAT 포함/별도 전환`
- `고객사 정보 불러오기`
- `공급자 템플릿 적용`
- `estimateNumber` 자동 발번
- `특약사항 템플릿 불러오기`
- `저장 후 미리보기`

## 9. 미리보기 UX

견적서는 미리보기가 매우 중요하다.

필수:

- A4 비율 미리보기
- 실제 PDF와 유사한 표 레이아웃
- 숫자 컬럼 우측 정렬
- 합계 행 별도 강조
- 헤더/합계/기타사항/특약사항 포함
- 페이지 넘침 경고
- PDF 저장 전 검토 상태 표시

시각 원칙:

- 인쇄/PDF 중심의 단색 레이아웃
- 넓은 여백
- 헤더와 표를 수평 라인으로 구획
- 공식 문서처럼 보이는 안정감

## 10. 버전 관리 UX

견적서는 버전 관리가 핵심이다.

필수:

- `v1`, `v2`, `v3` 같은 명시 버전
- 최신본 배지
- 버전별 수정 요약
- 어떤 버전이 고객에게 발송됐는지 표시
- 예전 버전 복제 후 새 버전 생성

권장:

- 버전 간 차이 요약
- 수량/금액 변경 시 자동 요약
- 어떤 버전이 실제로 열람됐는지 표시

## 11. 공유 UX

예시 문서와 현재 제품 방향을 합치면 공유는 아래 채널을 수용해야 한다.

- PDF 다운로드/첨부
- 카카오 공유
- 보호 링크 공유
- 이메일 공유

공유 패널 설정:

- 만료일
- 비밀번호
- 다운로드 허용 여부
- 인쇄 허용 여부
- 열람 로그 추적
- 공유 메시지 템플릿

## 12. 견적서 이후 CTA

견적서는 운영 흐름의 출발점이므로 저장으로 끝나면 안 된다.

필수 CTA:

- `계약 문서 생성`
- `수량 원장 생성/반영`
- `설치 체크리스트 초안 생성`
- `고객 전달 로그 남기기`
- `다음 추적 일정 만들기`

CTA 원칙:

- 견적서 저장 직후 강제 전환하지 않는다.
- 대신 `추천 다음 액션`으로 노출한다.
- 품목 표가 있으면 수량 원장과 연결 가능해야 한다.

## 13. 데이터 계약 초안

```ts
type QuoteDocument = {
  id: string
  caseId: string
  version: string
  status: "draft" | "ready" | "sent" | "viewed" | "revised" | "accepted" | "rejected" | "expired" | "converted" | "archived"
  estimateNumber: string
  issuedAt: string
  validUntil?: string
  subjectText?: string
  recipientCompanyName: string
  recipientContactName?: string
  referenceName?: string
  supplierBusinessName: string
  supplierBusinessRegistrationNumber?: string
  supplierRepresentativeName?: string
  supplierAddress?: string
  supplierContactName?: string
  supplierContactPhone?: string
  supplierContactEmail?: string
  currencyUnitLabel: string
  vatIncluded: boolean
  vatPolicyLabel?: string
  deliveryLocationNote?: string
  paymentTerms?: string
  installationPolicy?: string
  warrantyNote?: string
  generalNotes?: string
  specialTerms?: string
  footerContactText?: string
  internalMemo?: string
  subtotalAmount: number
  vatAmount?: number
  discountAmount?: number
  grandTotalAmount: number
  hasPendingAmounts?: boolean
  pendingAmountNote?: string
  lineItems: QuoteLineItem[]
}

type QuoteLineItem = {
  id: string
  quoteDocumentId: string
  sortOrder: number
  lineNumber: number
  itemType: "hardware" | "installation" | "shipping" | "service" | "discount" | "note_only"
  itemCode?: string
  itemName: string
  itemDescription?: string
  unitPrice?: number
  quantity?: number
  quantityUnit?: string
  lineSupplyAmount?: number
  vatIncluded: boolean
  lineStatus?: "priced" | "pending_price" | "separate_billing" | "informational"
  billingMode?: "included_in_quote" | "separate_invoice" | "tbd"
  remark?: string
  linkedQuantityRowId?: string
  linkedChecklistTemplateId?: string
}
```

## 14. 지금 바로 반영해야 할 설계 결론

1. `DocumentKind = quote`만으로는 부족하고 quote 전용 child model이 필요하다.
2. line item 구조가 없으면 실제 견적서 예시를 재현할 수 없다.
3. `발행자/수신자 스냅샷`을 분리해야 한다.
4. `기타사항`, `특약사항`, `footerContactText`를 별도 블록으로 둬야 한다.
5. `별도 청구 예정` 같은 비가격 행을 허용해야 한다.
6. `estimateNumber`, `validUntil`, `vatIncluded`, `hasPendingAmounts`가 필요하다.
7. 견적서 저장 후 `계약 생성`, `수량 원장 반영`, `체크리스트 초안 생성`으로 자연스럽게 이어져야 한다.

## 15. 다음 구현 메모

- `lib/partners-types.ts`에 quote 전용 타입과 line items 추가 검토
- `docs/admin-partners-supabase-schema.sql`에 quote line items/snapshots schema delta 검토
- 운영 건 상세 문서 탭에 `작성 / 미리보기 / 공유 / 버전` 서브뷰 추가
