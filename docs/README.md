# Docs Index

기준 시점: 2026-04-15
문서 목적: 현재 저장소에서 무엇을 먼저 읽어야 하는지, 어떤 문서를 믿어야 하는지, 어떤 문서가 역사 기록인지 빠르게 구분한다.

## 1. Start Here

- [active/repository-audit-2026-04-15.md](./active/repository-audit-2026-04-15.md)
  - 현재 검증 상태, 우선 수정 순서, 문서 신뢰도, 빠른 확인 명령
- [active/prd.md](./active/prd.md)
  - Classin Home 공개 사이트의 현재 기준 PRD
- [active/partner-portal-master-spec.md](./active/partner-portal-master-spec.md)
  - 파트너 포털의 현재 기준 제품 스펙
- [active/architecture-schema-erd.md](./active/architecture-schema-erd.md)
  - 현재 아키텍처/스키마 입구
- [hardware-ops/README.md](./hardware-ops/README.md)
  - 하드웨어 운영 허브 문서의 상위 인덱스

## 2. Product

- [active/prd.md](./active/prd.md)
  - 홈페이지, CTA, 리드 수집, 콘텐츠 운영 기준
- [active/partner-portal-master-spec.md](./active/partner-portal-master-spec.md)
  - 파트너 포털의 단일 진입 제품 문서
- [active/partner-portal-implementation-roadmap.md](./active/partner-portal-implementation-roadmap.md)
  - 파트너 포털 구현 순서
- [active/quote-lifecycle-execution-plan.md](./active/quote-lifecycle-execution-plan.md)
  - 견적 문서 라이프사이클 실행 기준
- [active/software-checkout-revamp-plan.md](./active/software-checkout-revamp-plan.md)
  - /checkout 구독형/충전형 재정렬 실행안

## 3. Architecture

- [active/architecture-schema-erd.md](./active/architecture-schema-erd.md)
  - 엔티티와 스키마 관점의 입구
- [active/notification-architecture-plan.md](./active/notification-architecture-plan.md)
  - 알림 아키텍처 계획
- [active/partner-portal-front-back-contract.md](./active/partner-portal-front-back-contract.md)
  - 파트너 포털 BFF/API 계약 문서
- [adr/README.md](./adr/README.md)
  - ADR 작성 규칙과 초기 백로그

## 4. Domains

- [hardware-ops/README.md](./hardware-ops/README.md)
  - 하드웨어 운영 문서 모음
- [active/partner-portal-document-hub-guidelines.md](./active/partner-portal-document-hub-guidelines.md)
  - 문서 허브 세부 운영 규칙
- [active/partner-portal-document-hub-wireframes.md](./active/partner-portal-document-hub-wireframes.md)
  - 문서 허브 화면 설계
- [active/MARKETING_EMAIL_SYSTEM.md](./active/MARKETING_EMAIL_SYSTEM.md)
  - 마케팅 이메일 시스템 구현 메모
  - 현재 제품 기준 문서가 아니라 역사적 구현 스냅샷으로 읽는다

## 5. Runbooks And Incidents

- [archive/error-fix-notes.md](./archive/error-fix-notes.md)
  - 과거 에러/불안 요소 메모
  - 현재 상태 단정에 쓰지 말고, 히스토리 참고용으로만 사용
- [archive/error_handle.md](./archive/error_handle.md)
  - 관리자 로그인/배포 설정 관련 과거 장애 메모
  - 현재 운영 기준은 항상 실제 코드와 현재 audit 문서로 재검증

## 6. Operating Rules

- 한 제품 영역에는 `기준 문서`를 하나만 둔다.
- 구현 순서는 이니셔티브당 `로드맵 문서` 하나에 모은다.
- 사고/장애 문서는 `archive/`에 두되, 현재 상태처럼 읽히지 않도록 역사 기록으로 표시한다.
- 문서 링크는 항상 repo-relative 경로만 사용한다.
- 브랜치명, 로컬 절대경로, 실제 비밀번호 예시를 기준 문서에 남기지 않는다.
