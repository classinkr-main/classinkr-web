/**
 * validate-naver-dev.mjs
 *
 * Safety gate before applying developed Naver posts back to Supabase.
 *
 * 1. 이미지: data/_naver-dev/<slug>.md 의 이미지 경로·개수·순서가 data/_naver-pull/<slug>.md 와
 *    같아야 한다(alt 설명만 바뀔 수 있다). 모든 이미지가 public/ 아래에 실제로 있어야 한다.
 * 2. 표기(FAIL): 줄표(— –), 문장 속 " - ", 표 밖 화살표(→), 인용(>) 안의 "- " 목록(사이트에서
 *    하이픈이 그대로 보인다), 표 빈칸 "-", 이모지·체크 기호.
 * 3. 문체(WARN): "아니라" 과다, 형광펜·초록 강조 과다, 해요체 섞임, 요약 상자 위치.
 * 4. 메타(_meta.json): 줄표·화살표 금지, seoTitle 끝 브랜드 접미사 금지(사이트 title 템플릿이 붙인다).
 *
 * Usage:
 *   node scripts/validate-naver-dev.mjs              # 전체
 *   node scripts/validate-naver-dev.mjs --only=2026-03   # slug 에 문자열이 든 글만
 *   node scripts/validate-naver-dev.mjs --meta-dir=<dir>  # <dir>/<slug>.json 메타 조각을 우선 검사
 * Exit code 0 = no FAIL, 1 = FAIL 있음 (WARN 은 종료 코드에 영향 없음)
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const pullDir = join(projectRoot, "data", "_naver-pull");
const devDir = join(projectRoot, "data", "_naver-dev");

const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice("--only=".length) : "";
// 작업 중인 메타 조각(<dir>/<slug>.json)이 있으면 _meta.json 항목 대신 검사한다.
const metaDirArg = process.argv.find((arg) => arg.startsWith("--meta-dir="));
const META_DIR = metaDirArg ? metaDirArg.slice("--meta-dir=".length) : "";

// 맨 위 "3줄 요약" 상자를 두는 정보성 글(지원금·법령·보험·바우처).
const INFO_POST_PREFIXES = [
  "naver-2026-01-16-",
  "naver-2026-03-06-",
  "naver-2026-03-12-",
  "naver-2026-03-24-",
  "naver-2026-04-24-",
  "naver-2026-06-11-",
];

// Extract just the URL (inside the parens) from every ![alt](url ...) in order.
function imagePaths(md) {
  const out = [];
  const re = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  let m;
  while ((m = re.exec(md)) !== null) out.push(m[1]);
  return out;
}

function publicImagePathsOnDisk(md) {
  return imagePaths(md).map((p) => join(projectRoot, "public", p.replace(/^\//, "")));
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function withoutLinkTargets(line) {
  return line.replace(/\]\([^)]*\)/g, "]");
}

function stripQuotedSpeech(text) {
  return text.replace(/"[^"\n]*"/g, "").replace(/“[^”\n]*”/g, "").replace(/'[^'\n]*'/g, "").replace(/‘[^’\n]*’/g, "");
}

function styleProblems(slug, md) {
  const fails = [];
  const warns = [];
  const lines = md.split("\n");

  lines.forEach((raw, i) => {
    const line = withoutLinkTargets(raw);
    const at = `L${i + 1}`;
    if (/[—–]/.test(line)) fails.push(`${at} 줄표(— –): ${raw.trim().slice(0, 70)}`);
    const body = line.replace(/^\s*(?:>\s*)?(?:[-*]|\d+\.)\s+/, "");
    if (/\S\s-\s\S/.test(body) && !isTableRow(line)) fails.push(`${at} 문장 속 " - ": ${raw.trim().slice(0, 70)}`);
    if (/→/.test(line) && !isTableRow(line)) fails.push(`${at} 표 밖 화살표(→): ${raw.trim().slice(0, 70)}`);
    if (/^\s*>\s*[-*]\s/.test(line)) fails.push(`${at} 인용 안 "- " 목록(화면에 하이픈이 보임): ${raw.trim().slice(0, 70)}`);
    if (isTableRow(line) && /\|\s*-\s*\|/.test(line)) fails.push(`${at} 표 빈칸 "-" (없음으로): ${raw.trim().slice(0, 70)}`);
    if (/[\p{Extended_Pictographic}✔✋✅]/u.test(line)) fails.push(`${at} 이모지·기호: ${raw.trim().slice(0, 70)}`);
  });

  const prose = lines.filter((l) => !/^!\[/.test(l)).join("\n");
  const count = (re) => (prose.match(re) || []).length;
  const aniraCount = count(/아니라/g);
  if (aniraCount > 1) warns.push(`"아니라" ${aniraCount}회 (글당 1회 이하)`);
  const highlight = count(/==[^=\n]+==/g);
  if (highlight > 2) warns.push(`형광펜 ${highlight}개 (2개 이하)`);
  const green = count(/\{\{green:/g);
  if (green > 1) warns.push(`초록 강조 ${green}개 (1개 이하)`);
  const bold = count(/\*\*[^*\n]+\*\*/g);
  if (bold > 10) warns.push(`굵게 ${bold}개 (8개 안팎 권장)`);
  // "~해 보세요." 같은 권유는 합니다체 글에서도 자연스러우므로 뺀다.
  const haeyo = (stripQuotedSpeech(prose).match(/[가-힣](?<!세)요\.(?:\s|$)|죠[.?](?:\s|$)/g) || []).length;
  if (haeyo > 0) warns.push(`해요체 문장 끝 ${haeyo}곳 (합니다체로 통일)`);

  const isInfo = INFO_POST_PREFIXES.some((prefix) => slug.startsWith(prefix));
  const hasSummary = /^>\s*\*\*3줄 요약\*\*/m.test(md);
  if (isInfo && !hasSummary) warns.push("정보성 글인데 3줄 요약 상자가 없음");
  if (!isInfo && hasSummary) warns.push("칼럼형 글에 3줄 요약 상자가 남아 있음");
  if (!/^원문: \[네이버 블로그\]\(https:\/\/blog\.naver\.com\//m.test(md)) fails.push("원문 링크 줄 없음");

  return { fails, warns };
}

function metaProblems(meta) {
  const fails = [];
  const text = JSON.stringify(meta);
  if (/[—–→]/.test(text)) fails.push("메타에 줄표·화살표");
  if (/\|\s*(ClassIn|Classin|클래스인)\s*$/.test(meta.seoTitle ?? "")) fails.push(`seoTitle 끝 브랜드 접미사(사이트가 자동으로 붙임): ${meta.seoTitle}`);
  return fails;
}

const slugs = readdirSync(devDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.replace(/\.md$/, ""))
  .filter((slug) => !ONLY || slug.includes(ONLY))
  .sort();

const metaPath = join(devDir, "_meta.json");
const metaList = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : [];
const slugToMeta = new Map(metaList.map((m) => [m.slug, m]));

let failures = 0;
let warnings = 0;
let missingFiles = 0;

for (const slug of slugs) {
  const pullPath = join(pullDir, `${slug}.md`);
  const devPath = join(devDir, `${slug}.md`);
  if (!existsSync(pullPath)) {
    console.warn(`[skip] no source for ${slug}`);
    continue;
  }
  const devMd = readFileSync(devPath, "utf8");
  const src = imagePaths(readFileSync(pullPath, "utf8"));
  const dev = imagePaths(devMd);
  const problems = [];

  const same = src.length === dev.length && src.every((p, i) => p === dev[i]);
  if (!same) {
    problems.push(`이미지 경로가 원문과 다름 (src=${src.length} dev=${dev.length})`);
    const maxLen = Math.max(src.length, dev.length);
    for (let i = 0; i < maxLen; i++) {
      if (src[i] !== dev[i]) problems.push(`   [${i}] src=${src[i] ?? "(없음)"}  dev=${dev[i] ?? "(없음)"}`);
    }
  }
  const broken = publicImagePathsOnDisk(devMd).filter((p) => !existsSync(p));
  if (broken.length) {
    missingFiles += broken.length;
    problems.push(`이미지 파일 없음 ${broken.length}개`);
    broken.forEach((p) => problems.push(`   missing: ${p}`));
  }

  const style = styleProblems(slug, devMd);
  problems.push(...style.fails);
  const metaPartPath = META_DIR ? join(META_DIR, `${slug}.json`) : "";
  const meta = metaPartPath && existsSync(metaPartPath)
    ? JSON.parse(readFileSync(metaPartPath, "utf8"))
    : slugToMeta.get(slug);
  if (meta) problems.push(...metaProblems(meta));
  else style.warns.push("_meta.json 항목 없음");

  if (problems.length) {
    failures += 1;
    console.error(`[FAIL] ${slug}`);
    problems.forEach((p) => console.error(`   ${p}`));
  } else {
    console.log(`[ok]   ${slug}: images ${dev.length}`);
  }
  if (style.warns.length) {
    warnings += 1;
    style.warns.forEach((w) => console.warn(`   [warn] ${w}`));
  }
}

console.log(`\n[summary] dev files=${slugs.length} failures=${failures} warned=${warnings} missing-on-disk=${missingFiles}`);
process.exit(failures > 0 ? 1 : 0);
