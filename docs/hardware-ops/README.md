# Hardware Ops Hub

기준 시점: 2026-04-06  
문서 목적: 클래스인 하드웨어 운영 허브의 정체성, IA, 엔티티, 화면 구조, 상태 흐름을 연결 문서 형태로 정리한다.

## 1. 한 줄 정의

이 시스템은 `파트너 목록 관리`가 아니라  
`클래스인 본사와 하드웨어 총판이 고객사별 운영 건, 문서, 수량, 일정, 실행 상태를 같은 화면에서 추적하는 운영 허브`다.

## 2. 현재 제품 문맥

- 현재 라우트는 `/admin/partners`를 사용한다.
- 다만 제품 정체성은 점점 `파트너 관리`보다 `하드웨어 운영 허브`에 가까워지고 있다.
- 당장은 구현 라우트를 유지하고, 문서와 데이터 모델은 `고객사 + 운영 건` 중심으로 재정의한다.

## 3. 문서 읽는 순서

1. [정체성과 원칙](./identity.md)
2. [정보 구조와 메뉴 관점](./information-architecture.md)
3. [도메인 모델과 원장 구조](./domain-model.md)
4. [데이터 계약](./data-contracts.md)
5. [견적서 스펙과 UX](./quote-document-spec.md)
6. [상태 흐름과 전이 규칙](./state-flow.md)
7. [운영 건 상세 화면](./operation-case-workspace.md)
8. [열린 질문과 다음 결정](./open-questions.md)

## 4. 기존 문서와 연결

- 상위 설계 초안: [../admin-partners-ops-design.md](../admin-partners-ops-design.md)
- 구현 계획: [../admin-partners-phase1-execution-plan.md](../admin-partners-phase1-execution-plan.md)
- 스키마 초안: [../admin-partners-supabase-schema.sql](../admin-partners-supabase-schema.sql)
- 관리자 전체 와이어프레임: [../admin-tab-wireframes.md](../admin-tab-wireframes.md)

## 5. 문서 계층 원칙

- 이 폴더의 문서는 `개념과 결정`을 정리한다.
- 기존 `docs/admin-*.md` 문서는 `구현/화면/실행 계획`에 가깝게 유지한다.
- 새 논의는 먼저 이 폴더에서 개념을 고정한 뒤, 필요하면 구현 문서로 내려간다.

## 6. 현재 핵심 판단

- 주인공 엔티티는 `파트너`가 아니라 `고객사`와 `운영 건`이다.
- 문서, 일정, 체크리스트, 수량, 로그, 이슈는 모두 운영 건에 연결된다.
- 캘린더는 원본이 아니라 가시화 레이어다.
- 문서 탭은 파일함이 아니라 `문서 상태 원장`이다.
- 수량 탭은 숫자 입력표가 아니라 `물량 진실표`다.

## 7. 다음에 이어서 다룰 축

- 고객사와 기존 클래스인 CRM/리드 데이터 연결 방식
- 운영 건 상단 요약 바의 실제 필드 확정
- 문서 전달본, 접근성, 보안 설정의 UX 상세화
- 수량 변경 시 자동 로그와 이슈 생성 규칙
- 본사 전용 메모와 총판 공유 메모의 권한 분리
