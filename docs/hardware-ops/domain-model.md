# Hardware Ops Domain Model

기준 시점: 2026-04-06  
관련 문서: [정체성과 원칙](./identity.md), [데이터 계약](./data-contracts.md), [상태 흐름](./state-flow.md)

## 1. 핵심 엔티티

### 1-1. Distributor Partner

현재 하드웨어 총판은 사실상 한 축이다.

역할:

- 공동 작업자
- 고객사 대응 및 하드웨어 이행 주체
- 본사와 상태를 맞춰야 하는 협업 대상

주의:

- 이 엔티티는 중요하지만 시스템의 주인공은 아니다.

### 1-2. Customer Account

운영의 관계 단위.

가져야 할 정보:

- 고객사명
- 학교/기관 유형
- 주요 담당자
- 연락 수단
- 설치 위치
- 기존 클래스인 고객 여부
- 내부 메모

### 1-3. Operation Case

실제 실행 단위이자 가장 중요한 엔티티.

예시:

- 전자칠판 12대 신규 설치
- 거치대 추가 납품
- 계약 갱신
- 영수증 재정리

가져야 할 정보:

- 고객사 연결
- 현재 단계
- 현재 상태
- 오너
- 다음 액션
- 우선순위
- 예정 일정
- 관련 문서/수량/체크리스트/로그/이슈

## 2. 운영 건에 붙는 실행 객체

### 2-1. Document Ledger

문서 원장.

- 견적서
- 계약서
- 영수증
- 설치 확인서
- 기타 증빙

자세한 내용: [운영 건 상세](./operation-case-workspace.md), [상태 흐름](./state-flow.md)

### 2-2. Quantity Ledger

물량 원장.

- 고객 요청 수량
- 견적 수량
- 계약 수량
- 준비 수량
- 출고 수량
- 설치 수량
- 최종 확정 수량

### 2-3. Schedule Item

실행 타이밍 객체.

- 고객 미팅
- 계약 검토
- 설치 일정
- 납품 일정
- 영수증/정산 마감

### 2-4. Checklist Item

실행 확인 객체.

- 운영 준비
- 설치 품목 준비
- 수량 검수
- 현장 이행
- 후속 점검

### 2-5. Activity Log

맥락 보존 객체.

- 고객 커뮤니케이션 로그
- 계약 로그
- 문서 전달 로그
- 상태 변경 로그
- 수량 변경 로그

### 2-6. Issue

애매하거나 위험한 상황을 추적하는 객체.

- 수량 불일치
- 계약 버전 상충
- 영수증 지연
- 본사/총판 인식 불일치

## 3. 소스 오브 트루스 원칙

- 고객사: 관계 기준의 원본
- 운영 건: 실행 상태의 원본
- 문서 원장: 합의와 증빙의 원본
- 수량 원장: 약속/준비/설치 숫자의 원본
- 캘린더: 일정의 뷰
- Overview: 운영 신호의 요약 뷰

## 4. 핵심 관계 구조

```text
Distributor Partner
        │
        └── Customer Account
                │
                └── Operation Case
                        ├── Documents
                        ├── Quantity Rows
                        ├── Schedule Items
                        ├── Checklist Items
                        ├── Activity Logs
                        └── Issues
```

## 5. 왜 이 구조가 필요한가

- 고객사 한 곳에 여러 건이 동시에 존재할 수 있다.
- 문서와 일정만으로는 운영 상태를 설명할 수 없다.
- 약속된 숫자와 실제 준비 숫자를 분리해 봐야 사고를 줄일 수 있다.
- 리스크는 메모가 아니라 추적 가능한 객체여야 한다.

## 6. 데이터 모델 설계 원칙

1. 모든 실행 객체는 운영 건에 연결한다.
2. 운영 건 없이 생성되는 문서/일정/체크리스트는 최소화한다.
3. 수량은 품목별 행 구조를 기본으로 한다.
4. 변경 이력은 로그로 남기고, 위험 신호는 이슈로 승격한다.
5. 고객과 공유 가능한 정보와 내부 전용 정보는 분리한다.

## 7. 현재 코드베이스로 옮길 때의 해석

현재 런타임 타입은 여전히 `partner`와 `deal` 용어를 중심으로 되어 있다.  
하지만 의미상으로는 아래처럼 해석해 가는 편이 맞다.

- `PartnerSummary`는 단순 파트너 레코드라기보다 `운영 워크스페이스 헤더`
- `PartnerDeal`은 좁은 영업 deal보다 `운영 건 v1`
- `PartnerDocument`, `PartnerScheduleItem`, `PartnerOpsChecklistItem`, `PartnerActivityLog`, `PartnerOpsIssue`는 모두 운영 건의 실행 객체

즉 리팩터의 순서는 아래가 좋다.

1. 문서와 화면 언어를 `운영 건` 중심으로 바꾼다.
2. DTO를 `dealId == caseId(v1)` 관점으로 넓힌다.
3. 실제 타입 이름 변경은 마지막에 한다.

## 8. 고객사 엔티티의 추가 필요성

현재 타입에는 `고객사`가 독립 엔티티로 거의 드러나지 않는다.  
하지만 실제 운영에서는 고객사가 관계의 기준점이므로 장기적으로는 별도 엔티티가 필요하다.

최소 필드:

- `customerId`
- `customerName`
- `organizationType`
- `primaryContactName`
- `primaryContactPhone`
- `primaryContactEmail`
- `installationAddress`
- `linkedCrmId`

초기에는 `PartnerDeal` 또는 workspace shell에 보조 필드로 얹어도 되지만, 결국 별도 모델로 분리하는 편이 안전하다.
