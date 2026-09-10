# ADR-010: 예약 작업과 외부 의존성은 복구 시 폭주·유실을 막는 경계를 갖는다

Status: accepted

Date: 2026-09-02

## 1. Context

2026-06-04부터 08-31까지 Vercel Cron 라우트는 Vercel이 보내지 않는 `x-vercel-cron` 헤더를
요구해 다수가 401로 종료됐다. 인증 게이트를 고친 뒤 리드 알림 Cron이 처음 정상 실행되자, 발송
상태가 없던 과거 48시간 이상 미응답 리드 256건을 포함해 262건이 한 번에 발송됐다. 정상화가 곧
안전한 복구를 뜻하지 않았고, 예약 작업의 오래된 상태가 외부 Webhook 폭주로 바뀌었다.

같은 시기 Supabase의 `PGRST303 JWT issued at future`가 Admin 인증과 공개 데이터 경로에 함께
전파됐지만 일부 읽기·쓰기 경로는 빈 데이터나 정상 응답으로 실패를 가렸다. 외부 AI에서는 timeout,
플랫폼 실행 상한, 모델별 출력 설정, 중복 클릭이 결합됐고, 배포 간 캐시 응답 shape 차이도 화면 장애를
만들었다.

이 문제들은 공급자가 다르지만 공통점이 있다. 외부 의존성 실패의 의미를 잃었고, 중단 후 재개와
부분 성공을 정상 상태 전이로 설계하지 않았다.

## 2. Decision

- Vercel Cron 인증은 `Authorization: Bearer ${CRON_SECRET}` 하나를 정본으로 한다.
  `x-vercel-cron`을 인증 조건으로 사용하지 않는다.
- 모든 예약 작업은 at-least-once 실행을 가정하고 기간·대상·이벤트 기반 멱등 키 또는 DB unique
  제약을 가진다.
- 외부 발송 Cron은 새 활성화·인증 복구·장기 중단 후 재개 전에 backlog dry-run을 수행하며,
  lookback·실행당 건수·목적지별 발송량·동시성 상한과 circuit breaker를 둔다.
- 대상 급증 시 개별 과거분 재생을 자동으로 계속하지 않는다. 발송을 중단하고 집계 요약과 운영자
  확인으로 전환한다.
- 업무 상태와 외부 전달 상태를 분리한다. 저장·전달 실패를 성공으로 가장하지 않고, 외부 전달이 완료
  조건일 때만 전달 성공을 전체 작업 성공 조건으로 강제한다.
- Webhook 목적지를 lead report, CS, ops, critical 용도로 분리하고 암묵적 fallback을 금지한다.
  새 목적지는 configured, enabled, healthy 상태를 구분한다.
- secret은 값이 아니라 마스킹 또는 단방향 fingerprint로만 확인한다. 노출은 P0 사건이며 회전한다.
- 의존성 결과는 `found / not_found / unavailable`과 안정적인 오류 코드로 구분한다. Admin 인증은
  fail closed, 공개 읽기만 bounded fallback, 쓰기는 실패를 명시한다.
- 외부 호출은 플랫폼 상한보다 짧은 timeout과 bounded retry를 사용하며, 캐시는 배포·schema 버전과
  shape guard를 가진다.
- 운영 hotfix는 확인된 Production commit에서 관련 변경만 배포하고, 다음 스케줄 또는 안정 구간까지
  실제 등록 Cron·delivery·저장 결과를 관찰한다.
- 세부 수치와 대응 절차는 [운영 장애·Cron·Webhook 안전 지침](../active/operational-failure-handling-guidelines.md)에 둔다.

## 3. Consequences

### Positive

- 인증 복구나 장기 중단 뒤 첫 실행이 과거분 대량 발송으로 이어질 가능성이 줄어든다.
- 중복·부분 성공·재시도의 결과를 DB와 delivery log에서 설명할 수 있다.
- 외부 의존성 장애가 빈 데이터, 정상 404, 저장 성공으로 오인되지 않는다.
- 목적지와 활성 상태가 분리돼 알림 채널을 안전하게 켜고 끌 수 있다.
- 직전 배포 캐시와 새 코드의 shape 불일치가 전체 화면 장애로 번지는 범위가 줄어든다.

### Negative

- 예약 작업마다 멱등 상태, dry-run, 상한, 관측 로그를 구현해야 한다.
- 급증 시 자동 처리를 멈추므로 운영자 확인이 필요할 수 있다.
- 외부 전달과 업무 결과를 분리하면 API·UI 상태 모델이 더 복잡해진다.
- 캐시·DB 응답 변경은 한 번에 rename하는 대신 호환 단계가 필요하다.

### Risks

- 상한이 너무 낮으면 정상 백로그 처리가 늦어질 수 있다.
- circuit breaker가 관측 없이 작동하면 필요한 알림까지 조용히 멈출 수 있다.
- 목적지 enable 상태가 여러 설정원에 분산되면 실제 활성 상태를 다시 오판할 수 있다.

이 위험은 명시적 readiness, 중단 사유 로그, 운영자 재개 절차, 실행당 지표와 단일 설정 정본으로
통제한다.

## 4. Related docs/code

- [운영 장애·Cron·Webhook 안전 지침](../active/operational-failure-handling-guidelines.md)
- [Supabase 운영 복구·하드닝 계획](../active/supabase-operational-recovery-hardening-plan-2026-09-01.md)
- [플랫폼 플레이북](../active/playbook/06-platform-data.md)
- [ADR-009 Site/Admin 배포 경계](ADR-009-site-admin-deployment-boundary.md)
- `app/api/cron/**`
- `lib/notifications/**`
- `lib/repositories/settings.ts`
- `vercel.json`
