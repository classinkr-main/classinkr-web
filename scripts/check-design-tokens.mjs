import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// 디자인 가드 — system §5-4(공개 사이트 디자인 언어 '편집 지면 · OS판')의 코드 집행판.
//   규칙 레지스트리(RULES) + 줄기만 하는 베이스라인(scripts/design-baseline.json) + 빌드 HTML 예산(--budget).
//
// CLI
//   (인자 없음)          prebuild 검사. 규칙 × 파일 건수가 베이스라인보다 늘면 위반.
//                        warn 이면 출력만(exit 0), error(또는 errorFrom 이후)면 exit 1.
//   --init               베이스라인을 처음 한 번 만든다. 파일이 있으면 거부한다.
//   --update-baseline    min(현재, 기존)으로 내린다. 늘어난 항목이 하나라도 있으면 쓰지 않고 exit 1.
//   --budget             postbuild. .next 프리렌더 HTML 의 마커 예산.
//
// 베이스라인이 없으면(깨끗한 클론, --init 전) 래칫 규칙은 보고만 하고 exit 0 이다.
// 베이스라인을 쓰지 않는 기존 admin/branch 3규칙(ratchet: false)은 그와 무관하게 지금처럼 exit 1.
//
// 규칙 형식: { id, files, pattern, message, allow, severity, errorFrom?, check?, ratchet? }
//   files    스캔 범위 { roots: [접두], exts, exclude? }. 글롭 대신 접두 목록(정본 편차 system §13-8).
//   allow    접두 또는 파일 경로 목록.
//   check    pattern 이 있으면 매치 거르개 (m, ctx) → 셀지 여부. pattern 이 없으면 파일 전체 검사 (ctx) → 매치 위치 배열.
//   ratchet  false 면 베이스라인 없이 항상 0 기준(기존 admin/branch 규칙의 현행 동작).
// 주석 속 패턴은 세지 않는다(stripComments). 경고를 끄는 예외 주석은 두지 않는다(system §11).

const BASELINE_PATH = "scripts/design-baseline.json";
// P0 머지일 + 14일. 머지할 때 날짜를 확정해 적는다(system §5-4·§12-2).
const ERROR_FROM = "2026-11-10";
// 한국 날짜 기준(UTC 면 09:00 KST 에 바뀐다)
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

const PUBLIC = {
  roots: ["app/", "components/", "lib/"],
  exts: [".ts", ".tsx", ".css"],
  exclude: [
    "app/admin/", "app/api/", "app/checkout/", "app/receipt/",
    "components/admin/", "components/portal/crud/", "components/portal/home/", // 소비처가 어드민뿐
    "lib/admin", "lib/branch/", "lib/crm/",
    // 어드민·API·서버 전용(공개 화면 클래스를 내지 않음) — system §12-5. 공개 라우트가 import 해도 데이터만 쓴다
    "lib/server/", "lib/repositories/", "lib/portal/repositories/", "lib/db/", "lib/meta/",
    "lib/internal-cs-chat/", "lib/cs/", "lib/marketing/", "lib/notifications/",
    "lib/email.ts", "lib/team-member-colors.ts", "lib/chatbot/service.ts",
    "components/notifications/", "components/ui/badge.tsx", "components/ui/ClassInInternalAIIcon.tsx",
    "components/portal/quotes/QuickQuoteComposer.tsx", "components/portal/quotes/QuoteDisplaySettings.tsx",
  ],
};
const PUBLIC_TS = { ...PUBLIC, exts: [".ts", ".tsx"] };
const PUBLIC_TSX = { ...PUBLIC, exts: [".tsx"] };
const BRANCH = { roots: ["components/admin/branch/"], exts: [".ts", ".tsx"] };
const only = (file) => ({ roots: [file], exts: [path.extname(file)] });

const SITE_BASE = "app/styles/site-base.css";
// 공유 프리미티브의 어드민 기본 문자열 — 기본값 불변(C17)이라 공개 규칙에서 뺀다(controls 요청)
const SHARED_UI = ["button", "dialog", "tabs", "input", "textarea"].map((n) => `components/ui/${n}.tsx`);
const HEX_ALLOW = [
  "lib/design-tokens.ts", "app/styles/tokens.css",
  "app/opengraph-image.tsx", "app/twitter-image.tsx", "app/global-error.tsx",
  "components/portal/quotes/", "components/auth/brand-glyphs.tsx", "components/auth/SocialLoginRow.tsx",
  ...SHARED_UI,
];
const BILLING_CHECKOUT = ["components/billing/", "components/checkout/"]; // .site 밖
const RETIRED_ICONS =
  "Sparkles|Zap|Star|PenTool|Presentation|MonitorSpeaker|Globe2|ExternalLink|FileCheck2|Fingerprint|" +
  "Loader2|CheckCircle2|AlertTriangle|AlertCircle|BarChart3|HelpCircle|Clock3";

// JSX 여는 태그. 따옴표 문자열과 중괄호 3단까지 건너뛴다(AST 없이 근사)
const jsxOpen = (names) =>
  new RegExp(
    `<(?:${names})\\b(?:[^<>{}"']|"[^"]*"|'[^']*'|\\{(?:[^{}]|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*\\})*>`,
    "g"
  );
const lineAt = (text, i) => text.slice(text.lastIndexOf("\n", i) + 1, (text.indexOf("\n", i) + 1 || text.length + 1) - 1);
// site-base.css 의 ::selection 줄만 민트·hex 허용(정본 편차 system §13-10)
const notSelection = (m, ctx) => !(ctx.file === SITE_BASE && lineAt(ctx.text, m.index).includes("::selection"));
const hasWord = (word) => new RegExp(`(?<![\\w-])${word}(?![\\w-])`);
const lacks = (re) => (m) => !re.test(m[0]);

// mock Frame(source kind "mock") 여는·닫는 태그 사이. ponytail: 같은 파일 안 다음 </Frame> 까지 — Frame 중첩은 없다는 규칙에 기댄다
function inMockFrame(ctx, index) {
  ctx.mock ??= [...ctx.text.matchAll(jsxOpen("Frame"))]
    .filter((m) => !m[0].endsWith("/>") && /kind:\s*["']mock["']/.test(m[0]))
    .map((m) => [m.index, ctx.text.indexOf("</Frame>", m.index)]);
  return ctx.mock.some(([s, e]) => index > s && (e < 0 || index < e));
}

// site-base.css: 보증 구간(guarantee:start~end) 밖 최상위에서 @layer·@custom-variant 가 아닌 규칙·at-rule(@keyframes 포함)
function unlayeredOutsideGuarantee(ctx) {
  const blank = (s) => s.replace(/[^\n]/g, " ");
  const text = stripComments(ctx.raw.replace(/\/\*[^*]*guarantee:start[\s\S]*?guarantee:end[^*]*\*\//, blank));
  const hits = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (depth === 0 && start < 0 && !/\s/.test(c)) start = i;
    if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    if (depth === 0 && start >= 0 && (c === "}" || c === ";")) {
      if (!/^@(?:layer|custom-variant)\b/.test(text.slice(start, start + 20))) hits.push(start);
      start = -1;
    }
  }
  return hits;
}

const warn = { severity: "warn", errorFrom: ERROR_FROM };
const fixedWarn = { severity: "warn" }; // 승격 없음
const error = { severity: "error" }; // 현재 위반 0(또는 P0 에서 0으로 만든 것)인 구조 규칙

const RULES = [
  // ── 기존 admin/branch 3규칙 — 현행 그대로(DESIGN.md §2 팔레트). SSOT 파일(lib/branch/*)은 범위 밖이라 자동 예외
  { id: "admin-branch-1E5DA8", files: BRANCH, pattern: /#1E5DA8/gi, allow: [], ...error, ratchet: false,
    message: "확도 예외 파랑(#1E5DA8) — 확도 맥락(lib/branch/confidence-tokens.ts) 밖 사용" },
  { id: "admin-branch-rose-emerald-sky", files: BRANCH, pattern: /\b(?:rose|emerald|sky)-\d/g, allow: [], ...error, ratchet: false,
    message: "Tailwind 기본 팔레트 유출(rose-/emerald-/sky-N) — 캐논 Danger/Success hex로 치환" },
  { id: "admin-branch-7B8B36", files: BRANCH, pattern: /#7B8B36/gi, allow: [], ...error, ratchet: false,
    message: "팀 아이덴티티 올리브(#7B8B36) — lib/branch/team-colors.ts 밖 리터럴" },

  // ── 색·면 (system·surfaces·controls)
  { id: "hex-literal", files: PUBLIC, allow: HEX_ALLOW, check: notSelection, ...warn,
    pattern: /(?<=[\s"'(:,[{])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi,
    message: "hex 리터럴 → 토큰 유틸. 예: #A39E98 → text-fg-muted(글자) / border-line-control(조작 경계). hex→hex 치환 금지" },
  { id: "pastel-green", files: PUBLIC, allow: [], check: notSelection, ...warn,
    pattern: /#(?:ECFDF5|D1FAE5)(?![\w-])/gi,
    message: "민트 면(#ECFDF5·#D1FAE5) → bg-surface-paper·hair·Kicker" },
  { id: "bad-colors", files: PUBLIC, allow: [], ...warn,
    pattern: /#(?:B85C33|E5E5E0)(?![\w-])|placeholder:text-\[#A39E98\]/gi,
    message: "퇴출 색 → 입력 경계 border-line-control, 플레이스홀더 placeholder:text-fg-placeholder" },
  { id: "ink-bg-literal", files: PUBLIC, allow: [], ...warn,
    pattern: /(?<![\w-])bg-(?:\[#111110\]|black|near-black|surface-ink)(?![\w-])/g,
    message: "먹 지면 우회 → <Section surface=\"ink\"> 또는 surface-ink 클래스" },
  { id: "palette-leak", files: PUBLIC, allow: [], ...warn, // bg-black 은 ink-bg-literal 이 센다
    pattern: /(?<![\w-])(?:(?:bg|text|border)-(?:white|warm-[\w-]+|(?:slate|gray|zinc|stone|rose|emerald|sky|green|amber|yellow)-\d+)|(?:text|border)-(?:black|near-black))(?![\w-])/g,
    message: "Tailwind·레거시 팔레트 → bg-surface-sheet·text-fg-*·border-line-*" },
  { id: "arbitrary-color", files: PUBLIC, allow: HEX_ALLOW, ...warn, // hex 는 hex-literal 이 센다
    pattern: /(?<![\w-])(?:bg|text|border|from|via|to|fill|stroke|ring|outline|decoration|divide)-\[(?:rgba?|hsla?)\(/g,
    message: "임의 색 유틸 → 토큰 유틸" },
  { id: "glass-blend", files: PUBLIC, allow: [], ...warn,
    pattern: /backdrop-(?:blur|filter)|backdropFilter|mix-blend|bg-blend|drop-shadow-\[|(?<![\w-])(?:grayscale|sepia|hue-rotate)(?!\w)/g,
    message: "유리·블렌드·필터 효과 → 불투명 bg-surface-*" },
  { id: "noise", files: PUBLIC, allow: [], ...warn, pattern: /noise-texture|feTurbulence/g, message: "노이즈 그레인 → 삭제" },
  { id: "gradient", files: PUBLIC, allow: ["app/styles/utilities.css"], ...warn,
    pattern: /(?<![\w-])bg-(?:gradient|linear|radial|conic)-|(?:linear|radial|conic)-gradient\(/g,
    message: "그라데이션 → 단색 면" },
  { id: "chart-gradient", files: { roots: ["components/charts/"], exts: [".ts", ".tsx"] },
    allow: [], ...warn, pattern: /<(?:linear|radial)Gradient\b/g, message: "차트 그라데이션 → 선·단색" },
  // ── 도판 (imagery)
  { id: "img-unoptimized", files: PUBLIC_TS, allow: [], ...warn, pattern: /\bunoptimized\b/g, message: "next/image unoptimized 금지" },
  { id: "img-fill-sizes", files: PUBLIC_TSX, allow: [], ...warn,
    pattern: jsxOpen("Image"), check: (m) => /\bfill\b/.test(m[0]) && !/\bsizes=/.test(m[0]),
    message: "fill 이미지에는 sizes 를 단다" },
  { id: "img-priority", files: PUBLIC_TSX, allow: [], ...warn,
    pattern: jsxOpen("Image"), check: (m) => /\bpriority\b/.test(m[0]),
    message: "priority 금지 — LCP 는 H1, 도판 preload 는 라우트당 1건(media)" },
  { id: "img-header-preload", files: only("components/sections/Header.tsx"), allow: [], ...warn,
    pattern: /preload|fetchPriority/g, message: "헤더 이미지 preload·fetchPriority 금지" },
  { id: "video-poster", files: PUBLIC_TSX, allow: [], ...warn,
    pattern: /<video\b[^>]*\bposter=/g, message: "<video poster> 대신 next/image 포스터" },
  { id: "gif", files: PUBLIC, allow: [], ...warn, pattern: /\.gif\b/g, message: "GIF → 무음 MP4 + 포스터" },
  { id: "blur-blob", files: PUBLIC, allow: [], ...warn,
    pattern: /(?<![\w-])blur-(?:2xl|3xl)(?![\w-])|(?<![\w-])blur-\[(?:[4-9]\d|\d{3,})px\]/g, message: "블러 블롭 → 삭제" },
  { id: "clip-text", files: PUBLIC, allow: [], ...warn, pattern: /bg-clip-text/g, message: "그라데이션 글자 → 단색 + ink-underline" },
  { id: "fixed-mask", files: PUBLIC, allow: [], ...warn,
    pattern: /(?<![\w-])bg-fixed(?![\w-])|background-attachment:\s*fixed|mask-image|(?<![\w-])mask-(?:linear|radial|\[)/g,
    message: "고정 배경·마스크 → 삭제" },
  { id: "header-offset", files: PUBLIC, allow: [], ...warn,
    pattern: /(?<![\w-])(?:top|pt|scroll-mt)-\[(?:76|80|92)px\]|100svh-(?:76px|5rem)/g,
    message: "헤더 높이 리터럴 → --header-h (top-(--header-h))" },
  { id: "radius-large", files: PUBLIC, allow: ["components/ui/dialog.tsx"], ...warn,
    pattern: /(?<![\w-])rounded(?:-[trblse]{1,2})?-(?:[2-9]xl|\[(?:1[6-9]|[2-9]\d|\d{3,})px\]|\[[1-9]\d*(?:\.\d+)?rem\])(?![\w-])/g,
    message: "반경 16px 이상 → rounded-lg(8)·rounded-xl(12)" },
  { id: "rounded-full", files: PUBLIC, allow: ["components/ui/filter-chip.tsx", "components/auth/SocialLoginRow.tsx", SITE_BASE], ...warn,
    pattern: /(?<![\w-])rounded(?:-[trblse]{1,2})?-full(?![\w-])/g,
    message: "pill 은 필터 칩만 → rounded-lg·rounded-xl (스위치·status-dot 은 site-base)" },
  { id: "shadow", files: PUBLIC, allow: SHARED_UI, ...warn,
    pattern: /(?<![\w-])shadow(?:-(?!(?:deep|none)(?![\w-]))[\w[]|(?=["'`\s]))/g,
    message: "그림자 → 테두리 hair (shadow-deep·shadow-none 만 허용)" },
  { id: "left-bar", files: PUBLIC, ...warn,
    allow: ["app/pricing/page.tsx", "components/blog/ArticleToc.tsx", "components/docs/DocsSidebarLayout.tsx", SITE_BASE],
    pattern: /(?<![\w-])border-l-2(?![\w-])|before:w-0\.5|inset_2px_0_0|row-accent/g,
    message: "좌측 2px 바는 세 곳만(C21) — Comparison·/pricing 선택 행·세로 목차" },

  // ── 토큰·스코프 구조 (system)
  { id: "token-decl-outside", files: PUBLIC, allow: ["app/styles/tokens.css"], ...error,
    pattern: /(?<![\w-])--(?:surface|fg|line)-[a-z-]+\s*:|\.surface-ink\s*\{|\.on-ink(?![\w-])/g,
    message: "--surface-*·--fg-*·--line-* 선언과 .surface-ink 정의는 app/styles/tokens.css 에만. .on-ink 는 만들지 않는다" },
  { id: "site-base-unlayered", files: only(SITE_BASE), allow: [], ...error, check: unlayeredOutsideGuarantee,
    message: "site-base.css 의 무레이어 규칙은 guarantee:start~end 구간(보증 4개)에만. 나머지는 @layer base/components 안으로" },
  { id: "globals-public-rule", files: only("app/globals.css"), allow: [], ...error,
    pattern: /\.site(?![\w-])|(?<![\w-])--(?:surface|fg|line)-/g,
    message: "app/globals.css 에 새 공개 규칙 금지 → app/styles/{tokens,utilities,site-base}.css" },
  // CheckoutRequestForm: /checkout 전용 대화상자라 .site 밖에 둔다(H07)
  { id: "radix-content-site", files: PUBLIC_TSX, allow: ["components/ui/", "components/checkout/CheckoutRequestForm.tsx"], ...error,
    pattern: jsxOpen("(?:Dialog|Popover|Select|DropdownMenu|Sheet)Content"), check: lacks(hasWord("site")),
    message: "공개 Radix *Content 의 className 에 site 를 넣는다(C17 포털 규칙)" },
  { id: "main-outside-chrome", files: PUBLIC_TSX, allow: ["components/AppChrome.tsx"], ...warn,
    pattern: /<main[\s>]/g, message: "<main> 은 AppChrome 하나뿐 → div·article·section" },
  { id: "z-literal", files: PUBLIC, allow: ["components/ui/dialog.tsx", "components/ui/toast.tsx"], ...warn,
    pattern: /(?<![\w-])z-(?:\[\d+\]|30|40|50)(?![\w-])/g,
    message: "페이지 수준 z 리터럴 → z-(--z-*) (로컬 겹침 z-0/10/20 은 허용)" },
  { id: "public-import", files: PUBLIC_TS, allow: [], ...error,
    pattern: /["']@\/components\/ui\/badge["']|from\s*["']recharts["']/g,
    message: "공개 화면에서 badge·recharts import 금지 → Kicker·텍스트 / 정적 SVG 차트" },

  // ── 글자 (typography)
  { id: "text-px", files: PUBLIC, allow: SHARED_UI, ...warn,
    pattern: /(?<![\w-])text-\[\d+(?:\.\d+)?(?:px|rem)\]/g, message: "글자 크기 리터럴 → text-{15종} (text-body·text-caption …)" },
  { id: "text-scale-default", files: PUBLIC, allow: SHARED_UI, ...warn,
    pattern: /(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl)(?![\w-])/g, message: "Tailwind 기본 글자 크기 → text-{15종}" },
  { id: "text-arbitrary-var", files: PUBLIC, allow: [], ...warn,
    pattern: /(?<![\w-])text-\(--/g, message: "text-(--…) 임의값 → text-{15종}·text-fg-* (C02)" },
  { id: "tracking-literal", files: PUBLIC, allow: [], ...warn,
    pattern: /(?<![\w-])tracking-(?:\[|(?:wide|wider|widest)(?![\w-]))|letterSpacing\s*:/g,
    message: "자간 리터럴 → 크기 토큰의 자간 또는 tracking-label·tracking-abbr" },
  { id: "font-weight", files: PUBLIC, allow: [], ...warn,
    pattern: /(?<![\w-])font-(?:black|extrabold|light|thin)(?![\w-])/g, message: "굵기는 400·500·600·700만" },
  { id: "italic-uppercase", files: PUBLIC, allow: [], ...warn, // 라틴 약어 허용 목록은 아직 없다 — 생기면 check 로 거른다
    pattern: /(?<![\w-])(?:italic|uppercase)(?![\w-])/g, message: "한글 지면에 italic·uppercase 금지" },
  { id: "font-family", files: PUBLIC, allow: [], ...warn,
    pattern: /(?<![\w-])font-(?:serif|mono)(?![\w-])/g,
    check: (m, ctx) => !(m[0] === "font-mono" && ctx.file === "components/billing/CodeInputField.tsx"),
    message: "세리프 없음(V2-A). font-mono 는 코드 렌더러·CodeInputField 만" },
  { id: "paperlogy", files: PUBLIC, allow: ["components/portal/quotes/"], ...error,
    pattern: /Paperlogy/g, message: "Paperlogy 는 견적서(components/portal/quotes/)만" },
  { id: "scope-display", files: PUBLIC, allow: ["components/home/HomeHero.tsx"], ...error,
    pattern: /(?<![-\w])text-display(?![-\w])/g, message: "text-display 는 Hero 만(C10)" },
  { id: "scope-poster", files: PUBLIC, allow: [], ...error,
    pattern: /(?<![-\w])text-poster(?![-\w])/g, message: "text-poster 는 Manifesto 만(C10)" },
  { id: "scope-folio-null", files: PUBLIC, allow: [], ...error,
    pattern: /folio=\{null\}/g, message: "folio={null} 은 Hero 만" },
  { id: "kicker-heading", files: PUBLIC_TSX, allow: [], ...error,
    pattern: /<h[34]\b[^>]*(?<![\w-])text-label(?![\w-])|<h[34]\b[^>]*>\s*<Kicker\b|<Kicker\b[^>]*\bas=\{?["']h[34]["']/g,
    message: "Kicker·text-label 을 h3·h4 에 붙이지 않는다" },
  { id: "spelling", files: PUBLIC, allow: [], ...warn, pattern: /안됩니다|수 밖에/g, message: "맞춤법 → 안 됩니다 / 수밖에" },
  { id: "external-font-cdn", files: { roots: ["public/"], exts: [".html"] }, allow: [], ...fixedWarn, // typography T11 뒤 error 로 올린다
    pattern: /fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr/g, message: "외부 폰트 CDN → 자체 호스팅 Pretendard" },

  // ── 숫자·정직 (system·imagery·typography)
  { id: "honesty-placeholder", files: PUBLIC_TS, allow: [], ...error,
    pattern: /credit\s*[:=]\s*\{?\s*["'`][^"'`\n]*○○|source\b[^\n]{0,80}?["'`](?:예시|샘플|추정)["'`]/g,
    message: "credit '○○'·출처 '예시/샘플/추정' 금지 — 실제 출처를 적거나 mock Frame 으로" },
  { id: "numeric-claim", files: PUBLIC_TSX, allow: ["lib/facts.ts"], ...fixedWarn,
    pattern: />[^<>{}]*?\d[\d,.]*\s*(?:\+|만|억|개국|%|배|곳|명)/g, check: (m, ctx) => !inMockFrame(ctx, m.index),
    message: "화면 수치는 lib/facts.ts 의 factId 로(Numeral). 예시는 mock Frame 안에서만" },
  { id: "numeral-example", files: PUBLIC_TSX, allow: [], ...error,
    pattern: jsxOpen("Numeral"), check: (m, ctx) => /\bexample\b/.test(m[0]) && !inMockFrame(ctx, m.index),
    message: "<Numeral example> 은 mock Frame 안에서만(X11)" },
  { id: "tolocale-direct", files: PUBLIC_TS, allow: ["lib/format.ts"], ...fixedWarn,
    pattern: /\.toLocale(?:String|DateString|TimeString)\(/g, message: "toLocale* 직접 호출 → lib/format.ts" },

  // ── 아이콘 (icons ICON_RULES)
  { id: "lucide-strokewidth", files: PUBLIC_TSX, allow: ["components/icons/", "app/global-error.tsx", "components/ui/dialog.tsx"], ...warn,
    // 대문자 JSX 태그(컴포넌트)만. raw <path>·<motion.circle> 은 소문자라 제외
    pattern: /<[A-Z][\w.]*\b[^<>]*?\s(?:strokeWidth|absoluteStrokeWidth)\b/g,
    message: "아이콘 strokeWidth 금지 — 획은 :where(.site) svg.lucide { stroke-width: var(--stroke-pen) }" },
  { id: "lucide-retired", files: PUBLIC_TS, allow: ["components/ui/toast.tsx"], ...warn,
    pattern: new RegExp(`import\\s*\\{[^}]*\\b(?:${RETIRED_ICONS})\\b[^}]*\\}\\s*from\\s*["']lucide-react["']`, "g"),
    message: "퇴역 글리프·별칭. Loader2→LoaderCircle, CheckCircle2→CircleCheck, AlertTriangle→TriangleAlert, AlertCircle→CircleAlert, BarChart3→ChartColumn, HelpCircle→CircleHelp, Clock3→Clock, ExternalLink→ArrowUpRight, Sparkles→'AI' 글자, 나머지는 lib/icon-concepts.ts" },
  { id: "lucide-namespace", files: PUBLIC_TS, allow: [], ...warn,
    pattern: /import\s*\*\s*as\s+\w+\s+from\s*["']lucide-react["']|["']lucide-react\/dynamic["']/g,
    message: "lucide 는 이름으로만 import(트리셰이킹)" },
  { id: "icon-glyph-char", files: PUBLIC_TS, allow: [], ...warn,
    // JSX 텍스트와 따옴표 문자열 안의 글자 기호·이모지(©®™ 제외)
    pattern: /(?:>[^<>{}]*|(["'`])[^"'`\n]*)(?:[✕✦✓✗★⚠→]|(?![©®™])\p{Extended_Pictographic})/gu,
    message: "글자 기호·이모지 → lucide 아이콘(→ 는 ArrowRight + arrow-nudge), 상태는 status-dot, ✦ 는 삭제" },

  // ── 모션 (system·cards_motion·imagery)
  { id: "motion-banned", files: PUBLIC, allow: [], ...warn,
    pattern: /(?<![\w-])animate-(?:ping|bounce|shake)(?![\w-])|repeat:\s*Infinity|hover:scale-|will-change|stroke-?[dD]ashoffset|draw-path/g,
    message: "금지 모션(ping·bounce·shake·무한 반복·hover scale·will-change·선 그리기)" },
  { id: "duration-literal", files: PUBLIC, allow: ["app/styles/", ...SHARED_UI], ...warn,
    pattern: /(?<![\w-])(?:duration|delay)-(?:\d|\[)|duration:\s*[\d.]+/g,
    message: "시간 리터럴 → duration-(--motion-*)·ease-soft" },
  { id: "effects", files: PUBLIC, allow: SHARED_UI, ...warn,
    pattern: /(?<![\w-])transition-all(?![\w-])|hover:-translate-y-/g,
    message: "transition-all·hover 떠오름 → 바뀌는 속성만 전이, hover 는 경계 진하게" },

  // ── 컨트롤 (controls)
  { id: "focus-ring", files: PUBLIC, allow: SHARED_UI, ...warn,
    pattern: /focus-visible:ring|ring-offset-|(?<![\w-])focus:|(?<![\w-])outline-none(?![\w-])/g,
    message: "컴포넌트별 포커스 링 금지 — 보증 ① outline 하나" },
  { id: "button-variant", files: PUBLIC_TSX, allow: BILLING_CHECKOUT, ...warn,
    pattern: /\bvariant=["'](?:secondary|outline|destructive|link|green-surface)["']/g,
    message: "공개 버튼 변형 → primary·line·ghost" },
  { id: "button-size", files: PUBLIC_TSX, allow: BILLING_CHECKOUT, ...warn,
    pattern: jsxOpen("Button"), check: lacks(/\bsize=["'](?:md|cta|icon-md)["']/),
    message: "공개 <Button> 은 size=\"md|cta|icon-md\"" },
  { id: "site-variant", files: PUBLIC_TSX, allow: BILLING_CHECKOUT, ...warn,
    pattern: jsxOpen("Input|Textarea|TabsList|TabsTrigger|TabsContent"), check: lacks(/\bvariant=["']site["']/),
    message: "공개 Input·Textarea·Tabs 는 variant=\"site\"" },
  { id: "ink-primary-button", files: PUBLIC_TSX, ...warn, // 휴리스틱: surface-ink 가 있는 파일의 <Button>
    allow: ["app/product/sw/page.tsx"], // H02: surface-ink 표지만 먼저 단 파일. 채움 버튼 교체(P3–P5, C14) 때 이 allow 를 지운다
    pattern: jsxOpen("Button"), check: (m, ctx) => ctx.text.includes("surface-ink") && !/\bvariant=["'](?:line|ghost)["']/.test(m[0]),
    message: "먹 지면 위 채움 버튼 0(C14) → variant=\"line\"·\"ghost\"" },
];

// ── 빌드 HTML 예산(--budget). 마커는 소유 스펙과의 계약이다(system §5-4 표). 마커가 없는 동안은 0으로 통과한다
const BUDGET_PAGES = {
  "/": ".next/server/app/index.html",
  "/product/sw": ".next/server/app/product/sw.html",
  "/product/hw": ".next/server/app/product/hw.html",
  "/pricing": ".next/server/app/pricing.html",
};
// 속성은 앞이 공백인 것만 센다(RSC 페이로드의 "data-…" JSON 키는 제외)
const attr = (name, value) => new RegExp(`\\s${name}${value ? `="${value}"` : "(?=[\\s=>/])"}`, "g");
const cls = (name) => new RegExp(`(?<=\\sclass="[^"]*)(?<![\\w-])${name}(?![\\w-])`, "g");
const count = (text, re) => (text.match(re) || []).length;
const PAGE_LIMITS = [
  { what: 'data-surface="ink"', re: attr("data-surface", "ink"), max: 1 }, // Footer 는 마커가 없어 집계 밖
  { what: ".pattern-grid", re: cls("pattern-grid"), max: 1 },
  { what: "data-moment", re: attr("data-moment"), max: 6 },
  { what: ".ink-underline", re: cls("ink-underline"), max: 1 },
  { what: "data-kicker", re: attr("data-kicker"), max: 7, routes: ["/"] }, // typography: 홈 = 7. Kicker 가 들어오면 정확히 7로 좁힌다
];

// .surface-ink 하위의 bg-fg-accent 수(controls ink-primary). 같은 이름 태그의 여닫기 깊이로 하위 범위를 잡는다
function inkAccent(html) {
  let n = 0;
  for (const m of html.matchAll(/<([a-z][\w-]*)\b[^>]*\sclass="[^"]*(?<![\w-])surface-ink(?![\w-])[^"]*"[^>]*>/g)) {
    const from = m.index + m[0].length;
    const re = new RegExp(`<(/?)${m[1]}\\b[^>]*>`, "g");
    re.lastIndex = from;
    let depth = 1;
    let end = html.length;
    for (let t; depth > 0 && (t = re.exec(html)); ) if ((depth += t[1] ? -1 : 1) === 0) end = t.index;
    n += count(html.slice(from, end), cls("bg-fg-accent"));
  }
  return n;
}

function runBudget() {
  const problems = [];
  let scrub = 0;
  let seen = 0;
  for (const [route, file] of Object.entries(BUDGET_PAGES)) {
    if (!existsSync(file)) {
      console.warn(`[design-budget] ${file} 없음 — ${route} 건너뜀(정적 프리렌더가 아님?)`);
      continue;
    }
    seen++;
    const html = readFileSync(file, "utf8");
    const over = (what, n, max, where = "") => n > max && problems.push(`${route}${where}: ${what} ${n} > ${max}`);
    for (const l of PAGE_LIMITS) if (!l.routes || l.routes.includes(route)) over(l.what, count(html, l.re), l.max);
    scrub += count(html, cls("ink-underline-scrub"));
    over(".surface-ink 안 bg-fg-accent", inkAccent(html), 0);

    const surfaces = [...html.matchAll(/\sdata-surface="([a-z]+)"/g)].map((m) => m[1]);
    over("sunken 지면 연속", surfaces.filter((s, i) => s === "sunken" && surfaces[i - 1] === "sunken").length, 0);

    // ponytail: <section 분할은 정규식 — Section 은 중첩하지 않는다는 규칙에 기댄다. 중첩이 생기면 파서를 검토한다
    let charts = 0;
    html.split(/(?=<section[\s>])/).forEach((chunk, i) => {
      const where = ` <section> #${i}`;
      // data-reveal 은 마운트 뒤에만 붙는다. SSR HTML 에는 Reveal 의 정적 표지 data-reveal-root 가 있다
      const reveals = count(chunk, attr("data-reveal-root"));
      over("data-reveal-root(Reveal)", reveals, 1, where);
      over("data-frame", count(chunk, attr("data-frame")), 1, where);
      if (/\sdata-surface="sheet"/.test(chunk.slice(0, chunk.indexOf(">")))) {
        // Frame 루트는 data-face, Card 루트는 data-card 로 표시한다
        const sheetFaces = count(chunk, attr("data-face", "sheet")) + count(chunk, /\sdata-card="(?:index|case|plan)"/g);
        over('sheet 지면 안 sheet 면(data-face="sheet"·data-card index/case/plan)', sheetFaces, 0, where);
      }
      if (reveals && count(chunk, attr("data-seq"))) charts++;
    });
    over("차트 등장(data-seq 를 담은 Reveal)", charts, 1);
  }
  if (scrub > 1) problems.push(`사이트: .ink-underline-scrub ${scrub} > 1`);
  // 한 쪽도 못 읽었으면 .next 구조가 바뀐 것이다 — 조용히 통과시키지 않는다
  if (seen === 0) problems.push("프리렌더 HTML 을 한 쪽도 찾지 못했다(BUDGET_PAGES 경로 확인)");

  if (problems.length > 0) {
    console.error("Design budget failed — 빌드 HTML 마커 예산 초과(system §5-4):");
    for (const p of problems) console.error(`- ${p}`);
    process.exit(1);
  }
  console.log(`Design budget passed (${seen}/${Object.keys(BUDGET_PAGES).length} pages).`);
}

// ── 소스 스캔
function listFiles(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) listFiles(full, exts, out);
    else if (exts.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const inScope = (file, scope) =>
  scope.exts.includes(path.extname(file)) &&
  scope.roots.some((r) => file.startsWith(r)) &&
  !(scope.exclude || []).some((e) => file.startsWith(e));

/** 주석을 같은 길이의 공백으로 지운 "코드만" 텍스트(줄·위치 보존).
 *  "https://" 등 스킴 뒤 "//"는 보존한다(":" 바로 뒤 "//"는 자르지 않음). CSS 의 /* *\/ 도 같은 함수로 지운다.
 *  CRLF 는 호출 전에 정규화한다 — 각 줄이 "\r"로 끝나면 줄 주석 제거가 통째로 무력화된다. */
function stripComments(source) {
  const blank = (s) => s.replace(/[^\n]/g, " ");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .split("\n")
    .map((line) => line.replace(/(?<!:)\/\/.*$/, blank))
    .join("\n");
}

function scan() {
  const roots = [...new Set(RULES.flatMap((r) => r.files.roots.map((p) => p.split("/")[0])))];
  const exts = new Set(RULES.flatMap((r) => r.files.exts));
  const files = roots.flatMap((r) => listFiles(r, exts)).sort();
  const hits = new Map(RULES.map((r) => [r.id, new Map()])); // id → file → [index]
  const texts = new Map();
  let scanned = 0;

  for (const file of files) {
    const rules = RULES.filter((r) => inScope(file, r.files) && !r.allow.some((a) => file.startsWith(a)));
    if (rules.length === 0) continue;
    scanned++;
    const raw = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const ctx = { file, raw, text: stripComments(raw) };
    texts.set(file, ctx.text);
    for (const rule of rules) {
      const found = rule.pattern
        ? [...ctx.text.matchAll(rule.pattern)].filter((m) => !rule.check || rule.check(m, ctx)).map((m) => m.index)
        : rule.check(ctx);
      if (found.length > 0) hits.get(rule.id).set(file, found);
    }
  }
  return { hits, texts, scanned };
}

const isError = (rule) => rule.severity === "error" || Boolean(rule.errorFrom && TODAY >= rule.errorFrom);
const ratcheted = RULES.filter((r) => r.ratchet !== false);

function currentCounts(hits) {
  const counts = {};
  for (const rule of ratcheted) {
    const perFile = Object.fromEntries([...hits.get(rule.id)].map(([f, idx]) => [f, idx.length]));
    if (Object.keys(perFile).length > 0) counts[rule.id] = perFile;
  }
  return counts;
}

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

const writeBaseline = (createdAt, counts) =>
  writeFileSync(BASELINE_PATH, `${JSON.stringify({ createdAt, counts }, null, 2)}\n`);

// 규칙 × 파일 단위로 기준보다 늘어난 항목
function increases(hits, baseCounts) {
  const out = [];
  for (const rule of RULES) {
    for (const [file, idx] of hits.get(rule.id)) {
      const base = rule.ratchet === false ? 0 : (baseCounts?.[rule.id]?.[file] ?? 0);
      if (idx.length > base) out.push({ rule, file, idx, base });
    }
  }
  return out;
}

function lineNumber(text, index) {
  let n = 1;
  for (let i = text.indexOf("\n"); i !== -1 && i < index; i = text.indexOf("\n", i + 1)) n++;
  return n;
}

function report(list, texts, log) {
  for (const { rule, file, idx, base } of list) {
    const lines = idx.slice(0, 10).map((i) => lineNumber(texts.get(file), i));
    const more = idx.length > 10 ? ` 외 ${idx.length - 10}건` : "";
    log(`- ${file}:${lines.join(",")}${more} [${rule.id}] 기준 ${base} → ${idx.length}. ${rule.message}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const mode = args[0] ?? "check";
  if (!["check", "--init", "--update-baseline", "--budget"].includes(mode) || args.length > 1) {
    console.error("사용법: node scripts/check-design-tokens.mjs [--init | --update-baseline | --budget]");
    process.exit(1);
  }
  if (mode === "--budget") return runBudget();

  const started = Date.now();
  const { hits, texts, scanned } = scan();
  const baseline = readBaseline();
  const counts = currentCounts(hits);

  if (mode === "--init") {
    if (baseline) {
      console.error(`${BASELINE_PATH} 이 이미 있습니다 — --init 재실행 금지(system §11). 줄일 때는 --update-baseline.`);
      process.exit(1);
    }
    writeBaseline(TODAY, counts);
    const total = Object.values(counts).reduce((s, f) => s + Object.values(f).reduce((a, b) => a + b, 0), 0);
    console.log(`${BASELINE_PATH} 생성: ${Object.keys(counts).length}개 규칙, ${total}건 (${scanned} files).`);
    return;
  }

  if (mode === "--update-baseline") {
    if (!baseline) {
      console.error(`${BASELINE_PATH} 이 없습니다 — 처음 한 번 --init.`);
      process.exit(1);
    }
    const up = increases(hits, baseline.counts).filter((v) => v.rule.ratchet !== false);
    if (up.length > 0) {
      console.error("베이스라인보다 늘어난 항목이 있어 쓰지 않았습니다(올리는 경로는 없다):");
      report(up, texts, console.error);
      process.exit(1);
    }
    // 늘어난 항목이 없으므로 현재 건수가 곧 min(현재, 기존)
    writeBaseline(baseline.createdAt, counts);
    console.log(`${BASELINE_PATH} 갱신(내리기만).`);
    return;
  }

  // prebuild 검사
  const elapsed = () => `${((Date.now() - started) / 1000).toFixed(2)}s`;
  if (!baseline) {
    const strict = increases(hits, null).filter((v) => v.rule.ratchet === false);
    console.warn(
      `[design-guard] ${BASELINE_PATH} 없음 — 래칫 규칙은 보고만 합니다(exit 0). 처음 한 번 \`node scripts/check-design-tokens.mjs --init\`.`
    );
    for (const rule of ratcheted) {
      const perFile = counts[rule.id];
      if (!perFile) continue;
      const total = Object.values(perFile).reduce((a, b) => a + b, 0);
      console.warn(`  ${isError(rule) ? "error" : "warn "} ${rule.id}: ${total}건 / ${Object.keys(perFile).length}파일`);
    }
    if (strict.length > 0) {
      console.error("Design token guard failed:");
      report(strict, texts, console.error);
      process.exit(1);
    }
    console.log(`Design token guard: no baseline, reported only (${scanned} files, ${elapsed()}).`);
    return;
  }

  const up = increases(hits, baseline.counts);
  const errors = up.filter((v) => isError(v.rule));
  const warns = up.filter((v) => !isError(v.rule));
  const down = Object.entries(baseline.counts).flatMap(([id, perFile]) =>
    Object.entries(perFile).filter(([file, n]) => (counts[id]?.[file] ?? 0) < n)
  );

  if (warns.length > 0) {
    console.warn("Design token guard warnings — 베이스라인보다 늘었습니다(warn, exit 0):");
    report(warns, texts, console.warn);
  }
  if (down.length > 0) console.log(`줄었음 ${down.length}항목 — \`node scripts/check-design-tokens.mjs --update-baseline\`으로 내리세요.`);
  if (errors.length > 0) {
    console.error("Design token guard failed — 새 위반(error):");
    report(errors, texts, console.error);
    console.error("\n새 코드라면 메시지의 토큰으로 치환하세요. 베이스라인 수동 상향·--init 재실행은 금지(system §11).");
    process.exit(1);
  }
  console.log(`Design token guard passed (${scanned} files, ${RULES.length} rules, warnings: ${warns.length}, ${elapsed()}).`);
}

main();
