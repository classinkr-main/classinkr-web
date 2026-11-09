/**
 * upgrade-lead-magnet-content.mjs
 * 리드마그넷 콘텐츠 보강분을 운영 Supabase lead_magnets 행에 반영한다(칸 단위, 사람이 고친 값 보호).
 *
 * 실행:
 *   node --env-file=.env.local scripts/upgrade-lead-magnet-content.mjs            # 미리보기(기본, 쓰기 없음)
 *   node --env-file=.env.local scripts/upgrade-lead-magnet-content.mjs --apply    # 운영 DB에 쓰기
 *   ... --file=scripts/data/lead-magnet-content-upgrade-2026-11.json               # 보강 파일 지정(기본값)
 *
 * 규칙(scripts/lib/lead-magnet-content-upgrade-plan.mjs):
 * - 칸마다 DB 현재값이 from과 같을 때만 to로 바꾼다. 다르면 충돌로 보고 건너뛴다(수기 편집본 보호).
 * - DB에 행이 없으면 건너뛴다(새로 만들지 않는다 — 행 생성은 import-lead-magnets.mjs 몫).
 * - 쓸 때는 읽은 시점의 updated_at과 같은 행만 바꾼다. 그사이 누가 저장했으면 0행이 바뀌고 충돌로 남는다.
 * - updated_at은 저장소(updateLeadMagnet)와 같이 직접 쓰지 않는다 — 테이블 트리거
 *   trg_lead_magnets_updated_at(supabase/migrations/20260818_lead_magnets.sql)이 채운다.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, isAbsolute, join, resolve } from "path";
import { fileURLToPath } from "url";

import { buildLeadMagnetContentUpgradePlan } from "./lib/lead-magnet-content-upgrade-plan.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = join(__dirname, "data/lead-magnet-content-upgrade-2026-11.json");
const TABLE = "lead_magnets";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const fileArg = argv.find((arg) => arg.startsWith("--file="));
const unsupported = argv.filter((arg) => arg !== "--apply" && !arg.startsWith("--file="));
if (unsupported.length > 0) {
  console.error(`지원하지 않는 옵션입니다: ${unsupported.join(", ")} (--apply, --file=경로만 받습니다)`);
  process.exit(1);
}

const upgradePath = fileArg
  ? (() => {
      const value = fileArg.slice("--file=".length);
      return isAbsolute(value) ? value : resolve(process.cwd(), value);
    })()
  : DEFAULT_FILE;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

let host;
try {
  host = new URL(supabaseUrl).host;
} catch {
  console.error("NEXT_PUBLIC_SUPABASE_URL 형식이 올바르지 않습니다.");
  process.exit(1);
}

// 대상 DB를 먼저 보여 준다 — 키 값은 찍지 않는다.
console.log("────────────────────────────────────────");
console.log(`[lead-magnets:content-upgrade] 대상 DB: ${host}`);
console.log(`모드: ${apply ? "적용(--apply) — 운영 DB에 씁니다" : "미리보기 — DB 쓰기 없음"}`);
console.log(`보강 파일: ${upgradePath}`);
console.log("────────────────────────────────────────");

const upgrade = JSON.parse(readFileSync(upgradePath, "utf8"));
const slugs = Object.keys(upgrade?.changes ?? {});
if (slugs.length === 0) {
  console.error("보강 파일에 바꿀 자료가 없습니다.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const { data: rows, error } = await supabase.from(TABLE).select("slug, data, updated_at").in("slug", slugs);
if (error) {
  console.error(`lead_magnets 조회 실패: ${error.message}`);
  process.exit(1);
}

const plan = buildLeadMagnetContentUpgradePlan(upgrade, rows ?? []);

const STATUS_LABEL = {
  apply: "적용 예정",
  already: "이미 반영",
  conflict: "충돌 — DB 값이 원본과 달라 건너뜀(사람이 고친 값)",
  skipped: "건너뜀",
};
for (const operation of plan.operations) {
  const head =
    operation.action === "skip-missing-row"
      ? "DB에 행 없음 — 건너뜀"
      : operation.action === "update"
        ? "갱신 대상"
        : "바꿀 칸 없음";
  console.log(`\n${operation.slug}: ${head}`);
  for (const field of operation.fields) {
    console.log(`  - ${field.field}: ${STATUS_LABEL[field.status]} · ${field.reason}`);
  }
}

const summary = {
  mode: apply ? "apply" : "dry-run",
  host,
  magnets: plan.magnets,
  rowsRead: rows?.length ?? 0,
  rowsToUpdate: plan.rowsToUpdate,
  rowsUnchanged: plan.rowsUnchanged,
  missingRows: plan.missingRows,
  fieldsToApply: plan.fieldsToApply,
  fieldsAlreadyApplied: plan.fieldsAlreadyApplied,
  fieldsInConflict: plan.fieldsInConflict,
  fieldsSkipped: plan.fieldsSkipped,
};

if (!apply) {
  console.log("\n[미리보기 요약] DB 쓰기 없음 — 반영하려면 --apply");
  console.log(JSON.stringify(summary, null, 2));
} else {
  let updated = 0;
  let raced = 0;
  let failed = 0;
  for (const operation of plan.operations) {
    if (operation.action !== "update") continue;
    let query = supabase.from(TABLE).update({ data: operation.data }).eq("slug", operation.slug);
    query = operation.updatedAt ? query.eq("updated_at", operation.updatedAt) : query;
    const { data: written, error: writeError } = await query.select("slug");
    if (writeError) {
      console.error(`실패: ${operation.slug} — ${writeError.message}`);
      failed += 1;
    } else if (!written || written.length === 0) {
      console.error(`충돌: ${operation.slug} — 읽은 뒤 누가 저장했습니다. 미리보기를 다시 돌려 확인하세요.`);
      raced += 1;
    } else {
      console.log(`갱신: ${operation.slug}`);
      updated += 1;
    }
  }
  console.log("\n[적용 결과]");
  console.log(JSON.stringify({ ...summary, rowsUpdated: updated, rowsRaced: raced, rowsFailed: failed }, null, 2));
  if (failed > 0 || raced > 0) process.exitCode = 1;
}
