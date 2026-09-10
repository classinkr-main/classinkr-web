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

`20260818_rls_blog_posts_patch_notes.sql`은 **살아 있는 테이블의 RLS를 켠다**. 적용 전 확인:
저장소 안의 `blog_posts`·`patch_notes` 접근은 전부 service role(`createSupabaseAdminClient`)이라
영향이 없다. 다만 저장소 밖에서 anon 키로 이 두 테이블을 읽는 외부 소비자(내부 대시보드·시트
연동 등)가 있다면 그쪽이 먼저 끊긴다 — 적용 전에 그런 소비자가 없는지 확인한다.

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

## 2026-08-18 스키마 드리프트 감사 결과

마이그레이션 149개 테이블 / 51개 함수 vs 코드의 `.from()` 145개 · `.rpc()` 19개를 전수 대조했다.

**깨끗한 것** — 고아 테이블 0건, 고아 RPC 0건, 확정 고아 컬럼 0건. `email_campaigns` 류의
"프로덕션에만 있는 테이블"은 더 없다. `ALTER TABLE`만 있고 `CREATE TABLE`이 없는 테이블도 0건이다.

**조치한 것**

| 발견 | 조치 |
| --- | --- |
| `blog_posts` RLS 꺼짐 — DRAFT·휴지통 글이 anon 키로 읽히고 쓰기까지 열림 | [20260818_rls_blog_posts_patch_notes.sql](../../supabase/migrations/20260818_rls_blog_posts_patch_notes.sql) — 유예 사유(어드민이 anon 키 사용)가 해소돼 원 계획대로 RLS + 공개 SELECT 정책 |
| `patch_notes` RLS·정책·revoke 전부 없음 | 같은 마이그레이션에서 deny-all |
| `hw_sales`·`hw_sale_items` 타입만 존재(테이블 없음) | `lib/supabase/database.types.ts`에서 제거 — 타입 검사를 통과하고 런타임 42P01로 죽는 함정 |

**남은 것(이번에 손대지 않음)**

- **초기 마이그레이션 5종의 멱등성 위반** — `20260402_partner_portal.sql`(가장 심각),
  `20260427_branch_dashboard.sql`, `20260403_install_schedules.sql`,
  `20260404_partner_portal_v2_domain.sql`, `20260414_quote_approval_gate.sql` 등에서
  `CREATE TABLE`·`CREATE TYPE`·`CREATE POLICY`·`ADD CONSTRAINT`가 무가드다.
  이미 적용된 프로덕션에는 영향이 없고 **새 환경 재현만 불가능**하다. 손대려면 SQL을 실제
  DB에 돌려 검증할 수 있는 환경이 필요하다 — 검증 없이 일괄 편집하지 않는다.
- **`product_catalog_items`** — 코드·SQL 함수 어디에서도 쓰이지 않는 데드 테이블
  (`20260404_partner_portal_v2_domain.sql`). 드롭은 되돌릴 수 없으므로 소유자 확인 후 결정한다.

## 새 마이그레이션을 추가할 때

1. `supabase/migrations/YYYYMMDD_설명.sql` — idempotent 구문, 관리자·금융 테이블은 즉시 RLS 활성화
   (deny-all 관례: [20260423_rls_admin_only_tables.sql](../../supabase/migrations/20260423_rls_admin_only_tables.sql)).
2. `lib/db/schema-contract.ts`의 `SCHEMA_CONTRACT_MIGRATIONS`와 `SCHEMA_PROBES`에 프로브를 함께 추가한다.
   프로브 없는 마이그레이션은 "적용했는지 아무도 모르는" 상태로 되돌아간다.
3. 데이터 이관이 필요하면 `scripts/`에 업서트 스크립트를 두고 프로브의 `seedCommand`에 적는다.
4. 타입·repository 쿼리는 스키마와 **같은 커밋**에서 바꾼다([플랫폼 플레이북](playbook/06-platform-data.md) §마이그레이션).
