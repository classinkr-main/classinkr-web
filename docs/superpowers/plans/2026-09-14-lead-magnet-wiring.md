# 리드마그넷 연결 작업 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 녹화 가이드를 운영에 공개하고, 최근 블로그 글 2편에 자료를 붙이고, 자료 신청자 후속 메일 자동화 3건을 광고성 메일 요건을 갖춘 상태로 켠다.

**Architecture:** 코드 변경은 두 가지뿐이다 — 자료 1건만 넣는 삽입 스크립트(판정 로직은 순수 함수로 분리해 테스트)와 캠페인 메일 공용 푸터의 발신자 정보. 나머지는 운영 반영 절차다. 운영 DB 쓰기·배포·Vercel 키 입력은 자동 모드가 막거나 비밀정보라 사용자가 실행하고, 읽기 전용 확인은 에이전트가 한다.

**Tech Stack:** Node ESM 스크립트, Supabase JS, Next.js(App Router), Vitest, Resend

**스펙:** `docs/superpowers/specs/2026-09-14-lead-magnet-wiring-design.md`

**작업 전 주의**
- 작업트리를 다른 세션과 공유한다. 커밋은 항상 파일 경로를 지정해 `git add -- <path>`로만 하고, 커밋 전에 `git diff --cached --name-only`로 이번 태스크 파일만 올라갔는지 확인한다. `git add -A` 금지.
- 품질 게이트(typecheck·lint·build)는 작업트리 전체를 검사하므로 다른 세션의 미커밋 변경 때문에 실패할 수 있다. 실패하면 오류가 이번 태스크 파일에서 났는지 먼저 본다.

---

## 파일 구조

| 파일 | 역할 | 신규/수정 |
|---|---|---|
| `scripts/lib/lead-magnet-single-insert.mjs` | JSON 자료 목록·slug·DB 기존 행 → insert/skip/error 판정(순수) | 신규 |
| `tests/scripts/lead-magnet-single-insert.test.ts` | 판정 함수 테스트 | 신규 |
| `scripts/insert-lead-magnet.mjs` | 인자 파싱·DB 조회·삽입(얇은 실행부) | 신규 |
| `lib/email.ts` | `wrapCampaignHtml` 푸터에 발신자 정보 한 줄 | 수정 |
| `tests/email-campaign-footer.test.ts` | 푸터 발신자 정보·수신거부 링크 테스트 | 신규 |
| `tmp/email-templates-ad-label-20260914.mjs` | 템플릿 제목 "(광고)" 적용/복원 운영 스크립트 (gitignore) | 신규 |
| `tmp/db-probe-automation-live-20260914.mjs` | 자동화 실발송 확인 읽기 전용 프로브 (gitignore) | 신규 |

---

### Task 1: 단일 자료 삽입 판정 함수

**Files:**
- Create: `scripts/lib/lead-magnet-single-insert.mjs`
- Test: `tests/scripts/lead-magnet-single-insert.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/scripts/lead-magnet-single-insert.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { planSingleLeadMagnetInsert } from "../../scripts/lib/lead-magnet-single-insert.mjs"

const magnets = [
  { slug: "academy-system-checklist", title: "진단표", published: true },
  { slug: "new-guide", title: "신규 가이드", published: true },
  { slug: "hidden-guide", title: "비공개 가이드", published: false },
]

describe("planSingleLeadMagnetInsert", () => {
  it("DB에 없으면 JSON 항목 그대로 insert 행을 만든다", () => {
    expect(planSingleLeadMagnetInsert(magnets, "new-guide", null)).toEqual({
      action: "insert",
      slug: "new-guide",
      row: { slug: "new-guide", data: magnets[1], published: true },
    })
  })

  it("published 가 true 가 아니면 false 로 넣는다", () => {
    expect(planSingleLeadMagnetInsert(magnets, "hidden-guide", null)).toMatchObject({
      action: "insert",
      row: { published: false },
    })
  })

  it("DB에 이미 있으면 어드민 수정본을 덮어쓰지 않고 skip 한다", () => {
    const existing = {
      slug: "academy-system-checklist",
      data: { slug: "academy-system-checklist", title: "어드민 수정본" },
      published: true,
    }
    expect(planSingleLeadMagnetInsert(magnets, "academy-system-checklist", existing)).toEqual({
      action: "skip",
      reason: "exists",
      slug: "academy-system-checklist",
    })
  })

  it("JSON에 없는 slug 는 not-found 오류", () => {
    expect(planSingleLeadMagnetInsert(magnets, "missing-guide", null)).toEqual({
      action: "error",
      reason: "not-found",
      slug: "missing-guide",
    })
  })

  it("JSON에 같은 slug 가 둘 이상이면 duplicate 오류", () => {
    const duplicated = [...magnets, { slug: "new-guide", title: "중복", published: true }]
    expect(planSingleLeadMagnetInsert(duplicated, "new-guide", null)).toEqual({
      action: "error",
      reason: "duplicate",
      slug: "new-guide",
    })
  })

  it("자료 목록이 배열이 아니면 TypeError", () => {
    expect(() => planSingleLeadMagnetInsert({}, "new-guide", null)).toThrow(TypeError)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/scripts/lead-magnet-single-insert.test.ts`
Expected: FAIL — `Failed to load url ../../scripts/lib/lead-magnet-single-insert.mjs` (또는 모듈을 찾을 수 없음)

- [ ] **Step 3: 최소 구현**

`scripts/lib/lead-magnet-single-insert.mjs`:

```js
import { buildLeadMagnetImportPlan } from "./lead-magnets-import-plan.mjs";

/**
 * data/lead-magnets.json 중 slug 1건만 lead_magnets 에 넣을지 판정한다(순수).
 * DB에 이미 있으면 어드민 편집본을 보호하기 위해 절대 덮어쓰지 않는다.
 *
 * @returns {{ action: "insert", slug: string, row: { slug: string, data: object, published: boolean } }
 *   | { action: "skip", reason: "exists", slug: string }
 *   | { action: "error", reason: "not-found" | "duplicate" | "invalid", slug: string }}
 */
export function planSingleLeadMagnetInsert(magnets, slug, existingRow = null) {
  if (!Array.isArray(magnets)) {
    throw new TypeError("data/lead-magnets.json 최상위는 배열이어야 합니다.");
  }

  const matches = magnets.filter((magnet) => magnet?.slug === slug);
  if (matches.length === 0) return { action: "error", reason: "not-found", slug };
  if (matches.length > 1) return { action: "error", reason: "duplicate", slug };

  const [item] = matches;
  const plan = buildLeadMagnetImportPlan([item], existingRow ? [existingRow] : []);
  if (plan.valid !== 1) return { action: "error", reason: "invalid", slug };

  if (existingRow) return { action: "skip", reason: "exists", slug };

  return {
    action: "insert",
    slug,
    row: { slug, data: item, published: item.published === true },
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/scripts/lead-magnet-single-insert.test.ts tests/scripts/lead-magnets-import-plan.test.ts`
Expected: PASS — 신규 6건 + 기존 import-plan 테스트 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add -- scripts/lib/lead-magnet-single-insert.mjs tests/scripts/lead-magnet-single-insert.test.ts
git diff --cached --name-only   # 위 2개만 나와야 한다
git commit -m "feat(lead-magnets): 자료 1건 삽입 판정 함수 — 기존 행은 덮어쓰지 않음"
```

---

### Task 2: 단일 자료 삽입 스크립트

**Files:**
- Create: `scripts/insert-lead-magnet.mjs`

- [ ] **Step 1: 스크립트 작성**

`scripts/insert-lead-magnet.mjs`:

```js
/**
 * insert-lead-magnet.mjs
 * data/lead-magnets.json 의 자료 1건만 Supabase lead_magnets 에 삽입한다.
 * 이미 DB에 있으면 덮어쓰지 않고 종료한다(어드민 편집본 보호). 전량 upsert 는 import-lead-magnets.mjs.
 *
 * 실행:
 *   node --env-file=.env.local scripts/insert-lead-magnet.mjs --slug <slug> --dry-run
 *   node --env-file=.env.local scripts/insert-lead-magnet.mjs --slug <slug>
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { planSingleLeadMagnetInsert } from "./lib/lead-magnet-single-insert.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, "../data/lead-magnets.json");

const argv = process.argv.slice(2);
let slug;
let dryRun = false;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === "--dry-run") {
    dryRun = true;
  } else if (arg === "--slug") {
    slug = argv[i + 1];
    i += 1;
  } else {
    console.error(`지원하지 않는 옵션입니다: ${arg}`);
    process.exit(1);
  }
}

if (!slug || slug.startsWith("--")) {
  console.error("--slug <slug> 가 필요합니다.");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const magnets = JSON.parse(readFileSync(dataPath, "utf8"));

const { data: existing, error: readError } = await supabase
  .from("lead_magnets")
  .select("slug, data, published")
  .eq("slug", slug)
  .maybeSingle();

if (readError) {
  console.error("조회 실패:", readError.message);
  process.exit(1);
}

const plan = planSingleLeadMagnetInsert(magnets, slug, existing ?? null);

if (plan.action === "error") {
  console.error(`중단 — ${slug}: ${plan.reason}`);
  process.exit(1);
}

if (plan.action === "skip") {
  console.error(`건너뜀 — ${slug} 는 이미 DB에 있습니다(덮어쓰지 않음).`);
  process.exit(1);
}

if (dryRun) {
  console.log("[insert-lead-magnet:dry-run] read-only preview — DB 쓰기 없음");
  console.log(JSON.stringify({ action: plan.action, slug, published: plan.row.published }, null, 2));
  process.exit(0);
}

const { error: insertError } = await supabase.from("lead_magnets").insert(plan.row);
if (insertError) {
  console.error("삽입 실패:", slug, "—", insertError.message);
  process.exit(1);
}

console.log(`삽입 완료: ${slug} (published=${plan.row.published})`);
```

- [ ] **Step 2: 인자 오류 경로 확인 (DB 접근 전 종료)**

Run: `node --env-file=.env.local scripts/insert-lead-magnet.mjs; echo "exit=$?"`
Expected: `--slug <slug> 가 필요합니다.` / `exit=1`

Run: `node --env-file=.env.local scripts/insert-lead-magnet.mjs --slug x --force; echo "exit=$?"`
Expected: `지원하지 않는 옵션입니다: --force` / `exit=1`

- [ ] **Step 3: 운영 DB 읽기 전용 미리보기**

Run: `node --env-file=.env.local scripts/insert-lead-magnet.mjs --slug classroom-recording-replay-setup-guide --dry-run; echo "exit=$?"`
Expected:
```
[insert-lead-magnet:dry-run] read-only preview — DB 쓰기 없음
{
  "action": "insert",
  "slug": "classroom-recording-replay-setup-guide",
  "published": true
}
exit=0
```

Run: `node --env-file=.env.local scripts/insert-lead-magnet.mjs --slug academy-system-checklist --dry-run; echo "exit=$?"`
Expected: `건너뜀 — academy-system-checklist 는 이미 DB에 있습니다(덮어쓰지 않음).` / `exit=1`

- [ ] **Step 4: 커밋**

```bash
git add -- scripts/insert-lead-magnet.mjs
git diff --cached --name-only   # 1개만
git commit -m "feat(lead-magnets): 자료 1건만 넣는 운영 스크립트 (insert-lead-magnet)"
```

---

### Task 3: 캠페인 메일 푸터 발신자 정보

**Files:**
- Modify: `lib/email.ts` (상수는 `RESEND_FROM` 선언 아래 59행 부근, 푸터는 `wrapCampaignHtml` 안 100행 부근)
- Test: `tests/email-campaign-footer.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/email-campaign-footer.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest"

async function loadEmail() {
  vi.resetModules()
  vi.doMock("@/lib/resend", () => ({ resend: null }))
  return import("@/lib/email")
}

describe("wrapCampaignHtml footer", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/resend")
    vi.resetModules()
  })

  it("모든 캠페인 메일 하단에 발신자 회사명·주소·전화·이메일을 넣는다", async () => {
    const { wrapCampaignHtml } = await loadEmail()
    const html = wrapCampaignHtml("<p>본문</p>")

    expect(html).toContain("이이오클래스인코리아 유한회사")
    expect(html).toContain("서울특별시 양천구 목동동로 233-1, 8층 806호")
    expect(html).toContain("02-6958-8566")
    expect(html).toContain("classinkr@classin.com")
  })

  it("수신거부 URL 이 있으면 링크를 그대로 유지한다", async () => {
    const { wrapCampaignHtml } = await loadEmail()
    const url = "https://classin.co.kr/api/newsletter/unsubscribe?token=abc"
    const html = wrapCampaignHtml("<p>본문</p>", url)

    expect(html).toContain(`href="${url}"`)
    expect(html).toContain("수신거부")
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/email-campaign-footer.test.ts`
Expected: FAIL — 첫 테스트 `expected ... to contain '이이오클래스인코리아 유한회사'`, 두 번째 테스트는 PASS

- [ ] **Step 3: 구현**

`lib/email.ts` — `const RESEND_FROM = ...` 줄 바로 아래에 추가:

```ts
/** 광고성 메일 발신자 정보 — 공개 사이트 푸터(components/sections/Footer.tsx)와 같은 값을 쓴다. */
const CAMPAIGN_SENDER_INFO =
  "이이오클래스인코리아 유한회사 · 서울특별시 양천구 목동동로 233-1, 8층 806호 (목동, 드림타워) · 02-6958-8566 · classinkr@classin.com"
```

`wrapCampaignHtml`의 푸터에서:

```ts
      <p style="margin:0">Classin Korea · classin.co.kr</p>
      ${footer}
```

를 다음으로 교체:

```ts
      <p style="margin:0">Classin Korea · classin.co.kr</p>
      <p style="margin:4px 0 0">${CAMPAIGN_SENDER_INFO}</p>
      ${footer}
```

- [ ] **Step 4: 통과 확인 + 이메일 관련 기존 테스트**

Run: `npx vitest run tests/email-campaign-footer.test.ts tests/email-delivery-configuration.test.ts tests/api/admin-email-send.test.ts`
Expected: PASS 전부

- [ ] **Step 5: 커밋**

```bash
git add -- lib/email.ts tests/email-campaign-footer.test.ts
git diff --cached --name-only   # 2개만
git commit -m "fix(email): 캠페인 메일 푸터에 발신자 회사 정보 추가 — 광고성 메일 요건"
```

---

### Task 4: 템플릿 제목 "(광고)" 운영 스크립트

**Files:**
- Create: `tmp/email-templates-ad-label-20260914.mjs` (tmp/ 는 gitignore — 커밋 없음)

- [ ] **Step 1: 스크립트 작성**

`tmp/email-templates-ad-label-20260914.mjs`:

```js
// 후속 메일 템플릿 제목 앞 "(광고)" 적용/복원 (프로덕션). 사용:
//   node tmp/email-templates-ad-label-20260914.mjs status                  # 현재 제목만 출력(읽기 전용)
//   node tmp/email-templates-ad-label-20260914.mjs apply                   # 3일·7일 후 메일 2건에 적용
//   node tmp/email-templates-ad-label-20260914.mjs apply --include-first   # 신청 즉시 메일까지 3건
//   node tmp/email-templates-ad-label-20260914.mjs revert                  # 백업 제목으로 복원
import { createClient } from "@supabase/supabase-js"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const v = m[2].trim().replace(/^["']|["']$/g, "")
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
}
const FIRST = "524a4c91-0c57-47b2-89da-fafa69c327ae" // 자료 신청 즉시 발송
const FOLLOW_UPS = [
  "b95a41d5-5c2d-49fd-b93a-5b6931db4cab", // 3일 후 병목 해석
  "164ffe06-6bcd-4ee8-be8e-3a165ecf8bb6", // 7일 후 상담 전환
]
const BACKUP = "tmp/email-templates-subject-backup-20260914.json"
const LABEL = "(광고) "
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const mode = process.argv[2] || "status"
const ids = process.argv.includes("--include-first") ? [FIRST, ...FOLLOW_UPS] : FOLLOW_UPS
const allIds = [FIRST, ...FOLLOW_UPS]

const { data: rows, error } = await sb.from("email_templates").select("id,name,subject").in("id", allIds)
if (error) { console.error(error.message); process.exit(1) }
console.log("현재:")
for (const r of rows) console.log(" ", r.id.slice(0, 8), "|", r.subject)
if (mode === "status") process.exit(0)

if (mode === "apply") {
  if (!existsSync(BACKUP)) {
    writeFileSync(BACKUP, JSON.stringify(rows, null, 2))
    console.log("백업:", BACKUP)
  }
  for (const r of rows.filter((row) => ids.includes(row.id))) {
    if (r.subject.startsWith("(광고)")) { console.log("  이미 표기:", r.id.slice(0, 8)); continue }
    const { error: e } = await sb.from("email_templates").update({ subject: LABEL + r.subject }).eq("id", r.id)
    if (e) { console.error("  실패:", r.id.slice(0, 8), e.message); process.exitCode = 1 } else console.log("  적용:", r.id.slice(0, 8))
  }
} else if (mode === "revert") {
  if (!existsSync(BACKUP)) { console.error("백업 없음:", BACKUP); process.exit(1) }
  for (const b of JSON.parse(readFileSync(BACKUP, "utf8"))) {
    const { error: e } = await sb.from("email_templates").update({ subject: b.subject }).eq("id", b.id)
    if (e) { console.error("  실패:", b.id.slice(0, 8), e.message); process.exitCode = 1 } else console.log("  복원:", b.id.slice(0, 8))
  }
} else {
  console.error("unknown mode"); process.exit(1)
}
```

- [ ] **Step 2: 읽기 전용 상태 확인**

Run: `node tmp/email-templates-ad-label-20260914.mjs status`
Expected:
```
현재:
  524a4c91 | {name}님, 요청하신 Classin 자료를 보내드립니다
  b95a41d5 | 0점이 몰린 영역, 어디부터 손대면 될까요?
  164ffe06 | 전체를 바꾸지 않아도 됩니다. 1개 반 파일럿부터
```
(행 순서는 다를 수 있다)

---

### Task 5: 품질 게이트

- [ ] **Step 1: 전체 게이트**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 세 명령 모두 종료 코드 0.
- `pages-manifest ENOENT` → `rm -rf .next` 후 build 재실행.
- content-visibility 체크 실패 → 다른 세션 `.next` 경합일 수 있으니 한 번 재실행.
- 타입·린트 오류가 Task 1~3 파일이 아닌 곳에서 나면 다른 세션 미커밋 변경이다 — 사용자에게 보고하고 이 계획 파일만의 문제인지 구분한다.

- [ ] **Step 2: 관련 테스트 묶음**

Run: `npx vitest run tests/scripts tests/email-campaign-footer.test.ts tests/email-delivery-configuration.test.ts tests/api/admin-email-send.test.ts`
Expected: PASS 전부

- [ ] **Step 3: 푸시 여부를 사용자에게 확인**

운영 배포는 `hom_v4` 브랜치 기준이다(9/14 운영 배포 `fc341753`의 ref가 hom_v4). 푸시가 곧 운영 배포가 될 수 있으므로 **사용자 확인 후** `git push origin hom_v4`. Task 3 커밋이 운영에 반영돼야 Task 6의 자동화를 켤 수 있다.

---

### Task 6: 운영 반영 (사용자 실행 + 에이전트 읽기 확인)

순서가 중요하다. 6.1~6.3은 독립, 6.4~6.8은 순서대로.

- [ ] **6.1 녹화 가이드 삽입 (사용자)**

사용자 실행:
```bash
node --env-file=.env.local scripts/insert-lead-magnet.mjs --slug classroom-recording-replay-setup-guide
```
Expected: `삽입 완료: classroom-recording-replay-setup-guide (published=true)`

에이전트 확인:
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://classin.co.kr/resources/classroom-recording-replay-setup-guide
```
Expected: `200`. 허브 `/resources` 목록은 최대 1시간 뒤 반영. 바로 필요하면 사용자가 `/admin/lead-magnets`에서 해당 자료를 열어 변경 없이 저장(허브·상세·블로그 경로 재검증).

- [ ] **6.2 최근 공개 글 2편에 자료 지정 (사용자, 어드민)**

`/admin/blog`에서 두 글을 열어 리드 마그넷 칸 지정 후 저장(저장 시 `/blog/<slug>` 재검증됨):

| 글 | 리드 마그넷 |
|---|---|
| 최대 500만원 지원! 국민내일배움카드 신청 가이드 | academy-system-checklist |
| 2026 Asia AI Education Forum in Busan | academy-case-match-brief |

에이전트 확인:
```bash
curl -s https://classin.co.kr/blog/2026-asia-ai-education-forum-in-busan | grep -c '우리 학원 맞춤 도입 사례 매칭 브리프'
```
Expected: `1` 이상. 국민내일배움카드 글은 slug가 한글이므로 브라우저에서 글 하단 "우리 학원 수업 운영 누수 진단표" 게이트 블록 노출을 확인.

- [ ] **6.3 템플릿 제목 "(광고)" (사용자)**

기본(3일·7일 후 2건):
```bash
node tmp/email-templates-ad-label-20260914.mjs apply
```
신청 즉시 메일까지 붙이기로 결정했다면 `apply --include-first`.

에이전트 확인: `node tmp/email-templates-ad-label-20260914.mjs status` → 대상 제목이 `(광고) `로 시작.

- [ ] **6.4 Vercel 운영 키 입력 + 재배포 (사용자)**

Vercel 프로젝트 `classinkr-web` → Settings → Environment Variables → **Production**:
- `RESEND_API_KEY` = (Resend 키)
- `NEXT_PUBLIC_SITE_URL` = `https://classin.co.kr`

입력 후 **Task 3 커밋이 포함된 배포**로 재배포. `NEXT_PUBLIC_` 값은 빌드 때 박히므로 키 입력 뒤 새 빌드가 반드시 필요하다.

에이전트 확인(값은 출력하지 않고 이름만):
```bash
T=$(grep -E '^VERCEL_ACCESS_TOKEN=' .env.local | cut -d= -f2- | tr -d '"'"'"); \
curl -s -H "Authorization: Bearer $T" "https://api.vercel.com/v10/projects/classinkr-web/env" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const prod=(JSON.parse(s).envs||[]).filter(x=>(x.target||[]).includes("production"));for(const k of ["RESEND_API_KEY","NEXT_PUBLIC_SITE_URL"]){const e=prod.find(x=>x.key===k);console.log(k,e?"PRESENT updated "+new Date(e.updatedAt).toISOString():"missing")}})'; \
curl -s -H "Authorization: Bearer $T" "https://api.vercel.com/v6/deployments?app=classinkr-web&target=production&limit=1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s).deployments[0];console.log("latest prod deploy",new Date(d.created).toISOString(),d.state||d.readyState,(d.meta?.githubCommitSha||"").slice(0,8))})'
```
Expected: 두 키 `PRESENT`, 최신 운영 배포 생성 시각이 두 키의 `updated` 시각보다 뒤이고 상태 `READY`, 커밋이 Task 3 커밋을 포함(`git merge-base --is-ancestor <task3-sha> <deploy-sha>`).

- [ ] **6.5 자동화 켜기 (사용자)**

```bash
node tmp/automation-golive-20260902.mjs activate
```
Expected: 변경 후 3건 `active`.

- [ ] **6.6 실수신 테스트 (사용자)**

1. `https://classin.co.kr/resources/classroom-recording-replay-setup-guide`에서 본인 이메일로 자료 신청.
2. 받은편지함 확인: 즉시 메일 도착, 하단에 발신자 회사 정보 줄, "수신거부" 링크 존재.
3. 수신거부 링크는 테스트 주소가 구독 해지되므로 마지막에 한 번만 눌러 동작 확인.

- [ ] **6.7 발송 기록 확인 (에이전트, 읽기 전용)**

`tmp/db-probe-automation-live-20260914.mjs` 작성 후 실행:

```js
// READ-ONLY: 후속 메일 자동화 실발송 확인 — 개인정보 컬럼은 출력하지 않는다
import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "node:fs"
for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const v = m[2].trim().replace(/^["']|["']$/g, "")
    if (!(m[1] in process.env)) process.env[m[1]] = v
  }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const RULES = {
  "6444fb68-18df-430e-85bc-3a10dcad7bc9": "즉시",
  "5240022a-5bd7-409d-bc2d-4a5b30ebfeb2": "3일 후",
  "e21845d1-0bc6-4aa7-a5d7-f7178bee3a9f": "7일 후",
}
const PII = /email|name|phone|recipient/i
const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
for (const table of ["automation_logs", "automation_delay_queue"]) {
  const { data, error } = await sb.from(table).select("*").gte("created_at", since).limit(200)
  if (error) { console.log(table, "ERR", error.message); continue }
  console.log(`\n${table} (최근 24시간 ${data.length}행)`)
  for (const r of data) {
    const ruleId = r.rule_id ?? r.ruleId
    if (ruleId && !RULES[ruleId]) continue
    const safe = Object.fromEntries(Object.entries(r).filter(([k]) => !PII.test(k) && typeof r[k] !== "object"))
    console.log(" ", RULES[ruleId] ?? "-", JSON.stringify(safe))
  }
}
```

Run: `node tmp/db-probe-automation-live-20260914.mjs`
Expected: `automation_logs`에 즉시 룰 행 `status: "sent"`, `automation_delay_queue`에 3일 후·7일 후 룰 예약 행 각 1건.

- [ ] **6.8 실패 시 롤백 (사용자)**

증상(메일 미도착, 로그 `failed`, 수신거부 링크 없음) 중 하나라도 있으면:
```bash
node tmp/automation-golive-20260902.mjs pause
```
원인 확인 후 6.4부터 다시.

---

## 완료 기준 (스펙 대응)

- [ ] 운영 `lead_magnets` 14종, 녹화 가이드 상세 200·다운로드 동작 — Task 1·2·6.1
- [ ] 최근 공개 글 2편 게이트 노출 — Task 6.2
- [ ] 후속 메일 제목 "(광고)", 발신자 정보·수신거부 링크 포함 — Task 3·4·6.3
- [ ] 자동화 3건 active, 본인 수신 확인, 지연 큐 2건 — Task 6.4~6.7
- [ ] typecheck + lint + build 통과 — Task 5
