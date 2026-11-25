#!/usr/bin/env bash
# 20261125_hardware_movements_mcp_idempotency_unique.sql 로컬 시나리오 — 일회용 PostgreSQL 클러스터 전용.
#
# 운영·공유 DB 에 붙지 않는다: 새 디렉터리에 initdb 로 클러스터를 만들고 127.0.0.1 에서만 듣게 띄운 뒤(유닉스 소켓 끔)
# 거기에만 접속하고, 끝나면(실패해도) 멈춘다. DATABASE_URL·PG* env 를 읽지 않는다. 합성 데이터만 쓴다.
#
#   WORK_DIR=<빈 임시 디렉터리> LOCAL_PG_PORT=55734 tests/fixtures/hw-mcp-idempotency-index/run-local.sh
#
# 필요: PostgreSQL 16 이상의 initdb·pg_ctl·psql(PATH 또는 PG_BIN). 확정 함수는 실제 마이그레이션(v3)을 그대로 싣는다.
#
# 보는 것(반박 검토 2026-11-25):
#   - MCP 로 등록한 배송 예정을 어드민이 출고 확정할 수 있다(출고 행이 raw.mcp 를 물려받아도 색인에 걸리지 않는다).
#   - 같은 키 동시 두 번째 예정 등록은 23505 로 막힌다.
#   - 이미 확정된 MCP 예정(예정 행 + 출고 행)은 "중복"으로 세지 않는다 → 색인을 만든다.
#   - 진짜 중복은 WARNING 만 남기고, 한 줄을 무효 처리한 뒤 다시 적용하면 색인을 만든다.
set -euo pipefail
export LC_ALL=C

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
MIGRATION="${MIGRATION:-$ROOT/supabase/migrations/20261125_hardware_movements_mcp_idempotency_unique.sql}"
CONFIRM_V3="$ROOT/supabase/migrations/20260914_hardware_confirm_planned_v3.sql"
PORT="${LOCAL_PG_PORT:-55734}"
WORK="${WORK_DIR:-$(mktemp -d)}"
if [ -n "${PG_BIN:-}" ]; then PATH="$PG_BIN:$PATH"; fi

if [ -e "$WORK/data" ]; then
  echo "run-local: $WORK/data 가 이미 있다 — 빈 WORK_DIR 을 주세요" >&2
  exit 2
fi
mkdir -p "$WORK"
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE DATABASE_URL || true

initdb -D "$WORK/data" -U postgres --auth=trust --locale=C >"$WORK/initdb.log"
pg_ctl -D "$WORK/data" -l "$WORK/pg.log" -w \
  -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null
LOG="$WORK/run.log"
: >"$LOG"
finish() {
  local code=$?
  pg_ctl -D "$WORK/data" -m fast -w stop >/dev/null 2>&1 || true
  if [ "$code" != 0 ]; then echo "run-local: 실패 — $LOG" >&2; grep -E 'NOTICE|WARNING|ERROR|DETAIL' "$LOG" >&2 || true; fi
}
trap finish EXIT

psql_db() { psql -X -q -h 127.0.0.1 -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -d "$@"; }
fresh_db() {
  psql_db postgres -c "create database $1" >/dev/null
  psql_db "$1" -f "$HERE/00-stub.sql" >/dev/null
  psql_db "$1" -f "$CONFIRM_V3" >/dev/null
}

# 1) 빈 표에 색인 → 확정·동시 등록 시나리오
fresh_db hw_fresh
psql_db hw_fresh -f "$MIGRATION" >>"$LOG" 2>&1
psql_db hw_fresh -f "$HERE/30-fresh-scenarios.sql" >>"$LOG" 2>&1

# 2) 확정된 MCP 예정이 이미 있는 표 → 색인을 만든다
fresh_db hw_confirmed
psql_db hw_confirmed -f "$HERE/40-existing-confirmed.sql" >>"$LOG" 2>&1
psql_db hw_confirmed -f "$MIGRATION" >>"$LOG" 2>&1
psql_db hw_confirmed -f "$HERE/41-existing-confirmed-check.sql" >>"$LOG" 2>&1

# 3) 진짜 중복 → WARNING, 무효 처리 뒤 다시 적용하면 색인
fresh_db hw_dup
psql_db hw_dup -f "$HERE/50-existing-duplicates.sql" >>"$LOG" 2>&1
psql_db hw_dup -f "$MIGRATION" >>"$LOG" 2>&1
grep -q "WARNING:  MCP 배송 예정 중복 키 1 건" "$LOG" || { echo "run-local: 중복 WARNING 이 없다" >&2; cat "$LOG" >&2; exit 1; }
psql_db hw_dup -f "$HERE/51-duplicates-blocked-check.sql" >>"$LOG" 2>&1
psql_db hw_dup -f "$MIGRATION" >>"$LOG" 2>&1
psql_db hw_dup -f "$HERE/52-duplicates-cleared-check.sql" >>"$LOG" 2>&1

WANT=10
GOT="$(grep -c 'NOTICE:  ok  ' "$LOG" || true)"
grep -E 'NOTICE|WARNING' "$LOG" | sed 's/^psql:[^ ]* //'
if [ "$GOT" != "$WANT" ]; then
  echo "run-local: ok $GOT/$WANT" >&2
  exit 1
fi
echo "run-local: ok $GOT/$WANT"
