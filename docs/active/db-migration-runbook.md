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

## 적용 보류 중인 마이그레이션

`check:db`에 걸리지 않는(프로브가 없는) 파일이라도, 아래 파일은 **파일명 순서대로 일괄 적용하지 않는다.**

### `20260910_leads_contact_unique_dedupe.sql` — 보류 (2026-09-15 조사)

전화(숫자만)·이메일(`lower(trim)`) 기준 유니크 부분 인덱스 2개를 만든다. 이름에 dedupe가 붙어 있지만 중복을 정리하는 문장은 없고, 정리는 운영자 수작업으로 넘긴다. `CONCURRENTLY`도 쓰지 않는다.

- **그대로 적용하면 실패한다.** 운영 `leads` 372행 중 전화 중복 19그룹 39행, 이메일 중복 16그룹 34행이 있다(읽기 전용 조회로 재현). 원문 값이 같은 진짜 재제출이다. 44/45행이 Meta 리드 광고, 20/24건이 서로 다른 광고 폼이다. 사람이 손댄 흔적(상태·메모·연락 기록)은 없다.
- **중복을 지우고 적용하면 더 나쁘다.**
  - 현재 설계는 같은 연락처가 다시 제출해도 새 행을 만드는 것이다(재유입 배지·아침 공지가 이를 전제로 센다).
  - 인덱스가 생기면 재제출이 23505가 된다. [lib/server/lead-capture.ts](../../lib/server/lead-capture.ts)는 이를 일반 저장 실패로 처리해 critical 알림을 보내고 502를 돌려준다.
  - Meta 웹훅([app/api/meta/webhook/route.ts](../../app/api/meta/webhook/route.ts))은 실패를 세기만 하고 Meta에 200을 돌려준다. Meta가 재전송하지 않으니 그 리드는 DB에 남지 않는다. 최근 30일 기준 월 16건 안팎으로 추정한다.
  - `saveLead`를 mock으로 바꾼 테스트는 이 회귀를 잡지 못한다.
- **막으려던 문제는 운영에서 보이지 않는다.** 어드민에서 같은 리드를 동시에 두 번 등록하는 경우를 막으려던 것인데, 운영에 수기 등록 행 0건, 10초 안에 겹친 중복 0건이다. 운영 전화의 91%가 `+82` 형식이라, 숫자만 비교하는 키는 `010` 형식 수기 등록과의 교차 중복도 막지 못한다.
- **적용 전에 정할 것(그로스/CRM 소유)**: 리드를 제출마다 한 행(현행)으로 둘지, 연락처당 한 행으로 둘지.
  - 현행 유지: 전역 유니크 인덱스를 버리고, 어드민 등록 경로만 연락처 키 advisory lock RPC로 원자화한다. 전화 키는 Compass `normalizePhoneKey` 규칙(82→0)에 맞춘다.
  - 연락처당 한 행: 앱 병합 전환 → 배포 → 백업 → 남길 행 확정 → 정리 → `lock_timeout`을 걸고 인덱스 생성 순서를 지킨다.
- 파일 주석의 "Compass와 같은 정규화"는 사실과 다르다(Compass는 82→0 치환).

### 하드웨어 마이그레이션

- 하드웨어 탭 마이그레이션의 적용 상태와 순서는 [하드웨어 SCM 탭 reference §6](./hardware-scm-tab-reference.md#6-마이그레이션-상태)에 둔다.
- `20260915_hardware_sample_showroom_status.sql`은 check 제약 값만 넓히는 변경이라 `check:db` 프로브로 확인할 수 없다. 그 문서의 제약 조회로 확인한다.

## 순서가 정해진 마이그레이션

### 컨택·쇼룸 예약·도입 신청 퍼널 (2026-09-22)

퍼널 개편([2차 기획](./contact-showroom-checkout-develop-round2-2026-09-20.md))이 기대는 마이그레이션 3개다. 앞의 둘은 **코드 배포 전에**, 마지막 하나는 **코드 배포 후에** 적용한다.

| 순서 | 파일 | 내용 | 코드 배포와의 순서 | 확인 |
| --- | --- | --- | --- | --- |
| 1 | `20260829_showroom_bookings.sql` | 쇼룸 예약 테이블(RLS deny-all) | 전 | `check:db` — `showroom_bookings`, anon 차단 |
| 2 | `20260921_checkout_requests_lead_qualifiers.sql` | `checkout_requests.role`·`academy_size` (nullable) | 전 | `check:db` — 도입 신청 리드 자격 필드 |
| 3 | `20260921_lead_source_intake_split.sql` | 과거 리드 `source` 보정(UPDATE 2문) | **후** | 아래 SQL. 데이터 보정이라 `check:db` 계약에 없다 |

**2번이 빠지면 무엇이 깨지나.** Phase C 코드부터 도입 신청 insert가 두 컬럼을 싣는다.

- 폴백이 들어가기 전 코드(Phase C·D)는 신청 저장이 42703/PGRST204로 실패하고 500을 돌려준다. 신청이 통째로 유실된다.
- 폴백 이후 코드는 두 컬럼을 빼고 다시 저장하고 `console.warn`을 남긴다([lib/checkout-requests.ts](../../lib/checkout-requests.ts)).
- 어느 쪽이든 어드민 접수 큐 조회는 두 컬럼을 select하므로 실패한다([lib/repositories/checkout-requests-admin.ts](../../lib/repositories/checkout-requests-admin.ts)).
- `ADD COLUMN IF NOT EXISTS` 두 줄이라 재실행해도 무해하다. 가장 먼저 적용한다.

**3번을 배포 후에 돌리는 이유.** 두 방향 모두 틈이 생긴다.

- 배포 전에 돌리면, 배포까지 이전 코드가 새 쇼룸·신청 리드를 계속 `contact_page`로 쓴다. 이 행들은 보정에서 빠진다.
- 이전 코드의 응답 SLA·아침 공지 집합은 새 값(`showroom_booking`·`checkout_request`)을 모른다. 보정된 과거 행이 배포 때까지 공지에서 빠진다.
- 멱등이라 배포 전후로 두 번 돌려도 된다(이미 바뀐 행은 조건에 다시 걸리지 않는다).

```sql
-- 적용 전: 보정 대상 규모
select source, count(*)
from public.leads
where source_detail = 'showroom_booking' or source_detail like 'checkout_request:%'
group by source;

-- 적용 후: 0행이어야 한다
select source_detail, count(*)
from public.leads
where source = 'contact_page'
  and (source_detail = 'showroom_booking' or source_detail like 'checkout_request:%')
group by source_detail;
```

`leads.source`에는 CHECK 제약이 없다. 3번을 적용하지 않아도 새 리드 저장은 깨지지 않는다. 빠지는 것은 과거 행의 집계 연속성뿐이다.

## 새 마이그레이션을 추가할 때

1. `supabase/migrations/YYYYMMDD_설명.sql` — idempotent 구문, 관리자·금융 테이블은 즉시 RLS 활성화
   (deny-all 관례: [20260423_rls_admin_only_tables.sql](../../supabase/migrations/20260423_rls_admin_only_tables.sql)).
2. `lib/db/schema-contract.ts`의 `SCHEMA_CONTRACT_MIGRATIONS`와 `SCHEMA_PROBES`에 프로브를 함께 추가한다.
   프로브 없는 마이그레이션은 "적용했는지 아무도 모르는" 상태로 되돌아간다.
3. 데이터 이관이 필요하면 `scripts/`에 업서트 스크립트를 두고 프로브의 `seedCommand`에 적는다.
4. 타입·repository 쿼리는 스키마와 **같은 커밋**에서 바꾼다([플랫폼 플레이북](playbook/06-platform-data.md) §마이그레이션).
