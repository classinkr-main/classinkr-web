/**
 * fix-blog-headings.mjs
 *
 * 임포트된 ClassIn 블로그 글의 마크다운 헤딩 구조 정리
 *  1) 빈 ## 라인 제거
 *  2) H2 가 전혀 없고 H3 만 있는 글: H3 → H2 승격 (메인 섹션 역할)
 *  3) 헤딩이 하나도 없는 글: Gemini 호출해서 본문 분석 후 H2 추가
 *
 * 실행:
 *   node --env-file=.env.local scripts/fix-blog-headings.mjs --dry
 *   node --env-file=.env.local scripts/fix-blog-headings.mjs --only=<slug>
 *   node --env-file=.env.local scripts/fix-blog-headings.mjs
 *
 * 안전장치: --dry 모드는 변경된 마크다운을 stdout 으로만 출력. DB 쓰기 없음.
 */

import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const args = new Set(process.argv.slice(2));
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY_SLUG = onlyArg ? onlyArg.slice("--only=".length) : null;
const DRY_RUN = args.has("--dry");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const geminiKey = process.env.CLASSIN_GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("[err] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 누락");
  process.exit(1);
}
if (!geminiKey) {
  console.error("[err] CLASSIN_GEMINI_API_KEY 누락");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const gemini = new GoogleGenerativeAI(geminiKey);

/* ─── 결정적 변환 ─── */
function deterministicFix(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  // 1) 빈 H2 / H3 라인 제거
  const cleaned = lines.filter((l) => {
    const t = l.trim();
    if (/^##\s*$/.test(t)) return false;
    if (/^###\s*$/.test(t)) return false;
    return true;
  });

  const h2Count = cleaned.filter((l) => /^## /.test(l)).length;
  const h3Count = cleaned.filter((l) => /^### /.test(l)).length;

  // 2) H2 없고 H3 만 있을 때 → H3 를 H2 로 승격
  let promoted = false;
  const out = cleaned.map((l) => {
    if (h2Count === 0 && h3Count > 0 && /^### /.test(l)) {
      promoted = true;
      return l.replace(/^### /, "## ");
    }
    return l;
  });

  // 3) 연속 빈 줄 정리
  const compact = [];
  let blank = 0;
  for (const l of out) {
    if (l.trim() === "") {
      blank += 1;
      if (blank <= 1) compact.push("");
    } else {
      blank = 0;
      compact.push(l);
    }
  }

  return {
    markdown: compact.join("\n").trim() + "\n",
    h2Count: h2Count + (promoted ? h3Count : 0),
    h3Count: promoted ? 0 : h3Count,
    promoted,
  };
}

/* ─── Gemini 로 H2 헤딩 추가 ─── */
async function addHeadingsViaAi(title, markdown) {
  const model = gemini.getGenerativeModel({
    model: "gemini-2.5-pro",
    generationConfig: { temperature: 0.2 },
  });

  const prompt = `다음은 한국어 블로그 글의 마크다운 본문입니다. 글에 섹션 헤딩이 없거나 부족합니다.
당신의 역할은 **본문 텍스트는 한 글자도 변경하지 않고**, 자연스러운 위치에 \`## 섹션 제목\` 헤딩 3~5개를 삽입하는 것입니다.

규칙:
- 절대로 원문 텍스트, 이미지(\`![](...)\`), 링크, 강조(\`**...**\`)를 수정하거나 삭제하지 마세요.
- 새 문장을 만들지 마세요. 헤딩 텍스트는 짧고 (10~25자) 본문 내용을 요약해야 합니다.
- 각 헤딩은 빈 줄 한 칸 위/아래에 배치하세요.
- 첫 헤딩은 도입부(intro) 뒤에 배치하세요.
- 결과는 수정된 마크다운 전체만 출력하세요. 코드 블록(\`\`\`) 으로 감싸지 마세요.

제목: ${title}

본문:
${markdown}`;

  const res = await model.generateContent(prompt);
  let text = res.response.text();
  // 안전: 만약 코드 블록으로 감싸져 오면 벗기기
  text = text.replace(/^```(?:markdown)?\s*\n/, "").replace(/\n```\s*$/, "");
  return text.trim() + "\n";
}

/* ─── 본문 보존 검증 ─── */
function verifyContentPreserved(before, after) {
  // 헤딩 라인 모두 제거 후 비교 → 같아야 함
  const strip = (s) =>
    s
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        // 빈 헤딩 라인(`##`, `### ` 등)도 제거 비교에서 무시
        return !/^#{1,6}(\s|$)/.test(t);
      })
      .join("\n")
      .replace(/\s+/g, " ")
      .trim();
  const a = strip(before);
  const b = strip(after);
  return { ok: a === b, beforeLen: a.length, afterLen: b.length };
}

async function main() {
  console.log(`[mode] ${DRY_RUN ? "DRY-RUN" : "WRITE"}${ONLY_SLUG ? ` only=${ONLY_SLUG}` : ""}`);

  const { data: posts, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, content_markdown")
    .eq("author_name", "Wooyoon Park");
  if (error) {
    console.error("[err]", error.message);
    process.exit(1);
  }

  let touched = 0;
  let aiCalls = 0;

  for (const p of posts) {
    if (ONLY_SLUG && p.slug !== ONLY_SLUG) continue;

    const before = p.content_markdown || "";
    const det = deterministicFix(before);
    let next = det.markdown;

    const finalHasH2 = /^## /m.test(next);

    let usedAi = false;
    if (!finalHasH2) {
      console.log(`[ai] ${p.slug} — 헤딩 없음, Gemini 호출`);
      try {
        next = await addHeadingsViaAi(p.title, next);
        aiCalls += 1;
        usedAi = true;
      } catch (e) {
        console.warn(`   ! AI 실패: ${e.message}`);
      }
    }

    const verify = verifyContentPreserved(before, next);
    if (!verify.ok) {
      console.warn(
        `[skip] ${p.slug} — 본문 변형 감지 (before=${verify.beforeLen}, after=${verify.afterLen}). 안전상 건너뜀.`
      );
      continue;
    }

    if (next.trim() === before.trim()) {
      console.log(`[same] ${p.slug} — 변경 없음`);
      continue;
    }

    const h2 = (next.match(/^## /gm) || []).length;
    const h3 = (next.match(/^### /gm) || []).length;
    console.log(`[fix] ${p.slug} — H2:${h2} H3:${h3}${usedAi ? " (AI)" : ""}`);

    if (DRY_RUN) {
      console.log(`---- ${p.slug} 변경된 헤딩 ----`);
      next.split("\n").filter((l) => /^#{2,3}\s/.test(l)).forEach((l) => console.log("  " + l));
      continue;
    }

    const { error: upErr } = await supabase
      .from("blog_posts")
      .update({ content_markdown: next })
      .eq("id", p.id);
    if (upErr) {
      console.error(`   [err] update 실패:`, upErr.message);
      continue;
    }
    touched += 1;
  }

  console.log(`\n[done] 갱신 ${touched}, AI 호출 ${aiCalls}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
