import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const VERCEL_CONFIG = "vercel.json";
const MAX_DAILY_RUNS_PER_CRON = 1;

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

function routeFileForCronPath(cronPath) {
  const cleanPath = cronPath.replace(/^\/+/, "");
  return path.join("app", `${cleanPath}`, "route.ts");
}

function main() {
  const config = JSON.parse(readFileSync(VERCEL_CONFIG, "utf8"));
  const crons = config.crons;
  if (!Array.isArray(crons)) {
    fail(`${VERCEL_CONFIG}: expected "crons" to be an array`);
  }

  const failures = [];
  const dailyRunsByPath = new Map();

  for (const cron of crons) {
    const cronPath = cron?.path;
    const schedule = cron?.schedule;

    if (typeof cronPath !== "string" || !cronPath.startsWith("/")) {
      failures.push(`Invalid cron path: ${JSON.stringify(cronPath)}`);
      continue;
    }

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

      if (runsPerMatchingDay > MAX_DAILY_RUNS_PER_CRON) {
        failures.push(
          `${cronPath}: "${schedule}" can run ${runsPerMatchingDay} times on a matching day; ` +
            "Vercel Hobby deployments require each cron expression to be daily-or-less"
        );
      }

      dailyRunsByPath.set(
        cronPath,
        (dailyRunsByPath.get(cronPath) ?? 0) + runsPerMatchingDay
      );
    } catch (error) {
      failures.push(`${cronPath}: ${error.message}`);
    }

    const routeFile = routeFileForCronPath(cronPath);
    if (!existsSync(routeFile)) {
      failures.push(`${cronPath}: missing route file ${routeFile}`);
    }
  }

  for (const [cronPath, runsPerMatchingDay] of dailyRunsByPath.entries()) {
    if (runsPerMatchingDay > MAX_DAILY_RUNS_PER_CRON) {
      failures.push(
        `${cronPath}: configured ${runsPerMatchingDay} total runs on a matching day across duplicate entries; ` +
          "use one daily-or-less cron entry per path, or move sub-daily scheduling outside vercel.json"
      );
    }
  }

  if (failures.length > 0) {
    console.error("Vercel cron safety check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error("\nUse one explicit minute and one explicit hour per cron expression, e.g. \"15 0 * * *\".");
    process.exit(1);
  }

  console.log(`Vercel cron safety check passed (${crons.length} cron entries).`);
}

main();
