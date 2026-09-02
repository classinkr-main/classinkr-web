/**
 * scripts/measure-admin-api.mjs — 어드민 API 응답시간 측정 스크립트
 *
 * 목적: 운영자가 배포 전후로 어드민 API 지연을 같은 방법으로 재기 위한 도구.
 * Node 20+ 내장 fetch만 쓴다 — 의존성 추가 없음.
 *
 * 사용법:
 *   node scripts/measure-admin-api.mjs
 *   npm run measure:admin
 *   npm run measure:admin -- --runs=8 --concurrency=2
 *   npm run measure:admin -- --json > result.json
 *   npm run measure:admin -- --endpoints=my-endpoints.txt
 *
 * 입력 (환경변수 또는 인자 — 인자가 우선):
 *   ADMIN_BASE_URL / --base-url=<url>   대상 서버 (기본 http://localhost:3888)
 *   ADMIN_COOKIE   / --cookie=<value>   관리자로 로그인한 브라우저의 Network 탭에서
 *                                       복사한 Cookie 헤더 문자열 그대로. 이 값은
 *                                       콘솔·JSON 출력 어디에도 절대 찍히지 않는다.
 *   --runs=N          엔드포인트당 반복 횟수 (기본 5). 1회차=콜드, 2회차부터 p50/p95 계산.
 *   --concurrency=K   동시에 측정할 엔드포인트 수 (기본 1). 배포 전후를 같은 조건으로
 *                      비교하려면 기본값(완전 순차 실행)을 권장한다 — 값을 올리면
 *                      엔드포인트끼리 서버 자원을 다투게 되어 절대값 비교가 어려워진다.
 *   --endpoints=파일  줄바꿈으로 구분된 경로 목록(#으로 시작하는 줄은 주석) 또는 문자열
 *                      배열 JSON 파일. 생략하면 DEFAULT_ENDPOINTS를 쓴다.
 *   --json            사람이 읽는 표 대신 JSON 결과 하나를 stdout에 출력.
 *   --help, -h         이 사용법을 출력하고 종료(요청을 보내지 않음).
 *
 * 출력: 엔드포인트별 상태코드·콜드(ms)·p50/p95(ms)·응답 바이트·
 * x-vercel-cache/cache-control/server-timing 요약, 전체 합계, "가장 느린 5개" 표.
 * 401/403 응답이 하나라도 있으면 Cookie 안내 메시지를 덧붙인다.
 */

import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const DEFAULT_BASE_URL = "http://localhost:3888";
const DEFAULT_RUNS = 5;
const DEFAULT_CONCURRENCY = 1;
const REQUEST_TIMEOUT_MS = 30_000;
const SLOWEST_COUNT = 5;
const CACHE_HEADER_KEYS = ["x-vercel-cache", "cache-control", "server-timing"];

const DEFAULT_ENDPOINTS = [
  "/api/admin/notifications?countOnly=1",
  "/api/admin/os-summary",
  "/api/admin/settings/integrations/status",
  "/api/admin/leads?scope=overview",
  "/api/admin/crm/overview",
  "/api/admin/crm/action-kpis",
  "/api/admin/crm/customers/unified?limit=50&offset=0",
  "/api/admin/crm/customers-neo",
  "/api/admin/crm/revenue?months=6",
  "/api/admin/crm/revenue-sheet",
  "/api/admin/leads/activity-summary",
  "/api/admin/calendar?year=2026&month=9",
  "/admin",
  "/admin/crm",
];

function printHelp() {
  console.log(`어드민 API 응답시간 측정 스크립트

사용법:
  node scripts/measure-admin-api.mjs [옵션]
  npm run measure:admin -- [옵션]

옵션:
  --base-url=<url>    대상 서버 (기본 ${DEFAULT_BASE_URL}, 또는 ADMIN_BASE_URL 환경변수)
  --cookie=<value>    관리자 세션 Cookie 헤더 문자열 (또는 ADMIN_COOKIE 환경변수).
                       값은 어디에도 출력되지 않는다.
  --runs=N            엔드포인트당 반복 횟수 (기본 ${DEFAULT_RUNS})
  --concurrency=K     동시에 측정할 엔드포인트 수 (기본 ${DEFAULT_CONCURRENCY})
  --endpoints=파일    측정할 경로 목록 파일 (줄바꿈 구분 또는 JSON 배열)
  --json              표 대신 JSON 결과를 stdout에 출력
  --help, -h          이 사용법 출력 후 종료

예시:
  ADMIN_BASE_URL=https://admin.example.com \\
  ADMIN_COOKIE="sb-access-token=...; sb-refresh-token=..." \\
    node scripts/measure-admin-api.mjs --runs=8
`);
}

function parseArgs(argv) {
  const opts = {
    runs: DEFAULT_RUNS,
    concurrency: DEFAULT_CONCURRENCY,
    endpointsFile: null,
    json: false,
    help: false,
    baseUrl: null,
    cookie: null,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg.startsWith("--runs=")) {
      opts.runs = Number.parseInt(arg.slice("--runs=".length), 10);
    } else if (arg.startsWith("--concurrency=")) {
      opts.concurrency = Number.parseInt(arg.slice("--concurrency=".length), 10);
    } else if (arg.startsWith("--endpoints=")) {
      opts.endpointsFile = arg.slice("--endpoints=".length);
    } else if (arg.startsWith("--base-url=")) {
      opts.baseUrl = arg.slice("--base-url=".length);
    } else if (arg.startsWith("--cookie=")) {
      opts.cookie = arg.slice("--cookie=".length);
    } else {
      throw new Error(`알 수 없는 인자: ${arg} (--help 참고)`);
    }
  }

  if (!Number.isFinite(opts.runs) || opts.runs < 1) opts.runs = DEFAULT_RUNS;
  if (!Number.isFinite(opts.concurrency) || opts.concurrency < 1) opts.concurrency = DEFAULT_CONCURRENCY;

  return opts;
}

function loadEndpoints(endpointsFile) {
  if (!endpointsFile) return DEFAULT_ENDPOINTS;

  let raw;
  try {
    raw = readFileSync(endpointsFile, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`--endpoints 파일을 읽을 수 없습니다(${endpointsFile}): ${message}`);
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      throw new Error(`${endpointsFile} 은(는) 문자열 배열 JSON이어야 합니다.`);
    }
    if (parsed.length === 0) throw new Error(`${endpointsFile} 에 유효한 엔드포인트가 없습니다.`);
    return parsed;
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length === 0) throw new Error(`${endpointsFile} 에 유효한 엔드포인트가 없습니다.`);
  return lines;
}

/** 표본이 적을 때(runs 기본값 5 → 웜업 4건)도 안전한 nearest-rank 백분위수. */
function percentile(sortedMs, p) {
  if (sortedMs.length === 0) return null;
  const rank = Math.ceil((p / 100) * sortedMs.length);
  const index = Math.min(sortedMs.length, Math.max(1, rank)) - 1;
  return sortedMs[index];
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function formatMs(ms) {
  if (ms === null || ms === undefined) return "-";
  return `${Math.round(ms)}`;
}

function cacheHeaderSummary(headers) {
  return CACHE_HEADER_KEYS.map((key) => `${key}=${headers?.[key] ?? "-"}`).join(" ");
}

async function requestOnce(url, headers) {
  const startedAt = performance.now();
  try {
    const res = await fetch(url, {
      headers,
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await res.arrayBuffer();
    return {
      ok: true,
      status: res.status,
      ms: performance.now() - startedAt,
      bytes: body.byteLength,
      headers: {
        "x-vercel-cache": res.headers.get("x-vercel-cache"),
        "cache-control": res.headers.get("cache-control"),
        "server-timing": res.headers.get("server-timing"),
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      ms: performance.now() - startedAt,
      bytes: null,
      headers: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 한 엔드포인트를 runs번 순차 호출한다(같은 엔드포인트를 동시에 여러 번 부르면
 * 커넥션 경합이 섞여 콜드/웜 구분이 무의미해진다 — 동시성은 엔드포인트 단위로만 적용).
 * 콜드(1회차) 요청 자체가 네트워크 오류로 실패하면 같은 이유로 남은 실행도 실패할
 * 가능성이 커, 오류당 30초 타임아웃 대기를 반복하지 않도록 조기 종료한다.
 */
async function measureEndpoint(baseUrl, path, headers, runs) {
  const url = new URL(path, baseUrl).toString();
  const warmSamples = [];
  let cold = null;
  let lastStatus = null;
  let lastHeaders = null;
  let errorMessage = null;
  let okCount = 0;

  for (let i = 0; i < runs; i++) {
    const result = await requestOnce(url, headers);

    if (result.ok) {
      okCount++;
      lastStatus = result.status;
      lastHeaders = result.headers;
      if (i === 0) {
        cold = { ms: result.ms, bytes: result.bytes };
      } else {
        warmSamples.push(result.ms);
      }
    } else {
      errorMessage = result.error;
      if (i === 0) break;
    }
  }

  warmSamples.sort((a, b) => a - b);

  return {
    path,
    status: lastStatus,
    coldMs: cold?.ms ?? null,
    p50Ms: percentile(warmSamples, 50),
    p95Ms: percentile(warmSamples, 95),
    bytes: cold?.bytes ?? null,
    headers: lastHeaders,
    okCount,
    runs,
    error: okCount === 0 ? errorMessage : null,
  };
}

/** 엔드포인트 단위 동시성 K로 작업을 처리하는 간단한 워커 풀(외부 의존성 없음). */
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    for (;;) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length) || 1;
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

function renderTable(rows, columns) {
  const widths = columns.map((col) =>
    Math.max(col.header.length, ...rows.map((row) => String(row[col.key] ?? "").length))
  );
  const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join("  ");

  const lines = [
    line(columns.map((col) => col.header)),
    widths.map((w) => "-".repeat(w)).join("  "),
    ...rows.map((row) => line(columns.map((col) => row[col.key] ?? "-"))),
  ];
  return lines.join("\n");
}

function buildSummaryRow(result) {
  return {
    경로: result.path,
    상태: result.error ? "ERR" : String(result.status ?? "-"),
    "콜드(ms)": formatMs(result.coldMs),
    "p50(ms)": formatMs(result.p50Ms),
    "p95(ms)": formatMs(result.p95Ms),
    바이트: formatBytes(result.bytes),
    "캐시 헤더": result.headers ? cacheHeaderSummary(result.headers) : (result.error ?? "-"),
  };
}

function rankMs(result) {
  return result.p95Ms ?? result.coldMs ?? Number.POSITIVE_INFINITY;
}

function printHumanReport({ baseUrl, cookieProvided, runs, concurrency, results, totalMs }) {
  console.log("=== 어드민 API 응답시간 측정 ===");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Cookie: ${cookieProvided ? "설정됨" : "없음 — 인증 필요 엔드포인트는 401/403이 예상됩니다"}`);
  console.log(`Runs: ${runs}  Concurrency: ${concurrency}  Endpoints: ${results.length}개`);
  console.log("");

  const columns = [
    { key: "경로", header: "경로" },
    { key: "상태", header: "상태" },
    { key: "콜드(ms)", header: "콜드(ms)" },
    { key: "p50(ms)", header: "p50(ms)" },
    { key: "p95(ms)", header: "p95(ms)" },
    { key: "바이트", header: "바이트" },
    { key: "캐시 헤더", header: "캐시 헤더(x-vercel-cache cache-control server-timing)" },
  ];
  console.log(renderTable(results.map(buildSummaryRow), columns));
  console.log("");

  const measured = results.filter((r) => !r.error);
  const slowest = [...measured].sort((a, b) => rankMs(b) - rankMs(a)).slice(0, SLOWEST_COUNT);
  if (slowest.length > 0) {
    console.log(`가장 느린 ${slowest.length}개 (p95 기준, 없으면 콜드):`);
    console.log(renderTable(slowest.map(buildSummaryRow), columns));
    console.log("");
  }

  console.log(`총 소요 시간: ${formatMs(totalMs)}ms (엔드포인트 ${results.length}개)`);

  const authIssues = results.filter((r) => r.status === 401 || r.status === 403);
  if (authIssues.length > 0) {
    console.log("");
    console.log(
      `[안내] ${authIssues.length}개 엔드포인트가 401/403을 반환했습니다. 브라우저에서 관리자로 ` +
        "로그인한 뒤 개발자도구 Network 탭에서 해당 요청의 Cookie 헤더 값을 복사해 " +
        "ADMIN_COOKIE 환경변수(또는 --cookie=)로 넘기세요."
    );
  }

  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    console.log("");
    console.log(`[오류] ${failed.length}개 엔드포인트에 연결하지 못했습니다:`);
    for (const r of failed) console.log(`  - ${r.path}: ${r.error}`);
  }
}

function toJsonResult({ baseUrl, cookieProvided, runs, concurrency, results, totalMs }) {
  const measured = results.filter((r) => !r.error);
  const slowest = [...measured].sort((a, b) => rankMs(b) - rankMs(a)).slice(0, SLOWEST_COUNT).map((r) => r.path);
  const authIssues = results.filter((r) => r.status === 401 || r.status === 403).map((r) => r.path);

  return {
    baseUrl,
    cookieProvided,
    ranAt: new Date().toISOString(),
    runs,
    concurrency,
    totalMs,
    endpoints: results,
    slowest,
    authIssues,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  const baseUrl = opts.baseUrl || process.env.ADMIN_BASE_URL || DEFAULT_BASE_URL;
  const cookie = opts.cookie || process.env.ADMIN_COOKIE || "";
  const endpoints = loadEndpoints(opts.endpointsFile);
  const headers = cookie ? { cookie } : undefined;

  const startedAt = performance.now();
  const results = await runPool(endpoints, opts.concurrency, (path) =>
    measureEndpoint(baseUrl, path, headers, opts.runs)
  );
  const totalMs = performance.now() - startedAt;

  const report = {
    baseUrl,
    cookieProvided: Boolean(cookie),
    runs: opts.runs,
    concurrency: opts.concurrency,
    results,
    totalMs,
  };

  if (opts.json) {
    console.log(JSON.stringify(toJsonResult(report), null, 2));
  } else {
    printHumanReport(report);
  }
}

main().catch((error) => {
  console.error(`에러: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
