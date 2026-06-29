/**
 * validate-naver-dev.mjs
 *
 * Safety gate before applying developed Naver posts back to Supabase.
 * For every data/_naver-dev/<slug>.md, confirm the image set (paths + count + order)
 * is IDENTICAL to data/_naver-pull/<slug>.md. Only captions (alt text) may differ.
 *
 * Usage: node scripts/validate-naver-dev.mjs
 * Exit code 0 = all good, 1 = mismatches found.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const pullDir = join(projectRoot, "data", "_naver-pull");
const devDir = join(projectRoot, "data", "_naver-dev");

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

const slugs = readdirSync(devDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.replace(/\.md$/, ""));

let failures = 0;
let missingFiles = 0;

for (const slug of slugs) {
  const pullPath = join(pullDir, `${slug}.md`);
  const devPath = join(devDir, `${slug}.md`);
  if (!existsSync(pullPath)) {
    console.warn(`[skip] no source for ${slug}`);
    continue;
  }
  const src = imagePaths(readFileSync(pullPath, "utf8"));
  const dev = imagePaths(readFileSync(devPath, "utf8"));

  const same = src.length === dev.length && src.every((p, i) => p === dev[i]);
  // also verify every dev image resolves on disk
  const onDisk = publicImagePathsOnDisk(readFileSync(devPath, "utf8"));
  const broken = onDisk.filter((p) => !existsSync(p));

  if (!same) {
    failures += 1;
    console.error(`[FAIL] ${slug}: image paths differ (src=${src.length} dev=${dev.length})`);
    const maxLen = Math.max(src.length, dev.length);
    for (let i = 0; i < maxLen; i++) {
      if (src[i] !== dev[i]) console.error(`   [${i}] src=${src[i] ?? "—"}  dev=${dev[i] ?? "—"}`);
    }
  } else if (broken.length) {
    failures += 1;
    missingFiles += broken.length;
    console.error(`[FAIL] ${slug}: ${broken.length} image(s) not found on disk`);
    broken.forEach((p) => console.error(`   missing: ${p}`));
  } else {
    console.log(`[ok]   ${slug}: ${dev.length} images preserved`);
  }
}

console.log(`\n[summary] dev files=${slugs.length} failures=${failures} missing-on-disk=${missingFiles}`);
process.exit(failures > 0 ? 1 : 0);
