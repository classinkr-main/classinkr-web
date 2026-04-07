# Operation Case Workspace

기준 시점: 2026-04-06  
관련 문서: [도메인 모델](./domain-model.md), [데이터 계약](./data-contracts.md), [견적서 스펙](./quote-document-spec.md), [상태 흐름](./state-flow.md)

## 1. 화면의 목적

운영 건 상세 화면은 단순 상세 페이지가 아니라  
`한 건의 문서, 수량, 일정, 실행 상태, 리스크를 한곳에서 보고 다음 액션까지 처리하는 실행 콘솔`이어야 한다.

## 2. 화면 골격

```text
[상단 요약 바]
[개요 / 문서 / 일정 / 체크리스트 / 수량 / 로그·이슈]
[우측 또는 하단 액션/리스크 패널]
```

## 3. 상단 요약 바

### 좌측: 정체성

- 고객사명
- 운영 건 제목
- 내부 관리 번호
- 고객 담당자
- 총판 담당자
- 본사 담당자
- 설치 위치 요약

### 좌측 필드 메모

- `고객사명`과 `운영 건 제목`은 항상 동시에 보여야 한다.
- 관리 번호는 검색/회의/전화 중 빠른 합의용 식별자로 쓸 수 있어야 한다.
- 담당자 영역은 `고객 / 총판 / 본사` 3주체를 같은 줄에서 인지할 수 있어야 한다.

### 중앙: 상태

- 현재 단계
- 현재 상태
- 우선순위
- 다음 일정
- 최근 업데이트 시각
- 다음 액션
- 오너

### 중앙 필드 규칙

- `단계`는 흐름을 보여준다.
- `상태`는 위험도를 보여준다.
- `다음 액션`은 문장이어야 한다.
- `오너`는 현재 공을 가진 사람이어야 한다.

### 우측: 건강도 지표

- 문서 상태
- 수량 상태
- 체크리스트 진행률
- 열린 이슈 수

### 우측 지표 표현 예시

- 문서: `3/4 완료`
- 수량: `불일치 1건`
- 체크리스트: `12개 중 8개 완료`
- 이슈: `열린 이슈 2건`

### 상단 액션

- 상태 변경
- 문서 추가
- 일정 추가
- 로그 작성
- 이슈 생성

## 4. 상단 요약 바 DTO 초안

상세 첫 로드에서 필요한 최소 shell DTO는 아래에 가깝다.

```ts
type OperationCaseShell = {
  workspaceId: string
  partnerName: string
  customerName: string
  caseId: string
  caseTitle: string
  stage: string
  healthStatus: string
  priority: string
  owner: string
  customerContactName?: string
  distributorOwner?: string
  hqOwner?: string
  installLocation?: string
  nextAction?: string
  nextActionAt?: string
  latestActivityAt?: string
  documentHealth: {
    requiredCount: number
    readyCount: number
    warningCount: number
  }
  quantityHealth: {
    mismatchCount: number
    criticalMismatchCount: number
  }
  checklistHealth: {
    totalCount: number
    completedCount: number
    blockedCount: number
  }
  issueHealth: {
    openCount: number
    criticalCount: number
  }
}
```

## 5. 개요 탭

개요 탭은 `상황판`이다. 첫 진입에서 무엇을 해야 하는지 보여줘야 한다.

필수 카드:

- 진행 타임라인
- 다음 액션
- 일정 요약
- 문서 진행도
- 수량/설치 현황
- 로그/이슈 요약

### 카드 우선순위

1. 다음 액션
2. 문서 진행도
3. 수량/설치 현황
4. 진행 타임라인
5. 일정 요약
6. 로그/이슈 요약

### 5-1. 다음 액션 카드

가장 위에 놓아도 되는 카드다.

필드:

- 액션 제목
- 액션 사유
- 담당자
- 마감일
- 관련 객체
- 바로가기 버튼

예:

- `설치 전 수량 최종 확인`
- `계약 수량 12대, 준비 수량 10대로 불일치`
- `담당자: 본사 운영`
- `마감: 4/8`
- `관련: 수량 탭`

### 5-2. 문서 진행도 카드

필드:

- 문서 종류
- 최신 상태
- 최신 버전
- 마지막 발송일
- 발송 채널
- 열람 여부
- 리스크 배지

### 5-3. 수량/설치 현황 카드

필드:

- 핵심 품목 3~5개 요약
- 계약 수량 vs 준비 수량
- 설치 완료율
- 불일치 건수
- 누락 품목 경고

### 5-4. 진행 타임라인 카드

단계 이벤트를 세로 리스트나 간단한 stepper로 보여준다.

필드:

- 이벤트명
- 완료 여부
- 일시
- 담당자
- 연결 문서 또는 로그 링크

### 5-5. 일정 요약 카드

필드:

- 오늘 일정
- 이번 주 일정
- 가장 가까운 설치 일정
- 준비되지 않은 일정 경고

### 5-6. 로그/이슈 요약 카드

필드:

- 최근 로그 5개
- 열린 이슈 3개
- 마지막 고객 커뮤니케이션
- 마지막 내부 결정
- 해결 대기 중 이슈

## 6. 개요 탭 자동 경고

개요 탭은 상태판인 동시에 경고판이다.

자동 경고 후보:

- 계약 단계인데 계약서 없음
- 설치 일정 있는데 체크리스트 미완료
- 계약 수량과 준비 수량 불일치
- 영수증 필요 상태인데 문서 없음
- 고객 미팅 후 로그 미작성
- 7일 이상 업데이트 없는 운영 건

## 7. 문서 탭

문서 탭은 파일함이 아니라 `문서 상태 원장`이다.

### 꼭 보여야 하는 필드

- 문서 종류
- 제목
- 버전
- 상태
- 내부 원본/외부 발송본 여부
- 발송 채널
- 발송일
- 만료일
- 보안 설정
- 열람/다운로드 여부
- 연결된 운영 단계

### 문서 상태 흐름

- draft
- ready
- sent
- viewed
- signed
- expired
- archived

### 문서 액션

- PDF 열기
- 링크 열기
- 비밀번호 설정
- 만료일 설정
- 최신본 지정
- 재발송
- 체결본 승격
- 견적서 편집/복제
- 견적서에서 계약 생성

### 문서 행 예시

```ts
type CaseDocumentRow = {
  id: string
  caseId: string
  kind: "quote" | "contract" | "receipt" | "installation_confirmation"
  title: string
  version: string
  status: "draft" | "ready" | "sent" | "viewed" | "signed" | "expired" | "archived"
  isLatest: boolean
  stageScope: "quote" | "contract" | "settlement" | "install"
  deliveryChannel?: "pdf" | "kakao" | "link" | "email"
  sentAt?: string
  expiresAt?: string
  passwordEnabled: boolean
  allowDownload: boolean
  lastViewedAt?: string
  owner?: string
}
```

### 견적서 전용 서브뷰

`kind === "quote"`인 문서는 일반 문서 drawer와 달리 아래 UX를 우선한다.

- 상단: `작성 / 미리보기 / 공유 / 버전` 탭
- 중앙: 품목 표 편집기 + 합계 계산
- 우측: A4 미리보기
- 하단 CTA: `계약 생성`, `수량 원장 반영`, `다음 일정 만들기`

### 견적서 필수 섹션

- 견적번호
- 발행일
- 수신/참조
- 공급자 사업자 정보
- 품목 표
- 총합/VAT 정책
- 기타사항
- 특약사항

## 8. 일정 탭

일정 탭은 이 건과 연결된 실행 일정을 관리한다.

### 일정 타입

- 고객 미팅
- 계약 검토
- 설치 일정
- 납품 일정
- 내부 준비 마감
- 영수증/정산 마감

### 설계 원칙

- 일정 생성 시 관련 체크리스트를 연결할 수 있어야 한다.
- 일정 완료 시 로그를 자동 생성할 수 있어야 한다.
- 관리자 캘린더는 여기서 만들어진 일정을 보여주는 레이어다.

## 9. 체크리스트 탭

체크리스트는 실행의 진척을 다루는 탭이다.

### 그룹 예시

- 운영 준비
- 설치 품목
- 수량 검수
- 현장 설치
- 후속 지원

### 컬럼

- 항목명
- 분류
- 상태
- 담당자
- 예정일
- 완료일
- 수량
- 메모

### 기본 상태

- todo
- in_progress
- blocked
- done

### 체크리스트 행 예시

```ts
type CaseChecklistRow = {
  id: string
  caseId: string
  group: "operation_prep" | "installation_items" | "quantity_review" | "onsite_install" | "post_support"
  title: string
  todoStatus: "todo" | "in_progress" | "blocked" | "done"
  owner?: string
  dueAt?: string
  completedAt?: string
  itemName?: string
  plannedQuantity?: number
  confirmedQuantity?: number
  blockedReason?: string
}
```

## 10. 수량 탭

수량 탭은 `물량 진실표`다.

### 기본 컬럼

- 품목명
- 내부 기준 수량
- 고객 요청 수량
- 견적 수량
- 계약 수량
- 준비 수량
- 출고 수량
- 설치 완료 수량
- 최종 확정 수량
- 차이
- 상태
- 메모

### 핵심 원칙

- 전체 합계보다 품목별 행 구조가 우선이다.
- 불일치가 있으면 즉시 경고가 보여야 한다.
- 수량 변경은 반드시 로그와 연결되어야 한다.
- 관련 문서에 영향이 있으면 재확인 신호를 띄운다.

### 수량 행 예시

```ts
type CaseQuantityRow = {
  id: string
  caseId: string
  itemCode?: string
  itemName: string
  unit?: string
  internalBaselineQty?: number
  customerRequestedQty?: number
  quotedQty?: number
  contractedQty?: number
  preparedQty?: number
  shippedQty?: number
  installedQty?: number
  finalConfirmedQty?: number
  rowStatus: "aligned" | "watch" | "mismatch" | "blocked"
  varianceReason?: string
  memo?: string
}
```

## 11. 로그/이슈 탭

이 탭은 이 화면의 기억 장치다.

### 로그 유형

- 고객 미팅 로그
- 문서 전달 로그
- 계약 로그
- 상태 변경 로그
- 수량 변경 로그
- 내부 메모

### 이슈 유형 예시

- 계약 버전 상충
- 수량 미확정
- 설치 장소 변경 가능성
- 영수증 요청 지연
- 본사/총판 인식 차이

### 로그 행 예시

```ts
type CaseLogRow = {
  id: string
  caseId: string
  logCategory:
    | "customer_touchpoint"
    | "quote_commercial"
    | "contract"
    | "quantity_install"
    | "settlement"
    | "internal_ops"
    | "system_transition"
  status: "recorded" | "follow_up_needed" | "waiting_partner" | "waiting_internal" | "blocked" | "resolved"
  action: string
  summary: string
  occurredAt: string
  nextAction?: string
  dueAt?: string
}
```

## 12. 우측 액션/리스크 패널

이 패널은 탭을 안 바꿔도 행동을 시작하게 만드는 보조 레이어다.

필수 블록:

- 다음 액션 3개
- 오버듀 항목
- 문서 누락 경고
- 수량 불일치 경고
- 오늘 일정
- 최근 업데이트 담당자

## 13. 자동 경고

상세 화면은 아래 경고를 자동으로 보여줄 수 있어야 한다.

- 계약 단계인데 계약서 없음
- 설치 일정 있는데 체크리스트 미완료
- 계약 수량과 준비 수량 불일치
- 영수증 필요 상태인데 문서 없음
- 최근 7일 이상 업데이트 없음

## 14. 구현 우선순위 메모

1. 상단 요약 바
2. 개요 탭 핵심 카드
3. 문서 탭
4. 수량 탭
5. 로그/이슈와 자동 경고
