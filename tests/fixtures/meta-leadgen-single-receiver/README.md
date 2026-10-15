# Meta 리드애즈 단일 수신 — 로컬 PG 시나리오

`supabase/migrations/20260915_meta_leadgen_single_receiver.sql` 의 식(모드 전이, 원장, 증인, 폴백, 건강 지표, 권한)을
**일회용 PostgreSQL 17 클러스터**에서 합성 데이터로 돌려 보는 시나리오 모음입니다.

이 저장소에는 PG 드라이버가 없고, 실제 DB 에 붙는 테스트 선례도 없습니다. 그래서 이 파일들은 vitest 가 돌리지 않습니다.
vitest 는 `tests/db/meta-leadgen-single-receiver-migration.test.ts` 로 SQL 텍스트의 규칙만 고정합니다.
마이그레이션 SQL 을 고치면 아래 러너를 다시 돌리고, 결과를 PR 본문에 적습니다.

## 규칙

- **운영·공유 DB 에서 돌리지 않습니다.** 러너는 빈 디렉터리에 `initdb` 로 새 클러스터를 만듭니다.
  `127.0.0.1` 에서만 듣게 띄우고(유닉스 소켓 끔) 거기에만 접속합니다. 끝나면 실패해도 멈춥니다.
  `DATABASE_URL`, Supabase 키, `PG*` env 는 읽지 않습니다.
- `npm run check:db` 같은 원격 확인과는 무관합니다.
- 데이터는 모두 합성입니다. 전화번호는 `010-0000-xxxx` 같은 가짜 번호만 씁니다.

## 실행

```bash
WORK_DIR="$(mktemp -d)" LOCAL_PG_PORT=55871 tests/fixtures/meta-leadgen-single-receiver/run-local.sh
```

- 필요한 것: PATH 에 PostgreSQL 17 의 `initdb`·`pg_ctl`·`psql`(Homebrew `postgresql@17` 에서 확인).
- `WORK_DIR` 에는 `data/` 가 없어야 합니다. 기존 클러스터는 재사용하지 않습니다. 로그는 모두 `WORK_DIR` 에 남습니다.
- `MIGRATION=<다른 파일>` 을 주면 그 파일을 적용합니다(검증본과 비교할 때 씁니다).

## 순서와 기대 결과

| DB | 적용 순서 | 기대 |
|---|---|---|
| `t0` | `00-stub` → 마이그레이션(Compass 전) → `10-compass-schema` ×2 → 마이그레이션 ×2 → `30-b-regression` | 첫 적용: `compass_meta_submissions_v: … missing` NOTICE. 재실행: `…: created`. 오류 0, 단언 **40** |
| `t0` | `31-concurrency.sh` | `A: inserted  B: exists_inserted`, `rows=1` |
| `t1` | `00-stub` → 마이그레이션 → `10-compass-schema` → 마이그레이션 ×2 → `40-final-scenarios` | 단언 **60** |
| `t1` | `50-runbook-checks`(`<테스트 leadgen_id>` → `3001`) | ERROR 없음 |
| `t1` | `60-migration-conventions` | 단언 **15** |

## 파일

| 파일 | 내용 |
|---|---|
| `00-stub.sql` | 이 설계가 닿는 실 DB 구조만 축약한 스텁입니다(crm·public, Compass 흉내 롤 `compass_app`). 저장소로 옮기며 `service_role` 에 `BYPASSRLS`(Supabase 기본 속성)를 더했습니다 |
| `10-compass-schema.sql` | Compass 소유 DDL 검증본입니다(`crm.meta_leadgen_submissions`·`crm.meta_leadgen_gap_imports`). Compass `scripts/schema.sql` 끝에 들어갑니다 |
| `15-compass-statements.sql` | Compass `lib/metaReceiverWitness.ts` SQL 상수(W0–W4) 검증본입니다. `40` 이 `\i` 로 읽습니다 |
| `30-b-regression.sql` | 설계 B 시나리오 T1–T16: 모드 전이·거절, adopt, 창, insert 모양, 멱등, blocked 재시도, skip, H1–H5, 롤백 잔여분, anon 거절 |
| `31-concurrency.sh` | T9 동시 미러입니다(한 leadgen 에 1행). 포트는 `LOCAL_PG_PORT` 로 받습니다 |
| `40-final-scenarios.sql` | 이식분 F1–F9: 제출 뷰 허용 키·45일, 증인 RPC, 스위치 강화, 폴백 선점·재시도·중단 복구, Compass 롤 권한, 증인 공백 가져오기, 롤백 뒤 폴백 |
| `50-runbook-checks.sql` | 런북 V2–V6 읽기 SQL 입니다(운영에서는 사람이 SQL Editor 에서 블록 하나씩 실행합니다) |
| `60-migration-conventions.sql` | 저장소로 옮기며 더한 카탈로그 대조입니다. 함수 10개의 `search_path=''`·definer·PUBLIC/anon/authenticated 실행 불가를 봅니다. 표 5개는 RLS deny-all 과 service_role 권한이 정확한지, 표·뷰 9개에 공개 권한이 없는지, RLS 아래에서 service_role 경로가 막히지 않는지를 봅니다 |
| `run-local.sh` | 위 순서를 돌리고 단언 수를 확인하는 러너입니다 |

`00`·`10`·`15`·`30`·`31`·`40`·`50` 은 설계 검증본(META-RECEIVER-FINAL §11, 2026-09-15)을 옮긴 것입니다.
SQL 식은 바꾸지 않았습니다. 바꾼 것은 세 가지입니다.

- 위에 적은 스텁 한 줄
- 동시 실행 스크립트의 포트 변수
- 전화번호 리터럴: 실번호일 수 있는 형태를 `010-0000-xxxx` 합성 번호로 바꿨습니다(20260914 픽스처와 같은 규칙).
  이에 맞춰 F1 "자유 응답 제외" 단언이 찾는 부분 문자열을 `9999` 에서 `9888` 로 바꿨습니다.

바꾼 뒤 러너를 다시 돌려 기대 결과가 그대로인 것을 확인했습니다.

## 운영과 다른 점(로컬에서 확인하지 못하는 것)

- 로컬의 뷰·함수 소유자는 슈퍼유저입니다. 운영에서는 `postgres`(표 소유자, 슈퍼유저 아님)가 소유합니다.
  두 경우 모두 RLS 를 우회하는 것은 PostgreSQL 규칙(소유자는 FORCE 가 없으면 RLS 우회)에 기댑니다.
- Supabase PostgREST 를 거친 호출, 오류 코드 모양, 운영 카탈로그의 실제 권한, Graph API 는 여기서 확인하지 않습니다.
