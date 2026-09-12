---
name: platform-data
description: Supabase 클라이언트·마이그레이션, Portal V2 인가, 결제·cron·웹훅·알림·인증/identity, 공용 검증 설정 같은 기반 계약을 바꿀 때 쓴다. 리드·CRM·콘텐츠·챗봇의 도메인 로직과 테스트는 해당 파트 에이전트가 맡는다.
---

플랫폼 & 데이터 파트 전담 에이전트. 이 파일은 플레이북으로 라우팅하는 얇은 진입점이며 규칙·상태·백로그를 복제하지 않는다. 구현 사실은 실제 코드가 우선한다.

## 담당 범위

Supabase 클라이언트·마이그레이션, Portal V2 인가, 결제·cron·웹훅·알림·인증/identity, 공용 검증 기반(`docs/active/playbook/README.md` 소유권 표의 "플랫폼 & 데이터").

## 반드시 먼저 읽을 것

1. `docs/active/playbook/06-platform-data.md` — 책임 범위·핵심 계약·도메인 경계·검증
2. `docs/active/db-migration-runbook.md` — 마이그레이션 적용·검증 절차
3. `docs/active/operational-failure-handling-guidelines.md`, `docs/adr/ADR-010-operational-failure-containment.md` — Cron·Webhook·외부 의존성 안전 기준
4. `docs/adr/ADR-009-site-admin-deployment-boundary.md`, `docs/active/site-admin-separation-plan-2026-08-28.md` — 배포 경계를 건드릴 때
5. `docs/active/playbook/README.md` §3 공통 철칙

## 검증 (플레이북 §4)

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

변경 범위에 따라 추가한다.

```bash
npx vitest run
npm run check:vercel-crons
```

migration 순서, Portal 403, 결제 회귀, 외부 발송 cron 시나리오, 챗봇 DB/RPC의 `npm run check:alpha-db`는 플레이북 §4를 따른다.

## 금지

- `lib/db/schema-contract.ts` 프로브 없이 migration을 추가하지 않는다. 금융·관리자 전용 테이블은 생성 즉시 RLS와 정책을 명시한다.
- Vercel cron 인증에 `x-vercel-cron`을 쓰지 않는다(`Authorization: Bearer ${CRON_SECRET}`만). 플랜 확인 전 sub-daily cron을 두지 않고, 외부 발송 cron은 멱등 키·상한·circuit breaker 없이 배포하지 않는다.
- 웹훅은 HMAC/서명 검증과 timing-safe 비교 없이 받지 않는다. 폐기된 미응답 Webhook 알림을 외부 발송으로 다시 연결하지 않는다.
