/**
 * import-naver-blog-posts.mjs
 *
 * Naver Blog(classinkorea) posts since 2025-12-05 -> local images + Supabase blog_posts.
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-naver-blog-posts.mjs --dry
 *   node --env-file=.env.local scripts/import-naver-blog-posts.mjs
 *   node --env-file=.env.local scripts/import-naver-blog-posts.mjs --update
 *
 * Imports as DRAFT so the public blog can review and publish later.
 */

import { createClient } from "@supabase/supabase-js";
import { JSDOM } from "jsdom";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, extname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const imageRootRel = "public/images/blog/naver";
const imageRootAbs = join(projectRoot, imageRootRel);
const imagePublicPrefix = "/images/blog/naver";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry");
const UPDATE_EXISTING = args.has("--update");
const sinceArg = process.argv.find((arg) => arg.startsWith("--since="));
const SINCE_DATE = sinceArg ? sinceArg.slice("--since=".length) : "2025-12-05";

const BLOG_ID = "classinkorea";
const LIST_URL =
  `https://blog.naver.com/PostTitleListAsync.naver?blogId=${BLOG_ID}` +
  "&viewdate=&currentPage=1&categoryNo=0&parentCategoryNo=0&countPerPage=30";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("[err] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY 누락");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ENTITY_MAP = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  hellip: "...",
  middot: "·",
};

const CATEGORY_MAP = {
  "1": "인사이트",
  "6": "인사이트",
  "7": "교육 트렌드",
  "9": "인사이트",
  "10": "제품 업데이트",
};

function decodeEntities(value = "") {
  return value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (match, name) => (ENTITY_MAP[name] === undefined ? match : ENTITY_MAP[name]));
}

function decodeNaverText(value = "") {
  try {
    return decodeEntities(decodeURIComponent(value.replace(/\+/g, "%20"))).trim();
  } catch {
    return decodeEntities(value.replace(/\+/g, " ")).trim();
  }
}

function cleanText(value = "") {
  return decodeEntities(value)
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeInlineText(value = "") {
  return decodeEntities(value)
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

function escapeMarkdownCell(value) {
  return cleanText(value).replace(/\|/g, "\\|");
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 82);
}

function parseNaverDate(value) {
  const match = value.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./);
  if (!match) throw new Error(`Invalid Naver date: ${value}`);
  const [, year, month, day] = match;
  const dateKey = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return {
    dateKey,
    // Noon UTC keeps the calendar date stable across UTC and Asia/Seoul renderers.
    iso: `${dateKey}T12:00:00.000Z`,
  };
}

function parseNaverJson(value) {
  return JSON.parse(value.replace(/\\'/g, "'"));
}

function estimateReadTime(markdown) {
  const text = markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/[#*_`>|\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${Math.max(1, Math.ceil(text.length / 650))}분`;
}

function firstSentences(markdown, maxLength = 185) {
  const text = markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+]\([^)]+\)/g, " ")
    .replace(/^#{2,3}\s+.*$/gm, " ")
    .replace(/^[-*]\s+/gm, " ")
    .replace(/^\d+\.\s+/gm, " ")
    .replace(/[>#*_`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  const candidate = text.slice(0, maxLength);
  const sentenceEnd = Math.max(candidate.lastIndexOf("."), candidate.lastIndexOf("?"), candidate.lastIndexOf("!"), candidate.lastIndexOf("다."));
  return `${candidate.slice(0, sentenceEnd > 70 ? sentenceEnd + 1 : maxLength - 1).trim()}…`;
}

function topicKind(title) {
  if (/지원|바우처|보험|의무|과태료|사업/.test(title)) return "policy";
  if (/전자칠판|Classin|클래스인|플랫폼|Zoom|줌/.test(title)) return "product";
  if (/퇴원율|명절|창업|운영|학원/.test(title)) return "operations";
  return "trend";
}

function targetReaderFor(title) {
  const kind = topicKind(title);
  if (kind === "policy") return "지원사업·제도 변화를 확인해야 하는 학원 원장·운영팀";
  if (kind === "product") return "온라인·하이브리드 수업 도구를 비교 중인 학원 원장·교육팀";
  if (kind === "operations") return "수업 품질과 운영 효율을 함께 개선하고 싶은 학원 운영자";
  return "교육 시장 변화와 수업 방식 전환을 살펴보는 교육자·학원 운영자";
}

function benefitItemsFor(title) {
  const kind = topicKind(title);
  if (kind === "policy") {
    return [
      "지원사업·제도 정보를 학원 운영 관점에서 빠르게 훑어볼 수 있습니다.",
      "신청 또는 적용 전에 확인해야 할 조건과 유의점을 정리할 수 있습니다.",
      "상담이나 내부 검토 전에 공식 안내를 다시 확인해야 할 지점을 구분할 수 있습니다.",
    ];
  }
  if (kind === "product") {
    return [
      "수업 도구를 기능 단위가 아니라 운영 흐름 기준으로 비교할 수 있습니다.",
      "판서, 녹화, 복습, 자료 관리가 어떻게 이어져야 하는지 확인할 수 있습니다.",
      "Classin 도입 상담 전에 우리 학원에 필요한 조건을 정리할 수 있습니다.",
    ];
  }
  if (kind === "operations") {
    return [
      "학원 운영에서 반복적으로 생기는 문제를 구조적으로 바라볼 수 있습니다.",
      "수업 품질과 관리 효율을 함께 높이기 위한 체크포인트를 얻을 수 있습니다.",
      "우리 학원 상황에 맞는 다음 실행 항목을 정리할 수 있습니다.",
    ];
  }
  return [
    "교육 시장 변화의 핵심 흐름을 짧게 파악할 수 있습니다.",
    "우리 학원 수업과 운영에 연결해 볼 질문을 얻을 수 있습니다.",
    "Classin 관점에서 기술 도입의 의미를 점검할 수 있습니다.",
  ];
}

function tagsFor(title, categoryNo) {
  const tags = ["네이버 블로그"];
  if (/AI|디지털/.test(title)) tags.push("AI 교육");
  if (/전자칠판/.test(title)) tags.push("전자칠판");
  if (/화상|온라인|Zoom|줌/.test(title)) tags.push("온라인 수업");
  if (/지원|바우처|보험|의무|과태료|사업/.test(title)) tags.push("학원 운영");
  if (/퇴원율|보강|창업/.test(title)) tags.push("운영 가이드");
  if (categoryNo === "10" && !tags.includes("전자칠판")) tags.push("하드웨어");
  return [...new Set(tags)].slice(0, 4);
}

function brandSummary(title) {
  const kind = topicKind(title);
  if (kind === "policy") {
    return [
      `이 글은 **${title}** 주제를 학원 운영자가 검토하기 쉬운 흐름으로 다시 정리합니다.`,
      "지원·제도 정보는 시점에 따라 바뀔 수 있으므로, 실제 신청 전에는 반드시 공식 안내를 다시 확인해야 합니다.",
      "Classin 도입 여부와 별개로, 운영팀이 체크해야 할 조건과 다음 액션을 분리해 보는 데 초점을 둡니다.",
    ];
  }
  if (kind === "product") {
    return [
      `이 글은 **${title}** 주제를 수업 전후 운영 흐름 관점에서 다시 정리합니다.`,
      "도구 선택의 기준은 단일 기능보다 판서, 녹화, 복습, 자료 관리가 하나의 흐름으로 이어지는지에 있습니다.",
      "Classin을 검토할 때 우리 학원의 수업 방식, 강사 운영, 학생 복습 경험을 함께 놓고 보면 판단이 쉬워집니다.",
    ];
  }
  if (kind === "operations") {
    return [
      `이 글은 **${title}** 주제를 학원 운영자가 바로 점검할 수 있게 다시 정리합니다.`,
      "운영 문제는 한 번의 캠페인보다 수업, 상담, 복습, 데이터 확인이 반복 가능한 구조로 이어질 때 개선됩니다.",
      "글을 읽은 뒤 우리 학원의 병목이 사람의 노력인지, 도구의 분산인지, 프로세스의 부재인지 나눠 보세요.",
    ];
  }
  return [
    `이 글은 **${title}** 주제를 Classin Home 독자에게 맞춰 다시 정리합니다.`,
    "교육 기술은 도입 자체보다 수업 경험과 운영 흐름을 어떻게 바꾸는지가 더 중요합니다.",
    "우리 학원에 적용 가능한 질문과 다음 검토 포인트를 중심으로 읽어보면 좋습니다.",
  ];
}

function prependBrandFrame(title, markdown) {
  const summary = brandSummary(title).map((item) => `- ${item}`).join("\n");
  return [
    "## 핵심 요약",
    "",
    summary,
    "",
    "## 원문 정리",
    "",
    markdown,
  ].join("\n");
}

function markdownInline(node) {
  if (node.nodeType === 3) return normalizeInlineText(node.textContent ?? "");
  if (node.nodeType !== 1) return "";

  const tag = node.tagName.toLowerCase();
  if (tag === "br") return "\n";

  const children = [...node.childNodes].map(markdownInline).join("");
  const text = cleanText(children);
  if (!text) return "";

  if (tag === "b" || tag === "strong") return `**${text}**`;
  if (tag === "i" || tag === "em") return `*${text}*`;
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    if (/^https?:\/\//i.test(href)) return `[${text}](${href})`;
  }
  return children;
}

function isEmptyText(value) {
  return !cleanText(value).replace(/[\u200b\s]/g, "");
}

function paragraphIsShortBold(paragraph) {
  const text = cleanText(paragraph.textContent ?? "");
  if (!text || text.length > 64) return false;
  const boldText = [...paragraph.querySelectorAll("b,strong")]
    .map((node) => cleanText(node.textContent ?? ""))
    .join(" ");
  return boldText && cleanText(boldText) === text;
}

function isNaverBoilerplateParagraph(value) {
  const text = cleanText(value);
  return (
    /^메이트\s*여러분\s*안녕하세요[~!,. ]*\s*클래스인입니다\.?$/i.test(text) ||
    /^안녕하세요[~!,. ]*\s*클래스인입니다\.?$/i.test(text) ||
    /^감사합니다\.?$/i.test(text)
  );
}

function stripNaverBoilerplatePrefix(value) {
  let text = cleanText(value);
  const classinName = String.raw`(?:\*\*)?클래스인(?:입니다)?(?:\*\*)?(?:입니다)?`;
  const suffix = String.raw`[~!,.，、:：;；\s\u{1f300}-\u{1faff}\ufe0f]*`;
  const patterns = [
    new RegExp(String.raw`^메이트\s*여러분[~!,.，、\s]*안녕하세요${suffix}${classinName}${suffix}`, "iu"),
    new RegExp(String.raw`^안녕하세요${suffix}메이트\s*여러분[~!,.，、\s]*${classinName}${suffix}`, "iu"),
    new RegExp(String.raw`^메이트\s*여러분[~!,.，、\s]*${classinName}${suffix}`, "iu"),
    new RegExp(String.raw`^안녕하세요${suffix}${classinName}${suffix}`, "iu"),
  ];
  for (const pattern of patterns) {
    text = text.replace(pattern, "").trim();
  }
  return text;
}

function mergeAdjacentBold(_match, left, right) {
  const noSpaceBefore = ["의", "은", "는", "이", "가", "을", "를", "와", "과", "로", "으로", "에", "에서", "도", "만", "까지", "부터", "처럼", "보다"].some((particle) =>
    right.startsWith(particle)
  );
  return `**${left}${noSpaceBefore ? "" : " "}${right}**`;
}

function sanitizeMarkdownArtifacts(value) {
  return value
    .replace(/([가-힣A-Za-z])\*\*(?=\s*(?:원장님|원장|대표님|대표|선생님|선생))/g, "$1OO")
    .replace(/\*최하단 인터뷰 링크 첨부/g, "(최하단 인터뷰 링크 첨부)")
    .replace(/\*\*([^*\n]+?)\*\*\*\*([^*\n]+?)\*\*/g, mergeAdjacentBold)
    .replace(/(^|\n)###\s+\*([^\n]+)/g, "$1### $2")
    .replace(/(^|\n)\*\*\*\s*하지만\s+(.+?)!\*\s*예\)/g, "$1- 다만 $2. 예)")
    .replace(/\s+\*이 구조를 통해서([^\n]+)/g, " (이 구조를 통해서$1)")
    .replace(/\*“([^”]+)”\*/g, "“$1”")
    .replace(/([가-힣A-Za-z0-9])\*([“"][^*\n]+?[”"])\*([가-힣A-Za-z0-9])/g, "$1 $2$3")
    .replace(/\*([“"][^*\n]+?[”"])\*/g, "$1")
    .replace(/\s+\*\((※[^*\n]+)\)\*/g, " ($1)")
    .replace(/(^|\n)\*\*\s+([^*\n]+?)\*($|\n)/g, "$1- $2$3")
    .replace(/(^|\n)\*\*\*\s*([^*\n]+?)\*($|\n)/g, "$1- $2$3")
    .replace(/(^|\s)\*\*-\*\*\s*\*\*([^*\n:]+?:)\*\*/g, "\n- **$2**")
    .replace(/(^|\s)\*\*-\s*([^*\n:]+?:)\*\*/g, "\n- **$2**")
    .replace(/(^|\s)-\*\*([^*\n:]+?:)\*\*/g, "\n- **$2**")
    .replace(/\*\*\s+\*\*/g, " ")
    .replace(/(:\*\*)(?=\S)/g, "$1 ")
    .replace(/([가-힣A-Za-z0-9])\*\*(?=[\"'“‘0-9A-Za-z가-힣])/g, "$1 **")
    .replace(/([.!?다요죠임])\s+(-\s+\*\*)/g, "$1\n$2")
    .replace(/\*"([^"\n]+)"\*/g, "\"$1\"")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseTextComponent(component) {
  const module = component.querySelector(".se-module-text");
  if (!module) return [];

  const blocks = [];
  let paragraphGroup = [];
  const flush = () => {
    if (paragraphGroup.length > 0) {
      blocks.push(paragraphGroup.join(" "));
      paragraphGroup = [];
    }
  };

  for (const child of [...module.children]) {
    const tag = child.tagName.toLowerCase();
    if (tag === "ol" || tag === "ul") {
      flush();
      const ordered = tag === "ol";
      const items = [...child.querySelectorAll(":scope > li")]
        .map((item) => cleanText(item.textContent ?? ""))
        .filter(Boolean);
      if (items.length > 0) {
        blocks.push(items.map((item, index) => (ordered ? `${index + 1}. ${item}` : `- ${item}`)).join("\n"));
      }
      continue;
    }

    if (tag === "p") {
      const text = stripNaverBoilerplatePrefix(markdownInline(child));
      if (isEmptyText(text)) {
        flush();
        continue;
      }
      if (isNaverBoilerplateParagraph(text)) {
        flush();
        continue;
      }
      if (paragraphIsShortBold(child)) {
        flush();
        blocks.push(`### ${cleanText(child.textContent ?? "").replace(/^\*\*|\*\*$/g, "")}`);
        continue;
      }
      paragraphGroup.push(text);
    }
  }

  flush();
  return blocks;
}

function parseQuoteComponent(component) {
  const paragraphTexts = [...component.querySelectorAll(".se-module-text p")]
    .map((paragraph) => cleanText(paragraph.textContent ?? ""))
    .filter(Boolean);
  const text = paragraphTexts.length > 0
    ? paragraphTexts.join(" ")
    : cleanText(component.querySelector(".se-module-text")?.textContent ?? component.textContent ?? "");
  if (!text) return [];
  if (text.length <= 80) return [`## ${text}`];
  return [`> ${text}`];
}

function parseTableComponent(component) {
  const rows = [...component.querySelectorAll("tr")]
    .map((row) => [...row.querySelectorAll("th,td")].map((cell) => escapeMarkdownCell(cell.textContent ?? "")))
    .filter((row) => row.some(Boolean));

  if (rows.length === 0) return [];
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
  const header = normalized[0];
  const divider = Array.from({ length: width }, () => "---");
  return [
    [
      `| ${header.join(" | ")} |`,
      `| ${divider.join(" | ")} |`,
      ...normalized.slice(1).map((row) => `| ${row.join(" | ")} |`),
    ].join("\n"),
  ];
}

function parseOgLinkComponent(component) {
  const link = component.querySelector("a.se-oglink-info");
  const href = link?.getAttribute("href");
  if (!href || !/^https?:\/\//i.test(href)) return [];
  const title = cleanText(component.querySelector(".se-oglink-title")?.textContent ?? href);
  const summary = cleanText(component.querySelector(".se-oglink-summary")?.textContent ?? "");
  return summary ? [`[${title}](${href})\n\n> ${summary}`] : [`[${title}](${href})`];
}

function getImageUrls(component) {
  const urls = [];

  for (const img of component.querySelectorAll("img.se-image-resource")) {
    let url = img.getAttribute("data-lazy-src");
    if (!url) {
      const link = img.closest("[data-linkdata]");
      const data = link?.getAttribute("data-linkdata") || "";
      try {
        const parsed = JSON.parse(decodeEntities(data));
        url = parsed.src || null;
      } catch {
        url = null;
      }
    }
    url ||= img.getAttribute("src");
    if (url && !url.includes("w80_blur")) urls.push(url);
  }

  return [...new Set(urls)]
    .map((url) => (url.startsWith("//") ? `https:${url}` : url))
    .filter((url) => /^https?:\/\//i.test(url));
}

function extensionFromContentType(contentType) {
  if (/png/i.test(contentType)) return ".png";
  if (/webp/i.test(contentType)) return ".webp";
  if (/gif/i.test(contentType)) return ".gif";
  return ".jpg";
}

function extensionFromUrl(url) {
  const cleaned = url.split("?")[0].split("#")[0];
  const ext = extname(cleaned).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext) ? ext : "";
}

async function downloadImage(url, slug, index, referer) {
  const headers = {
    "User-Agent": "Mozilla/5.0",
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    Referer: referer,
  };
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = res.headers.get("content-type") || "";
  const ext = extensionFromUrl(url) || extensionFromContentType(contentType);
  const slugDir = join(imageRootAbs, slug);
  const filename = `image-${String(index).padStart(2, "0")}${ext}`;
  const dest = join(slugDir, filename);
  const publicPath = `${imagePublicPrefix}/${slug}/${filename}`;

  if (!DRY_RUN) {
    mkdirSync(slugDir, { recursive: true });
    if (!existsSync(dest)) {
      const buffer = Buffer.from(await res.arrayBuffer());
      writeFileSync(dest, buffer);
    }
  }

  return publicPath;
}

async function parseImageComponent(component, slug, imageCounter, referer, title) {
  const urls = getImageUrls(component);
  const blocks = [];
  for (const url of urls) {
    imageCounter.value += 1;
    try {
      const localPath = await downloadImage(url, slug, imageCounter.value, referer);
      blocks.push(`![${title}](${localPath})`);
    } catch (error) {
      console.warn(`   ! image failed ${url}: ${error.message}`);
    }
  }
  return blocks;
}

async function postToMarkdown({ logNo, title, slug }) {
  const url = `https://blog.naver.com/PostView.naver?blogId=${BLOG_ID}&logNo=${logNo}&redirect=Dlog&widgetTypeCall=true&directAccess=false`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`PostView HTTP ${res.status}`);

  const html = await res.text();
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const components = [...doc.querySelectorAll(".se-main-container > .se-component")];
  const blocks = [];
  const imageCounter = { value: 0 };

  for (const component of components) {
    if (component.classList.contains("se-text")) {
      blocks.push(...parseTextComponent(component));
    } else if (component.classList.contains("se-quotation")) {
      blocks.push(...parseQuoteComponent(component));
    } else if (component.classList.contains("se-image") || component.classList.contains("se-imageGroup")) {
      blocks.push(...(await parseImageComponent(component, slug, imageCounter, url, title)));
    } else if (component.classList.contains("se-horizontalLine")) {
      blocks.push("---");
    } else if (component.classList.contains("se-table")) {
      blocks.push(...parseTableComponent(component));
    } else if (component.classList.contains("se-oglink")) {
      blocks.push(...parseOgLinkComponent(component));
    }
  }

  const markdown = sanitizeMarkdownArtifacts(blocks
    .map((block) => block.trim())
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim());

  return {
    markdown,
    imageCount: imageCounter.value,
    heroImageUrl: markdown.match(/!\[[^\]]*]\(([^)]+)\)/)?.[1] ?? null,
    sourceUrl: `https://blog.naver.com/${BLOG_ID}/${logNo}`,
  };
}

function createRecord(post, parsed) {
  const contentMarkdown = [
    prependBrandFrame(post.title, parsed.markdown),
    "",
    "---",
    "",
    `원문: [네이버 블로그](${parsed.sourceUrl})`,
  ].join("\n");
  const excerpt = firstSentences(contentMarkdown);
  const tags = tagsFor(post.title, post.categoryNo);

  return {
    title: post.title,
    slug: post.slug,
    excerpt,
    content_markdown: contentMarkdown,
    content_html: null,
    category: CATEGORY_MAP[post.categoryNo] ?? "인사이트",
    tags,
    author_name: "ClassIn Korea 팀",
    author_role: "콘텐츠 에디터",
    author_bio: "ClassIn Korea 팀이 학원 운영, 온라인 수업, 하이브리드 학습 환경에 필요한 실무 정보를 정리해 전합니다.",
    author_avatar_url: null,
    author_user_id: null,
    read_time: estimateReadTime(contentMarkdown),
    image_url: parsed.heroImageUrl,
    hero_image_url: parsed.heroImageUrl,
    featured: false,
    status: "DRAFT",
    seo_title: `${post.title} | Classin`,
    seo_description: excerpt,
    benefit_items: benefitItemsFor(post.title),
    target_reader: targetReaderFor(post.title),
    cta_text: "도입 상담 신청하기",
    cta_url: "/contact#contact-form",
    cta_style: "primary",
    related_post_ids: [],
    page_layout: "standard",
    published_at: null,
    created_at: post.createdAt,
    published_by: null,
    deleted_at: null,
  };
}

async function fetchTargetPosts() {
  const res = await fetch(LIST_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`PostTitleListAsync HTTP ${res.status}`);

  const payload = parseNaverJson(await res.text());
  return payload.postList
    .map((item) => {
      const { dateKey, iso } = parseNaverDate(item.addDate);
      const title = decodeNaverText(item.title);
      const slugBase = slugify(title) || item.logNo;
      return {
        logNo: item.logNo,
        title,
        categoryNo: item.categoryNo,
        dateKey,
        createdAt: iso,
        slug: `naver-${dateKey}-${slugBase}`.slice(0, 112).replace(/-$/g, ""),
      };
    })
    .filter((post) => post.dateKey >= SINCE_DATE)
    .sort((a, b) => (a.dateKey === b.dateKey ? a.logNo.localeCompare(b.logNo) : a.dateKey.localeCompare(b.dateKey)));
}

async function run() {
  console.log(`[mode] ${DRY_RUN ? "DRY-RUN" : "WRITE"}${UPDATE_EXISTING ? " UPDATE" : ""} since=${SINCE_DATE}`);
  const posts = await fetchTargetPosts();
  console.log(`[fetch] target posts=${posts.length}`);

  const { data: existingRows, error: existingError } = await supabase
    .from("blog_posts")
    .select("id, slug");
  if (existingError) throw new Error(`[db] existing slug query failed: ${existingError.message}`);
  const slugToId = new Map((existingRows ?? []).map((row) => [row.slug, row.id]));
  console.log(`[db] existing posts=${slugToId.size}`);

  const inserts = [];
  const updates = [];
  let skipped = 0;
  let totalImages = 0;

  for (const post of posts) {
    const existsId = slugToId.get(post.slug);
    if (existsId && !UPDATE_EXISTING) {
      console.log(`[skip] ${post.dateKey} ${post.slug}`);
      skipped += 1;
      continue;
    }

    console.log(`\n[post] ${post.dateKey} ${post.title}`);
    console.log(`   slug=${post.slug}`);
    const parsed = await postToMarkdown(post);
    totalImages += parsed.imageCount;
    const record = createRecord(post, parsed);
    console.log(`   markdown=${record.content_markdown.length} chars images=${parsed.imageCount} read=${record.read_time}`);

    if (existsId) {
      updates.push({ id: existsId, record });
    } else {
      inserts.push(record);
    }
  }

  console.log(`\n[summary] insert=${inserts.length} update=${updates.length} skip=${skipped} images=${totalImages}`);
  if (DRY_RUN) {
    console.log("[dry] DB 변경 없음");
    return;
  }

  if (inserts.length > 0) {
    const { data, error } = await supabase
      .from("blog_posts")
      .insert(inserts)
      .select("id, slug, status");
    if (error) throw new Error(`[db] insert failed: ${error.message}`);
    console.log(`[insert] ${data.length} posts`);
    data.forEach((row) => console.log(`  + ${row.slug} (${row.status})`));
  }

  for (const { id, record } of updates) {
    const { error } = await supabase.from("blog_posts").update(record).eq("id", id);
    if (error) {
      console.warn(`[db] update failed ${record.slug}: ${error.message}`);
    } else {
      console.log(`  ~ ${record.slug}`);
    }
  }
  if (updates.length > 0) console.log(`[update] ${updates.length} posts`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
