# DB 마이그레이션 적용 런북

상태: 현재 기준 운영 문서
범위: `supabase/migrations/**`, 프로덕션 Supabase 스키마 최신화 절차와 검증

이 저장소는 마이그레이션을 **수동 적용**한다. 그동안 확인은 그때그때 만든 임시 스크립트
(`tmp/db-probe-*.mjs`)로 했고 기록이 남지 않아 "적용했는지"를 나중에 확신할 수 없었다.
실제로 `email_campaigns`는 repo에 `CREATE TABLE` 없이 프로덕션에만 존재하는 고아 테이블로
오래 남아 있었다([20260703_email_campaigns_backfill.sql](../../supabase/migrations/20260703_email_campaigns_backfill.sql)).

그래서 검증을 코드로 고정한다. 절차는 아래 3단계다.

## 1. 무엇이 남았는지 확인

```bash
npm run check:db
```

- 계약 SSOT: [lib/db/schema-contract.ts](../../lib/db/schema-contract.ts)
- 읽기 전용이다. RPC 프로브도 존재하지 않는 id로 호출해 0행 UPDATE만 낸다.
- 종료 코드: 스키마 미적용이 있으면 `1`. 데이터 이관만 남았으면 `0`(`--strict`면 `1`).

챗봇·문서 알파 계약은 `npm run check:alpha-db`가 따로 담당한다. 두 계약은 중복 등재하지 않는다.

## 2. 적용

Supabase SQL Editor(또는 CLI)에서 미적용 파일을 **파일명 날짜 순서대로** 실행한다.
모든 마이그레이션은 idempotent(`IF NOT EXISTS` / `CREATE OR REPLACE`)이므로 재실행은 무해하다.

적용 후 데이터 이관이 필요한 마이그레이션은 `check:db`가 경고로 알려준다. 현재 해당:

| 마이그레이션 | 이관 명령 |
| --- | --- |
| `20260818_lead_magnets.sql` | `node --env-file=.env.local scripts/import-lead-magnets.mjs` |

## 3. 재확인

```bash
npm run check:db --  --strict
```

`[check:db] DB가 repo 마이그레이션까지 최신입니다.`가 나오면 끝이다.

## 배포 순서 규칙

**마이그레이션을 먼저 적용하고 코드를 배포한다.** 다만 순서가 뒤집혀도 공개 표면이 죽지 않도록
아래를 지킨다 — 순서 사고는 반드시 일어난다는 전제로 코드를 쓴다.

- **읽기 경로는 강등한다.** 새 테이블을 읽는 공개 화면은 테이블 부재·행 0에서 기존 원본(번들 JSON 등)으로
  내려간다. Vercel의 read-only 파일시스템이 막는 것은 **쓰기**뿐이고 번들 JSON **읽기**는 안전하다.
  기준 구현: [lib/repositories/lead-magnets.ts](../../lib/repositories/lead-magnets.ts)의
  `readAllFromSupabase()` — 부재/빈 테이블은 `null`을 돌려주고 호출부가 JSON으로 강등하며,
  그 외 오류는 삼키지 않고 던진다. 강등은 무음이 아니라 `console.warn`으로 남긴다.
- **쓰기 경로는 강등하지 않는다.** JSON에 써도 운영에서는 유실되므로 "마이그레이션 미적용"을
  그대로 알린다(같은 파일의 `MISSING_TABLE_MESSAGE`).
- **새 컬럼 기록은 코어 경로와 분리한다.** 미적용 환경에서 주 기능이 죽지 않도록 별도
  `try/catch`로 best-effort 기록한다. 기준 구현:
  [app/api/admin/email/send/route.ts](../../app/api/admin/email/send/route.ts)의 부분 실패 기록.

## 새 마이그레이션을 추가할 때

1. `supabase/migrations/YYYYMMDD_설명.sql` — idempotent 구문, 관리자·금융 테이블은 즉시 RLS 활성화
   (deny-all 관례: [20260423_rls_admin_only_tables.sql](../../supabase/migrations/20260423_rls_admin_only_tables.sql)).
2. `lib/db/schema-contract.ts`의 `SCHEMA_CONTRACT_MIGRATIONS`와 `SCHEMA_PROBES`에 프로브를 함께 추가한다.
   프로브 없는 마이그레이션은 "적용했는지 아무도 모르는" 상태로 되돌아간다.
3. 데이터 이관이 필요하면 `scripts/`에 업서트 스크립트를 두고 프로브의 `seedCommand`에 적는다.
4. 타입·repository 쿼리는 스키마와 **같은 커밋**에서 바꾼다([플랫폼 플레이북](playbook/06-platform-data.md) §마이그레이션).
