# Docs Index

기준 시점: 2026-04-06  
문서 목적: 현재 저장소의 주요 기획/설계 문서를 읽기 쉬운 입구로 정리한다.

## 1. 가장 먼저 볼 문서

- [hardware-ops/README.md](./hardware-ops/README.md)
  - 하드웨어 운영 허브의 정체성, IA, 엔티티, 상세 화면, 상태 흐름을 연결한 상위 인덱스

## 2. 하드웨어 운영 관련

- [hardware-ops/identity.md](./hardware-ops/identity.md)
  - 왜 이 시스템이 필요한지와 제품 원칙
- [hardware-ops/information-architecture.md](./hardware-ops/information-architecture.md)
  - 운영 허브 관점의 상위 IA
- [hardware-ops/domain-model.md](./hardware-ops/domain-model.md)
  - 고객사, 운영 건, 문서/수량/로그/이슈 엔티티 구조
- [hardware-ops/data-contracts.md](./hardware-ops/data-contracts.md)
  - 타입/DTO/API로 옮기기 위한 데이터 계약
- [hardware-ops/quote-document-spec.md](./hardware-ops/quote-document-spec.md)
  - 실제 견적서 예시를 반영한 필드, line item, 버전/공유 UX
- [hardware-ops/state-flow.md](./hardware-ops/state-flow.md)
  - 단계 전이, 경고, 자동 제안 규칙
- [hardware-ops/operation-case-workspace.md](./hardware-ops/operation-case-workspace.md)
  - 운영 건 상세 화면의 상단 요약 바, 개요, 문서/수량 탭 구조
- [hardware-ops/open-questions.md](./hardware-ops/open-questions.md)
  - 아직 열려 있는 결정 사항
- [admin-partners-ops-design.md](./admin-partners-ops-design.md)
  - `/admin/partners` 기반의 상위 운영 설계 초안
- [admin-partners-phase1-execution-plan.md](./admin-partners-phase1-execution-plan.md)
  - 화면/타입/API/구현 순서를 정리한 Phase 1 실행 계획
- [admin-partners-supabase-schema.sql](./admin-partners-supabase-schema.sql)
  - 파트너/문서/로그/체크리스트/이슈 관련 SQL 초안

## 3. 관리자 전체 탭 관련

- [admin-next-phase-plan.md](./admin-next-phase-plan.md)
  - 관리자 주요 탭과 블로그 AI의 다음 단계 기획
- [admin-tab-wireframes.md](./admin-tab-wireframes.md)
  - Overview, Campaigns, Settings, Analytics 중심 와이어프레임
- [email-campaigns-ux-upgrade.md](./email-campaigns-ux-upgrade.md)
  - 이메일 캠페인 UX 보강 메모

## 4. 문서 운영 원칙

- 개념 합의는 `hardware-ops/` 아래에서 먼저 정리한다.
- 화면/구현 계획은 `admin-*.md` 문서에서 구체화한다.
- 새 논의가 생기면 먼저 인덱스 문서에 링크를 추가해 문서 지형을 유지한다.
