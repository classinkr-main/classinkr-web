import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Design-token guard for components/admin/branch/ — DESIGN.md §2 팔레트 원칙의
// 코드 집행판. 세 가지를 잡는다:
//   (a) 확도 예외 파랑 #1E5DA8 — 확도(REV 3단) 맥락 밖 사용은 팔레트 위반.
//       SSOT는 lib/branch/confidence-tokens.ts (이 스크립트의 스캔 범위 밖이라
//       자동으로 예외 처리된다).
//   (b) Tailwind 기본 팔레트 유출 — rose-*/emerald-*/sky-* 클래스. 캐논
//       Danger(#B43E3E)/Success(#084734) 계열 hex 유틸로 대체해야 한다.
//   (c) 팀 아이덴티티 올리브 #7B8B36 — SSOT는 lib/branch/team-colors.ts
//       (역시 스캔 범위 밖이라 자동 예외).
//
// 기존 위반은 ALLOWLIST에 "상대경로:패턴" 단위로 명시해 통과시킨다(다른 파트
// 소유 파일이라 이번 웨이브에서 못 고친 것들 — 후속 웨이브 처리 대상).
// 신규 파일·신규 패턴 조합만 차단한다. 파일:패턴 단위 그랜드파더링이라, 이미
// 허용된 파일에 같은 패턴이 새로 추가돼도 이 스크립트는 못 잡는다 — 그런 파일은
// 소유 에이전트가 정리할 때 ALLOWLIST에서 빼는 것으로 좁혀나간다.

const SCAN_ROOT = "components/admin/branch";
const FILE_EXTS = new Set([".ts", ".tsx"]);

const PATTERNS = {
  "1E5DA8": {
    label: "확도 예외 파랑(#1E5DA8) — 확도 맥락(lib/branch/confidence-tokens.ts) 밖 사용",
    test: (line) => /#1E5DA8/i.test(line),
  },
  "rose-emerald-sky": {
    label: "Tailwind 기본 팔레트 유출(rose-/emerald-/sky-N) — 캐논 Danger/Success hex로 치환",
    test: (line) => /\b(rose|emerald|sky)-\d/.test(line),
  },
  "7B8B36": {
    label: "팀 아이덴티티 올리브(#7B8B36) — lib/branch/team-colors.ts 밖 리터럴",
    test: (line) => /#7B8B36/i.test(line),
  },
};

// 파일:패턴 단위 허용 목록 — 다른 파트 소유라 이번 웨이브에서 못 고친 기존 위반.
// (품질 웨이브 2 / 2026-07-17 시점 실측. 각 파일이 정리되면 여기서 제거할 것.)
const ALLOWLIST = new Set([
  // (a) 확도 예외 파랑 — 확도 맥락 밖 사용
  "SalesLedgerCharts.tsx:1E5DA8",
  "ledger/shared.tsx:1E5DA8",
  "sections/BranchKpiAccordion.tsx:1E5DA8",
  "sections/BranchRegionHeatmap.tsx:1E5DA8",
  "sections/BranchUpcomingDeals.tsx:1E5DA8",
  "sections/DealMixSection.tsx:1E5DA8",
  // (b) Tailwind 기본 팔레트 유출
  "SyncStatusBar.tsx:rose-emerald-sky",
  "sections/BranchKpiAccordion.tsx:rose-emerald-sky",
  "sections/BranchRegionHeatmap.tsx:rose-emerald-sky",
  "sections/CampaignsSection.tsx:rose-emerald-sky",
  // (c) 팀 아이덴티티 올리브
  "sections/BranchKpiAccordion.tsx:7B8B36",
  "sections/BranchPipelineKanban.tsx:7B8B36",
  "sections/DealMixSection.tsx:7B8B36",
]);

function listSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (FILE_EXTS.has(path.extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

/** 블록 주석(/* *\/)을 통째로 지우고, 줄 주석(//)을 잘라낸 "코드만" 텍스트로 정규화.
 *  "https://" 등 스킴 뒤 "//"는 보존한다(":" 바로 뒤 "//"는 자르지 않음). */
function stripComments(source) {
  const noBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlockComments
    .split("\n")
    .map((line) => line.replace(/(?<!:)\/\/.*$/, ""))
    .join("\n");
}

function main() {
  const files = listSourceFiles(SCAN_ROOT);
  const violations = [];

  for (const file of files) {
    const relPath = path.relative(SCAN_ROOT, file);
    const code = stripComments(readFileSync(file, "utf8"));
    const lines = code.split("\n");

    for (const [patternKey, pattern] of Object.entries(PATTERNS)) {
      const allowKey = `${relPath}:${patternKey}`;
      if (ALLOWLIST.has(allowKey)) continue;

      lines.forEach((line, idx) => {
        if (pattern.test(line)) {
          violations.push({
            file: relPath,
            lineNumber: idx + 1,
            patternKey,
            label: pattern.label,
          });
        }
      });
    }
  }

  if (violations.length > 0) {
    console.error("Design token guard failed — new violations in components/admin/branch/:");
    for (const v of violations) {
      console.error(`- ${v.file}:${v.lineNumber} [${v.patternKey}] ${v.label}`);
    }
    console.error(
      "\n이미 알려진 위반이면 scripts/check-design-tokens.mjs의 ALLOWLIST에 " +
        '"상대경로:패턴"으로 등록되어 있어야 통과합니다(단, 그 파일을 고칠 수 있는 소유 ' +
        "에이전트가 직접 처리하는 것이 우선). 새 코드라면 DESIGN.md 팔레트로 치환하세요."
    );
    process.exit(1);
  }

  console.log(
    `Design token guard passed (${files.length} files scanned in ${SCAN_ROOT}/, ` +
      `${ALLOWLIST.size} grandfathered allowlist entries).`
  );
}

main();
