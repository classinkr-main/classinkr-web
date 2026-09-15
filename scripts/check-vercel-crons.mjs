import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const VERCEL_CONFIG = "vercel.json";
// Vercel Pro(2026-09-14 전환)는 크론을 분 단위로 정시에 돌린다. 저장소 정책은 경로당 항목 하나,
// 경로당 하루 288회(5분 간격) 이하, 전체 40개 이하다 — AGENTS.md "배포 / Cron 안전 규칙".
const MAX_RUNS_PER_DAY_PER_PATH = 288;
const MAX_CRON_ENTRIES = 40;

function fail(message) {
  throw new Error(message);
}

function parseNumber(value, min, max, label) {
  if (!/^\d+$/.test(value)) {
    fail(`${label}: expected a number, got "${value}"`);
  }

  const number = Number(value);
  if (number < min || number > max) {
    fail(`${label}: expected ${min}-${max}, got ${number}`);
  }

  return number;
}

function expandCronField(field, min, max, label) {
  const values = new Set();

  for (const part of field.split(",")) {
    if (!part) fail(`${label}: empty list segment in "${field}"`);

    const [rangePart, stepPart] = part.split("/");
    if (part.split("/").length > 2) {
      fail(`${label}: invalid step syntax "${part}"`);
    }

    const step = stepPart === undefined ? 1 : parseNumber(stepPart, 1, max - min + 1, `${label} step`);
    let start;
    let end;

    if (rangePart === "*") {
      start = min;
      end = max;
    } else if (rangePart.includes("-")) {
      const [rawStart, rawEnd] = rangePart.split("-");
      if (rangePart.split("-").length !== 2) {
        fail(`${label}: invalid range syntax "${rangePart}"`);
      }
      start = parseNumber(rawStart, min, max, `${label} range start`);
      end = parseNumber(rawEnd, min, max, `${label} range end`);
      if (start > end) fail(`${label}: range start ${start} is after end ${end}`);
    } else {
      start = parseNumber(rangePart, min, max, label);
      end = start;
    }

    for (let value = start; value <= end; value += step) {
      values.add(value);
    }
  }

  return values;
}

/**
 * cron path -> route file. 동적 세그먼트(`[slot]`)를 쓰는 라우트는 vercel.json 에
 * 구체값(`/api/cron/dispatch/07`)으로 등록되므로, 리터럴 디렉터리가 없으면
 * 같은 자리의 `[param]` 디렉터리로 내려간다. 이걸 안 하면 슬롯 크론이
 * 전부 "missing route file" 로 잡힌다.
 */
function routeFileForCronPath(cronPath) {
  const segments = cronPath.replace(/^\/+/, "").split("/").filter(Boolean);
  let current = "app";

  for (const segment of segments) {
    const literal = path.join(current, segment);
    if (existsSync(literal)) {
      current = literal;
      continue;
    }

    const dynamic = readdirSync(current, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\[.+\]$/.test(entry.name))
      .map((entry) => entry.name);

    if (dynamic.length !== 1) return path.join(current, segment, "route.ts");
    current = path.join(current, dynamic[0]);
  }

  return path.join(current, "route.ts");
}

function main() {
  const config = JSON.parse(readFileSync(VERCEL_CONFIG, "utf8"));
  const crons = config.crons;
  if (!Array.isArray(crons)) {
    fail(`${VERCEL_CONFIG}: expected "crons" to be an array`);
  }

  const failures = [];
  const entriesByPath = new Map();

  if (crons.length > MAX_CRON_ENTRIES) {
    failures.push(`${VERCEL_CONFIG} has ${crons.length} cron entries; the limit is ${MAX_CRON_ENTRIES}`);
  }

  for (const cron of crons) {
    const cronPath = cron?.path;
    const schedule = cron?.schedule;

    if (typeof cronPath !== "string" || !cronPath.startsWith("/")) {
      failures.push(`Invalid cron path: ${JSON.stringify(cronPath)}`);
      continue;
    }

    entriesByPath.set(cronPath, (entriesByPath.get(cronPath) ?? 0) + 1);

    if (typeof schedule !== "string") {
      failures.push(`${cronPath}: missing string schedule`);
      continue;
    }

    const fields = schedule.trim().split(/\s+/);
    if (fields.length !== 5) {
      failures.push(`${cronPath}: "${schedule}" must have exactly 5 cron fields`);
      continue;
    }

    try {
      const minutes = expandCronField(fields[0], 0, 59, `${cronPath} minute`);
      const hours = expandCronField(fields[1], 0, 23, `${cronPath} hour`);
      const runsPerMatchingDay = minutes.size * hours.size;

      if (runsPerMatchingDay > MAX_RUNS_PER_DAY_PER_PATH) {
        failures.push(
          `${cronPath}: "${schedule}" runs ${runsPerMatchingDay} times on a matching day; ` +
            `the limit is ${MAX_RUNS_PER_DAY_PER_PATH} (every 5 minutes)`
        );
      }
    } catch (error) {
      failures.push(`${cronPath}: ${error.message}`);
    }

    const routeFile = routeFileForCronPath(cronPath);
    if (!existsSync(routeFile)) {
      failures.push(`${cronPath}: missing route file ${routeFile}`);
    }
  }

  for (const [cronPath, entryCount] of entriesByPath.entries()) {
    if (entryCount > 1) {
      failures.push(`${cronPath}: appears in ${entryCount} cron entries; keep exactly one entry per path`);
    }
  }

  if (failures.length > 0) {
    console.error("Vercel cron safety check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error(
      `\nWrite schedules in UTC, one entry per path, at most ${MAX_RUNS_PER_DAY_PER_PATH} runs a day ` +
        `and at most ${MAX_CRON_ENTRIES} entries, e.g. "0 0,4,8 * * *" (09:00/13:00/17:00 KST).`
    );
    process.exit(1);
  }

  console.log(`Vercel cron safety check passed (${crons.length} cron entries).`);
}

main();
