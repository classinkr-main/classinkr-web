# 홈 랜딩 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈(`/`)을 5화면 컴팩트 관문으로 다시 짓고, 공개 사이트 강조색을 `#0B7A52`로 바꾸며(어드민은 `#084734` 유지), 공개 사이트의 그린 hex 리터럴을 토큰 유틸로 바꾼다.

**Architecture:** 색은 `app/styles/tokens.css` 한 곳(`:root` = 공개 그린, `:root:not(:has(.site))` = 어드민 옛 그린)에서 나오고, 화면은 토큰 유틸(`bg-fg-accent`, `text-fg-muted` …)만 쓴다. 홈은 `components/home/` 5개 + 카피 SSOT `home-copy.ts` + `app/page.tsx` 조립. 기존 홈 전용 섹션 19개는 삭제.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4(`@theme inline` 토큰), vitest(`renderToStaticMarkup`, node 환경), lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-30-home-landing-redesign-design.md` (v2, 11-02 개정). 카피·링크·규칙은 스펙 §2-3·§2-4가 정본이다.

---

## 작업 환경 규칙 (모든 Task 공통)

- 작업 디렉터리: `/Users/clmagi/Desktop/Projects/classin_home-design-p0` (git 워크트리, 브랜치 `design/p1-visual`). 다른 체크아웃으로 `cd` 하지 않는다.
- **`git stash` 금지**(스택이 다른 세션과 공유됨). 치울 게 있으면 WIP 커밋.
- **`git add -A`·`git add .` 금지.** 바꾼 파일을 경로로 지정해 `git add` 하고, `git add … && git commit …` 처럼 `&&`로만 잇는다.
- 커밋 메시지 끝에 빈 줄 + `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- 품질 게이트(AGENTS.md): `npm run typecheck` → `npx eslint app components lib --max-warnings=0` → `npm run build` → `npx vitest run`. `typecheck`가 `.next/types`의 없는 라우트를 가리키면 `rm -rf .next` 후 재실행. build 가 `content-visibility`·`pages-manifest ENOENT`로 깨지면 `rm -rf .next` 후 한 번 더.
- 디자인 가드: `node scripts/check-design-tokens.mjs` (prebuild 자동 실행). 지금은 warn 이라 exit 0 이지만 **2026-11-10 부터 error** 이고 `--update-baseline`은 "늘어난 항목"이 하나라도 있으면 거부한다. 따라서 **새 파일(`components/home/**`)은 모든 규칙에서 0건**이어야 한다. 가드 출력에서 `components/home/`가 한 줄이라도 나오면 그 Task는 끝나지 않은 것이다.
- 가드가 새 파일에서 걸기 쉬운 것: `priority`(Image) 금지, `text-display`는 allow 된 파일만, `<Button>`에 `size="md|cta|icon-md"` 필수, `variant=` 는 primary(기본)만, `shadow-*`·`rounded-2xl 이상`·`rounded-full`·`text-base/sm/lg`·`text-[Npx]`·`font-black/extrabold`·`uppercase/italic`·`focus-visible:ring`·`transition-all`·`duration-N`·`z-50`·`→` 글자·hex 리터럴·`bg-white`·`text-white`·`border-black/…` 전부 금지. 토큰 유틸만 쓴다.

## 파일 구조

| 파일 | 책임 |
| --- | --- |
| `app/styles/tokens.css` | 색 정본. `:root` 공개 그린 + `:root:not(:has(.site))` 어드민 유지 블록 |
| `lib/design-tokens.ts` | tokens.css 미러(`accent`) |
| `components/ui/button.tsx` | 공용 버튼. hex → 토큰, 공개용 size `md`·`cta`·`icon-md` 추가 |
| `components/home/home-copy.ts` | 홈 카피 SSOT (스펙 §2-3) |
| `components/home/GatewayLink.tsx` | 관문 텍스트 링크(글자 + ArrowRight) |
| `components/home/HomeHero.tsx` | 1화면 (client: DemoModal) |
| `components/home/HomeProblem.tsx` | 2화면 |
| `components/home/HomeHow.tsx` | 3화면 |
| `components/home/HomeProof.tsx` | 4화면 |
| `components/home/HomePilotCta.tsx` | 5화면 (client: DemoModal) |
| `app/page.tsx` | 조립 + 메타·JSON-LD (그대로) |
| `tests/home/landing-sections.test.tsx` | 5화면 렌더·링크·hex 0 검증 |
| `DESIGN.md`, `docs/active/playbook/01-home-front.md` | 색 문서 |
| `scripts/check-design-tokens.mjs` | 삭제 파일 allow 정리 |

---

### Task 1: origin/main → design/p1-visual 병합

운영 배포본은 `origin/main`(b4bec0d5)이다. 로컬 `main`은 쓰지 않는다(159 커밋 뒤, 다른 세션이 커밋 중).

**Files:** 충돌 22개 — 아래 표.

- [ ] **Step 1: 시작 상태 확인**

```bash
git status --short            # 비어 있어야 한다
git rev-parse --abbrev-ref HEAD   # design/p1-visual
git fetch origin main && git rev-parse --short origin/main   # b4bec0d5
```

- [ ] **Step 2: 병합 시작**

```bash
git merge --no-ff --no-commit origin/main
git diff --name-only --diff-filter=U
```
Expected: 22 paths (AGENTS.md, DESIGN.md, app/contact/page.tsx, app/layout.tsx, app/product/sw/page.tsx, components/AppChrome.tsx, components/sections/{DemoModal,Hero,KeyUseCases,ProblemCost}.tsx, components/showroom/SlotPicker.tsx, components/ui/FloatingChatbot.tsx, docs/README.md, docs/active/public-site-design-language-2026-10-26.md + 그 폴더 7개, scripts/check-design-tokens.mjs).

- [ ] **Step 3: 통째로 한쪽을 택하는 파일**

```bash
# design 쪽(ours): 디자인 언어 문서 8개 + 규칙 레지스트리판 가드
git checkout --ours -- docs/active/public-site-design-language-2026-10-26.md docs/active/public-site-design-language-2026-10-26/ scripts/check-design-tokens.mjs
git add docs/active/public-site-design-language-2026-10-26.md docs/active/public-site-design-language-2026-10-26/ scripts/check-design-tokens.mjs
# main 쪽(theirs): Task 6 에서 삭제될 두 파일
git checkout --theirs -- components/sections/Hero.tsx components/sections/ProblemCost.tsx
git add components/sections/Hero.tsx components/sections/ProblemCost.tsx
```

- [ ] **Step 4: 충돌 hunk 안에서 한쪽을 택하는 파일 (자동 병합된 나머지는 보존)**

파일을 열어 `<<<<<<< HEAD … ======= … >>>>>>> origin/main` 블록마다 아래 쪽만 남기고 마커를 지운다. `git checkout --theirs`는 쓰지 않는다(자동 병합된 design 변경이 날아간다).

| 파일 | hunk | 남기는 쪽 | 이유 |
| --- | --- | --- | --- |
| `AGENTS.md` | 1 | origin/main | 한 줄 규칙이 상위 호환 |
| `app/contact/page.tsx` | 3 | origin/main | `ContactFastTrack`·form-start 계측 리팩터 |
| `app/product/sw/page.tsx` | 4 | origin/main | 정직성 수정(SlotDigit·"200개 고객사"·"<100ms/99.9%" 삭제) |
| `components/sections/DemoModal.tsx` | 1 | origin/main | `markFormStart`·shake 가 상위 집합 |
| `components/sections/KeyUseCases.tsx` | 1 | origin/main | 새 도판·overlay props |
| `components/showroom/SlotPicker.tsx` | 1 | origin/main | 키보드 접근성 재작성 |
| `components/ui/FloatingChatbot.tsx` | 1 | **HEAD** | `z-(--z-chatbot)` 토큰 |

- [ ] **Step 5: 양쪽을 합치는 파일**

`app/layout.tsx` — 두 블록 다 남긴다:
```ts
// 루트라 어드민에도 적용된다. 강제 다크 UA 의 자동 반전을 끄고, iOS 브라우저 크롬을 paper 로 칠한다.
export const viewport: Viewport = {
  themeColor: color.paper,
  colorScheme: "only light",
};

// 검색엔진 소유확인 메타태그. 검색 콘솔(Google Search Console, 네이버 서치어드바이저)에서 발급한 값을
// 환경변수로 넣는다. 비밀 값이 아니며(페이지 소스에 그대로 노출된다), 비어 있으면 태그 자체를 내보내지 않는다.
const verification = createSiteVerification({
  google: process.env.GOOGLE_SITE_VERIFICATION,
  naver: process.env.NAVER_SITE_VERIFICATION,
});
```
import 에 `type { Metadata, Viewport } from "next"`, `{ color } from "@/lib/design-tokens"`, `createSiteVerification`(from `@/lib/seo`, main 이 넣은 import 줄) 이 모두 있는지, metadata 에 `...(verification ? { verification } : {})` 가 있는지 확인한다.

`components/AppChrome.tsx` — design 의 구조(skip link, `.site` 래퍼, `cn`, `z-(--z-*)`) 위에 main 의 로직을 얹는다:
1. import: HEAD 쪽의 `import { cn } from "@/lib/utils"` 는 남기고 `import { isInternalPath } from "@/lib/internal-path"` 는 지운다. origin/main 쪽 `import { hidesPublicChrome, isTrackingExcludedPath } from "@/lib/tracking-paths"` 를 넣는다.
2. 본문: `const showPublicChrome = !isInternalPath(pathname)` → `!hidesPublicChrome(pathname)`. main 이 넣은 `trackingExcluded`·`showGoogleTag`·`showAnalytics = showPublicChrome && !trackingExcluded`, `ContactLinkTracker` dynamic import 와 `<ContactLinkTracker />` 렌더, `{showGoogleTag ? <GoogleAdsScript /> : null}` 이 자동 병합돼 있는지 확인하고 없으면 넣는다(`git show origin/main:components/AppChrome.tsx` 로 대조).
3. `grep -n "isInternalPath" components/AppChrome.tsx` → 0. `grep -rl "lib/internal-path" app components lib tests` 가 비면 `git rm lib/internal-path.ts`.

`DESIGN.md` — HEAD 쪽 두 줄(Warm White·Warm Dark, `[admin] in force`·`target` 주석 포함) 다음에 origin/main 의 **Form Label** 세 줄을 덧붙인다:
```md
- **Form Label** (`#44514A`): 공개 폼의 필드 라벨 — 본문(`#111110`)보다 한 단계 눌러 값과
  라벨을 가르는 자리. 문의·쇼룸 예약·도입 신청 세 폼의 실사용(2026-09-22 기준 30여 곳)을
  공식 토큰으로 편입한 것이다. 라벨 밖에서는 쓰지 않는다.
```

`docs/README.md` — HEAD 쪽 세 줄(디자인 언어 "A 확정" 설명 + premium-elevation 항목) 다음에 origin/main 쪽의 신규 항목 세 개(seo-aeo-improvement-worklist, seo-analytics-console-runbook, integration-followups) 여섯 줄을 덧붙인다. origin/main 쪽 첫 줄("승인 대기" 설명)은 버린다.

- [ ] **Step 6: 마커 0 확인 후 스테이징**

```bash
grep -rn "^<<<<<<<\|^>>>>>>>\|^=======$" AGENTS.md DESIGN.md app components lib docs scripts --include='*.ts' --include='*.tsx' --include='*.md' --include='*.mjs' --include='*.css' | head
git add AGENTS.md DESIGN.md docs/README.md app/contact/page.tsx app/layout.tsx app/product/sw/page.tsx components/AppChrome.tsx components/sections/DemoModal.tsx components/sections/KeyUseCases.tsx components/showroom/SlotPicker.tsx components/ui/FloatingChatbot.tsx
git diff --name-only --diff-filter=U    # 비어야 한다
```

- [ ] **Step 7: 게이트 + vitest (병합 뒤 필수)**

```bash
rm -rf .next && npm run typecheck && npx eslint app components lib --max-warnings=0 && npm run build && npx vitest run
```
예상 손질: `app/product/sw/page.tsx` 에서 쓰지 않게 된 import(`useMemo` 등)·`StatCard` 의 `icon` prop 타입, `AppChrome` 의 중복 선언. 고친 파일은 `git add <path>`.

- [ ] **Step 8: 병합 커밋**

```bash
git commit -m "merge: origin/main(b4bec0d5, 10-30 개인정보 핫픽스 포함) → design/p1-visual

충돌 22: 디자인 언어 문서·가드는 design, 정직성·접근성 수정(sw·contact·SlotPicker·DemoModal)은 main, layout·AppChrome·DESIGN·README 는 합침.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 강조색 토큰 (`#0B7A52`) + 어드민 유지 블록

**Files:**
- Modify: `app/styles/tokens.css` (`:root` 세 값 + 새 블록)
- Modify: `lib/design-tokens.ts:11`
- Test: `tests/lib/design-tokens.test.ts`, `tests/design/surface-contrast.test.ts` (기존)

- [ ] **Step 1: 미러 먼저 바꿔 테스트가 실패하는지 본다**

`lib/design-tokens.ts`:
```ts
  accent: "#0B7A52",      // --fg-accent (공개 그린 2026-11-02. 어드민은 tokens.css 유지 블록이 #084734)
```
```bash
npx vitest run tests/lib/design-tokens.test.ts
```
Expected: FAIL `accent = --fg-accent` (css 는 아직 `#084734`).

- [ ] **Step 2: tokens.css `:root` 세 값**

`app/styles/tokens.css` `:root` 안:
```css
    --fg-accent: #0B7A52;
    --fg-accent-hover: #0A6E4A;
```
```css
    --line-link: rgb(11 122 82 / .75);
```

- [ ] **Step 3: 어드민 유지 블록** — `:root { … }` 블록이 닫힌 직후, `@media (width < 40rem)` 앞에:

```css
  /* 공개 강조색(2026-11-02, #0B7A52 · hover #0A6E4A). 어드민·checkout DOM 은 .site 래퍼(AppChrome)가 없어
     옛 그린을 읽는다 — 공용 components/ui 를 토큰으로 바꿔도 어드민 색은 변하지 않는다. .site 가 있으면(포털 포함) :root 값 */
  :root:not(:has(.site)) {
    --fg-accent: #084734;
    --fg-accent-hover: #065C41;
    --line-link: rgb(8 71 52 / .6);
  }
```

- [ ] **Step 4: 테스트·가드 통과**

```bash
npx vitest run tests/lib/design-tokens.test.ts tests/design/surface-contrast.test.ts
node scripts/check-design-tokens.mjs | grep -c "tokens.css" ; true   # 0 (tokens.css 는 allow)
```
Expected: 두 테스트 PASS (fg-accent on sunken 4.92 ≥ 4.5, on-accent 5.13).

- [ ] **Step 5: Commit**

```bash
git add app/styles/tokens.css lib/design-tokens.ts && git commit -m "feat(tokens): 공개 강조색 #0B7A52(hover #0A6E4A) — 어드민은 :root:not(:has(.site)) 로 #084734 유지

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: 공용 버튼 토큰화 + 공개용 size

**Files:**
- Modify: `components/ui/button.tsx:7-41`

- [ ] **Step 1: cva 문자열 교체** — `buttonVariants` 를 아래로 바꾼다(`destructive`·`icon`·`icon-sm`·`sm`·`default`·`lg`·`xl` 는 어드민 호환을 위해 값 유지, 색만 토큰).

```tsx
const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap text-[15px] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    {
        variants: {
            variant: {
                // Primary — Classin Green (tokens.css --fg-accent: 공개 #0B7A52 · 어드민 #084734)
                default:
                    "bg-fg-accent text-fg-on-accent rounded-[6px] hover:bg-fg-accent-hover active:scale-[0.97] shadow-sm",
                // Secondary — warm surface
                secondary:
                    "bg-black/5 text-fg-ink rounded-[6px] hover:bg-black/[0.08] active:scale-[0.97]",
                // Outline — whisper border
                outline:
                    "border border-line-hair bg-surface-sheet text-fg-ink rounded-[6px] hover:bg-surface-sunken active:scale-[0.97] shadow-sm",
                // Ghost — text only
                ghost:
                    "text-fg-accent bg-transparent hover:underline underline-offset-4",
                // Destructive (어드민 전용)
                destructive:
                    "bg-red-500 text-white rounded-[6px] hover:bg-red-600 active:scale-[0.97] shadow-sm",
                // Link
                link:
                    "text-fg-accent underline-offset-4 hover:underline",
                // Green surface — 틴트는 accent 불투명도로(새 틴트 토큰 없음)
                "green-surface":
                    "bg-fg-accent/8 text-fg-accent rounded-[6px] hover:bg-fg-accent/14 active:scale-[0.97]",
            },
            size: {
                default: "h-[38px] px-5 py-2",
                sm: "h-8 px-3 text-[13px]",
                lg: "h-11 px-7 text-base",
                xl: "h-12 px-8 text-base",
                icon: "h-9 w-9 rounded-[6px]",
                "icon-sm": "h-7 w-7 rounded-[6px]",
                // 공개 화면(controls): 가드 button-size 가 md·cta·icon-md 만 허용한다
                md: "h-11 px-5",
                cta: "h-12 px-7 text-base",
                "icon-md": "h-11 w-11 rounded-[6px]",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)
```

- [ ] **Step 2: 확인**

```bash
grep -c "#" components/ui/button.tsx      # 0
npm run typecheck && npx eslint components/ui/button.tsx --max-warnings=0 && npx vitest run tests/ui
```
Expected: PASS. 전체 `npx vitest run` 에서 Button 의 옛 클래스 문자열(`bg-[#084734]`)을 박제한 테스트가 깨지면 **기대값을 새 클래스로** 고친다(버튼을 되돌리지 않는다).

- [ ] **Step 3: Commit**

```bash
git add components/ui/button.tsx && git commit -m "refactor(ui): Button 색을 토큰 유틸로, 공개용 size md·cta·icon-md 추가

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 색 문서 (DESIGN.md · 홈 플레이북)

**Files:**
- Modify: `DESIGN.md` 4·26·27·72·73·75·그린 배급 bullet·`--line-link` 행
- Modify: `docs/active/playbook/01-home-front.md:42,59`

- [ ] **Step 1: 밑줄 대비 수치 계산**

```bash
node -e '
const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const cr=(a,b)=>((Math.max(L(a),L(b))+.05)/(Math.min(L(a),L(b))+.05)).toFixed(2);
const mix=(fg,bg,a)=>"#"+[1,3,5].map(i=>Math.round(parseInt(fg.slice(i,i+2),16)*a+parseInt(bg.slice(i,i+2),16)*(1-a)).toString(16).padStart(2,"0")).join("");
for(const bg of["#FFFFFF","#FAFAF8","#F6F5F4"]) console.log(bg, cr(mix("#0B7A52",bg,.75),bg));'
```
출력 세 값(sheet / paper / sunken 순)을 Step 2 의 `--line-link` 행에 적는다(약 3.3 / 3.2 / 3.1).

- [ ] **Step 2: DESIGN.md 치환** (python 으로 정확히 1회씩 치환; 하나라도 0회면 중단하고 원문을 확인)

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path("DESIGN.md"); s = p.read_text()
def rep(old, new):
    global s
    assert s.count(old) == 1, old[:50]
    s = s.replace(old, new)
rep("Classin 브랜드 그린(`#084734`)을 액센트로 오버라이드한 시스템.",
    "Classin 브랜드 그린(공개 `#0B7A52` · 어드민 `#084734`)을 액센트로 오버라이드한 시스템.")
rep("- **Classin Green** (`#084734`): Primary CTA, 링크, 인터랙티브 액센트 — 유일한 포화 컬러",
    "- **Classin Green** (`#084734` `[admin] in force` · 공개 화면 `#0B7A52` `[public] in force` 2026-11-02, 토큰 `--fg-accent`): Primary CTA, 링크, 인터랙티브 액센트 — 유일한 포화 컬러")
rep("- **Green Hover** (`#065c41`): 버튼 hover/active 상태 `[admin] in force`. 공개 화면 hover는 밝아지지 않고 짙어지는 `#073D2D`다 `[public] target`(2026-10-28)",
    "- **Green Hover** (`#065c41`): 버튼 hover/active 상태 `[admin] in force`. 공개 화면 hover는 밝아지지 않고 짙어지는 `#0A6E4A`다 `[public] in force`(2026-11-02, `--fg-accent-hover`)")
rep("| `--fg-accent` | `#084734` | `text-fg-accent`, `bg-fg-accent` | 10.71 / 10.08 / 9.56 |",
    "| `--fg-accent` | `#0B7A52` | `text-fg-accent`, `bg-fg-accent` | 5.36 / 5.13 / 4.92 |")
rep("| `--fg-accent-hover` | `#073D2D` | `hover:text-fg-accent-hover`, `hover:bg-fg-accent-hover` | 12.25 / 11.53 / 10.93 |",
    "| `--fg-accent-hover` | `#0A6E4A` | `hover:text-fg-accent-hover`, `hover:bg-fg-accent-hover` | 6.28 / 6.01 / 5.77 |")
rep("| `--fg-on-accent` | `#FAFAF8` | `text-fg-on-accent` | `#084734` 위 10.25 · `#073D2D` 위 11.72 |",
    "| `--fg-on-accent` | `#FAFAF8` | `text-fg-on-accent` | `#0B7A52` 위 5.13 · `#0A6E4A` 위 6.01 |")
rep("공개 그린 글자·채움 상태값은 OKLCH L ≤ .36(밝은 지면) 또는 C ≤ .07(먹 위)이다. `#0E5038`로 옮기지 않는다(L .385로 오히려 밝다).",
    "공개 그린 글자·채움은 `#0B7A52`(2026-11-02 확정, 밝은 지면 AA 통과)다. 밝은 지면 대비 4.5 아래로 내려가는 더 밝은 값은 쓰지 않는다. 어드민은 `#084734` 그대로이며 `tokens.css`의 `:root:not(:has(.site))` 블록이 맡는다.")
rep("| `--line-link` | `rgb(8 71 52 / .6)` | `decoration-line-link` | 3.51 / 3.43 / 3.36 | 링크 밑줄 |",
    "| `--line-link` | `rgb(11 122 82 / .75)` | `decoration-line-link` | S / P / K | 링크 밑줄 |")
p.write_text(s); print("ok")
PY
```
그 다음 `S / P / K` 를 Step 1 의 세 수치로 바꾼다.

- [ ] **Step 3: 플레이북 치환**

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path("docs/active/playbook/01-home-front.md"); s = p.read_text()
old1 = "유일 포화색 = ClassIn Green `#084734`(hover `#065c41`)."
new1 = "유일 포화색 = ClassIn Green — 공개 사이트 `#0B7A52`(hover `#0A6E4A`, 토큰 `--fg-accent`·`bg-fg-accent`), 어드민 `#084734`(hover `#065c41`). 공개 화면은 hex 를 쓰지 않고 토큰 유틸만 쓴다."
old2 = "포커스 링 `focus-visible:ring-2 ring-[#084734]`"
new2 = "포커스 링은 site-base 보증 outline 하나(컴포넌트별 ring 금지)"
assert s.count(old1) == 1 and s.count(old2) == 1
p.write_text(s.replace(old1, new1).replace(old2, new2)); print("ok")
PY
```

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md docs/active/playbook/01-home-front.md && git commit -m "docs(design): 공개 강조색 #0B7A52·hover #0A6E4A 반영, 어드민 #084734 유지 명시

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 홈 5화면 (TDD)

**Files:**
- Test: `tests/home/landing-sections.test.tsx`
- Create: `components/home/home-copy.ts`, `components/home/GatewayLink.tsx`, `components/home/HomeHero.tsx`, `components/home/HomeProblem.tsx`, `components/home/HomeHow.tsx`, `components/home/HomeProof.tsx`, `components/home/HomePilotCta.tsx`
- Modify: `app/page.tsx` (전체 교체)

- [ ] **Step 1: 실패하는 테스트**

`tests/home/landing-sections.test.tsx`:
```tsx
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { ReactElement, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// Next 런타임이 없는 node 환경: 이미지·링크·Radix 모달(ToastProvider 필요)은 껍데기로 대신한다
vi.mock("next/image", () => ({
  default: ({ priority: _p, loading: _l, ...rest }: Record<string, unknown>) => <img {...(rest as object)} />,
}))
vi.mock("next/link", () => ({
  default: ({ href, prefetch: _p, children, ...rest }: { href: string; prefetch?: boolean | null; children: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))
vi.mock("@/components/sections/DemoModal", () => ({
  DemoModal: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import { HomeHero } from "@/components/home/HomeHero"
import { HomeProblem } from "@/components/home/HomeProblem"
import { HomeHow } from "@/components/home/HomeHow"
import { HomeProof } from "@/components/home/HomeProof"
import { HomePilotCta } from "@/components/home/HomePilotCta"

const html = (el: ReactElement) => renderToStaticMarkup(el)
const CHECKLIST = "/resources/academy-system-checklist"

describe("홈 5화면", () => {
  it("히어로: H1·주 CTA 1회·진단지 링크·숫자 4개·제품 이미지", () => {
    const h = html(<HomeHero />)
    expect(h).toContain("<h1")
    expect(h).toContain("학원의 시스템으로")
    expect(h.match(/파일럿 상담 신청/g)).toHaveLength(1)
    expect(h).toContain(`href="${CHECKLIST}#download"`)
    for (const v of ["3,000만+", "5,000만+", "6만+", "160+"]) expect(h).toContain(v)
    expect(h).toContain('src="/images/hero-dashboard.webp"')
    expect(h).not.toContain("priority")
  })

  it.each([
    ["문제", HomeProblem, "강사가 바뀌면, 수업도 바뀝니다.", [CHECKLIST]],
    ["작동 방식", HomeHow, "수업 전·중·후를 하나의 흐름으로", ["/product/sw", "/product/hw", "/product/ai-report"]],
    ["증거", HomeProof, "먼저 바꾼 학원들", ["/blog"]],
  ] as const)("%s: H2 + 관문 링크", (_name, Section, heading, hrefs) => {
    const h = html(<Section />)
    expect(h).toContain("<h2")
    expect(h).toContain(heading)
    for (const href of hrefs) expect(h).toContain(`href="${href}"`)
  })

  it("파일럿: H2·주 CTA 1회·진단지·페이지 줄", () => {
    const h = html(<HomePilotCta />)
    expect(h).toContain("1개 교실, 90일 파일럿부터")
    expect(h.match(/파일럿 상담 신청/g)).toHaveLength(1)
    expect(h).toContain(`href="${CHECKLIST}#download"`)
    for (const href of ["/showroom", "/pricing", "/resources"]) expect(h).toContain(`href="${href}"`)
  })

  it("components/home 에 hex 리터럴이 없다", () => {
    const dir = join(process.cwd(), "components/home")
    for (const file of readdirSync(dir)) {
      expect(readFileSync(join(dir, file), "utf8"), file).not.toMatch(/#[0-9a-fA-F]{6}\b/)
    }
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run tests/home
```
Expected: FAIL — `Cannot find module '@/components/home/HomeHero'`.

- [ ] **Step 3: 카피 SSOT** — `components/home/home-copy.ts`

```ts
// components/home/home-copy.ts — 홈 5화면 카피 SSOT (스펙 §2-3). H1·리드는 lib/classin-positioning.ts 의
// heroHeadline·oneLine 을 쓴다. 숫자 4개는 docs/active/brand-canon/company-facts.md 의 EEO 공식 수치.
export const HOME_COPY = {
  hero: {
    kicker: "학원 수업 운영 OS",
    primaryCta: "파일럿 상담 신청",
    secondaryCta: "34문항 운영 진단지 받기",
    secondaryHref: "/resources/academy-system-checklist#download",
    imageAlt: "불 꺼진 교실 벽의 대형 전자칠판 화면에 푸른 지구가 떠 있는 장면",
    stats: [
      { value: "3,000만+", label: "월간 수업" },
      { value: "5,000만+", label: "교사 · 학습자" },
      { value: "6만+", label: "교육기관" },
      { value: "160+", label: "서비스 국가" },
    ],
    statsCaption: "EEO 공식 기준 · 전 세계 누적",
  },
  problem: {
    heading: "강사가 바뀌면, 수업도 바뀝니다.",
    scenes: [
      { title: "에이스 강사가 퇴사했습니다.", body: "그 반 20명의 수업 품질은 누가 지킵니까." },
      { title: "같은 교재, 같은 시간.", body: "반마다 성적이 다른데, 어느 반이 왜 다른지 모릅니다." },
      { title: "상담마다 같은 질문.", body: "\"복습은 어떻게 하나요?\"에 매번 말로만 답합니다." },
    ],
    closing: "수업은 개인기가 아니라, 시스템입니다.",
    link: { label: "우리 학원 운영 누수 진단하기", href: "/resources/academy-system-checklist" },
  },
  how: {
    heading: "수업 전·중·후를 하나의 흐름으로",
    linkLabel: "자세히 보기",
    steps: [
      { phase: "수업 전", title: "EDB 교안", body: "우수 강사의 판서와 자료를 다시 쓰는 수업 파일로 남깁니다.", href: "/product/sw" },
      { phase: "수업 중", title: "Classin Board", body: "전자칠판·카메라·OPS·소프트웨어가 한 교실 안에서 함께 돕니다.", href: "/product/hw" },
      { phase: "수업 후", title: "녹화 · AI 리포트 · 관리자 데이터", body: "수업이 끝나도 기록과 관리 기준이 남습니다.", href: "/product/ai-report" },
    ],
  },
  proof: {
    heading: "먼저 바꾼 학원들",
    cases: [
      { name: "청주 이** 국어", result: "첨삭·과제 이력을 누적해 강사별 편차를 줄였습니다." },
      { name: "부산 과**", result: "반별 수업 기록과 평가 데이터로 상담 준비 시간을 줄였습니다." },
      { name: "대치 세**", result: "판서와 자료가 수업 흐름 안에 남아 복습·보강 밀도를 높였습니다." },
    ],
    link: { label: "도입 이야기 더 보기", href: "/blog" },
  },
  pilot: {
    heading: "1개 교실, 90일 파일럿부터",
    steps: [
      { title: "대표 수업 선정", body: "가장 손이 많이 가는 수업 하나를 고릅니다." },
      { title: "교실 설치 · 온보딩", body: "보드 설치와 강사 온보딩을 함께 진행합니다." },
      { title: "결과 확인 후 확대", body: "녹화와 데이터로 결과를 보고 다음 교실을 정합니다." },
    ],
    honest: "결제 · 오프라인 출석 · 고급 리포트는 별도 시스템이나 연동으로 분리해 설계합니다.",
    primaryCta: "파일럿 상담 신청",
    secondaryCta: "34문항 운영 진단지 받기",
    secondaryHref: "/resources/academy-system-checklist#download",
    pages: [
      { label: "목동 쇼룸", href: "/showroom" },
      { label: "가격", href: "/pricing" },
      { label: "자료실", href: "/resources" },
    ],
  },
} as const
```

- [ ] **Step 4: 관문 링크** — `components/home/GatewayLink.tsx`

```tsx
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** 화면 끝의 관문 텍스트 링크. 강조색은 누를 수 있는 것에만(DESIGN.md §2) — 이 링크와 CTA 가 전부다 */
export function GatewayLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-1 text-ui font-semibold text-fg-accent hover:underline underline-offset-4", className)}
    >
      {children}
      <ArrowRight aria-hidden className="size-4 arrow-nudge" />
    </Link>
  )
}
```

- [ ] **Step 5: 1화면** — `components/home/HomeHero.tsx`

```tsx
"use client"

import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DemoModal } from "@/components/sections/DemoModal"
import { TrackedLink } from "@/components/TrackedLink"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import { HOME_COPY } from "./home-copy"

const { hero } = HOME_COPY
// "좋은 수업을, 강사의 개인기에서 학원의 시스템으로" — 쉼표에서 두 줄
const [h1Lead, h1Rest] = CLASSIN_POSITIONING.heroHeadline.split(", ")

export function HomeHero() {
  return (
    <section className="bg-surface-paper pt-(--header-h)">
      <div className="mx-auto max-w-[1040px] px-5 pb-14 pt-14 md:pb-20 md:pt-20">
        <div className="mx-auto max-w-[800px] text-center">
          <p className="text-label text-fg-muted">{hero.kicker}</p>
          <h1 className="mt-4 text-h1 text-fg-ink break-keep">
            {h1Lead},<br />{h1Rest}
          </h1>
          <p className="mt-5 text-body-l text-fg-body break-keep">{CLASSIN_POSITIONING.oneLine}</p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-5">
            <DemoModal trackingButton="hero_demo">
              <Button size="cta" className="w-full rounded-lg sm:w-auto">
                {hero.primaryCta}
                <ArrowRight aria-hidden className="arrow-nudge" />
              </Button>
            </DemoModal>
            <TrackedLink
              href={hero.secondaryHref}
              ctaId="hero_lead_magnet"
              tracking={{ lead_magnet: "academy-system-checklist" }}
              className="inline-flex items-center gap-1 text-ui font-semibold text-fg-accent hover:underline underline-offset-4"
            >
              {hero.secondaryCta}
              <ArrowRight aria-hidden className="size-4 arrow-nudge" />
            </TrackedLink>
          </div>
        </div>

        {/* LCP 는 H1. priority(preload) 는 가드가 막는다 — eager 로드만 */}
        <div className="mx-auto mt-12 max-w-[960px] overflow-hidden rounded-xl border border-line-hair bg-surface-sheet md:mt-14">
          <Image
            src="/images/hero-dashboard.webp"
            alt={hero.imageAlt}
            width={1536}
            height={1024}
            loading="eager"
            sizes="(min-width: 1040px) 960px, 100vw"
            className="h-auto w-full"
          />
        </div>

        <dl className="mx-auto mt-10 grid max-w-[960px] grid-cols-2 gap-y-6 border-y border-line-hair py-6 md:mt-12 md:grid-cols-4">
          {hero.stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center">
              {/* dt 가 먼저(HTML 순서), 화면은 숫자가 위(order) */}
              <dt className="order-2 mt-1 text-note text-fg-muted">{s.label}</dt>
              <dd className="text-h3 tabular-nums text-fg-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-center text-note text-fg-muted">{hero.statsCaption}</p>
      </div>
    </section>
  )
}
```

- [ ] **Step 6: 2화면** — `components/home/HomeProblem.tsx`

```tsx
import { Reveal } from "@/components/landing/Reveal"
import { GatewayLink } from "./GatewayLink"
import { HOME_COPY } from "./home-copy"

const { problem } = HOME_COPY

export function HomeProblem() {
  return (
    <section className="bg-surface-sunken py-14 md:py-20">
      <Reveal className="mx-auto max-w-[1040px] px-5">
        <h2 className="text-h2 text-fg-ink break-keep">{problem.heading}</h2>
        <ul className="mt-8 grid gap-4 md:mt-10 md:grid-cols-3">
          {problem.scenes.map((scene) => (
            <li key={scene.title} className="rounded-xl border border-line-hair bg-surface-sheet p-6">
              <h3 className="text-h3 text-fg-ink break-keep">{scene.title}</h3>
              <p className="mt-2 text-body text-fg-body break-keep">{scene.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-h3 text-fg-ink break-keep md:mt-10">{problem.closing}</p>
        <GatewayLink href={problem.link.href} className="mt-4">{problem.link.label}</GatewayLink>
      </Reveal>
    </section>
  )
}
```

- [ ] **Step 7: 3화면** — `components/home/HomeHow.tsx`

```tsx
import { Reveal } from "@/components/landing/Reveal"
import { GatewayLink } from "./GatewayLink"
import { HOME_COPY } from "./home-copy"

const { how } = HOME_COPY

export function HomeHow() {
  return (
    <section className="bg-surface-paper py-14 md:py-20">
      <Reveal className="mx-auto max-w-[1040px] px-5">
        <h2 className="text-h2 text-fg-ink break-keep">{how.heading}</h2>
        <ol className="mt-8 grid gap-4 md:mt-10 md:grid-cols-3">
          {how.steps.map((step) => (
            <li key={step.href} className="flex flex-col rounded-xl border border-line-hair bg-surface-sheet p-6">
              <p className="text-label text-fg-muted">{step.phase}</p>
              <h3 className="mt-2 text-h3 text-fg-ink break-keep">{step.title}</h3>
              <p className="mt-2 flex-1 text-body text-fg-body break-keep">{step.body}</p>
              <GatewayLink href={step.href} className="mt-5">{how.linkLabel}</GatewayLink>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  )
}
```

- [ ] **Step 8: 4화면** — `components/home/HomeProof.tsx`

```tsx
import { Reveal } from "@/components/landing/Reveal"
import { GatewayLink } from "./GatewayLink"
import { HOME_COPY } from "./home-copy"

const { proof } = HOME_COPY

export function HomeProof() {
  return (
    <section className="bg-surface-sunken py-14 md:py-20">
      <Reveal className="mx-auto max-w-[1040px] px-5">
        <h2 className="text-h2 text-fg-ink break-keep">{proof.heading}</h2>
        <ul className="mt-8 grid gap-6 md:mt-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line-hair">
          {proof.cases.map((c) => (
            <li key={c.name} className="md:px-6 md:first:pl-0 md:last:pr-0">
              <p className="text-body font-semibold text-fg-ink">{c.name}</p>
              <p className="mt-1 text-body text-fg-body break-keep">{c.result}</p>
            </li>
          ))}
        </ul>
        <GatewayLink href={proof.link.href} className="mt-8 md:mt-10">{proof.link.label}</GatewayLink>
      </Reveal>
    </section>
  )
}
```

- [ ] **Step 9: 5화면** — `components/home/HomePilotCta.tsx`

```tsx
"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DemoModal } from "@/components/sections/DemoModal"
import { TrackedLink } from "@/components/TrackedLink"
import { Reveal } from "@/components/landing/Reveal"
import { HOME_COPY } from "./home-copy"

const { pilot } = HOME_COPY

export function HomePilotCta() {
  return (
    <section className="bg-surface-paper py-14 md:py-20">
      <Reveal className="mx-auto max-w-[1040px] px-5">
        <h2 className="text-h2 text-fg-ink break-keep">{pilot.heading}</h2>
        <ol className="mt-8 grid gap-4 md:mt-10 md:grid-cols-3">
          {pilot.steps.map((step, i) => (
            <li key={step.title} className="rounded-xl border border-line-hair bg-surface-sheet p-6">
              <p className="text-label tabular-nums text-fg-muted">{i + 1}</p>
              <h3 className="mt-2 text-h3 text-fg-ink break-keep">{step.title}</h3>
              <p className="mt-2 text-body text-fg-body break-keep">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-caption text-fg-muted break-keep">{pilot.honest}</p>
        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
          <DemoModal trackingButton="final_consultation">
            <Button size="cta" className="w-full rounded-lg sm:w-auto">
              {pilot.primaryCta}
              <ArrowRight aria-hidden className="arrow-nudge" />
            </Button>
          </DemoModal>
          <TrackedLink
            href={pilot.secondaryHref}
            ctaId="final_lead_magnet"
            tracking={{ source: "home_final_cta", lead_magnet: "academy-system-checklist" }}
            className="inline-flex items-center gap-1 text-ui font-semibold text-fg-accent hover:underline underline-offset-4"
          >
            {pilot.secondaryCta}
            <ArrowRight aria-hidden className="size-4 arrow-nudge" />
          </TrackedLink>
        </div>
        <nav aria-label="다음 페이지" className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-line-hair pt-6">
          {pilot.pages.map((page) => (
            <Link key={page.href} href={page.href} className="text-ui text-fg-muted hover:text-fg-ink">
              {page.label}
            </Link>
          ))}
        </nav>
      </Reveal>
    </section>
  )
}
```

- [ ] **Step 10: 조립** — `app/page.tsx` 전체 교체

```tsx
import type { Metadata } from "next"
import dynamic from "next/dynamic"
import { HomeHero } from "@/components/home/HomeHero"
import { JsonLd } from "@/components/seo/JsonLd"
import { createBreadcrumbJsonLd, createPublicMetadata, createWebPageJsonLd } from "@/lib/seo"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"

export const metadata: Metadata = {
  ...createPublicMetadata({
    title: "수업 시스템 OS",
    description: CLASSIN_POSITIONING.metadataDescription,
    path: "/",
    keywords: ["수업 시스템 OS", "학원 수업 운영", "전자칠판", "EDB", "Classin"],
  }),
  title: { absolute: "Classin | 수업 시스템 OS" },
}

// 2~5화면은 폴드 아래 — 첫 청크에서 뺀다
const HomeProblem = dynamic(() => import("@/components/home/HomeProblem").then((m) => ({ default: m.HomeProblem })))
const HomeHow = dynamic(() => import("@/components/home/HomeHow").then((m) => ({ default: m.HomeHow })))
const HomeProof = dynamic(() => import("@/components/home/HomeProof").then((m) => ({ default: m.HomeProof })))
const HomePilotCta = dynamic(() => import("@/components/home/HomePilotCta").then((m) => ({ default: m.HomePilotCta })))

export default function LandingPage() {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/",
            name: "Classin 수업 시스템 OS",
            description: CLASSIN_POSITIONING.metadataDescription,
          }),
          createBreadcrumbJsonLd([{ name: "홈", path: "/" }]),
        ]}
      />
      {/* 5화면 관문: 히어로+신뢰 → 문제 → 작동 방식 → 증거 → 파일럿+CTA (스펙 §2-2) */}
      <HomeHero />
      <HomeProblem />
      <HomeHow />
      <HomeProof />
      <HomePilotCta />
    </>
  )
}
```

- [ ] **Step 11: 테스트·타입·린트·가드**

```bash
npx vitest run tests/home
npm run typecheck && npx eslint app/page.tsx components/home --max-warnings=0
node scripts/check-design-tokens.mjs 2>&1 | grep -n "components/home\|app/page.tsx" ; echo "exit ${PIPESTATUS[0]}"
```
Expected: 테스트 PASS, grep 출력 **0줄**. 한 줄이라도 나오면 그 규칙 메시지대로 고친다(토큰 유틸 밖의 클래스를 쓴 것이다).

- [ ] **Step 12: Commit**

```bash
git add tests/home/landing-sections.test.tsx components/home app/page.tsx && git commit -m "feat(home): 홈 랜딩을 5화면 컴팩트 관문으로 재작성 — 토큰 유틸만, hex 0

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: 옛 홈 섹션·영상 삭제, 가드 allow 정리

**Files:**
- Delete: `components/sections/{Hero,LogoBar,HomeEntitySummary,HomeAudiencePaths,EraVision,ProblemCost,HomeLeadMagnet,Manifesto,SolutionOverview,DashboardPreview,DashboardPreviewCharts,ScienceBased,SatisfyingClass,CaseStudies,GlobalScale,TestimonialWall,Outcomes,Comparison,FinalCTA}.tsx`, `public/video/home-hero.mp4`
- Modify: `scripts/check-design-tokens.mjs` (allow 목록 5곳)

- [ ] **Step 1: 참조 0 재확인 (병합 뒤 main 이 새 참조를 넣었을 수 있다)**

```bash
for n in Hero LogoBar HomeEntitySummary HomeAudiencePaths EraVision ProblemCost HomeLeadMagnet Manifesto SolutionOverview DashboardPreview DashboardPreviewCharts ScienceBased SatisfyingClass CaseStudies GlobalScale TestimonialWall Outcomes Comparison FinalCTA; do printf -- "-- %s: " "$n"; /usr/bin/grep -rl "sections/${n}[\"']\|/${n}[\"']" app components lib tests --include='*.tsx' --include='*.ts' | grep -v "components/sections/${n}.tsx" | tr '\n' ' '; echo; done
```
Expected: 전부 빈 목록(DashboardPreviewCharts 는 DashboardPreview 만, 이것도 삭제). 다른 참조가 있으면 **삭제하지 말고** 보고한다.

- [ ] **Step 2: 삭제**

```bash
git rm components/sections/Hero.tsx components/sections/LogoBar.tsx components/sections/HomeEntitySummary.tsx components/sections/HomeAudiencePaths.tsx components/sections/EraVision.tsx components/sections/ProblemCost.tsx components/sections/HomeLeadMagnet.tsx components/sections/Manifesto.tsx components/sections/SolutionOverview.tsx components/sections/DashboardPreview.tsx components/sections/DashboardPreviewCharts.tsx components/sections/ScienceBased.tsx components/sections/SatisfyingClass.tsx components/sections/CaseStudies.tsx components/sections/GlobalScale.tsx components/sections/TestimonialWall.tsx components/sections/Outcomes.tsx components/sections/Comparison.tsx components/sections/FinalCTA.tsx public/video/home-hero.mp4
```

- [ ] **Step 3: 가드 allow 정리** — `scripts/check-design-tokens.mjs`

| 규칙 | 바꾸기 전 | 바꾼 뒤 |
| --- | --- | --- |
| `chart-gradient` | `roots: ["components/charts/", "components/sections/DashboardPreview"]` | `roots: ["components/charts/"]` |
| `left-bar` allow | `"components/sections/Comparison.tsx", ` 포함 | 그 항목 제거 |
| `scope-display` allow | `["components/sections/Hero.tsx"]` | `["components/home/HomeHero.tsx"]` |
| `scope-poster` allow | `["components/sections/Manifesto.tsx"]` | `[]` |
| `scope-folio-null` allow | `["components/sections/Hero.tsx"]` | `[]` |
| `ink-primary-button` allow | `["components/sections/Hero.tsx", "components/sections/FinalCTA.tsx", "app/product/sw/page.tsx"]` | `["app/product/sw/page.tsx"]` |

```bash
grep -n "components/sections/\(Hero\|Manifesto\|FinalCTA\|Comparison\|DashboardPreview\)" scripts/check-design-tokens.mjs   # 0
```

- [ ] **Step 4: 게이트**

```bash
rm -rf .next && npm run typecheck && npx eslint app components lib --max-warnings=0 && npm run build && npx vitest run
```
`tests/ui/card.test.tsx` 의 "CaseStudies 활성" 케이스는 문자열만 박제한 것이라 그대로 통과한다.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-design-tokens.mjs && git commit -m "chore(home): 옛 홈 섹션 19개·히어로 영상(35MB) 삭제, 가드 allow 정리

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
(`git rm` 한 파일은 이미 스테이징돼 있다.)

---

### Task 7: 공개 사이트 그린 hex → 토큰 (5묶음, 묶음마다 커밋)

**범위** (스펙 §3-3): 묶음 A `components/sections/**` · B `app/product/**` + `components/product/**` · C `components/ui/**`(`card.tsx`·`button.tsx` 제외) · D `app/{about,contact,pricing,resources,docs,blog,events,showroom,download,updates,faq,premium,terms,privacy,unsubscribe,data-deletion}/**` + `app/*.tsx` · E `components/{landing,docs,blog,seminars,showroom,events,premium,legal,consent,media,seo}/**`.
**제외**: `components/ui/card.tsx`(테스트 박제), `components/{billing,checkout,portal,auth,account}`, `app/{checkout,receipt,share,account,auth}`, `lib/**`, `app/globals.css`(15곳 전부 어드민·shadcn 공용).

**치환 규칙** — 1차는 sed(모양이 유일한 클래스만), 2차는 손.

- [ ] **Step 1 (묶음마다): 현황**

```bash
P="<묶음 경로들>"
/usr/bin/grep -rnoi "#084734\|#065c41\|#073d2d\|#ecfdf5\|#d1fae5\|rgba(8, *71, *52[^)]*)" $P --include='*.tsx' --include='*.ts' | wc -l
```

- [ ] **Step 2 (묶음마다): sed 1차** (macOS sed; 대소문자 둘 다)

```bash
find $P \( -name '*.tsx' -o -name '*.ts' \) -not -name 'card.tsx' -not -name 'button.tsx' -print0 | xargs -0 sed -i '' -E \
  -e 's/(text|bg|border|ring|outline|divide|fill|stroke|from|via|to|decoration)-\[#084734\]/\1-fg-accent/g' \
  -e 's/(text|bg|border)-\[#065[cC]41\]/\1-fg-accent-hover/g' \
  -e 's/(text|bg|border)-\[#073[dD]2[dD]\]/\1-fg-accent-hover/g' \
  -e 's/bg-\[#[eE][cC][fF][dD][fF]5\]/bg-fg-accent\/8/g' \
  -e 's/bg-\[#[dD]1[fF][aA][eE]5\]/bg-fg-accent\/14/g' \
  -e 's/border-\[#[eE][cC][fF][dD][fF]5\]/border-line-hair/g'
```
(macOS BSD sed 라 `-E` 필수. `/N` 불투명도 접미사는 그대로 남아 `bg-fg-accent/30` 이 된다. 치환 뒤 `git diff --stat $P` 로 건드린 파일 수를 본다.)

- [ ] **Step 3 (묶음마다): 손 2차** — 남은 출현을 하나씩

```bash
/usr/bin/grep -rni "#084734\|#065c41\|#073d2d\|#ecfdf5\|#d1fae5\|rgba(8, *71, *52" $P --include='*.tsx' --include='*.ts'
```
| 남은 모양 | 처리 |
| --- | --- |
| `style={{ color: "#084734" }}`·`backgroundColor` | 클래스 `text-fg-accent`/`bg-fg-accent` 로 옮기고 style 제거 |
| SVG `fill="#084734"`·`stroke="#084734"` | `fill="currentColor"` + 부모/자신에 `text-fg-accent`, 또는 `className="fill-fg-accent"` |
| `shadow-[… rgba(8,71,52,…)]`·`boxShadow: 'rgba(8,71,52,…)'` | 그림자 삭제(가드가 그림자를 금지) → 필요하면 `border border-line-hair` |
| `border-[rgba(8,71,52,0.12)]` 등 | `border-fg-accent/12` |
| `bg-[rgba(8,71,52,0.1)]` | `bg-fg-accent/10` |
| `text-[#6EE7B7]`·`bg-[#6EE7B7]` 가 `surface-ink` 안 | `text-fg-accent`·`bg-fg-accent` (먹 지면이 변수로 민트를 준다) |
| 액센트 채움 요소의 `text-white` | `text-fg-on-accent` (`grep -n "bg-fg-accent[^/].*text-white\|text-white.*bg-fg-accent"`) |
| 문자열 상수(`const GREEN = "#084734"`)·차트 색 | 가능하면 `color.accent`(`@/lib/design-tokens`) — 공개 차트·OG 전용일 때만. 어드민과 공유하는 상수면 그대로 두고 보고 |
| `#084734` 가 주석 안 | 그대로 |

- [ ] **Step 4 (묶음마다): 확인 + 커밋**

```bash
npm run typecheck && npx eslint $P --max-warnings=0 && node scripts/check-design-tokens.mjs > /tmp/guard.txt; grep -c "hex-literal" /tmp/guard.txt; true
npx vitest run
git add $P && git commit -m "refactor(public): <묶음 이름> 그린 hex → 토큰 유틸

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
가드 출력에서 **늘어난** 항목(`+N`)이 있으면 그 파일을 되짚는다. 줄어드는 것만 정상이다.

묶음 순서: A → B → C → D → E. 각 묶음 뒤 출현 수가 0 이 되지 않는 파일(어드민 공유 상수 등)은 커밋 메시지 본문에 경로와 이유를 적는다.

---

### Task 8: 최종 게이트·베이스라인·푸시·PR

- [ ] **Step 1: 전체 게이트**

```bash
rm -rf .next && npm run typecheck && npx eslint app components lib --max-warnings=0 && npm run build && npx vitest run
```

- [ ] **Step 2: 홈 hex 0 + 가드 베이스라인 내리기**

```bash
grep -rc '#[0-9A-Fa-f]\{6\}' components/home app/page.tsx      # 전부 :0
node scripts/check-design-tokens.mjs --update-baseline           # 늘어난 항목 0 → 기록
git add scripts/design-baseline.json && git commit -m "chore(design): 가드 베이스라인 갱신 — 홈 재작성·hex 토큰화 반영

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
`--update-baseline` 이 거부하면(늘어난 항목) 그 파일·규칙을 고친 뒤 다시 한다. 베이스라인을 손으로 고치지 않는다.

- [ ] **Step 3: 푸시 + PR (스쿼시 병합 관례)**

```bash
git push -u origin design/p1-visual
gh pr create --base main --title "홈 랜딩 5화면 컴팩트 개편 + 공개 강조색 #0B7A52 토큰화" --body-file - <<'MD'
## 요약
- 홈(`/`)을 5화면 관문으로 재작성: 히어로+신뢰 띠 → 문제 → 작동 방식(제품 3페이지 링크) → 증거(블로그) → 파일럿+CTA. 섹션 19개·히어로 영상 35MB 삭제.
- 공개 사이트 강조색 `#084734` → `#0B7A52`(hover `#0A6E4A`). `tokens.css` 한 곳. 어드민은 `:root:not(:has(.site))` 블록으로 `#084734` 유지.
- 공개 사이트 그린 hex 리터럴 → 토큰 유틸(`bg-fg-accent` 등). 공용 Button 토큰화 + 공개용 size `md|cta|icon-md`.
- origin/main(10-30 개인정보 핫픽스) 병합 포함.

설계: `docs/superpowers/specs/2026-10-30-home-landing-redesign-design.md` · 계획: `docs/superpowers/plans/2026-11-02-home-landing-redesign.md`

## 검증
- typecheck · eslint · build(디자인 가드 포함) · vitest 전부 통과
- `components/home/**` hex 0, 가드 신규 위반 0, 베이스라인 갱신
- 브라우저 1280/375 스크린샷은 PR 코멘트

## 배포
운영 배포는 사용자가 실행(Vercel Promote).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
MD
```

---

## Self-review (작성자 확인)

- 스펙 §1 목표 6개 → Task 5(5화면·400줄 이하·링크), Task 5(밝은 정적 히어로·영상 삭제는 Task 6), Task 5(파일럿 단일 CTA), Task 2(색), Task 5+8(hex 0). 커버.
- §2-3 카피 전부 `home-copy.ts` 에 그대로. §2-4 규칙: 지면 교차(1·3·5 paper, 2·4 sunken) ✓, 강조색은 CTA·링크만 ✓, 타이포 토큰만 ✓, 여백 `py-14 md:py-20`·`max-w-[1040px]` ✓, Reveal 2~5 ✓, 히어로 이미지 1장·`loading="eager"`(priority 는 가드 금지라 스펙의 `priority` 를 eager 로 대체) ✓.
- §3-1 삭제 목록 = Task 6 Step 2 목록(19 + mp4) ✓. `lib/testimonials.ts`·`hero-soft-enter`·`KeyUseCases` 유지 ✓.
- §3-2 = Task 2·3·4 ✓ (가드 HEX_ALLOW 에 `#084734` 없음 — 할 일 없음). §3-3 = Task 7 ✓. §3-4 계측 id 4개 = HomeHero·HomePilotCta ✓. §3-5 = Task 1(origin/main) ✓.
- §4 검증 1~3 = Task 5 Step 11·Task 8 ✓. 4(브라우저)·5(시안 대조)는 Fable 이 Task 8 뒤 직접 한다.
- 타입 일관성: `HOME_COPY` 키(hero/problem/how/proof/pilot)와 각 컴포넌트의 구조 분해가 일치. `GatewayLink({ href, className, children })` 호출 3곳 동일. `Button size="cta"` 는 Task 3 에서 추가.
