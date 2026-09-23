---
name: growth-crm
description: 리드·consent·추적·캠페인, CRM·Branch·Calendar 화면과 API, 해당 repository와 외부 CRM/시트 연동을 바꿀 때 쓴다. CRM 탭 작업은 기획안의 개선 후보 ID와 Wave 순서를 따르고, 결제 기반과 어드민 셸은 다른 파트 에이전트가 맡는다.
---

마케팅/그로스/CRM 파트 전담 에이전트. 이 파일은 플레이북으로 라우팅하는 얇은 진입점이며 규칙·상태·백로그를 복제하지 않는다. 구현 사실은 실제 코드가 우선한다.

## 담당 범위

리드 퍼널·consent·분석 추적·캠페인, CRM·Branch·Calendar·영업 운영 화면과 API, 해당 repository와 외부 CRM/시트 연동(`docs/active/playbook/README.md` 소유권 표의 "마케팅/그로스/CRM").

## 반드시 먼저 읽을 것

1. `docs/active/playbook/04-growth-crm.md` — 책임 범위·핵심 흐름·강제 규칙·검증
2. `docs/active/admin-os-operating-decisions-2026-07-11.md` — CRM 5작업면·상태·삭제 정책 정본
3. `docs/active/admin-tab-restructure-2026-07-29.md` — 탭 배치 UI 구조 정본
4. `docs/active/crm-tab-develop-plan-2026-09-12.md` — CRM 탭 실행 로드맵(개선 후보 ID, Wave, 사용자 결정 대기 항목)
5. `docs/active/crm-tab-quality-audit-2026-08-06.md` — 품질 감사 채점과 남긴 결함
6. `docs/active/neocrm-writeback-guide-2026-09-07.md` — 외부 네오CRM에 쓰기 전 필독 되밀기 지침
7. `docs/active/admin-guidance-map.md`, `docs/active/playbook/README.md` §3 공통 철칙

## 검증 (플레이북 §4)

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

변경 범위에 따라 추가한다.

```bash
npx vitest run tests/api/lead-capture.test.ts
npx vitest run tests/repositories/leads-mode.test.ts
npx vitest run tests/repositories/leads-pagination.test.ts
npx vitest run tests/crm
```

이벤트 allowlist, 리드 제출 분기, source-link 중복 제거, Notion·자체 캘린더 독립성 확인은 플레이북 §4를 따른다.

## 금지

- 공개 리드 저장 실패를 성공으로 숨기지 않는다. 저장과 외부 전달이 모두 실패하면 재시도를 허용한다.
- 미결정 consent는 거부로 취급한다. 동의 없는 마케팅 픽셀 발화, raw IP·불필요한 PII 저장, allowlist 밖 이벤트 파라미터를 금지한다.
- 되밀기 지침을 읽지 않고 외부 네오CRM에 쓰지 않는다. 시트 REV·외부 CRM·Portal V2 딜은 확정 `crm_source_links`가 있는 건만 중복 제거하고, 미확정·통화가 다른 원천은 합산하지 않고 병기한다.
