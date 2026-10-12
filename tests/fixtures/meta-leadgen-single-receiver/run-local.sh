#!/usr/bin/env bash
# 20260915_meta_leadgen_single_receiver.sql 로컬 시나리오 — 일회용 PostgreSQL 클러스터 전용.
#
# 이 스크립트는 운영·공유 DB 에 붙지 않는다: 새 디렉터리에 initdb 로 클러스터를 만들고 127.0.0.1 에서만
# 듣게 띄운 뒤(유닉스 소켓 끔) 거기에만 접속하고, 끝나면(실패해도) 멈춘다. DATABASE_URL·PG* env 를 읽지 않는다.
#
#   WORK_DIR=<빈 임시 디렉터리> LOCAL_PG_PORT=55733 tests/fixtures/meta-leadgen-single-receiver/run-local.sh
#
# 필요: PostgreSQL 17 의 initdb·pg_ctl·psql 이 PATH 에 있을 것. 합성 데이터만 쓴다.
set -euo pipefail
# macOS 에서 로캘이 비면 postmaster 가 "became multithreaded during startup" 으로 멈춘다 — 검증 기록과 같은 C 로캘.
export LC_ALL=C

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
MIGRATION="${MIGRATION:-$ROOT/supabase/migrations/20260915_meta_leadgen_single_receiver.sql}"
PORT="${LOCAL_PG_PORT:-55733}"
WORK="${WORK_DIR:-$(mktemp -d)}"

if [ -e "$WORK/data" ]; then
  echo "run-local: $WORK/data 가 이미 있다 — 빈 WORK_DIR 을 주세요(기존 클러스터를 재사용하지 않는다)" >&2
  exit 2
fi
mkdir -p "$WORK"

initdb -D "$WORK/data" -U postgres --auth=trust --locale=C >"$WORK/initdb.log"
pg_ctl -D "$WORK/data" -l "$WORK/pg.log" -w \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null
trap 'pg_ctl -D "$WORK/data" -m fast -w stop >/dev/null 2>&1 || true' EXIT

cp "$HERE"/00-stub.sql "$HERE"/10-compass-schema.sql "$HERE"/15-compass-statements.sql \
   "$HERE"/30-b-regression.sql "$HERE"/31-concurrency.sh "$HERE"/40-final-scenarios.sql \
   "$HERE"/50-runbook-checks.sql "$HERE"/60-migration-conventions.sql "$WORK/"
cp "$MIGRATION" "$WORK/20-admin-migration.sql"
cd "$WORK"

psql_db() { psql -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -d "$@"; }
count_ok() { grep -c 'NOTICE:  ok  ' "$1" || true; }
expect_ok() {
  local log="$1" want="$2" got
  got="$(count_ok "$log")"
  if [ "$got" != "$want" ]; then
    echo "run-local: $log 단언 $got 개 통과 — $want 개여야 한다" >&2
    exit 1
  fi
  echo "  $log: 단언 $got 개 통과"
}

psql_db postgres -q -c 'create database t0' -c 'create database t1'

# t0: 스텁 → 어드민 마이그레이션(Compass 전) → Compass DDL ×2 → 어드민 ×2 → 설계 B 회귀(T1–T16) → 동시 실행(T9)
{
  for f in 00-stub.sql 20-admin-migration.sql 10-compass-schema.sql 10-compass-schema.sql \
           20-admin-migration.sql 20-admin-migration.sql 30-b-regression.sql; do
    psql_db t0 -f "$f"
  done
} >run-t0.log 2>&1
grep -q 'compass_meta_submissions_v: crm.meta_leadgen_submissions missing' run-t0.log
grep -q 'compass_meta_submissions_v: created' run-t0.log
expect_ok run-t0.log 40
LOCAL_PG_PORT="$PORT" sh 31-concurrency.sh >run-t0-concurrency.log 2>&1
grep -q 'A: inserted  B: exists_inserted' run-t0-concurrency.log
grep -q '^rows=1$' run-t0-concurrency.log
echo "  run-t0-concurrency.log: $(tr '\n' ' ' <run-t0-concurrency.log)"

# t1: 같은 적용 순서 → 이식분 F1–F9 → 런북 V2–V6(읽기) → 저장소 규칙 대조(C1–C5)
{
  for f in 00-stub.sql 20-admin-migration.sql 10-compass-schema.sql 20-admin-migration.sql \
           20-admin-migration.sql 40-final-scenarios.sql; do
    psql_db t1 -f "$f"
  done
} >run-t1.log 2>&1
expect_ok run-t1.log 60
sed "s/<테스트 leadgen_id>/3001/" 50-runbook-checks.sql >run-50-substituted.sql
psql_db t1 -f run-50-substituted.sql >run-50.log 2>&1
if grep -q 'ERROR' run-50.log; then
  echo "run-local: run-50.log 에 ERROR" >&2
  exit 1
fi
echo "  run-50.log: V2–V6 오류 없음"
psql_db t1 -f 60-migration-conventions.sql >run-60.log 2>&1
expect_ok run-60.log 15

echo "run-local: 전부 통과 (WORK_DIR=$WORK)"
