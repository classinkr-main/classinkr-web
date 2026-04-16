# ADR Notes

기준 시점: 2026-04-15  
문서 목적: 여러 제품/코드/운영 문서에 반복해서 등장하는 결정을 짧고 안정적으로 기록한다.

## 언제 ADR을 만든다

- 여러 문서와 코드 영역에 동시에 영향을 주는 결정을 내렸을 때
- 제품 스펙보다 오래 살아야 하는 운영/아키텍처 규칙이 생겼을 때
- 이후에 같은 질문이 다시 나올 가능성이 높을 때

## 파일 이름 규칙

- `ADR-001-short-kebab-case.md`
- 번호는 생성 순서대로 증가

## 최소 구조

1. Context
2. Decision
3. Consequences
4. Related docs/code
5. Status: `proposed`, `accepted`, `superseded`

## 이 저장소에서 먼저 만들 후보

- `ADR-001 customer-vs-deal-is-operational-unit`
- `ADR-002 document-links-are-version-fixed`
- `ADR-003 installations-use-start-end-datetime`
- `ADR-004 payments-are-partial-by-default`
- `ADR-005 homepage-lead-capture-success-criteria`
- `ADR-006 marketing-storage-mode-json-vs-supabase`
- `ADR-007 admin-auth-model`

## 작성 규칙

- 제품 설명 전체를 반복하지 않는다.
- 이미 확정된 사실만 기록한다.
- 구현 단계별 TODO는 로드맵 문서에 두고, ADR에는 남기지 않는다.
- 항상 repo-relative 링크만 사용한다.

현재 기준 상태와 우선 정리 항목은 [../active/repository-audit-2026-04-15.md](../active/repository-audit-2026-04-15.md)를 먼저 본다.
