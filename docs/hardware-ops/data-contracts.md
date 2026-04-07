# Hardware Ops Data Contracts

기준 시점: 2026-04-06  
관련 문서: [도메인 모델](./domain-model.md), [견적서 스펙](./quote-document-spec.md), [운영 건 상세](./operation-case-workspace.md), [상태 흐름](./state-flow.md)

## 1. 문서 목적

이 문서는 개념 문서를 실제 타입/DTO/API 설계로 옮길 때 기준이 되는 `데이터 계약`을 정리한다.

핵심 원칙:

- 지금 구현은 `/admin/partners`와 `partner/deal` 용어를 쓰고 있다.
- 장기 개념은 `고객사 + 운영 건` 중심이다.
- 따라서 당장은 기존 타입 위에서 움직이되, 의미는 운영 허브 쪽으로 정렬한다.

## 2. 현재 구현 용어와 목표 용어 매핑

| 현재 코드 용어 | 목표 개념 용어 | 설명 |
| --- | --- | --- |
| `PartnerSummary` | `DistributorWorkspace` | 총판/운영 워크스페이스의 상단 엔티티 |
| `PartnerDeal` | `OperationCase` | 실제 실행 단위 |
| `PartnerDocument` | `CaseDocument` | 운영 건에 연결된 문서 원장 |
| `PartnerScheduleItem` | `CaseScheduleItem` | 운영 건 실행 일정 |
| `PartnerOpsChecklistItem` | `CaseChecklistItem` | 운영 건 실행 체크 항목 |
| `PartnerActivityLog` | `CaseActivityLog` | 운영 건 맥락 로그 |
| `PartnerOpsIssue` | `CaseIssue` | 운영 건 리스크/판단 필요 항목 |
| `PartnerSalesRecord` | `CaseSettlementRecord` 또는 `RevenueRecord` | 정산/매출 결과 |

메모:

- `PartnerDeal`은 실제로는 `deal`보다 넓은 운영 건 개념으로 확장될 가능성이 높다.
- 초기 구현에서는 `dealId`를 `caseId`의 v1 대용으로 사용해도 된다.

## 3. 공통 필드 원칙

모든 핵심 엔티티는 아래 공통 필드를 고려한다.

- `id`
- `partnerId`
- `customerId` 또는 고객 식별자
- `caseId` 또는 현재 단계에서는 `dealId`
- `createdAt`
- `updatedAt`
- `owner`
- `visibility`
- `source`

### visibility

최소 2단계로 나누는 편이 좋다.

- `internal`
- `shared_with_partner`

나중에 필요하면 아래를 추가한다.

- `shared_with_customer`

### source

변경 출처를 로그와 UI에서 추적하기 위해 아래 값을 고려한다.

- `hq`
- `partner`
- `system`

## 4. 운영 건 계약

운영 건은 실행의 기준점이다.

### 필수 필드

- `id`
- `partnerId`
- `customerId`
- `title`
- `caseType`
- `stage`
- `healthStatus`
- `priority`
- `owner`
- `nextAction`
- `nextActionAt`
- `latestActivityAt`
- `summary`

### 권장 필드

- `customerName`
- `customerPrimaryContact`
- `installLocation`
- `expectedCloseAt`
- `contractStartAt`
- `contractEndAt`
- `calendarSyncEnabled`
- `tags`

### caseType 예시

- `new_install`
- `additional_delivery`
- `contract_renewal`
- `settlement_followup`
- `issue_resolution`

### stage

상세 내용은 [상태 흐름](./state-flow.md)을 따른다.

- `intake`
- `quote`
- `contract`
- `prep`
- `install`
- `settlement`
- `closed`

### healthStatus

- `healthy`
- `watch`
- `delayed`
- `blocked`
- `done`

## 5. 문서 원장 계약

문서는 파일이 아니라 상태 객체다.

### 문서 레코드 필수 필드

- `id`
- `partnerId`
- `caseId`
- `kind`
- `title`
- `version`
- `status`
- `stageScope`
- `isLatest`
- `isInternalSource`
- `isCustomerFacing`
- `owner`

### 문서 레코드 권장 필드

- `fileLabel`
- `fileUrl`
- `externalUrl`
- `amount`
- `issuedAt`
- `dueAt`
- `signedAt`
- `archivedAt`
- `memo`
- `lineItemCount`

### kind 예시

- `quote`
- `contract`
- `receipt`
- `settlement`
- `installation_confirmation`
- `handover_confirmation`
- `evidence`

### status 예시

- `draft`
- `ready`
- `sent`
- `viewed`
- `signed`
- `expired`
- `archived`

### 문서 전달본 계약

문서 자체와 별도로 전달본을 둔다.

필드:

- `id`
- `documentId`
- `deliveryChannel`
- `deliveryStatus`
- `recipientName`
- `recipientEmail`
- `recipientPhone`
- `shareToken`
- `shareSlug`
- `passwordEnabled`
- `allowDownload`
- `allowPrint`
- `expiresAt`
- `sentAt`
- `lastViewedAt`
- `viewCount`

### 문서 접근 로그 계약

- `id`
- `deliveryId`
- `eventType`
- `actorType`
- `occurredAt`
- `ipAddress`
- `userAgent`

### 견적서 전용 확장

견적서는 다른 문서보다 구조가 깊다.  
실제 예시를 반영하면 아래 전용 필드를 별도 payload 또는 확장 테이블로 두는 편이 좋다.

- `estimateNumber`
- `recipientName`
- `referenceName`
- `supplierBusinessRegistrationNumber`
- `supplierRepresentativeName`
- `supplierAddress`
- `supplierContactName`
- `supplierContactPhone`
- `supplierContactEmail`
- `validUntil`
- `vatIncluded`
- `currencyUnitLabel`
- `vatPolicyLabel`
- `subjectText`
- `deliveryLocationNote`
- `paymentTerms`
- `installationPolicy`
- `warrantyNote`
- `generalNotes`
- `specialTerms`
- `footerContactText`
- `hasPendingAmounts`
- `pendingAmountNote`
- `lineItems`

세부 구조는 [견적서 스펙과 UX](./quote-document-spec.md)를 따른다.

### Quote Line Item 권장 필드

- `lineNumber`
- `itemType`
- `itemCode`
- `itemName`
- `itemDescription`
- `unitPrice`
- `quantity`
- `quantityUnit`
- `lineSupplyAmount`
- `lineStatus`
- `billingMode`
- `remark`
- `linkedQuantityRowId`

## 6. 수량 원장 계약

수량은 품목별 행 구조를 기본으로 한다.

### 수량 행 필수 필드

- `id`
- `partnerId`
- `caseId`
- `itemCode`
- `itemName`
- `unit`
- `customerRequestedQty`
- `quotedQty`
- `contractedQty`
- `preparedQty`
- `shippedQty`
- `installedQty`
- `finalConfirmedQty`
- `rowStatus`

### 수량 행 권장 필드

- `category`
- `internalBaselineQty`
- `varianceReason`
- `owner`
- `updatedAt`
- `memo`

### rowStatus 예시

- `aligned`
- `watch`
- `mismatch`
- `blocked`

### 계산 파생 필드

조회용 DTO에서 아래 값을 계산해도 좋다.

- `quoteVsContractDelta`
- `contractVsPreparedDelta`
- `preparedVsInstalledDelta`
- `installedVsFinalDelta`
- `hasMismatch`

## 7. 일정 계약

### 필수 필드

- `id`
- `partnerId`
- `caseId`
- `kind`
- `status`
- `title`
- `startsAt`
- `owner`

### 권장 필드

- `endsAt`
- `location`
- `isAllDay`
- `syncToAdminCalendar`
- `relatedChecklistGroup`
- `relatedDocumentId`
- `memo`

### kind 예시

- `customer_meeting`
- `contract_review`
- `installation`
- `delivery`
- `internal_deadline`
- `settlement_deadline`

## 8. 체크리스트 계약

### 필수 필드

- `id`
- `partnerId`
- `caseId`
- `group`
- `title`
- `todoStatus`
- `owner`

### 권장 필드

- `installStatus`
- `itemCode`
- `itemName`
- `plannedQuantity`
- `confirmedQuantity`
- `dueAt`
- `completedAt`
- `blockedReason`
- `memo`

### group 예시

- `operation_prep`
- `installation_items`
- `quantity_review`
- `onsite_install`
- `post_support`

## 9. 로그 계약

로그는 맥락 보존 객체다.

### 필수 필드

- `id`
- `partnerId`
- `caseId`
- `logCategory`
- `status`
- `action`
- `summary`
- `occurredAt`

### 권장 필드

- `actor`
- `subjectType`
- `subjectId`
- `details`
- `nextAction`
- `dueAt`
- `documentId`
- `scheduleItemId`
- `checklistItemId`
- `issueId`

### logCategory 예시

- `customer_touchpoint`
- `quote_commercial`
- `contract`
- `quantity_install`
- `settlement`
- `internal_ops`
- `system_transition`

## 10. 이슈 계약

### 필수 필드

- `id`
- `partnerId`
- `caseId`
- `title`
- `category`
- `severity`
- `status`
- `facts`

### 권장 필드

- `unresolvedPoints`
- `currentAssumption`
- `verifyWith`
- `owner`
- `nextCheckAt`
- `dueAt`
- `resolvedAt`
- `resolutionSummary`
- `relatedDocumentId`
- `relatedChecklistItemId`
- `relatedQuantityRowId`

### severity

- `low`
- `medium`
- `high`
- `critical`

### status

- `open`
- `watching`
- `blocked`
- `resolved`

## 11. 운영 큐 DTO

리스트 화면은 전체 그래프 대신 요약 DTO로 보는 게 맞다.

### 큐 요약 필드

- `workspaceId`
- `partnerName`
- `customerCount`
- `activeCaseCount`
- `mainCaseTitle`
- `mainStage`
- `healthStatus`
- `nextActionAt`
- `openChecklistCount`
- `openIssueCount`
- `pendingDocumentCount`
- `mismatchQuantityCount`
- `latestActivitySummary`
- `latestActivityAt`

## 12. 상세 상단 Shell DTO

상세 첫 로드에서는 모든 탭 데이터를 다 불러오기보다 shell DTO를 먼저 쓴다.

### shell 필드

- `workspaceId`
- `partnerName`
- `customerName`
- `caseId`
- `caseTitle`
- `caseType`
- `stage`
- `healthStatus`
- `priority`
- `owner`
- `nextAction`
- `nextActionAt`
- `lastMeetingAt`
- `latestActivityAt`
- `documentHealth`
- `quantityHealth`
- `checklistProgress`
- `openIssueCount`

## 13. 구현 메모

- 현재 코드에서는 `PartnerWorkspaceShell`과 `PartnerQueueSummary`를 점진적으로 이 계약에 맞게 넓혀가면 된다.
- `dealId`는 점진적으로 `caseId` 의미를 가지도록 UI 용어를 먼저 바꿀 수 있다.
- 타입 이름을 한 번에 바꾸기보다, 문서와 화면 라벨에서 먼저 `운영 건` 용어를 쓰는 편이 안전하다.
