# 다운로드 페이지 신설 + GNB 재배치 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 사이트에 `/download` 페이지를 신설하고, GNB의 `자료 받아보기`를 `다운로드`로 교체하며, `자료 받아보기` 진입점을 블로그·행사 상세 페이지 하단 추천 밴드로 재배치한다.

**Architecture:** 다운로드 버전·URL은 `lib/downloads.ts` 한 곳에 상수로 모은다(순수 데이터 + 순수 헬퍼, 단위 테스트 대상). 라우트 `app/download/page.tsx`(서버, metadata/JSON-LD)가 클라이언트 컴포넌트 `DownloadPageClient`(OS 자동 감지 하이라이트 + 플랫폼 그리드)를 렌더한다. GNB(`Header.tsx`)와 재사용 밴드(`ResourcesRecommendation`)는 정적 링크만 다룬다.

**Tech Stack:** Next.js 16(App Router) · React 19 · TypeScript · Tailwind CSS 4 · lucide-react · Vitest · `TrackedLink`(click_cta 계측)

설계 문서: [download-page-design-2026-07-14.md](download-page-design-2026-07-14.md)

---

## 파일 구조

- Create: `lib/downloads.ts` — 다운로드 버전·URL 상수, 타입, 순수 헬퍼(`detectPrimaryOs`, `highlightPlatformId`).
- Create: `tests/download/downloads.test.ts` — 데이터/헬퍼 단위 테스트.
- Create: `app/download/page.tsx` — 서버 라우트, metadata + JSON-LD.
- Create: `app/download/DownloadPageClient.tsx` — 다운로드 UI(클라이언트, OS 감지).
- Create: `components/sections/ResourcesRecommendation.tsx` — 자료 받아보기 추천 밴드.
- Modify: `components/sections/Header.tsx` — GNB `자료 받아보기` → `다운로드` 교체(데스크톱·모바일).
- Modify: `app/blog/[slug]/page.tsx` — 상세 하단에 추천 밴드 삽입.
- Modify: `app/events/[slug]/page.tsx` — 상세 하단에 추천 밴드 삽입.

---

## Task 1: 다운로드 데이터 모듈 + 단위 테스트 (TDD)

**Files:**
- Create: `lib/downloads.ts`
- Test: `tests/download/downloads.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/download/downloads.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import {
  PRIMARY_DOWNLOADS,
  SECONDARY_DOWNLOADS,
  detectPrimaryOs,
  highlightPlatformId,
} from "@/lib/downloads"

const allVariants = [...PRIMARY_DOWNLOADS, ...SECONDARY_DOWNLOADS].flatMap((p) => p.variants)

describe("downloads data", () => {
  it("모든 다운로드 URL은 https이며 HubSpot 추적 파라미터가 없다", () => {
    for (const v of allVariants) {
      expect(v.href.startsWith("https://")).toBe(true)
      expect(v.href).not.toContain("__hstc")
      expect(v.href).not.toContain("__hssc")
      expect(v.href).not.toContain("__hsfp")
    }
  })

  it("주요 플랫폼은 windows/mac/mobile 순서를 유지한다", () => {
    expect(PRIMARY_DOWNLOADS.map((p) => p.id)).toEqual(["windows", "mac", "mobile"])
  })

  it("모바일 플랫폼 변형은 matchOs로 ios/android를 구분한다", () => {
    const mobile = PRIMARY_DOWNLOADS.find((p) => p.id === "mobile")!
    expect(mobile.variants.map((v) => v.matchOs)).toEqual(["ios", "android"])
  })
})

describe("detectPrimaryOs", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "mac"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", "ios"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8)", "android"],
    ["totally-unknown-agent", "windows"],
  ] as const)("%s → %s", (ua, expected) => {
    expect(detectPrimaryOs(ua)).toBe(expected)
  })
})

describe("highlightPlatformId", () => {
  it("모바일 OS는 mobile로, 그 외는 자기 자신/windows로 매핑", () => {
    expect(highlightPlatformId("ios")).toBe("mobile")
    expect(highlightPlatformId("android")).toBe("mobile")
    expect(highlightPlatformId("mac")).toBe("mac")
    expect(highlightPlatformId("windows")).toBe("windows")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- downloads`
Expected: FAIL — `Cannot find module '@/lib/downloads'` (또는 해당 export 없음).

- [ ] **Step 3: Write minimal implementation**

Create `lib/downloads.ts`:

```ts
// Classin 다운로드 데이터 (단일 소스)
// 버전 갱신 시 이 파일만 수정한다. URL은 공식 CDN(download.eeo.cn / eeo.cn)이며
// HubSpot 추적 파라미터(__hstc 등)는 제거한 상태로 유지한다.

export const CLASSIN_VERSION = "6.0.8"

export type PlatformId = "windows" | "mac" | "mobile" | "linux" | "classinx"
export type DetectedOs = "windows" | "mac" | "ios" | "android"
export type DownloadIcon = "windows" | "apple" | "mobile" | "linux" | "classinx"

export interface DownloadVariant {
  label: string
  href: string
  matchOs?: Extract<DetectedOs, "ios" | "android">
}

export interface DownloadPlatform {
  id: PlatformId
  os: string
  note?: string
  icon: DownloadIcon
  variants: DownloadVariant[]
}

export const PRIMARY_DOWNLOADS: DownloadPlatform[] = [
  {
    id: "windows",
    os: "Windows",
    note: "Windows 7 이상",
    icon: "windows",
    variants: [
      {
        label: "다운로드",
        href: "https://download.eeo.cn/client/classin_win_install_6.0.8.2730_s.exe",
      },
    ],
  },
  {
    id: "mac",
    os: "macOS",
    icon: "apple",
    variants: [
      {
        label: "Intel",
        href: "https://download.eeo.cn/client/classin_mac_install_6.0.8.2734_s.dmg",
      },
      {
        label: "Apple Silicon",
        href: "https://download.eeo.cn/client/classin_mac_install_6.0.8.2735_arm64.dmg",
      },
    ],
  },
  {
    id: "mobile",
    os: "모바일",
    note: "iOS · Android",
    icon: "mobile",
    variants: [
      {
        label: "App Store",
        href: "https://apps.apple.com/app/classin/id1226361488",
        matchOs: "ios",
      },
      {
        label: "Google Play",
        href: "https://play.google.com/store/apps/details?id=cn.eeo.classin",
        matchOs: "android",
      },
    ],
  },
]

export const SECONDARY_DOWNLOADS: DownloadPlatform[] = [
  {
    id: "linux",
    os: "Linux",
    note: ".deb",
    icon: "linux",
    variants: [
      {
        label: "x86_64",
        href: "https://www.eeo.cn/download/client/classin_6.0.8.2737_amd64.deb",
      },
      {
        label: "arm64",
        href: "https://www.eeo.cn/download/client/classin_6.0.8.2738_arm64.deb",
      },
    ],
  },
  {
    id: "classinx",
    os: "ClassIn X",
    note: "교실용 · Windows",
    icon: "classinx",
    variants: [
      {
        label: "64bit",
        href: "https://download.eeo.cn/client/classinx_win_install_6.0.8.2733_x64.exe",
      },
      {
        label: "32bit",
        href: "https://download.eeo.cn/client/classinx_win_install_6.0.8.2732_s.exe",
      },
    ],
  },
]

export function detectPrimaryOs(userAgent: string): DetectedOs {
  const ua = userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return "ios"
  if (/android/.test(ua)) return "android"
  if (/macintosh|mac os x/.test(ua)) return "mac"
  return "windows"
}

// 자동 감지된 OS를 상단 하이라이트에 쓸 주요 플랫폼으로 매핑한다.
export function highlightPlatformId(
  os: DetectedOs,
): Extract<PlatformId, "windows" | "mac" | "mobile"> {
  if (os === "mac") return "mac"
  if (os === "ios" || os === "android") return "mobile"
  return "windows"
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- downloads`
Expected: PASS (4개 describe 전부 통과).

- [ ] **Step 5: Commit**

```bash
git add lib/downloads.ts tests/download/downloads.test.ts
git commit -m "feat(front): Classin 다운로드 데이터 모듈 + 단위 테스트"
```

---

## Task 2: `/download` 라우트 + 다운로드 UI

**Files:**
- Create: `app/download/page.tsx`
- Create: `app/download/DownloadPageClient.tsx`

- [ ] **Step 1: 서버 라우트 작성**

Create `app/download/page.tsx`:

```tsx
import type { Metadata } from "next"

import { DownloadPageClient } from "./DownloadPageClient"
import { createBreadcrumbJsonLd, createPublicMetadata, createWebPageJsonLd } from "@/lib/seo"
import { JsonLd } from "@/components/seo/JsonLd"

export const metadata: Metadata = createPublicMetadata({
  title: "다운로드",
  description:
    "수업에 필요한 Classin 앱을 Windows, macOS, iOS, Android 등 기기에 맞게 내려받으세요.",
  path: "/download",
  keywords: ["Classin 다운로드", "클래스인 설치", "Classin Windows", "Classin Mac", "Classin 앱"],
})

export default function DownloadPage() {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({
            path: "/download",
            name: "Classin 앱 다운로드",
            description: "수업에 필요한 Classin 앱을 기기에 맞게 내려받으세요.",
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "다운로드", path: "/download" },
          ]),
        ]}
      />
      <DownloadPageClient />
    </>
  )
}
```

- [ ] **Step 2: 다운로드 클라이언트 UI 작성**

Create `app/download/DownloadPageClient.tsx`:

```tsx
"use client"

import * as React from "react"
import { Apple, Download, Monitor, School, Smartphone, Terminal } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import {
  CLASSIN_VERSION,
  PRIMARY_DOWNLOADS,
  SECONDARY_DOWNLOADS,
  detectPrimaryOs,
  highlightPlatformId,
  type DownloadIcon,
  type DownloadPlatform,
  type DownloadVariant,
} from "@/lib/downloads"

const ICONS: Record<DownloadIcon, React.ComponentType<{ className?: string }>> = {
  windows: Monitor,
  apple: Apple,
  mobile: Smartphone,
  linux: Terminal,
  classinx: School,
}

function ctaIdFor(platform: DownloadPlatform, variant: DownloadVariant) {
  const suffix = (variant.matchOs ?? variant.label).toLowerCase().replace(/\s+/g, "_")
  return `download_${platform.id}_${suffix}`
}

function DownloadLink({
  platform,
  variant,
  primary,
}: {
  platform: DownloadPlatform
  variant: DownloadVariant
  primary?: boolean
}) {
  return (
    <TrackedLink
      href={variant.href}
      ctaId={ctaIdFor(platform, variant)}
      tracking={{ platform: platform.id, variant: variant.label, version: CLASSIN_VERSION }}
      target="_blank"
      rel="noopener noreferrer"
      className={
        primary
          ? "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] bg-[#084734] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#065c41]"
          : "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] border border-[#084734]/20 bg-white px-3.5 py-2 text-[13px] font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5]"
      }
    >
      {primary ? <Download className="h-4 w-4" /> : null}
      {variant.label}
    </TrackedLink>
  )
}

function PlatformCard({ platform }: { platform: DownloadPlatform }) {
  const Icon = ICONS[platform.icon]
  return (
    <div className="rounded-[16px] border border-black/[0.08] bg-white p-5">
      <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#F6F5F4] text-[#111110]">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-[15px] font-semibold text-[#111110]">{platform.os}</p>
      {platform.note ? <p className="mt-0.5 text-[13px] text-[#615D59]">{platform.note}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {platform.variants.map((variant) => (
          <DownloadLink key={variant.href} platform={platform} variant={variant} />
        ))}
      </div>
    </div>
  )
}

export function DownloadPageClient() {
  const [detected, setDetected] = React.useState<ReturnType<typeof detectPrimaryOs>>("windows")

  React.useEffect(() => {
    setDetected(detectPrimaryOs(navigator.userAgent))
  }, [])

  const highlightId = highlightPlatformId(detected)
  const highlight =
    PRIMARY_DOWNLOADS.find((platform) => platform.id === highlightId) ?? PRIMARY_DOWNLOADS[0]
  const HighlightIcon = ICONS[highlight.icon]

  return (
    <section className="pb-20 pt-28 md:pt-36">
      <div className="container mx-auto max-w-3xl px-5">
        <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#084734]">Download</p>
        <h1 className="mt-2.5 text-[2rem] font-semibold leading-[1.2] tracking-[-0.02em] text-[#111110] md:text-[2.4rem]">
          Classin 앱 다운로드
        </h1>
        <p className="mt-2 text-[15px] leading-7 text-[#615D59]">
          수업에 필요한 Classin을 기기에 맞게 설치하세요. 현재 버전 {CLASSIN_VERSION}
        </p>

        <div className="mt-8 flex flex-col gap-4 rounded-[16px] border border-black/[0.08] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] bg-[#ECFDF5] text-[#084734]">
              <HighlightIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[11px] font-semibold text-[#084734]">현재 사용 중인 기기</p>
              <p className="text-[16px] font-semibold text-[#111110]">
                {highlight.os}
                {highlight.note ? ` · ${highlight.note}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {highlight.variants.map((variant) => (
              <DownloadLink key={variant.href} platform={highlight} variant={variant} primary />
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PRIMARY_DOWNLOADS.map((platform) => (
            <PlatformCard key={platform.id} platform={platform} />
          ))}
        </div>

        <p className="mb-3 mt-10 text-[12px] font-medium uppercase tracking-[0.12em] text-[#615D59]">
          기타 플랫폼
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SECONDARY_DOWNLOADS.map((platform) => (
            <PlatformCard key={platform.id} platform={platform} />
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Lint + 타입 확인**

Run: `npx eslint app/download --max-warnings=0 && npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 4: 브라우저 프리뷰 검증**

`.claude/launch.json`의 dev 서버로 프리뷰를 열고 `/download`로 이동한다(dev 포트 3888). 확인:
- 히어로/버전 문구 렌더, 하이라이트 카드가 접속 OS를 반영, 주요 4카드(Windows/macOS/모바일) + 기타(Linux/ClassIn X) 노출.
- `read_console_messages`로 hydration 경고 없음 확인.
- 다운로드 링크 href가 `lib/downloads.ts`의 URL과 일치(`read_page`).

- [ ] **Step 5: Commit**

```bash
git add app/download/page.tsx app/download/DownloadPageClient.tsx
git commit -m "feat(front): /download 페이지 신설 (OS 자동 감지 + 플랫폼 그리드)"
```

---

## Task 3: GNB — 자료 받아보기 → 다운로드 교체

**Files:**
- Modify: `components/sections/Header.tsx`

- [ ] **Step 1: 데스크톱 우측 클러스터 교체**

`components/sections/Header.tsx`에서 데스크톱 `자료 받아보기` 링크(`SessionNavEntry`와 `도입 문의` 사이, `ctaId="gnb_resources"`, `href="/resources"`)를 아래로 교체:

```tsx
                    <TrackedLink
                        href="/download"
                        prefetch={false}
                        ctaId="gnb_download"
                        className="hidden font-semibold text-[15px] text-[#615D59] transition-colors hover:text-[#084734] md:flex"
                    >
                        다운로드
                    </TrackedLink>
```

- [ ] **Step 2: 모바일 액션 그룹 교체**

같은 파일 모바일 메뉴 하단 액션 그룹의 `자료 받아보기` 링크(`ctaId="gnb_mobile_resources"`, `href="/resources"`)를 아래로 교체:

```tsx
                            <TrackedLink
                                href="/download"
                                prefetch={false}
                                ctaId="gnb_mobile_download"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="flex min-h-11 w-full items-center justify-center rounded-[8px] border border-black/[0.08] bg-white px-4 text-[15px] font-semibold text-[#615D59] transition-colors hover:bg-[#F6F5F4]"
                            >
                                다운로드
                            </TrackedLink>
```

- [ ] **Step 3: Lint 확인**

Run: `npx eslint components/sections/Header.tsx --max-warnings=0`
Expected: 오류 없음. (`components/sections/Header.tsx`에 더 이상 `/resources` 링크가 없어야 함 — `grep -n "gnb_resources\|자료 받아보기" components/sections/Header.tsx`로 0건 확인.)

- [ ] **Step 4: Commit**

```bash
git add components/sections/Header.tsx
git commit -m "feat(front): GNB 자료 받아보기 → 다운로드 교체"
```

---

## Task 4: 자료 받아보기 추천 밴드 + 블로그·행사 상세 삽입

**Files:**
- Create: `components/sections/ResourcesRecommendation.tsx`
- Modify: `app/blog/[slug]/page.tsx`
- Modify: `app/events/[slug]/page.tsx`

- [ ] **Step 1: 추천 밴드 컴포넌트 작성**

Create `components/sections/ResourcesRecommendation.tsx`:

```tsx
import { ArrowRight, FileText } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"

export function ResourcesRecommendation({ surface }: { surface: string }) {
  return (
    <div className="mt-12 rounded-[24px] border border-black/[0.08] bg-[#F6F5F4] p-6 md:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 inline-flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-white text-[#084734]">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#615D59]">
              자료실
            </p>
            <h2 className="mt-1 text-[1.25rem] font-semibold tracking-[-0.02em] text-[#111110]">
              도입 검토에 필요한 PDF 자료
            </h2>
            <p className="mt-1.5 text-[14px] leading-6 text-[#615D59]">
              학원 운영·전자칠판·수업 시스템 체크리스트를 무료로 받아보세요.
            </p>
          </div>
        </div>
        <TrackedLink
          href="/resources"
          ctaId={`resources_reco_${surface}`}
          className="inline-flex flex-none items-center justify-center gap-2 rounded-[8px] bg-[#084734] px-5 py-3 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#065c41]"
        >
          자료 받아보기
          <ArrowRight className="h-4 w-4" />
        </TrackedLink>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 블로그 상세에 삽입**

`app/blog/[slug]/page.tsx` 상단 import에 추가:

```tsx
import { ResourcesRecommendation } from "@/components/sections/ResourcesRecommendation"
```

`{ctaHref && ( ... )}` CTA 블록(검은 배경 블록)의 닫는 `)}` **직후**, 그 블록을 감싸는 컨테이너의 닫는 `</div>` **직전**에 삽입:

```tsx
            <ResourcesRecommendation surface="blog" />
```

즉 구조는 다음과 같이 된다:

```tsx
            {ctaHref && (
              /* ...기존 검은 CTA 블록... */
            )}

            <ResourcesRecommendation surface="blog" />
          </div>
        </div>
      </section>
```

- [ ] **Step 3: 행사 상세에 삽입**

`app/events/[slug]/page.tsx` 상단 import에 추가:

```tsx
import { ResourcesRecommendation } from "@/components/sections/ResourcesRecommendation"
```

`{ctaHref && event.status !== "마감" && ( ... )}` CTA 블록의 닫는 `)}` **직후**, 감싸는 컨테이너의 닫는 `</div>` **직전**에 삽입:

```tsx
          <ResourcesRecommendation surface="event" />
```

즉 구조는 다음과 같이 된다:

```tsx
          {ctaHref && event.status !== "마감" && (
            /* ...기존 검은 CTA 블록... */
          )}

          <ResourcesRecommendation surface="event" />
        </div>
      </section>
```

- [ ] **Step 4: Lint + 타입 확인**

Run: `npx eslint components/sections/ResourcesRecommendation.tsx "app/blog/[slug]/page.tsx" "app/events/[slug]/page.tsx" --max-warnings=0 && npm run typecheck`
Expected: 오류 없음.

- [ ] **Step 5: Commit**

```bash
git add components/sections/ResourcesRecommendation.tsx "app/blog/[slug]/page.tsx" "app/events/[slug]/page.tsx"
git commit -m "feat(front): 자료 받아보기 추천 밴드 재배치 (블로그·행사 상세)"
```

---

## Task 5: 전체 품질 게이트 + 브라우저 검증

**Files:** 없음(검증만).

- [ ] **Step 1: 프로젝트 게이트 실행**

Run: `npx eslint app components lib --max-warnings=0 && npm run test -- downloads && npm run build`
Expected: 세 명령 모두 성공(경고 0, 테스트 통과, 빌드 성공).

- [ ] **Step 2: 브라우저 전 구간 검증**

dev 프리뷰(포트 3888)에서:
- GNB에 `다운로드`가 `내 계정` 옆에 보이고 `자료 받아보기`는 안 보임(데스크톱·모바일 각각).
- `/download` 진입·OS 하이라이트·전 플랫폼 링크 정상.
- 임의의 블로그 상세(`/blog/{slug}`)와 행사 상세(`/events/{slug}`) 하단에 추천 밴드 노출, `자료 받아보기` 클릭 시 `/resources` 이동.
- `read_console_messages`로 신규 오류/hydration 경고 없음.

- [ ] **Step 3: 스크린샷으로 결과 공유**

`computer {action:"screenshot"}`로 `/download`와 GNB, 상세 하단 밴드를 캡처해 사용자에게 공유.

---

## Self-Review 체크

- **Spec coverage**: `/download` 신설(Task 2) · 데이터 중앙화(Task 1) · OS 감지(Task 2) · CamIn 제외(Task 1 데이터에 없음) · GNB 교체(Task 3) · 상세 하단 재배치(Task 4) · 게이트(Task 5) — 설계 문서 각 항목 대응 완료. `/resources` 페이지는 손대지 않음(범위 밖 준수).
- **Placeholder scan**: 모든 코드 단계에 실제 코드 포함, TBD/TODO 없음.
- **Type consistency**: `PlatformId`/`DetectedOs`/`DownloadIcon`/`DownloadVariant`/`DownloadPlatform`와 `detectPrimaryOs`·`highlightPlatformId` 시그니처가 Task 1 정의와 Task 2 사용처에서 일치. `ICONS` 키는 `DownloadIcon` 유니온과 정확히 일치.
