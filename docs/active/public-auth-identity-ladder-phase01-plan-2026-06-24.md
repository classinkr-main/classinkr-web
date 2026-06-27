# 공개 사용자 로그인 — 점진적 정체성 계단 Phase 0–1 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개(비관리자) 로그인 쐐기를 *실제로 작동하고 신뢰할 수 있게* 만든다 — 프리미엄(로그인 게이트) 자료가 로그인 후 자동 재개되고, 정체성 스티칭이 검증-이메일 게이트로 결정론화되며, Kakao가 추가되고, 최소 `/account` 멤버 표면이 생긴다. 이로써 깨지지 않는 통합 고객 ID의 토대를 놓는다.

**Architecture:** 정체성 사다리 L0(익명 `cln_aid`) → L1(리드, email 게이트) → L2(인증 멤버, `auth.users`+`user_profiles`) → L3(제품 계정, `account_ref` 예약). 표준 스파인은 `auth.users`이고 `leads.user_id`(신규)로 1:N 연결. "프리미엄"은 **기존 `gate:'login'`** 이며 새 enum/필드를 만들지 않는다(검증 로그인이 곧 권한). 로그인 후 재개는 same-origin 상대 `next` 안의 `resume=download` 마커로 전달. 리드 자동 결합은 **provider가 검증한 이메일일 때만**.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript(strict), Supabase(`@supabase/ssr` 서버 클라이언트 + service-role admin 클라이언트), vitest 4.1.5.

**Spec:** [public-auth-identity-ladder-2026-06-24.md](public-auth-identity-ladder-2026-06-24.md)

---

## 잠긴 결정 (D1–D8 요약)

- **D1 프리미엄 = 기존 로그인 게이트.** `gate:'login'`이 곧 프리미엄. 새 gate enum/`accessTier` 필드/유료 플래그/402 금지. `tier:'basic'|'advanced'`는 콘텐츠 깊이 라벨로 그대로 둠.
- **D2 재개 계약.** `next`(상대·same-origin) 안의 `resume=download` 마커. 블로그 게이트는 현재 경로+`resume=download&material=<slug>`, 자료상세는 `/resources/<slug>?resume=download`. 다운로드 라우트 GET 폴백도 이 경로로 재지정. 마운트 시 1회 자동 실행 후 `history.replaceState`로 마커 제거.
- **D3 프로바이더 가용성.** `resolveProviderAvailability(env)`(순수) → `GET /api/auth/providers`. 다이얼로그는 가용한 버튼만 렌더(미설정 Naver 숨김, Kakao는 설정 시만).
- **D4 검증-이메일 앵커.** `shouldAutoLinkEmail(emailVerified)`. `stitchIdentity`에 `emailVerified?` 추가. Google=`email_confirmed_at`, Kakao=`is_email_verified && is_email_valid`, Naver=false, 비인증 경로(newsletter/materials)=false.
- **D5 결정론 스티칭.** 3중복 `findLatestLeadIdByEmail` 제거 → `associateLeadsForVerifiedEmail(userId,email)` 하나로. 검증 이메일의 **모든** 리드를 `leads.user_id`로 결합, scoped `client_events` 백필, `identity_stitch_logs` 감사 1행.
- **D6 마이그레이션+타입 동반.** `supabase/migrations/20260624_public_auth_identity_ladder.sql`(멱등) + `lib/supabase/database.types.ts` 동시 수정.
- **D7 검증 명령.** 정적 게이트 `npx eslint app components lib --max-warnings=0` + `npm run build`. 빠른 루프 `npm run typecheck`. 단위테스트 `npx vitest run --dir tests tests/<area>/<file>.test.ts`(bare 실행·전체 0-fail 게이트 금지). I/O 흐름은 수동 검증.
- **D8 RLS.** `user_profiles/leads/material_downloads/identity_stitch_logs`는 항상 `createSupabaseAdminClient()`(service_role).

## 태스크 순서 & 의존성

- **Phase 0:** Task 1 → Task 2
- **Phase 1:** Task 3 → (Task 4 → Task 5), Task 6(▷Task 1 버튼 필요), Task 7, Task 8 → Task 9, Task 10(독립)

## 통합 조정 (권위 있음 — 아래 개별 태스크의 충돌 하위 스텝을 덮어씀)

1. **`components/auth/PublicLoginDialog.tsx`는 Task 1 → Task 8 순서로만 편집한다.** Task 1이 먼저 다이얼로그 전체를 재작성(프로바이더 가용성·버튼)하고, **Task 8 Step 3이 그 위에 (선택) 마케팅 동의 체크박스를 *추가*한다.** 첫 로그인 동의 수집(spec §5.2)을 위해 체크박스를 유지한다. 따라서 Task 8 Step 3의 "Current code" 앵커는 **Task 1 적용 후 파일** 기준이며(아래 Step 3에 그 기준으로 반영됨), 실행자는 라인 번호가 아니라 실제 파일에서 앵커를 찾는다.
2. **`MarketingConsentToggle`(Task 8)는 self-contained.** `GET /api/account/marketing-consent`로 초기값을 직접 가져오고 다이얼로그 체크박스가 남긴 `localStorage["cln_pending_marketing_consent"]` 의도를 1회 드레인한다 — **props를 받지 않는다.** Task 9는 `<MarketingConsentToggle />`만 마운트하고 `context.profile.marketing_consent`를 읽지 않는다(그 필드는 `PublicUserProfile`에 없음).
3. **Task 2의 `LeadMagnetGate.tsx` 변경은 타겟 편집**(login_required 분기 nextPath, resume useEffect, 다이얼로그 mount nextPath)이다 — 전체 파일 교체가 아니다.
4. **"프리미엄 tier"(spec §4.3/§6/§7)는 기존 `gate` 필드로 실현**(email=free, login=premium, D1). 새 tier/accessTier 필드·enum·마이그레이션 컬럼을 추가하지 않는다.

---

### Task 1: Provider-availability endpoint + conditional provider buttons

Implements D3. Adds a pure `resolveProviderAvailability(env)` helper, a no-store GET endpoint that returns it, and rewires `PublicLoginDialog` to fetch availability on open and render only the configured provider buttons (Google always; Naver/Kakao gated). Kakao gets a `startKakao()` that mirrors `startNaver()` and points at `/api/auth/kakao/start` (routes land in Task A6 — the button stays hidden until `availability.kakao` is true). Unit-tests the pure helper.

- [ ] **Step 1: Create the pure provider-availability helper.** New file `lib/auth/providers.ts`. `google` is always true (Supabase-managed). `naver` needs BOTH `NAVER_CLIENT_ID` and `NAVER_CLIENT_SECRET`. `kakao` needs `KAKAO_REST_API_KEY`. Uses a minimal env shape so the unit test can pass a plain object.

```ts
export interface ProviderAvailability {
  google: boolean
  naver: boolean
  kakao: boolean
}

type ProviderEnv = {
  NAVER_CLIENT_ID?: string
  NAVER_CLIENT_SECRET?: string
  KAKAO_REST_API_KEY?: string
}

export function resolveProviderAvailability(env: ProviderEnv): ProviderAvailability {
  return {
    google: true,
    naver: Boolean(env.NAVER_CLIENT_ID?.trim() && env.NAVER_CLIENT_SECRET?.trim()),
    kakao: Boolean(env.KAKAO_REST_API_KEY?.trim()),
  }
}
```

- [ ] **Step 2: Create the GET endpoint.** New file `app/api/auth/providers/route.ts`. Returns `resolveProviderAvailability(process.env)` as JSON with `no-store` (availability is env-derived and must not be cached at the edge). Forced dynamic so env is read at request time.

```ts
import { NextResponse } from "next/server"

import { resolveProviderAvailability } from "@/lib/auth/providers"

export const dynamic = "force-dynamic"

export async function GET() {
  const availability = resolveProviderAvailability(process.env)
  return NextResponse.json(availability, {
    headers: { "Cache-Control": "no-store" },
  })
}
```

- [ ] **Step 3: Rewire `PublicLoginDialog` to fetch availability and conditionally render buttons.** Modify `components/auth/PublicLoginDialog.tsx`. Changes: import `useEffect` + the `ProviderAvailability` type; widen `loadingProvider` to include `"kakao"`; add `availability` state (default Google-only so Naver/Kakao stay hidden until the fetch resolves — never flash an unconfigured button); fetch `/api/auth/providers` in a `useEffect` keyed on `open` (with an `ignore` guard so a close-then-reopen race can't apply stale state); add `startKakao()` mirroring `startNaver()`; render Naver only when `availability.naver` and Kakao only when `availability.kakao`. DESIGN.md styles and the same-origin/relative `next` assumption are untouched.

Full current file → new file:

```tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, LockKeyhole, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import type { ProviderAvailability } from "@/lib/auth/providers"

interface PublicLoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nextPath?: string
  title?: string
  description?: string
}

function getCurrentPath() {
  if (typeof window === "undefined") return "/resources"
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

const DEFAULT_AVAILABILITY: ProviderAvailability = {
  google: true,
  naver: false,
  kakao: false,
}

export function PublicLoginDialog({
  open,
  onOpenChange,
  nextPath,
  title = "로그인 후 자료 받기",
  description = "심화 자료는 다운로드 기록과 재열람을 위해 공개 사용자 로그인이 필요합니다.",
}: PublicLoginDialogProps) {
  const [loadingProvider, setLoadingProvider] = useState<"google" | "naver" | "kakao" | null>(null)
  const [error, setError] = useState("")
  const [availability, setAvailability] = useState<ProviderAvailability>(DEFAULT_AVAILABILITY)
  const resolvedNextPath = useMemo(() => nextPath ?? getCurrentPath(), [nextPath])

  useEffect(() => {
    if (!open) return
    let ignore = false
    fetch("/api/auth/providers", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProviderAvailability | null) => {
        if (ignore || !data) return
        setAvailability({
          google: true,
          naver: Boolean(data.naver),
          kakao: Boolean(data.kakao),
        })
      })
      .catch(() => {
        if (ignore) return
        setAvailability(DEFAULT_AVAILABILITY)
      })
    return () => {
      ignore = true
    }
  }, [open])

  const startGoogle = async () => {
    setError("")
    setLoadingProvider("google")
    try {
      const origin = window.location.origin
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(resolvedNextPath)}`
      const supabase = createSupabaseBrowserClient()
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      })
      if (signInError) {
        setError("Google 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.")
        setLoadingProvider(null)
      }
    } catch {
      setError("로그인 설정을 확인하지 못했습니다.")
      setLoadingProvider(null)
    }
  }

  const startNaver = () => {
    setError("")
    setLoadingProvider("naver")
    window.location.href = `/api/auth/naver/start?next=${encodeURIComponent(resolvedNextPath)}`
  }

  const startKakao = () => {
    setError("")
    setLoadingProvider("kakao")
    window.location.href = `/api/auth/kakao/start?next=${encodeURIComponent(resolvedNextPath)}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[#ECFDF5] text-[#084734]">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Button
            type="button"
            onClick={startGoogle}
            disabled={loadingProvider !== null}
            className="h-11 w-full"
          >
            {loadingProvider === "google" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Google로 계속하기
          </Button>
          {availability.naver ? (
            <Button
              type="button"
              variant="outline"
              onClick={startNaver}
              disabled={loadingProvider !== null}
              className="h-11 w-full"
            >
              {loadingProvider === "naver" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Naver로 계속하기
            </Button>
          ) : null}
          {availability.kakao ? (
            <Button
              type="button"
              variant="outline"
              onClick={startKakao}
              disabled={loadingProvider !== null}
              className="h-11 w-full"
            >
              {loadingProvider === "kakao" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Kakao로 계속하기
            </Button>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-[13px] leading-5 text-[#B85C33]">
            {error}
          </p>
        ) : null}
        <p className="text-[11px] leading-5 text-[#A39E98]">
          로그인 정보는 자료 열람 기록과 상담 후속 안내에만 사용됩니다.
        </p>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Add the unit test for the pure helper.** New file `tests/auth/providers.test.ts` (the `tests/auth/` directory does not exist yet — this creates it). Covers: Google always true; Naver needs BOTH env vars (each missing → false); Kakao needs only the REST key; whitespace-only values count as unset. Pure, no mocks, no I/O.

```ts
import { describe, expect, it } from "vitest"

import { resolveProviderAvailability } from "@/lib/auth/providers"

describe("resolveProviderAvailability", () => {
  it("always enables google", () => {
    expect(resolveProviderAvailability({}).google).toBe(true)
  })

  it("enables naver only when both client id and secret are set", () => {
    expect(resolveProviderAvailability({}).naver).toBe(false)
    expect(
      resolveProviderAvailability({ NAVER_CLIENT_ID: "id" }).naver
    ).toBe(false)
    expect(
      resolveProviderAvailability({ NAVER_CLIENT_SECRET: "secret" }).naver
    ).toBe(false)
    expect(
      resolveProviderAvailability({ NAVER_CLIENT_ID: "id", NAVER_CLIENT_SECRET: "secret" }).naver
    ).toBe(true)
  })

  it("treats whitespace-only naver env as unset", () => {
    expect(
      resolveProviderAvailability({ NAVER_CLIENT_ID: "  ", NAVER_CLIENT_SECRET: "secret" }).naver
    ).toBe(false)
  })

  it("enables kakao only when the rest api key is set", () => {
    expect(resolveProviderAvailability({}).kakao).toBe(false)
    expect(
      resolveProviderAvailability({ KAKAO_REST_API_KEY: "key" }).kakao
    ).toBe(true)
    expect(
      resolveProviderAvailability({ KAKAO_REST_API_KEY: "   " }).kakao
    ).toBe(false)
  })
})
```

- [ ] **Step 5: Verify.** Run the static gate and the scoped unit test:

```bash
npx eslint app components lib --max-warnings=0 \
  && npm run typecheck \
  && npx vitest run --dir tests tests/auth/providers.test.ts \
  && npm run build
```

MANUAL: with `npm run dev`, open a login-gated lead-magnet dialog and confirm only Google shows when Naver/Kakao env vars are unset; set `KAKAO_REST_API_KEY` and confirm the Kakao button appears (clicking it 404s until Task A6 lands — expected). Verify `GET /api/auth/providers` returns `{"google":true,...}` with `Cache-Control: no-store`.

- [ ] **Step 6: Commit.**

```bash
git add lib/auth/providers.ts app/api/auth/providers/route.ts components/auth/PublicLoginDialog.tsx tests/auth/providers.test.ts \
  && git commit -m "feat(auth): provider-availability endpoint + conditional provider buttons in login dialog"
```

---

### Task 2: Fix lost post-login download intent (both gate sinks + orphaned GET fallback)

Per D2 (RESUME CONTRACT). Three sinks lose the gated-download intent after OAuth login: the blog `LeadMagnetGate` opens the login dialog with no `nextPath` (so the user lands back on `/resources` with no resume), the resource detail `ResourceDownloadForm` has no login branch at all (it always renders the lead form, even for `gate==='login'`), and the download route GET fallback redirects to an orphaned `/resources?auth=login&material=<slug>` target that nothing consumes. All resume state must ride inside the same-origin relative `next` path with marker `resume=download` (blog gate also carries `material=<slug>`), and the auto-resume must fire exactly once then strip the marker via `history.replaceState`.

Verification for the live OAuth round trip (Supabase callback strips cross-origin → `next` → resume) is MANUAL per D7: run `npm run dev`, open a `gate==='login'` lead-magnet (set in the admin editor), click download → Google login → confirm the download auto-fires once on return and the URL no longer contains `resume=download`. The static gate (`npx eslint app components lib --max-warnings=0` then `npm run build`) must pass.

- [ ] **Step 1: Rewrite `components/blog/LeadMagnetGate.tsx` — pass a resume-aware `nextPath` to the dialog and add a guarded mount resume effect.**

The current file imports `useState` only, renders `PublicLoginDialog` without `nextPath`, and never resumes. Apply these **targeted edits** (the rest of the file — JSX body, form, download button — is unchanged; the closing note below confirms it):

Current head (lines 9-37):
```tsx
"use client"

import { useState } from "react"
import { ArrowRight, CheckCircle2, Download, FileText, Loader2, Mail } from "lucide-react"
import { PublicLoginDialog } from "@/components/auth/PublicLoginDialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics"
import {
  getLeadMagnetItemCount,
  getLeadMagnetPublicGateLabel,
  getLeadMagnetTierLabel,
  type LeadMagnet,
} from "@/lib/lead-magnets"
import { MaterialDownloadError, requestMaterialDownload } from "@/lib/materials-client"

interface Props {
  leadMagnet: LeadMagnet
  /** 유입 추적용 — 어느 글에서 제출됐는지 기록 */
  postSlug: string
}

export function LeadMagnetGate({ leadMagnet, postSlug }: Props) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")
```

New head — add `useEffect`/`useRef`, compute `nextPath`, build a `useRef`-guarded resume effect. The download handler is hoisted into a `useCallback` so the resume effect can call it and `useEffect` deps stay honest:
```tsx
"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, CheckCircle2, Download, FileText, Loader2, Mail } from "lucide-react"
import { PublicLoginDialog } from "@/components/auth/PublicLoginDialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { trackEvent } from "@/lib/analytics"
import {
  getLeadMagnetItemCount,
  getLeadMagnetPublicGateLabel,
  getLeadMagnetTierLabel,
  type LeadMagnet,
} from "@/lib/lead-magnets"
import { MaterialDownloadError, requestMaterialDownload } from "@/lib/materials-client"

interface Props {
  leadMagnet: LeadMagnet
  /** 유입 추적용 — 어느 글에서 제출됐는지 기록 */
  postSlug: string
}

/**
 * 로그인 후 자료 다운로드 의도를 same-origin 상대 경로(next)에 실어 복원한다.
 * 현재 경로에 resume=download & material=<slug> 마커를 붙이되 기존 쿼리/해시는 보존한다.
 */
function buildResumeNextPath(slug: string): string {
  if (typeof window === "undefined") return `/resources/${slug}`
  const url = new URL(window.location.href)
  url.searchParams.set("resume", "download")
  url.searchParams.set("material", slug)
  return `${url.pathname}${url.search}${url.hash}`
}

export function LeadMagnetGate({ leadMagnet, postSlug }: Props) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")
  const [resumeNextPath, setResumeNextPath] = useState<string | undefined>(undefined)
  const resumedRef = useRef(false)
```

Current `handleDownload` (lines 80-109) becomes a `useCallback` (identical body, only the wrapper changes):
```tsx
  const handleDownload = useCallback(async () => {
    if (downloading || !leadMagnet.published) return

    setDownloading(true)
    setError("")
    try {
      const result = await requestMaterialDownload({
        slug: leadMagnet.slug,
        email: submitted ? email : undefined,
        source: "blog_lead_magnet",
        postSlug,
      })
      window.location.assign(result.url)
    } catch (downloadError) {
      if (
        downloadError instanceof MaterialDownloadError &&
        downloadError.code === "login_required"
      ) {
        setResumeNextPath(buildResumeNextPath(leadMagnet.slug))
        setLoginDialogOpen(true)
      } else {
        setError(
          downloadError instanceof Error
            ? downloadError.message
            : "자료를 열지 못했습니다."
        )
      }
    } finally {
      setDownloading(false)
    }
  }, [downloading, leadMagnet.published, leadMagnet.slug, submitted, email, postSlug])
```

Add the resume effect immediately after `handleDownload`. It runs once on mount: if `resume=download` is present AND `material` matches this lead magnet's slug, it strips the markers first (so a re-render can't re-trigger), then fires the download exactly once via the `resumedRef` guard:
```tsx
  useEffect(() => {
    if (resumedRef.current) return
    if (typeof window === "undefined") return

    const params = new URLSearchParams(window.location.search)
    if (params.get("resume") !== "download") return
    if (params.get("material") !== leadMagnet.slug) return

    resumedRef.current = true

    params.delete("resume")
    params.delete("material")
    const cleanedSearch = params.toString()
    const cleanedUrl =
      window.location.pathname +
      (cleanedSearch ? `?${cleanedSearch}` : "") +
      window.location.hash
    window.history.replaceState(window.history.state, "", cleanedUrl)

    void handleDownload()
  }, [handleDownload, leadMagnet.slug])
```

Pass `nextPath={resumeNextPath}` to the dialog. Current render (lines 113-117):
```tsx
      <PublicLoginDialog
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
        title="로그인 후 자료 받기"
      />
```
becomes:
```tsx
      <PublicLoginDialog
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
        nextPath={resumeNextPath}
        title="로그인 후 자료 받기"
      />
```

The rest of the file (JSX body, form, download button) is unchanged.

- [ ] **Step 2: Rewrite `app/resources/[slug]/ResourceDownloadForm.tsx` — add a real `gate==='login'` branch, a `login_required` catch, and a resume effect.**

The current file has no login branch (the lead form renders for every gate) and its catch shows raw text. Replace the whole file:

```tsx
"use client"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { ArrowRight, CheckCircle2, Loader2, LockKeyhole, Mail } from "lucide-react"

import { PublicLoginDialog } from "@/components/auth/PublicLoginDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { trackEvent } from "@/lib/analytics"
import { MaterialDownloadError, requestMaterialDownload } from "@/lib/materials-client"
import { cn } from "@/lib/utils"

interface ResourceDownloadFormProps {
  resource: {
    slug: string
    title: string
    gate: "open" | "email" | "login"
    estimatedMinutes: number
    itemCount: number
    hasPdfFile: boolean
  }
}

interface DownloadFormState {
  name: string
  org: string
  role: string
  size: string
  email: string
  phone: string
  website: string
  consent: boolean
}

const initialForm: DownloadFormState = {
  name: "",
  org: "",
  role: "",
  size: "",
  email: "",
  phone: "",
  website: "",
  consent: true,
}

const inputClassName =
  "h-10 rounded-[6px] border-black/[0.08] bg-white text-[14px] focus-visible:border-[#084734]/50 focus-visible:ring-[#084734]/10"

export function ResourceDownloadForm({ resource }: ResourceDownloadFormProps) {
  const [form, setForm] = useState<DownloadFormState>(initialForm)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")
  const [loginDialogOpen, setLoginDialogOpen] = useState(false)
  const resumedRef = useRef(false)

  const isLoginGate = resource.gate === "login"
  // 로그인 게이트는 자료 슬러그가 경로에 있으므로 material 파라미터가 필요 없다.
  const loginNextPath = `/resources/${resource.slug}?resume=download`

  const updateField = <Key extends keyof DownloadFormState>(
    key: Key,
    value: DownloadFormState[Key]
  ) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const scrollToChecklist = () => {
    document.getElementById("resource-checklist")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    })
  }

  // 로그인 게이트: 로그인 후 같은 페이지로 돌아오면 다운로드를 한 번 자동 실행한다.
  const runLoginDownload = useCallback(async () => {
    if (loading) return
    setLoading(true)
    setError("")
    try {
      const result = await requestMaterialDownload({
        slug: resource.slug,
        source: "resource_pdf_download",
      })
      window.location.assign(result.url)
    } catch (downloadError) {
      if (
        downloadError instanceof MaterialDownloadError &&
        downloadError.code === "login_required"
      ) {
        setLoginDialogOpen(true)
      } else {
        setError(
          downloadError instanceof MaterialDownloadError
            ? downloadError.message
            : "자료 다운로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요."
        )
      }
    } finally {
      setLoading(false)
    }
  }, [loading, resource.slug])

  useEffect(() => {
    if (resumedRef.current) return
    if (typeof window === "undefined") return

    const params = new URLSearchParams(window.location.search)
    if (params.get("resume") !== "download") return

    resumedRef.current = true

    params.delete("resume")
    const cleanedSearch = params.toString()
    const cleanedUrl =
      window.location.pathname +
      (cleanedSearch ? `?${cleanedSearch}` : "") +
      window.location.hash
    window.history.replaceState(window.history.state, "", cleanedUrl)

    void runLoginDownload()
  }, [runLoginDownload])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return

    const email = form.email.trim().toLowerCase()
    if (!email || !form.name.trim() || !form.org.trim() || !form.consent) {
      setError("필수 정보를 입력하고 수신 동의에 체크해 주세요.")
      return
    }

    setLoading(true)
    setError("")

    try {
      const leadResponse = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "newsletter",
          sourceDetail: `resource_pdf_download:${resource.slug}`,
          leadMagnet: resource.slug,
          name: form.name.trim(),
          org: form.org.trim(),
          role: form.role.trim(),
          size: form.size.trim(),
          email,
          phone: form.phone.trim(),
          message: `PDF 자료 요청: ${resource.title}`,
          marketingConsent: true,
          currentPage: window.location.href,
          landingPage: window.location.origin + window.location.pathname,
          referrer: document.referrer,
          website: form.website,
        }),
      })
      const leadData = await leadResponse.json().catch(() => null)

      if (!leadResponse.ok || !leadData?.ok) {
        setError(leadData?.error || "자료 신청에 실패했습니다. 잠시 후 다시 시도해 주세요.")
        return
      }

      trackEvent("submit_newsletter", {
        source: "resource_pdf_download",
        lead_magnet: resource.slug,
        gate: resource.gate,
      })

      const result = await requestMaterialDownload({
        slug: resource.slug,
        email,
        source: "resource_pdf_download",
      })

      const destination = new URL(result.url, window.location.origin)
      const isCurrentPage = destination.pathname === window.location.pathname

      if (!isCurrentPage) {
        window.location.assign(result.url)
        return
      }

      setSubmitted(true)
    } catch (downloadError) {
      if (
        downloadError instanceof MaterialDownloadError &&
        downloadError.code === "login_required"
      ) {
        setLoginDialogOpen(true)
      } else if (downloadError instanceof MaterialDownloadError) {
        setError(downloadError.message)
      } else {
        setError("자료 다운로드를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div id="download" className="scroll-mt-28">
      <PublicLoginDialog
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
        nextPath={loginNextPath}
        title="로그인 후 자료 받기"
      />
      <aside className="border border-black/[0.08] bg-white p-5 shadow-[0_10px_28px_rgba(17,17,16,0.04)] lg:sticky lg:top-28">
      {submitted ? (
        <div className="flex min-h-[360px] flex-col justify-center text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center border border-black/[0.08] bg-white text-[#084734]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-xl font-bold text-[#111110]">자료 신청이 완료되었습니다.</h2>
          <p className="mt-3 text-sm leading-6 text-[#615D59]">
            다운로드가 시작되지 않았다면 아래 문항을 먼저 확인한 뒤 다시 시도해 주세요.
          </p>
          <Button type="button" className="mt-6 h-11 w-full" onClick={scrollToChecklist}>
            전체 문항 보기
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : isLoginGate ? (
        <div className="flex min-h-[360px] flex-col justify-center text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-[#ECFDF5] text-[#084734]">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-2xl font-bold tracking-[-0.03em] text-[#111110]">
            로그인 후 자료 받기
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#615D59]">
            이 자료는 다운로드 기록과 재열람을 위해 공개 사용자 로그인이 필요합니다. 로그인하면
            자료를 바로 받을 수 있습니다.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2 border-y border-black/[0.08] py-4 text-center">
            <div>
              <p className="text-[11px] font-bold text-[#084734]/70">형식</p>
              <p className="mt-1 text-[12px] font-semibold text-[#31302E]">PDF</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#084734]/70">분량</p>
              <p className="mt-1 text-[12px] font-semibold text-[#31302E]">
                {resource.itemCount}문항
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#084734]/70">소요</p>
              <p className="mt-1 text-[12px] font-semibold text-[#31302E]">
                약 {resource.estimatedMinutes}분
              </p>
            </div>
          </div>
          {error ? <p className="mt-4 text-sm leading-6 text-[#B85C33]">{error}</p> : null}
          <Button
            type="button"
            disabled={loading}
            className="mt-5 h-11 w-full"
            onClick={() => {
              setError("")
              setLoginDialogOpen(true)
            }}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <LockKeyhole className="h-4 w-4" />
                로그인하고 자료 받기
              </>
            )}
          </Button>
        </div>
      ) : (
        <>
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#084734]">
              {resource.hasPdfFile ? "PDF Download" : "PDF Request"}
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-[#111110]">
              업무용 이메일로 자료 받기
            </h2>
            <p className="mt-3 pr-16 text-sm leading-6 text-[#615D59] sm:pr-0">
              PDF에는 관련 자료와 상담 링크가 포함됩니다. 다운로드와 관련 소식 안내에 필요한
              최소 정보만 받습니다.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 border-y border-black/[0.08] py-4 text-center">
            <div>
              <p className="text-[11px] font-bold text-[#084734]/70">형식</p>
              <p className="mt-1 text-[12px] font-semibold text-[#31302E]">PDF</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#084734]/70">분량</p>
              <p className="mt-1 text-[12px] font-semibold text-[#31302E]">
                {resource.itemCount}문항
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#084734]/70">소요</p>
              <p className="mt-1 text-[12px] font-semibold text-[#31302E]">
                약 {resource.estimatedMinutes}분
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <input
              className="hidden"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(event) => updateField("website", event.target.value)}
              name="website"
            />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[#31302E]">
                  이름 *
                </span>
                <Input
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  className={inputClassName}
                  placeholder="홍길동"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[#31302E]">
                  이메일 *
                </span>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A39E98]" />
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField("email", event.target.value)}
                    className={cn(inputClassName, "pl-10")}
                    placeholder="name@classin.com"
                    required
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[#31302E]">
                  학원명 *
                </span>
                <Input
                  value={form.org}
                  onChange={(event) => updateField("org", event.target.value)}
                  className={inputClassName}
                  placeholder="클래스인학원"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[#31302E]">
                  직책
                </span>
                <Input
                  value={form.role}
                  onChange={(event) => updateField("role", event.target.value)}
                  className={inputClassName}
                  placeholder="원장 / 실장 / 강사"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[#31302E]">
                  원생 규모
                </span>
                <select
                  value={form.size}
                  onChange={(event) => updateField("size", event.target.value)}
                  className={cn(inputClassName, "w-full px-3")}
                >
                  <option value="">선택</option>
                  <option value="100명 이하">100명 이하</option>
                  <option value="100~300명">100~300명</option>
                  <option value="300~500명">300~500명</option>
                  <option value="500명 이상">500명 이상</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-[#31302E]">
                  연락처
                </span>
                <Input
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  className={inputClassName}
                  placeholder="010-0000-0000"
                />
              </label>
            </div>

            <label className="flex gap-2 border border-black/[0.08] bg-[#F6F5F4] p-3 text-[12px] leading-5 text-[#615D59]">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(event) => updateField("consent", event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#084734]"
                required
              />
              <span>
                자료 제공과 Classin 교육 인사이트·제품 소식 수신에 동의합니다. 언제든 수신거부할
                수 있습니다.
              </span>
            </label>

            {error ? <p className="text-sm leading-6 text-[#B85C33]">{error}</p> : null}

            <Button type="submit" disabled={loading} className="h-11 w-full">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {resource.hasPdfFile ? "PDF 다운로드" : "PDF 자료 신청하기"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </>
      )}
      </aside>
    </div>
  )
}
```

Notes on the rewrite: the `login` branch renders a login CTA (not the lead form) that opens `PublicLoginDialog` with `nextPath=/resources/<slug>?resume=download`; the resume `useEffect` strips the marker first then auto-calls `requestMaterialDownload` once (guarded by `resumedRef`); `handleSubmit`'s catch now opens the dialog on `code==='login_required'` instead of showing raw text (defensive — covers the non-login gates whose preview gate could still 401). Everything stays same-origin/relative.

- [ ] **Step 3: Repoint the orphaned login/email redirects in `app/api/materials/[slug]/download/route.ts` GET handler to the resource detail page with `resume=download`.**

Current (lines 123-129):
```ts
  if (preview.gate === "login" && !userContext) {
    return NextResponse.redirect(new URL(`/resources?auth=login&material=${encodeURIComponent(slug)}`, req.url))
  }

  if (preview.gate === "email" && !userContext?.user.email) {
    return NextResponse.redirect(new URL(`/resources?auth=email&material=${encodeURIComponent(slug)}`, req.url))
  }
```

New — both repoint to the resource detail page (`/resources/<slug>`) so the page-level resume effect can pick up the marker after login; the orphaned `/resources?auth=...&material=` target is dropped:
```ts
  if (preview.gate === "login" && !userContext) {
    return NextResponse.redirect(
      new URL(`/resources/${encodeURIComponent(slug)}?resume=download`, req.url)
    )
  }

  if (preview.gate === "email" && !userContext?.user.email) {
    return NextResponse.redirect(
      new URL(`/resources/${encodeURIComponent(slug)}?resume=download`, req.url)
    )
  }
```

- [ ] **Step 4: Run the static gate.** `npx eslint app components lib --max-warnings=0` then `npm run build`. Both must pass (the OAuth resume round trip is MANUAL per D7 — verify via `npm run dev` on a `gate==='login'` lead-magnet fixture as described in the task intro).

- [ ] **Step 5: Commit.**
```bash
git add components/blog/LeadMagnetGate.tsx "app/resources/[slug]/ResourceDownloadForm.tsx" "app/api/materials/[slug]/download/route.ts" && git commit -m "fix(auth): preserve post-login download intent via resume=download across both gate sinks + GET fallback"
```

---

### Task 3: Migration + paired database.types.ts edits (public auth identity ladder)

Per D6/D8. Adds `leads.user_id` (nullable FK → `auth.users`, partial index, comment), `user_profiles.account_ref` (nullable, NO FK, reserved comment), and the new `identity_stitch_logs` table (RLS enabled, service_role-only manage policy). Migration is idempotent and follows repo convention verified in `supabase/migrations/20260615_public_material_downloads.sql` and `supabase/migrations/20260614_alpha_admin_base_schema.sql` (`create ... if not exists`, `drop policy if exists` before `create policy`, comment lines, `notify pgrst, 'reload schema';` at end). The `pgcrypto` extension (for `gen_random_uuid()`) is already established by prior migrations; re-asserting it here keeps this file self-contained. Every column is paired with the hand-maintained `lib/supabase/database.types.ts` edit IN THIS SAME TASK — without the matching type edit, repo INSERTs silently drop the field; without the migration the column write no-ops in the DB. The migration is applied to Supabase out of band (`supabase db push` or SQL Editor); this task does NOT run it.

- [ ] **Step 1: Create the new migration file** `supabase/migrations/20260624_public_auth_identity_ladder.sql` with the FULL content below.

```sql
-- Public auth identity ladder: link verified logins to CRM leads and audit every stitch.
--
-- Why this exists:
-- - Public (non-admin) login is the entitlement for login-gated lead magnets (D1).
-- - Post-login we deterministically associate ALL leads matching a verified email to the
--   Supabase auth user, so a logged-in visitor resumes gated downloads without re-gating (D5).
-- - leads.user_id is the join anchor; user_profiles.account_ref is reserved for a future
--   accounts spine (no FK yet — the accounts table does not exist).
-- - identity_stitch_logs is the best-effort audit trail for each stitch (mirrors consent_logs).
--
-- Runtime access is routed through server handlers using the service role (RLS deny-all by default).
-- This file is idempotent and safe to run against an existing environment.

create extension if not exists pgcrypto with schema extensions;

-- ─── leads.user_id (verified-login association anchor) ─────

alter table public.leads
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_leads_user_id
  on public.leads (user_id)
  where user_id is not null;

comment on column public.leads.user_id is 'Supabase auth user associated to this lead via verified-email identity stitching (null until a verified login matches).';

-- ─── user_profiles.account_ref (reserved for future accounts spine) ─────

alter table public.user_profiles
  add column if not exists account_ref uuid;

comment on column public.user_profiles.account_ref is 'Reserved forward reference to a future accounts spine. Nullable with NO FK — the accounts table does not exist yet.';

-- ─── identity_stitch_logs (best-effort audit trail) ─────

create table if not exists public.identity_stitch_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  anonymous_id text,
  lead_ids uuid[],
  action text,
  email_verified boolean,
  created_at timestamptz not null default now()
);

create index if not exists identity_stitch_logs_user_created_idx
  on public.identity_stitch_logs (user_id, created_at desc)
  where user_id is not null;

alter table public.identity_stitch_logs enable row level security;

drop policy if exists "Service role manage identity stitch logs" on public.identity_stitch_logs;
create policy "Service role manage identity stitch logs"
  on public.identity_stitch_logs for all
  to service_role
  using (true)
  with check (true);

comment on table public.identity_stitch_logs is 'Best-effort audit trail of verified-email identity stitches: which leads were associated to which auth user, and whether the email was verified.';

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Add `user_id` to `interface Lead`** in `lib/supabase/database.types.ts`. The `referrer` field is the last attribution field before the timestamps; insert `user_id` immediately after it (mirrors the migration placement and keeps it adjacent to the other join/identity fields).

Before:
```ts
  landing_page: string | null;
  current_page: string | null;
  referrer: string | null;
  created_at: string;
  updated_at: string;
}

export type MaterialGateType = "open" | "email" | "login";
```

After:
```ts
  landing_page: string | null;
  current_page: string | null;
  referrer: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export type MaterialGateType = "open" | "email" | "login";
```

- [ ] **Step 3: Add `account_ref` to `interface UserProfile`** in `lib/supabase/database.types.ts`. Insert it after `lead_id` (the existing join anchor) and before the timestamps.

Before:
```ts
export interface UserProfile {
  id: string;
  email: string | null;
  name: string | null;
  org: string | null;
  role: string | null;
  phone: string | null;
  provider: string | null;
  provider_id: string | null;
  marketing_consent: boolean;
  lead_id: string | null;
  created_at: string;
  updated_at: string;
}
```

After:
```ts
export interface UserProfile {
  id: string;
  email: string | null;
  name: string | null;
  org: string | null;
  role: string | null;
  phone: string | null;
  provider: string | null;
  provider_id: string | null;
  marketing_consent: boolean;
  lead_id: string | null;
  account_ref: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 4: Add `interface IdentityStitchLog` + its Insert/Update aliases** in `lib/supabase/database.types.ts`. Place the interface immediately after the `ClientEvent` interface (and before the `ContactLogType`/`LeadContactLog` block), so it sits next to the other identity/event tables. The `LeadInsert` alias already derives `user_id` as required via `Omit<Lead, ...>`; per D6 intersect it with `{ user_id?: string | null }` so `user_id` is optional on insert (leads are created before any login).

Before (the `ClientEvent` interface and the line that follows it):
```ts
export interface ClientEvent {
  id: string;
  event_name: string;
  button: string | null;
  page: string | null;
  params: Record<string, unknown>;
  referrer: string | null;
  user_agent: string | null;
  anonymous_id: string | null;
  lead_id: string | null;
  user_id: string | null;
  session_id: string | null;
  created_at: string;
}

export type ContactLogType = "call" | "sms" | "kakao" | "email";
```

After:
```ts
export interface ClientEvent {
  id: string;
  event_name: string;
  button: string | null;
  page: string | null;
  params: Record<string, unknown>;
  referrer: string | null;
  user_agent: string | null;
  anonymous_id: string | null;
  lead_id: string | null;
  user_id: string | null;
  session_id: string | null;
  created_at: string;
}

export interface IdentityStitchLog {
  id: string;
  user_id: string | null;
  email: string | null;
  anonymous_id: string | null;
  lead_ids: string[] | null;
  action: string | null;
  email_verified: boolean | null;
  created_at: string;
}

export type IdentityStitchLogInsert = Omit<IdentityStitchLog, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type IdentityStitchLogUpdate = Partial<Omit<IdentityStitchLog, "id" | "created_at">>;

export type ContactLogType = "call" | "sms" | "kakao" | "email";
```

- [ ] **Step 5: Make `user_id` optional on `LeadInsert`** in `lib/supabase/database.types.ts` (per D6). Leads are inserted before any login exists, so `user_id` must not be a required insert field.

Before:
```ts
export type LeadInsert = Omit<Lead, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};
```

After:
```ts
export type LeadInsert = Omit<Lead, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
  user_id?: string | null;
};
```

- [ ] **Step 6: Register `identity_stitch_logs` in the `Database` Tables registry** in `lib/supabase/database.types.ts`. Add the entry right after the existing `client_events` block (matching the interface placement).

Before:
```ts
      client_events: {
        Row: ClientEvent;
        Insert: ClientEventInsert;
        Update: ClientEventUpdate;
      };
      audit_logs: {
```

After:
```ts
      client_events: {
        Row: ClientEvent;
        Insert: ClientEventInsert;
        Update: ClientEventUpdate;
      };
      identity_stitch_logs: {
        Row: IdentityStitchLog;
        Insert: IdentityStitchLogInsert;
        Update: IdentityStitchLogUpdate;
      };
      audit_logs: {
```

- [ ] **Step 7: Verify (per D7).** Fast inner loop first, then the static gate. No vitest needed for this task (pure migration + type edits; the migration is applied to Supabase out of band).
```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

- [ ] **Step 8: Commit.**
```bash
git add supabase/migrations/20260624_public_auth_identity_ladder.sql lib/supabase/database.types.ts && git commit -m "feat(auth): migration + types for public auth identity ladder (leads.user_id, user_profiles.account_ref, identity_stitch_logs)"
```

---

### Task 4: Deterministic, verification-gated identity stitching

> **Dependency note (D6 — separate task):** This task writes to `leads.user_id` and the `identity_stitch_logs` table. Both are introduced by the paired migration + `database.types.ts` task (`supabase/migrations/20260624_public_auth_identity_ladder.sql`). Until that migration is applied, the `leads.user_id` UPDATE and the `identity_stitch_logs` INSERT silently no-op (PostgREST will reject unknown columns/relations) — the `captureWarning` pattern records the failure as a non-fatal warning rather than throwing. Land the migration task before relying on stitch results in production.

- [ ] **Step 1: Rewrite `lib/identity/stitch.ts` — add `shouldAutoLinkEmail`, `emailVerified` input, `associateLeadsForVerifiedEmail`, gated linking, and best-effort audit row.**

Current file (`/Users/clmagi/Desktop/Projects/classin_home/lib/identity/stitch.ts`) ends at line 103 with the `stitchIdentity` function and a latest-1 `findLatestLeadIdByEmail`. Replace the ENTIRE file with:

```ts
import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

interface StitchIdentityInput {
  anonymousId?: string | null
  userId?: string | null
  leadId?: string | null
  email?: string | null
  emailVerified?: boolean
}

interface StitchIdentityResult {
  ok: boolean
  leadId: string | null
  warnings: string[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeShortText(value: string | null | undefined, max = 160) {
  const text = value?.trim()
  return text ? text.slice(0, max) : null
}

function normalizeUuid(value: string | null | undefined) {
  const text = normalizeShortText(value, 80)
  return text && UUID_RE.test(text) ? text : null
}

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase()
  return email && EMAIL_RE.test(email) ? email : null
}

/**
 * 검증된 이메일일 때만 이메일 문자열로 lead 자동 연결을 허용한다.
 * 미검증 이메일을 신뢰하면 타인의 lead/다운로드 이력에 무단 연결될 수 있으므로
 * email_confirmed_at(Google) / is_email_verified(Kakao) 등으로만 true가 된다.
 */
export function shouldAutoLinkEmail(emailVerified: boolean): boolean {
  return emailVerified
}

async function captureWarning(label: string, task: PromiseLike<unknown>, warnings: string[]) {
  try {
    await task
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`${label}: ${message}`)
  }
}

interface AssociateResult {
  leadIds: string[]
  canonicalLeadId: string | null
}

/**
 * 검증된 이메일 → user_id 결정적 연결.
 * latest-1 추측을 버리고, 같은 이메일의 모든 미연결 lead를 user_id로 묶는다.
 * (a) UPDATE leads SET user_id WHERE lower(email)=email AND user_id IS NULL
 * (b) 해당 user_id의 모든 lead id 조회
 * (c) user_profiles.lead_id 는 가장 최근(canonical) lead로 백필
 * (d) client_events.lead_id 는 user_id로 스코프해서만 백필(무제한 금지)
 * 반드시 service_role(admin) 클라이언트 — server/anon 클라이언트는 RLS로 0행.
 */
export async function associateLeadsForVerifiedEmail(
  userId: string,
  email: string,
  warnings: string[] = []
): Promise<AssociateResult> {
  const normalizedUserId = normalizeUuid(userId)
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedUserId || !normalizedEmail) {
    return { leadIds: [], canonicalLeadId: null }
  }

  const supabase = createSupabaseAdminClient()

  // (a) 같은 이메일의 미연결 lead 전부 묶기
  const associate = supabase
    .from("leads")
    .update({ user_id: normalizedUserId })
    .eq("email", normalizedEmail)
    .is("user_id", null)
  await captureWarning("leads associate by verified email", associate, warnings)

  // (b) 이 user_id에 묶인 모든 lead id
  let leadIds: string[] = []
  try {
    const { data, error } = await supabase
      .from("leads")
      .select("id")
      .eq("user_id", normalizedUserId)
      .order("created_at", { ascending: false })
    if (error) throw new Error(error.message)
    leadIds = (data ?? [])
      .map((row) => (typeof row.id === "string" ? row.id : null))
      .filter((id): id is string => Boolean(id))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warnings.push(`leads select by user_id: ${message}`)
  }

  // (c) canonical = 가장 최근 lead(위에서 created_at desc 정렬)
  const canonicalLeadId = leadIds[0] ?? null

  if (canonicalLeadId) {
    const profile = supabase
      .from("user_profiles")
      .update({ lead_id: canonicalLeadId })
      .eq("id", normalizedUserId)
      .is("lead_id", null)
    await captureWarning("user_profiles canonical lead link", profile, warnings)

    // (d) client_events 백필은 user_id로 스코프(무제한 금지)
    const events = supabase
      .from("client_events")
      .update({ lead_id: canonicalLeadId })
      .eq("user_id", normalizedUserId)
      .is("lead_id", null)
    await captureWarning("client_events user-scoped lead backfill", events, warnings)
  }

  return { leadIds, canonicalLeadId }
}

export async function stitchIdentity(input: StitchIdentityInput): Promise<StitchIdentityResult> {
  const anonymousId = normalizeShortText(input.anonymousId, 100)
  const userId = normalizeUuid(input.userId)
  const email = normalizeEmail(input.email)
  const emailVerified = Boolean(input.emailVerified)
  const explicitLeadId = normalizeUuid(input.leadId)
  const warnings: string[] = []

  // 검증된 이메일 + userId 가 있을 때만 결정적 연결을 수행한다.
  // explicit leadId(이미 알고 있는 just-created lead)는 이메일 추측 없이 그대로 신뢰한다.
  let associatedLeadIds: string[] = []
  let canonicalLeadId: string | null = null
  if (userId && email && shouldAutoLinkEmail(emailVerified)) {
    const result = await associateLeadsForVerifiedEmail(userId, email, warnings)
    associatedLeadIds = result.leadIds
    canonicalLeadId = result.canonicalLeadId
  }

  const leadId = explicitLeadId ?? canonicalLeadId

  if (!anonymousId && !userId) {
    await writeStitchLog({ userId, email, anonymousId, leadIds: leadIdsFor(leadId, associatedLeadIds), emailVerified, action: "noop" }, warnings)
    return { ok: warnings.length === 0, leadId, warnings }
  }

  const supabase = createSupabaseAdminClient()
  const eventPatch: Record<string, string> = {}
  if (userId) eventPatch.user_id = userId
  if (leadId) eventPatch.lead_id = leadId

  if (Object.keys(eventPatch).length > 0 && anonymousId) {
    const query = supabase
      .from("client_events")
      .update(eventPatch)
      .eq("anonymous_id", anonymousId)
      .or("lead_id.is.null,user_id.is.null")
    await captureWarning("client_events anonymous backfill", query, warnings)
  }

  // explicit leadId 경로: 이미 알고 있는 lead를 user_id/profile에 연결(이메일 추측 없음).
  if (leadId && userId) {
    const eventsByUser = supabase
      .from("client_events")
      .update({ lead_id: leadId })
      .eq("user_id", userId)
      .is("lead_id", null)
    await captureWarning("client_events user backfill", eventsByUser, warnings)

    const profile = supabase
      .from("user_profiles")
      .update({ lead_id: leadId })
      .eq("id", userId)
      .is("lead_id", null)
    await captureWarning("user_profiles lead link", profile, warnings)
  }

  await writeStitchLog(
    {
      userId,
      email,
      anonymousId,
      leadIds: leadIdsFor(leadId, associatedLeadIds),
      emailVerified,
      action: explicitLeadId ? "explicit_lead" : canonicalLeadId ? "verified_email" : "anonymous_only",
    },
    warnings
  )

  return { ok: warnings.length === 0, leadId, warnings }
}

function leadIdsFor(leadId: string | null, associated: string[]) {
  const set = new Set<string>(associated)
  if (leadId) set.add(leadId)
  return Array.from(set)
}

/**
 * identity_stitch_logs 감사 행 1건 best-effort 기록.
 * consent_logs 패턴(app/api/consent/route.ts)을 미러링 — 실패는 throw하지 않고 경고만 남긴다.
 */
async function writeStitchLog(
  entry: {
    userId: string | null
    email: string | null
    anonymousId: string | null
    leadIds: string[]
    emailVerified: boolean
    action: string
  },
  warnings: string[]
) {
  const supabase = createSupabaseAdminClient()
  const insert = supabase.from("identity_stitch_logs").insert({
    user_id: entry.userId,
    email: entry.email,
    anonymous_id: entry.anonymousId,
    lead_ids: entry.leadIds,
    action: entry.action,
    email_verified: entry.emailVerified,
  })
  await captureWarning("identity_stitch_logs insert", insert, warnings)
}
```

- [ ] **Step 2: Edit `lib/auth/public-user.ts` — delete the duplicate `findLatestLeadIdByEmail`, gate `lead_id` behind verified email, import the canonical helper.**

Current `/Users/clmagi/Desktop/Projects/classin_home/lib/auth/public-user.ts` lines 1-6 (imports) → add the stitch import:

```ts
import "server-only"

import type { User } from "@supabase/supabase-js"

import { associateLeadsForVerifiedEmail, shouldAutoLinkEmail } from "@/lib/identity/stitch"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
```

Delete the duplicate helper at current lines 43-57:

```ts
async function findLatestLeadIdByEmail(email: string | null | undefined) {
  if (!email) return null

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.id) return null
  return data.id as string
}
```

Replace `upsertPublicUserProfile` (current lines 59-94) so it only resolves a `lead_id` when the email is verified, using the canonical deterministic helper. New body:

```ts
export async function upsertPublicUserProfile(user: User): Promise<PublicUserProfile> {
  const supabase = createSupabaseAdminClient()
  const email = user.email?.trim().toLowerCase() || null
  const provider = getProvider(user)
  const providerId = getProviderId(user)
  const name = getDisplayName(user)
  const emailVerified = Boolean(user.email_confirmed_at)

  const payload = {
    id: user.id,
    email,
    name,
    provider,
    provider_id: providerId,
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(payload, { onConflict: "id" })
    .select("id, email, name, provider, provider_id, lead_id")
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to upsert public user profile.")
  }

  let leadId = (data.lead_id as string | null) ?? null

  // 검증된 이메일일 때만 결정적으로 lead를 연결한다(latest-1 추측 제거).
  if (email && shouldAutoLinkEmail(emailVerified)) {
    const { canonicalLeadId } = await associateLeadsForVerifiedEmail(user.id, email)
    if (canonicalLeadId) leadId = canonicalLeadId
  }

  return {
    id: data.id as string,
    email: (data.email as string | null) ?? null,
    name: (data.name as string | null) ?? null,
    provider: (data.provider as string | null) ?? null,
    provider_id: (data.provider_id as string | null) ?? null,
    lead_id: leadId,
  }
}
```

> Note: the `upsert` payload no longer sets `lead_id` on creation (it was previously set to a guessed latest-1 value). `lead_id` is now resolved post-upsert only when `email_confirmed_at` is present, via `associateLeadsForVerifiedEmail`, which writes `user_profiles.lead_id` itself; the local `leadId` is read back for the return value. The `lead_id` column in the `.select(...)` reflects any pre-existing value for returning users.

- [ ] **Step 3: Edit `lib/materials.ts` — delete the duplicate `findLatestLeadIdByEmail`; the non-auth download path keeps the already-known `leadId` and passes `emailVerified=false`.**

Delete the duplicate helper at current `/Users/clmagi/Desktop/Projects/classin_home/lib/materials.ts` lines 45-59:

```ts
async function findLatestLeadIdByEmail(email: string | null) {
  if (!email) return null

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.id) return null
  return data.id as string
}
```

Replace `prepareMaterialDownload` lead resolution + stitch call (current lines 144-152):

```ts
  const email = normalizeEmail(request.email)
  const leadId = request.leadId ?? await findLatestLeadIdByEmail(email)
  const { url, signed } = await resolveDestinationUrl(magnet)
  await stitchIdentity({
    anonymousId: request.anonymousId,
    userId: request.userId,
    leadId,
    email,
  })
```

with (the download path holds the just-created `leadId`; never auto-link by email string — so `emailVerified` is `false` and the email is no longer used to guess a lead):

```ts
  const email = normalizeEmail(request.email)
  const leadId = request.leadId ?? null
  const { url, signed } = await resolveDestinationUrl(magnet)
  await stitchIdentity({
    anonymousId: request.anonymousId,
    userId: request.userId,
    leadId,
    email,
    emailVerified: false,
  })
```

> `normalizeEmail` (lines 27-30) stays — `email` is still threaded into `stitchIdentity` for audit logging, but with `emailVerified=false` the stitch helper will NOT run `associateLeadsForVerifiedEmail`, so no email-based auto-link occurs. `recordDownload` continues to use the known `leadId`.

- [ ] **Step 4: Create `tests/identity/stitch.test.ts` — unit-test `shouldAutoLinkEmail` and the associate-all behavior with the Supabase-admin mock.**

New file `/Users/clmagi/Desktop/Projects/classin_home/tests/identity/stitch.test.ts` (full content). Uses the `vi.mock("@/lib/supabase/admin")` + chainable-query-builder mock pattern, asserting the `leads` UPDATE is scoped by `email` and `user_id IS NULL`, and that an unverified email never triggers lead association:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Chainable Supabase query-builder mock.
// update()/select() return a thenable that also exposes eq/is/or/order.
type Op = { table: string; method: string; payload?: unknown; filters: Record<string, unknown> }

const ops: Op[] = []
let selectLeadsRows: Array<{ id: string }> = []

function makeBuilder(table: string, method: string, payload?: unknown) {
  const op: Op = { table, method, payload, filters: {} }
  ops.push(op)

  const builder: Record<string, unknown> = {}
  const chain = (key: string) => (col: string, val?: unknown) => {
    op.filters[`${key}:${col}`] = val ?? null
    return builder
  }
  builder.eq = chain("eq")
  builder.is = chain("is")
  builder.or = (expr: string) => {
    op.filters["or"] = expr
    return builder
  }
  builder.order = (col: string, opts?: unknown) => {
    op.filters[`order:${col}`] = opts ?? null
    return builder
  }

  // Resolution: a `select` on leads returns the configured rows; everything else { error: null }.
  const resolved =
    table === "leads" && method === "select"
      ? { data: selectLeadsRows, error: null }
      : { data: null, error: null }

  ;(builder as { then: unknown }).then = (
    onFulfilled: (value: unknown) => unknown
  ) => Promise.resolve(resolved).then(onFulfilled)

  return builder
}

const from = vi.fn((table: string) => ({
  update: (payload: unknown) => makeBuilder(table, "update", payload),
  insert: (payload: unknown) => makeBuilder(table, "insert", payload),
  select: () => makeBuilder(table, "select"),
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

import {
  associateLeadsForVerifiedEmail,
  shouldAutoLinkEmail,
  stitchIdentity,
} from "@/lib/identity/stitch"

const USER_ID = "11111111-1111-4111-8111-111111111111"
const LEAD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const LEAD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

function leadsUpdateOps() {
  return ops.filter((op) => op.table === "leads" && op.method === "update")
}

describe("shouldAutoLinkEmail", () => {
  it("returns true only when the email is verified", () => {
    expect(shouldAutoLinkEmail(true)).toBe(true)
    expect(shouldAutoLinkEmail(false)).toBe(false)
  })
})

describe("associateLeadsForVerifiedEmail", () => {
  beforeEach(() => {
    ops.length = 0
    selectLeadsRows = [{ id: LEAD_A }, { id: LEAD_B }]
    from.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("associates ALL matching leads scoped by email and user_id IS NULL", async () => {
    const result = await associateLeadsForVerifiedEmail(USER_ID, "Owner@Example.com")

    const updates = leadsUpdateOps()
    expect(updates).toHaveLength(1)
    // payload sets user_id to the caller's id
    expect(updates[0].payload).toEqual({ user_id: USER_ID })
    // scoped by lowercased email and unassociated rows only (no limit-1)
    expect(updates[0].filters["eq:email"]).toBe("owner@example.com")
    expect(updates[0].filters["is:user_id"]).toBeNull()

    // canonical = most recent (first row of created_at desc select)
    expect(result.canonicalLeadId).toBe(LEAD_A)
    expect(result.leadIds).toEqual([LEAD_A, LEAD_B])

    // client_events backfill is scoped by user_id (never unbounded)
    const eventBackfill = ops.find(
      (op) => op.table === "client_events" && op.method === "update"
    )
    expect(eventBackfill?.filters["eq:user_id"]).toBe(USER_ID)
    expect(eventBackfill?.filters["is:lead_id"]).toBeNull()

    // user_profiles canonical link scoped to this user with null lead_id guard
    const profile = ops.find((op) => op.table === "user_profiles" && op.method === "update")
    expect(profile?.payload).toEqual({ lead_id: LEAD_A })
    expect(profile?.filters["eq:id"]).toBe(USER_ID)
  })

  it("returns empty without writing when inputs are invalid", async () => {
    const result = await associateLeadsForVerifiedEmail("not-a-uuid", "not-an-email")
    expect(result).toEqual({ leadIds: [], canonicalLeadId: null })
    expect(leadsUpdateOps()).toHaveLength(0)
  })
})

describe("stitchIdentity verification gate", () => {
  beforeEach(() => {
    ops.length = 0
    selectLeadsRows = [{ id: LEAD_A }]
    from.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("does NOT associate leads when the email is unverified", async () => {
    await stitchIdentity({
      anonymousId: "anon-unverified-0001",
      userId: USER_ID,
      email: "owner@example.com",
      emailVerified: false,
    })

    // no email-based leads UPDATE happened (the only leads.update would come from association)
    expect(leadsUpdateOps()).toHaveLength(0)
    // and no leads select-by-user_id either
    expect(ops.some((op) => op.table === "leads" && op.method === "select")).toBe(false)
  })

  it("associates leads when the email is verified and userId is present", async () => {
    await stitchIdentity({
      anonymousId: "anon-verified-0001",
      userId: USER_ID,
      email: "owner@example.com",
      emailVerified: true,
    })

    const updates = leadsUpdateOps()
    expect(updates).toHaveLength(1)
    expect(updates[0].filters["eq:email"]).toBe("owner@example.com")
    expect(updates[0].filters["is:user_id"]).toBeNull()
  })

  it("writes one identity_stitch_logs audit row best-effort", async () => {
    await stitchIdentity({
      anonymousId: "anon-audit-0001",
      userId: USER_ID,
      email: "owner@example.com",
      emailVerified: true,
    })

    const auditInserts = ops.filter(
      (op) => op.table === "identity_stitch_logs" && op.method === "insert"
    )
    expect(auditInserts).toHaveLength(1)
    expect(auditInserts[0].payload).toMatchObject({
      user_id: USER_ID,
      email: "owner@example.com",
      email_verified: true,
    })
  })
})
```

- [ ] **Step 5: Run the scoped verification commands (per D7).**

```bash
npx vitest run --dir tests tests/identity/stitch.test.ts
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
```

> The vitest run MUST be scoped to `tests/identity/stitch.test.ts` (a bare `vitest run` globs stale `.worktrees` copies and 10 pre-existing data-coupled files fail — do NOT gate on whole-suite 0 failures). The OAuth round trip, RLS enforcement, and real DB writes (`leads.user_id` UPDATE, `identity_stitch_logs` INSERT) are **MANUAL** verification via `npm run dev` + a login-gated fixture after the D6 migration is applied.

- [ ] **Step 6: Commit.**

```bash
git add lib/identity/stitch.ts lib/auth/public-user.ts lib/materials.ts tests/identity/stitch.test.ts
git commit -m "feat(identity): deterministic verification-gated lead stitching

- shouldAutoLinkEmail + emailVerified gate: email-based lead auto-link only when verified
- associateLeadsForVerifiedEmail: associate ALL matching leads (drop latest-1 guess), user-scoped client_events backfill, canonical user_profiles.lead_id
- collapse 3 duplicate findLatestLeadIdByEmail copies into one canonical helper
- materials download path passes emailVerified=false (uses known leadId, never email guess)
- best-effort identity_stitch_logs audit row per stitch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Thread emailVerified into every stitchIdentity call site

Per D4, `stitchIdentity` gains an optional `emailVerified?: boolean` input (added in A4). This task wires the correct per-provider value into the four route/identify/newsletter/callback call sites so that email-to-lead auto-association happens ONLY when the email is provably verified.

**Overlap note (do NOT double-edit):** `lib/materials.ts` line 147 also calls `stitchIdentity`. That call site is owned by A4 (it sets `emailVerified: false` there because the download flow already holds the just-created `leadId` and must never auto-link by raw email string). This task therefore does NOT touch `lib/materials.ts` — editing the same line in two tasks would collide. The four sites below are the complete scope of this task.

**Dependency:** This task assumes A4 has already added the optional `emailVerified?: boolean` field to `StitchIdentityInput` in `lib/identity/stitch.ts`. If A4 has not landed, these call sites still compile (the field is optional), but the verified-anchor gate is a no-op until A4's stitch logic reads `emailVerified`. These edits are pass-through arg wiring only.

Verified current code by reading each file. `app/auth/callback/route.ts` exchanges a Supabase OAuth code (Google) and has `data.user.email_confirmed_at` available. `app/api/identify/route.ts` reads `context.user.email_confirmed_at` from `getPublicUserContext`. The Naver callback has no verified-email flag from `/v1/nid/me`, so it passes `false`. The newsletter subscribe holds a just-created `leadId` and never auto-links by email, so it passes `false`.

All four edits are I/O routes; static gate only (eslint + build), runtime is MANUAL verification.

- [ ] **Step 1: Pass `emailVerified` from the Google OAuth callback.** In `app/auth/callback/route.ts`, the `exchangeCodeForSession` result already guarantees `data.user` is non-null at the stitch call (the early return at line 31-34 handles `!data.user`). Google email verification is reflected in `email_confirmed_at`.

  Current (`app/auth/callback/route.ts`, lines 36-46):

  ```ts
  try {
    const profile = await upsertPublicUserProfile(data.user)
    await stitchIdentity({
      anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
      userId: data.user.id,
      leadId: profile.lead_id,
      email: data.user.email ?? profile.email,
    })
  } catch (profileError) {
    console.error("[auth/callback] profile upsert failed:", profileError)
  }
  ```

  New:

  ```ts
  try {
    const profile = await upsertPublicUserProfile(data.user)
    await stitchIdentity({
      anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
      userId: data.user.id,
      leadId: profile.lead_id,
      email: data.user.email ?? profile.email,
      emailVerified: Boolean(data.user.email_confirmed_at),
    })
  } catch (profileError) {
    console.error("[auth/callback] profile upsert failed:", profileError)
  }
  ```

- [ ] **Step 2: Pass `emailVerified` from the identify route.** In `app/api/identify/route.ts`, `getPublicUserContext()` returns a `context` whose `user` is a Supabase auth user exposing `email_confirmed_at`. This route runs for any already-authenticated public user (Google, Naver, etc.), so we read the live verified flag rather than hardcoding.

  Current (`app/api/identify/route.ts`, lines 28-33):

  ```ts
  const result = await stitchIdentity({
    anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
    userId: context.user.id,
    leadId: context.profile.lead_id,
    email: context.user.email ?? context.profile.email,
  })
  ```

  New:

  ```ts
  const result = await stitchIdentity({
    anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
    userId: context.user.id,
    leadId: context.profile.lead_id,
    email: context.user.email ?? context.profile.email,
    emailVerified: Boolean(context.user.email_confirmed_at),
  })
  ```

- [ ] **Step 3: Pass `emailVerified: false` from the Naver OAuth callback.** Per D4, Naver's `/v1/nid/me` exposes no email-verified flag, so the stitch must never auto-link by email here. Note: `ensureNaverUser` creates the Supabase user with `email_confirm: true` purely to allow magic-link session issuance — that is an internal session-bootstrap flag and does NOT mean Naver verified the user's email, so we explicitly pass `false` rather than reading `user.email_confirmed_at`. (Full Naver provider handling is in A7; this task only sets the stitch arg.)

  Current (`app/api/auth/naver/callback/route.ts`, lines 191-196):

  ```ts
    await stitchIdentity({
      anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
      userId: user.id,
      leadId: publicProfile.lead_id,
      email: user.email ?? publicProfile.email,
    })
  ```

  New:

  ```ts
    await stitchIdentity({
      anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
      userId: user.id,
      leadId: publicProfile.lead_id,
      email: user.email ?? publicProfile.email,
      emailVerified: false,
    })
  ```

- [ ] **Step 4: Pass `emailVerified: false` from the newsletter subscribe route.** This flow already holds the just-created `leadId` from `submitLeadCapture` and must never auto-associate by raw email string (the email here is self-asserted, not provider-verified). Per D4, non-auth paths pass `false`.

  Current (`app/api/newsletter/subscribe/route.ts`, lines 66-74):

  ```ts
    if (result.body.ok && result.body.leadId) {
      void stitchIdentity({
        anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
        leadId: result.body.leadId,
        email,
      }).catch((error) => {
        console.warn("[newsletter/subscribe] identify failed:", error)
      })
    }
  ```

  New:

  ```ts
    if (result.body.ok && result.body.leadId) {
      void stitchIdentity({
        anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
        leadId: result.body.leadId,
        email,
        emailVerified: false,
      }).catch((error) => {
        console.warn("[newsletter/subscribe] identify failed:", error)
      })
    }
  ```

- [ ] **Step 5: Static gate (per D7).** Run the repo quality gate over the changed routes:

  ```bash
  npx eslint app components lib --max-warnings=0
  npm run typecheck
  npm run build
  ```

  Expect all three to pass. (Note: A4 must have added `emailVerified?: boolean` to `StitchIdentityInput` for `npm run typecheck`/`npm run build` to accept the new arg; the field is optional so absence of A4 would still typecheck but leave the gate inert.) MANUAL runtime verification of the OAuth round trips, identify POST, and newsletter POST is out of scope for the static gate — run `npm run dev` with a login-gated fixture to confirm verified-email anchoring behaves per D4.

- [ ] **Step 6: Commit.**

  ```bash
  git add app/auth/callback/route.ts app/api/identify/route.ts app/api/auth/naver/callback/route.ts app/api/newsletter/subscribe/route.ts
  git commit -m "feat(identity): thread emailVerified into stitchIdentity call sites (D4)"
  ```

---

### Task 6: Kakao custom OAuth (clone Naver, verified-email anchor)

Clones the Naver custom-OAuth pattern (`app/api/auth/naver/{start,callback}/route.ts`) for Kakao. Per **D3**, availability keys off `KAKAO_REST_API_KEY`. Per **D4**, the lead auto-link only fires when Kakao reports the email as both verified and valid, so `stitchIdentity` is called with `emailVerified = Boolean(is_email_verified && is_email_valid)` and the synthetic Supabase user is created with `email_confirm` set to that same flag (never hard-coded `true` for unverified emails).

This task assumes the sibling D4/D5 task has already widened `StitchIdentityInput` with `emailVerified?: boolean` (the callback passes it; if D4 lands after this, the field is simply ignored until then — no type break since it is optional). The Kakao dialog button itself is wired in A1; the redirect URI to register in the Kakao Developers console is `<origin>/api/auth/kakao/callback`.

- [ ] **Step 1: Create the Kakao OAuth start route** (new file `app/api/auth/kakao/start/route.ts`). Mirrors the Naver start route exactly: same-origin `next` sanitization, `auth_error=kakao_not_configured` fallback when the REST API key is missing, identical cookie options. Authorize URL is `https://kauth.kakao.com/oauth/authorize` with `response_type=code`, `client_id=KAKAO_REST_API_KEY`, `redirect_uri=<origin>/api/auth/kakao/callback`, `state`, and `scope=account_email,profile_nickname`.

```ts
import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

const STATE_COOKIE = "cln_kakao_oauth_state"
const NEXT_COOKIE = "cln_kakao_oauth_next"

function getSafeNextPath(req: NextRequest) {
  const rawNext = req.nextUrl.searchParams.get("next") ?? "/resources"
  try {
    const nextUrl = new URL(rawNext, req.nextUrl.origin)
    if (nextUrl.origin !== req.nextUrl.origin) return "/resources"
    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
  } catch {
    return "/resources"
  }
}

export async function GET(req: NextRequest) {
  const clientId = process.env.KAKAO_REST_API_KEY?.trim()
  if (!clientId) {
    const fallback = new URL(getSafeNextPath(req), req.nextUrl.origin)
    fallback.searchParams.set("auth_error", "kakao_not_configured")
    return NextResponse.redirect(fallback)
  }

  const state = randomUUID()
  const redirectUri = `${req.nextUrl.origin}/api/auth/kakao/callback`
  const authorizeUrl = new URL("https://kauth.kakao.com/oauth/authorize")
  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("client_id", clientId)
  authorizeUrl.searchParams.set("redirect_uri", redirectUri)
  authorizeUrl.searchParams.set("state", state)
  authorizeUrl.searchParams.set("scope", "account_email,profile_nickname")

  const response = NextResponse.redirect(authorizeUrl)
  const secure = process.env.NODE_ENV === "production"
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 10,
  })
  response.cookies.set(NEXT_COOKIE, getSafeNextPath(req), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 10,
  })
  return response
}
```

- [ ] **Step 2: Create the Kakao OAuth callback route** (new file `app/api/auth/kakao/callback/route.ts`). Clones the Naver callback structure: `cln_kakao_*` cookies, state guard (`kakao_state`), token exchange, profile fetch, dedupe-or-create the Supabase user, issue a session via the existing `issueSupabaseSession` helper pattern, `upsertPublicUserProfile`, then `stitchIdentity`. Key Kakao-specific deltas:
  - `exchangeKakaoCode` POSTs `https://kauth.kakao.com/oauth/token` as `application/x-www-form-urlencoded` with `grant_type=authorization_code`, `client_id=KAKAO_REST_API_KEY`, `client_secret` only when `KAKAO_CLIENT_SECRET` is set, `code`, `redirect_uri`.
  - `fetchKakaoProfile` GETs `https://kapi.kakao.com/v2/user/me` with `Bearer` token; reads `id` (coerced via `String(id)`), `kakao_account.email`, `kakao_account.is_email_verified`, `kakao_account.is_email_valid`, `kakao_account.profile.nickname`.
  - `ensureKakaoUser` dedupes by `provider='kakao'` + `provider_id=String(id)`; synthetic email fallback `kakao_<id>@kakao.invalid`. The `email_confirm` flag on create is set to the computed `emailVerified` (per D4 — do NOT force `true`).
  - The callback throws `kakao_email` when Kakao did not return an email and no synthetic fallback can be derived (id missing is already caught upstream). Error codes: `kakao_state` / `kakao_failed` / `kakao_email`. Console label `[kakao/callback]`.
  - `stitchIdentity` is called with `emailVerified: Boolean(is_email_verified && is_email_valid)`.

```ts
import { createServerClient } from "@supabase/ssr"
import type { User } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { upsertPublicUserProfile } from "@/lib/auth/public-user"
import { ANONYMOUS_ID_COOKIE } from "@/lib/consent/consent"
import { stitchIdentity } from "@/lib/identity/stitch"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getSupabaseBrowserEnv } from "@/lib/supabase/public-env"

const STATE_COOKIE = "cln_kakao_oauth_state"
const NEXT_COOKIE = "cln_kakao_oauth_next"

interface KakaoTokenResponse {
  access_token?: string
  token_type?: string
  error?: string
  error_description?: string
}

interface KakaoProfileResponse {
  id?: number | string
  kakao_account?: {
    email?: string
    is_email_verified?: boolean
    is_email_valid?: boolean
    profile?: {
      nickname?: string
    }
  }
}

interface KakaoProfile {
  id: string
  email: string | null
  nickname: string | null
  emailVerified: boolean
}

function getSafeNextUrl(req: NextRequest) {
  const rawNext = req.cookies.get(NEXT_COOKIE)?.value ?? "/resources"
  try {
    const nextUrl = new URL(rawNext, req.nextUrl.origin)
    if (nextUrl.origin !== req.nextUrl.origin) return new URL("/resources", req.nextUrl.origin)
    return nextUrl
  } catch {
    return new URL("/resources", req.nextUrl.origin)
  }
}

function redirectWithError(req: NextRequest, code: string) {
  const nextUrl = getSafeNextUrl(req)
  nextUrl.searchParams.set("auth_error", code)
  const response = NextResponse.redirect(nextUrl)
  response.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" })
  response.cookies.set(NEXT_COOKIE, "", { maxAge: 0, path: "/" })
  return response
}

async function exchangeKakaoCode(req: NextRequest, code: string) {
  const clientId = process.env.KAKAO_REST_API_KEY?.trim()
  const clientSecret = process.env.KAKAO_CLIENT_SECRET?.trim()
  if (!clientId) throw new Error("Kakao OAuth is not configured.")

  const redirectUri = `${req.nextUrl.origin}/api/auth/kakao/callback`
  const params = new URLSearchParams()
  params.set("grant_type", "authorization_code")
  params.set("client_id", clientId)
  if (clientSecret) params.set("client_secret", clientSecret)
  params.set("code", code)
  params.set("redirect_uri", redirectUri)

  const response = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: params.toString(),
    cache: "no-store",
  })
  const token = (await response.json().catch(() => null)) as KakaoTokenResponse | null
  if (!response.ok || !token?.access_token) {
    throw new Error(token?.error_description ?? token?.error ?? "Failed to exchange Kakao code.")
  }
  return token.access_token
}

async function fetchKakaoProfile(accessToken: string): Promise<KakaoProfile> {
  const response = await fetch("https://kapi.kakao.com/v2/user/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  const profile = (await response.json().catch(() => null)) as KakaoProfileResponse | null
  if (!response.ok || profile?.id === undefined || profile?.id === null) {
    throw new Error("Failed to fetch Kakao profile.")
  }

  const account = profile.kakao_account
  return {
    id: String(profile.id),
    email: account?.email?.trim().toLowerCase() || null,
    nickname: account?.profile?.nickname?.trim() || null,
    emailVerified: Boolean(account?.is_email_verified && account?.is_email_valid),
  }
}

async function ensureKakaoUser(profile: KakaoProfile) {
  const admin = createSupabaseAdminClient()
  const providerId = profile.id
  const email = profile.email || `kakao_${providerId}@kakao.invalid`
  const name = profile.nickname || "Kakao User"

  const { data: existingProfile } = await admin
    .from("user_profiles")
    .select("id")
    .eq("provider", "kakao")
    .eq("provider_id", providerId)
    .maybeSingle()

  if (existingProfile?.id) {
    return { email, userId: existingProfile.id as string }
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: profile.emailVerified,
    user_metadata: {
      provider: "kakao",
      provider_id: providerId,
      sub: providerId,
      name,
    },
  })

  if (createError && !createError.message.toLowerCase().includes("already")) {
    throw createError
  }

  return { email, userId: created.user?.id ?? null }
}

async function issueSupabaseSession(
  req: NextRequest,
  email: string,
  emailVerified: boolean,
  response: NextResponse,
) {
  const admin = createSupabaseAdminClient()
  let { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  })

  if (linkError) {
    const { error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: emailVerified,
      user_metadata: { provider: "kakao" },
    })
    if (createError && !createError.message.toLowerCase().includes("already")) {
      throw createError
    }
    const retry = await admin.auth.admin.generateLink({ type: "magiclink", email })
    linkData = retry.data
    linkError = retry.error
  }

  const hashedToken = (linkData as { properties?: { hashed_token?: string } } | null)
    ?.properties?.hashed_token
  if (linkError || !hashedToken) {
    throw linkError ?? new Error("Kakao session token was not issued.")
  }

  const { url, publishableKey } = getSupabaseBrowserEnv()
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const { data, error } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: hashedToken,
  })
  if (error || !data.user) throw error ?? new Error("Failed to verify Kakao session.")
  return data.user
}

export async function GET(req: NextRequest) {
  const expectedState = req.cookies.get(STATE_COOKIE)?.value
  const state = req.nextUrl.searchParams.get("state")
  const code = req.nextUrl.searchParams.get("code")

  if (!expectedState || !state || expectedState !== state || !code) {
    return redirectWithError(req, "kakao_state")
  }

  const nextUrl = getSafeNextUrl(req)
  const response = NextResponse.redirect(nextUrl)
  response.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" })
  response.cookies.set(NEXT_COOKIE, "", { maxAge: 0, path: "/" })

  try {
    const accessToken = await exchangeKakaoCode(req, code)
    const profile = await fetchKakaoProfile(accessToken)
    if (!profile.id) {
      return redirectWithError(req, "kakao_email")
    }
    const { email } = await ensureKakaoUser(profile)
    const user = (await issueSupabaseSession(
      req,
      email,
      profile.emailVerified,
      response,
    )) as User
    const publicProfile = await upsertPublicUserProfile(user)
    await stitchIdentity({
      anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
      userId: user.id,
      leadId: publicProfile.lead_id,
      email: user.email ?? publicProfile.email,
      emailVerified: profile.emailVerified,
    })
    nextUrl.searchParams.delete("auth_error")
    return response
  } catch (error) {
    console.error("[kakao/callback] failed:", error)
    return redirectWithError(req, "kakao_failed")
  }
}
```

- [ ] **Step 3: Document the new Kakao env vars** in `.env.local.example`. Add a Kakao block next to the other auth/Supabase vars. Insert it immediately after the `SUPABASE_SECRET_KEY=...` line (line 9) in the Supabase block, since Naver currently has no example block and these are the public-auth OAuth provider keys.

Current code:
```sh
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxxxxxxxxxx

# Blog data source
```

New code:
```sh
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxxxxxxxxxx

# Public auth — Naver custom OAuth (app/api/auth/naver/*)
# Naver Developers > Application > Client ID / Client Secret.
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=

# Public auth — Kakao custom OAuth (app/api/auth/kakao/*)
# Kakao Developers > My Application > App Keys > REST API key.
# Register redirect URI <origin>/api/auth/kakao/callback under Product Settings > Kakao Login.
# KAKAO_CLIENT_SECRET is optional; set it only if "Kakao Login > Security > Client Secret" is enabled.
KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=

# Blog data source
```

- [ ] **Step 4: Verify (static gate per D7).** Run `npx eslint app components lib --max-warnings=0` then `npm run build`. Fast inner loop: `npm run typecheck`. The OAuth round trip (real Kakao app, redirect URI registration, session issuance, RLS-backed stitch) is **MANUAL** verification via `npm run dev` plus a Kakao-login flow against a real Kakao application — there is no automated harness for the I/O-bound path. No new unit test is added here (the start route's `getSafeNextPath` is a private copy of the already-tested Naver helper; the pure availability helper `resolveProviderAvailability` is owned by D3/A-providers task).

- [ ] **Step 5: Commit.**
```sh
git add app/api/auth/kakao/start/route.ts app/api/auth/kakao/callback/route.ts .env.local.example
git commit -m "feat(auth): Kakao custom OAuth (clone Naver, verified-email anchor)"
```

**Notes / cross-task dependencies:**
- The callback passes `emailVerified` into `stitchIdentity`. That field is `emailVerified?: boolean` on `StitchIdentityInput`, added by the D4/D5 stitch task. Because it is optional, this task type-checks even if the stitch task lands afterward; the verified-email auto-link only takes effect once D4 wires `shouldAutoLinkEmail` into `stitchIdentity`. If D4 has already landed, no change is needed here.
- `email_confirm` is intentionally set to the computed `emailVerified` flag (not hard-coded `true` as the Naver clone does), per **D4** — an unverified Kakao email must not be marked confirmed in Supabase.
- The dialog Kakao button + `loadingProvider` union extension and `/api/auth/providers` availability gating are owned by A1/D3; this task only ships the server routes and env docs.
- All `user_profiles` reads/writes go through `createSupabaseAdminClient()` (service_role) per **D8** — the inherited `issueSupabaseSession` uses the RLS-applied server client only to set session cookies via `verifyOtp`, identical to the Naver original.

---

### Task 7: Retrofit Naver to unverified-email + provider-siloed auth identity (anti-takeover)

**SECURITY task.** Naver's `/v1/nid/me` returns no email-verification flag, so the Naver-provided email MUST be treated as unverified. Today `ensureNaverUser` and `issueSupabaseSession` both call `admin.auth.admin.createUser(...)` and `generateLink`/`verifyOtp` keyed on the **real** Naver email. If a different user already owns that real email (e.g. signed up via Google/email), `generateLink({ type: "magiclink", email: realEmail })` resolves to and mints a session for **that pre-existing user** — full account takeover. The stitch then auto-links leads by the unverified email string.

**Chosen policy (documented in code comments):** silo the Supabase auth identity on the synthetic provider-scoped address `naver_<providerId>@naver.invalid`. All `createUser` / `generateLink` / `verifyOtp` calls key on this synthetic address — never the real email — so a session can never be minted onto a pre-existing account that owns the real email. `email_confirm: true` is retained ONLY for the synthetic `.invalid` address (it asserts ownership of the Naver account, not of the real mailbox; the `.invalid` TLD is non-routable so this is safe and login still succeeds). The real email is kept solely as a non-identity profile attribute (`user_metadata.real_email`). The stitch is called with `emailVerified: false` so no lead is auto-linked by the unverified email.

> Dependency: the `emailVerified` field on `stitchIdentity`'s input is added by the identity-stitch task (D4/D5). This task passes `emailVerified: false`; until that field exists on `StitchIdentityInput`, TS will reject the excess property. Land this task **after** (or together with) the stitch-helper task so `StitchIdentityInput` already declares `emailVerified?: boolean`.

- [ ] **Step 1: Rewrite `ensureNaverUser` to key the auth account on the synthetic provider-siloed address and carry the real email only as profile metadata.**

  File: `app/api/auth/naver/callback/route.ts`

  Before (lines 86–120):
  ```ts
  async function ensureNaverUser(profile: NonNullable<NaverProfileResponse["response"]>) {
    const admin = createSupabaseAdminClient()
    const providerId = profile.id
    const email = profile.email?.trim().toLowerCase() || `naver_${providerId}@naver.invalid`
    const name = profile.name?.trim() || profile.nickname?.trim() || "Naver User"

    const { data: existingProfile } = await admin
      .from("user_profiles")
      .select("id")
      .eq("provider", "naver")
      .eq("provider_id", providerId)
      .maybeSingle()

    if (existingProfile?.id) {
      return { email, userId: existingProfile.id as string }
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        provider: "naver",
        provider_id: providerId,
        sub: providerId,
        name,
        phone: profile.mobile ?? null,
      },
    })

    if (createError && !createError.message.toLowerCase().includes("already")) {
      throw createError
    }

    return { email, userId: created.user?.id ?? null }
  }
  ```

  After:
  ```ts
  // SECURITY: Naver's /v1/nid/me exposes no email-verification flag, so the
  // Naver-provided email is UNVERIFIED. We key the Supabase auth identity on a
  // synthetic provider-siloed address (naver_<providerId>@naver.invalid) instead
  // of the real email. This prevents an email-collision account takeover: a
  // magiclink minted against the real email could otherwise resolve to a
  // pre-existing account that already owns it. The real email is retained only
  // as a non-identity profile attribute (user_metadata.real_email). email_confirm
  // is true ONLY because the synthetic .invalid address is non-routable and
  // uniquely derived from the Naver account id — it asserts Naver-account
  // ownership, not real-mailbox ownership.
  function getNaverAuthEmail(providerId: string) {
    return `naver_${providerId}@naver.invalid`
  }

  async function ensureNaverUser(profile: NonNullable<NaverProfileResponse["response"]>) {
    const admin = createSupabaseAdminClient()
    const providerId = profile.id as string
    const authEmail = getNaverAuthEmail(providerId)
    const realEmail = profile.email?.trim().toLowerCase() || null
    const name = profile.name?.trim() || profile.nickname?.trim() || "Naver User"

    const { data: existingProfile } = await admin
      .from("user_profiles")
      .select("id")
      .eq("provider", "naver")
      .eq("provider_id", providerId)
      .maybeSingle()

    if (existingProfile?.id) {
      return { authEmail, realEmail, userId: existingProfile.id as string }
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      user_metadata: {
        provider: "naver",
        provider_id: providerId,
        sub: providerId,
        name,
        real_email: realEmail,
        phone: profile.mobile ?? null,
      },
    })

    if (createError && !createError.message.toLowerCase().includes("already")) {
      throw createError
    }

    return { authEmail, realEmail, userId: created.user?.id ?? null }
  }
  ```

- [ ] **Step 2: Rewrite `issueSupabaseSession` to mint the session against the synthetic auth email only.**

  File: `app/api/auth/naver/callback/route.ts`

  Before (lines 122–169):
  ```ts
  async function issueSupabaseSession(req: NextRequest, email: string, response: NextResponse) {
    const admin = createSupabaseAdminClient()
    let { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    })

    if (linkError) {
      const { error: createError } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { provider: "naver" },
      })
      if (createError && !createError.message.toLowerCase().includes("already")) {
        throw createError
      }
      const retry = await admin.auth.admin.generateLink({ type: "magiclink", email })
      linkData = retry.data
      linkError = retry.error
    }

    const hashedToken = (linkData as { properties?: { hashed_token?: string } } | null)
      ?.properties?.hashed_token
    if (linkError || !hashedToken) {
      throw linkError ?? new Error("Naver session token was not issued.")
    }

    const { url, publishableKey } = getSupabaseBrowserEnv()
    const supabase = createServerClient(url, publishableKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    })

    const { data, error } = await supabase.auth.verifyOtp({
      type: "email",
      token_hash: hashedToken,
    })
    if (error || !data.user) throw error ?? new Error("Failed to verify Naver session.")
    return data.user
  }
  ```

  After:
  ```ts
  // SECURITY: `authEmail` is always the synthetic provider-siloed address
  // (naver_<providerId>@naver.invalid). The magiclink + verifyOtp round trip is
  // bound to that address, so the issued session can never land on a pre-existing
  // user that owns the real Naver email. Never pass the real email here.
  async function issueSupabaseSession(
    req: NextRequest,
    authEmail: string,
    response: NextResponse,
  ) {
    const admin = createSupabaseAdminClient()
    let { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: authEmail,
    })

    if (linkError) {
      const { error: createError } = await admin.auth.admin.createUser({
        email: authEmail,
        email_confirm: true,
        user_metadata: { provider: "naver" },
      })
      if (createError && !createError.message.toLowerCase().includes("already")) {
        throw createError
      }
      const retry = await admin.auth.admin.generateLink({ type: "magiclink", email: authEmail })
      linkData = retry.data
      linkError = retry.error
    }

    const hashedToken = (linkData as { properties?: { hashed_token?: string } } | null)
      ?.properties?.hashed_token
    if (linkError || !hashedToken) {
      throw linkError ?? new Error("Naver session token was not issued.")
    }

    const { url, publishableKey } = getSupabaseBrowserEnv()
    const supabase = createServerClient(url, publishableKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    })

    const { data, error } = await supabase.auth.verifyOtp({
      type: "email",
      token_hash: hashedToken,
    })
    if (error || !data.user) throw error ?? new Error("Failed to verify Naver session.")
    return data.user
  }
  ```

- [ ] **Step 3: Update the `GET` orchestrator to thread `authEmail` into the session call and pass the real (unverified) email + `emailVerified: false` to the stitch.**

  File: `app/api/auth/naver/callback/route.ts`

  Before (lines 185–198):
  ```ts
    try {
      const accessToken = await exchangeNaverCode(req, code, state)
      const profile = await fetchNaverProfile(accessToken)
      const { email } = await ensureNaverUser(profile)
      const user = (await issueSupabaseSession(req, email, response)) as User
      const publicProfile = await upsertPublicUserProfile(user)
      await stitchIdentity({
        anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
        userId: user.id,
        leadId: publicProfile.lead_id,
        email: user.email ?? publicProfile.email,
      })
      nextUrl.searchParams.delete("auth_error")
      return response
    } catch (error) {
  ```

  After:
  ```ts
    try {
      const accessToken = await exchangeNaverCode(req, code, state)
      const profile = await fetchNaverProfile(accessToken)
      const { authEmail, realEmail } = await ensureNaverUser(profile)
      // SECURITY: mint the session against the synthetic auth email only.
      const user = (await issueSupabaseSession(req, authEmail, response)) as User
      const publicProfile = await upsertPublicUserProfile(user)
      await stitchIdentity({
        anonymousId: req.cookies.get(ANONYMOUS_ID_COOKIE)?.value ?? null,
        userId: user.id,
        leadId: publicProfile.lead_id,
        // SECURITY: Naver email is UNVERIFIED (no flag in /v1/nid/me). Pass the
        // real email for diagnostics but mark emailVerified:false so the stitch
        // never auto-links leads by this email string (D4).
        email: realEmail ?? publicProfile.email,
        emailVerified: false,
      })
      nextUrl.searchParams.delete("auth_error")
      return response
    } catch (error) {
  ```

- [ ] **Step 4: Lint + build gate.**
  ```bash
  npx eslint app components lib --max-warnings=0 && npm run build
  ```
  Both must pass clean. If `npm run build` (or `npm run typecheck`) reports that `emailVerified` is not assignable to `StitchIdentityInput`, the identity-stitch task (D4/D5) that adds `emailVerified?: boolean` to `StitchIdentityInput` has not landed yet — land/rebase that task first, then re-run. Do not delete the `emailVerified: false` arg to make the build pass.

- [ ] **Step 5: MANUAL runtime verification (per D7 — I/O-bound OAuth round trip, no automated harness).**
  ```bash
  npm run dev
  ```
  1. Pre-seed a pre-existing account that owns a real email `victim@example.com` (e.g. via Google or email login). Note its `auth.users.id`.
  2. Complete the Naver login flow with a Naver account whose profile email is the same `victim@example.com`.
  3. Confirm in Supabase: a NEW `auth.users` row exists with `email = naver_<providerId>@naver.invalid` and `user_metadata.real_email = victim@example.com`; the session cookie resolves to THIS new user id — NOT the pre-existing victim id (no takeover).
  4. Confirm `leads` rows with `email = victim@example.com` were NOT auto-associated to the Naver user (`user_id` unchanged), because `emailVerified: false` suppressed the email auto-link.
  5. Confirm login still succeeds end-to-end (redirect to `next` path, session present).

- [ ] **Step 6: Commit.**
  ```bash
  git add app/api/auth/naver/callback/route.ts && git commit -m "fix(auth): treat Naver email as unverified, silo auth identity to prevent account takeover"
  ```

---

### Task 8: First-login marketing-consent capture + write path + withdrawal

Spec 5.2. The column `user_profiles.marketing_consent` already exists in `lib/supabase/database.types.ts` (line 118, `marketing_consent: boolean`) but is NEVER written — `upsertPublicUserProfile` omits it. This task owns the WRITE PATH (GET/POST route, scoped by logged-in user id, admin client per D8), a reusable opt-in/withdraw toggle, and first-login capture via a short-lived `localStorage` key set by the login dialog checkbox and drained by the toggle on mount (the social OAuth redirect leaves the client, so the intent is persisted client-side and POSTed right after the user lands back authenticated). The `/account` page that mounts the toggle is A9 — out of scope here. Withdrawal is the same toggle, so it is exactly as easy as opt-in (legal requirement).

**Chosen mechanism (concrete, no placeholder):** the dialog writes the checkbox value to `localStorage["cln_pending_marketing_consent"]` only when checked (value `"1"`). `MarketingConsentToggle`, on mount, first reads the server value via `GET`, then — if the pending key is present and equals `"1"` and the server value is not already `true` — POSTs `{ consent: true }` once and clears the key. This is the "store the intended choice, write it right after login" path. Manual verification covers the full OAuth round-trip; the route POST gets a vitest test using the admin-mock pattern.

- [ ] **Step 1: Create the write-path route `app/api/account/marketing-consent/route.ts`.** GET returns the logged-in user's `marketing_consent` (admin read scoped by `user.id`); POST validates `{ consent: boolean }` and updates `user_profiles.marketing_consent` for that id via `createSupabaseAdminClient` (D8 — server/anon client is RLS-blocked → zero rows). 401 when not logged in. Same-origin guard on POST mirrors `app/api/consent/route.ts`. Auth identity comes from `getPublicUserContext()` (already returns `{ user, profile }` from the SSR session); we use only `context.user.id` and do the `marketing_consent` read/write directly with the admin client because `PublicUserProfile` does not carry `marketing_consent`.

NEW FILE — full content:

```ts
import { type NextRequest, NextResponse } from "next/server"

import { getPublicUserContext } from "@/lib/auth/public-user"
import { isCrossOriginRequest } from "@/lib/server/same-origin"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

interface MarketingConsentBody {
  consent?: boolean
}

/**
 * 로그인한 공개 사용자의 마케팅 수신 동의 상태를 반환한다.
 * user_profiles.marketing_consent는 RLS로 보호되므로 admin 클라이언트(service_role)로만 읽는다.
 */
export async function GET() {
  const context = await getPublicUserContext()
  if (!context) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("user_profiles")
    .select("marketing_consent")
    .eq("id", context.user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true, consent: Boolean(data?.marketing_consent) })
}

/**
 * 마케팅 수신 동의 opt-in/철회를 기록한다. 철회는 opt-in과 동일하게 consent:false POST 한 번으로 처리된다.
 * 항상 로그인 사용자의 id로 스코프하며 admin 클라이언트로만 쓴다(서버/익명 클라이언트는 RLS로 0행).
 */
export async function POST(req: NextRequest) {
  if (isCrossOriginRequest(req)) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  const context = await getPublicUserContext()
  if (!context) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let body: MarketingConsentBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  if (typeof body.consent !== "boolean") {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from("user_profiles")
    .update({ marketing_consent: body.consent })
    .eq("id", context.user.id)

  if (error) {
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true, consent: body.consent })
}
```

- [ ] **Step 2: Create the reusable toggle `components/account/MarketingConsentToggle.tsx`.** Client component. On mount: `GET` current value; then drain the `localStorage["cln_pending_marketing_consent"]` first-login intent (if `=== "1"` and current server value is not already `true`, POST `{ consent: true }` once, update local state, clear the key). User clicks toggle → POST the new value (opt-in OR withdraw, symmetric). A `useRef` guard prevents the drain from firing twice under StrictMode double-mount.

NEW FILE — full content:

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"

const PENDING_CONSENT_KEY = "cln_pending_marketing_consent"

async function fetchConsent(): Promise<boolean | null> {
  try {
    const res = await fetch("/api/account/marketing-consent", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })
    if (!res.ok) return null
    const data = (await res.json()) as { ok?: boolean; consent?: boolean }
    return data.ok ? Boolean(data.consent) : null
  } catch {
    return null
  }
}

async function postConsent(consent: boolean): Promise<boolean> {
  try {
    const res = await fetch("/api/account/marketing-consent", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ consent }),
    })
    return res.ok
  } catch {
    return false
  }
}

export function MarketingConsentToggle() {
  const [consent, setConsent] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const drainedRef = useRef(false)

  useEffect(() => {
    let active = true

    const init = async () => {
      const current = await fetchConsent()
      if (!active) return

      // 첫 로그인 시 다이얼로그 체크박스가 남긴 의도를 한 번만 반영한다.
      let next = current
      if (!drainedRef.current) {
        drainedRef.current = true
        let pending: string | null = null
        try {
          pending = window.localStorage.getItem(PENDING_CONSENT_KEY)
        } catch {
          pending = null
        }
        if (pending !== null) {
          try {
            window.localStorage.removeItem(PENDING_CONSENT_KEY)
          } catch {
            // 무시: 스토리지 접근 실패는 동의 기록에 영향 없음
          }
          if (pending === "1" && current !== true) {
            const ok = await postConsent(true)
            if (active && ok) next = true
          }
        }
      }

      if (active) setConsent(next ?? false)
    }

    void init()
    return () => {
      active = false
    }
  }, [])

  const handleToggle = async () => {
    if (consent === null || saving) return
    const nextValue = !consent
    setSaving(true)
    setError("")
    const ok = await postConsent(nextValue)
    if (ok) {
      setConsent(nextValue)
    } else {
      setError("동의 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    }
    setSaving(false)
  }

  const checked = consent === true
  const disabled = consent === null || saving

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-4">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-[#1A1A1A]">마케팅 정보 수신</p>
        <p className="mt-1 text-[13px] leading-5 text-[#6B6661]">
          신규 자료·웨비나·제품 소식을 이메일로 받아봅니다. 언제든 다시 끌 수 있습니다.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="마케팅 정보 수신 동의"
        onClick={handleToggle}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 disabled:opacity-50 ${
          checked ? "bg-[#084734]" : "bg-[#D6D3D0]"
        }`}
      >
        {saving ? (
          <Loader2 className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
        ) : (
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              checked ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        )}
      </button>
      {error ? (
        <p role="alert" className="sr-only">
          {error}
        </p>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3: Add the optional marketing-consent checkbox to `components/auth/PublicLoginDialog.tsx`.** Default unchecked. On change it writes/clears `localStorage["cln_pending_marketing_consent"]` so the intent survives the OAuth redirect (the toggle/`/account` reads it on return per Step 2). Add controlled `marketingOptIn` state, persist on toggle, and render the checkbox below the provider buttons. **⚠️ Per integration reconciliation #1, this edits the file AS PRODUCED BY Task 1** — the anchors below are Task 1's output (import already includes `useEffect`; `loadingProvider` union already includes `"kakao"`; an `availability` state already exists). Locate these anchors in the live file; do not rely on the pre-Task-1 line numbers.

Current code (top of file, the react import — post-Task-1):

```tsx
"use client"

import { useEffect, useMemo, useState } from "react"
```

New code:

```tsx
"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
```

Current code (state declarations, post-Task-1):

```tsx
  const [loadingProvider, setLoadingProvider] = useState<"google" | "naver" | "kakao" | null>(null)
  const [error, setError] = useState("")
  const [availability, setAvailability] = useState<ProviderAvailability>(DEFAULT_AVAILABILITY)
  const resolvedNextPath = useMemo(() => nextPath ?? getCurrentPath(), [nextPath])
```

New code (add `marketingOptIn` state after `error`, and `handleMarketingChange` after `resolvedNextPath`):

```tsx
  const [loadingProvider, setLoadingProvider] = useState<"google" | "naver" | "kakao" | null>(null)
  const [error, setError] = useState("")
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [availability, setAvailability] = useState<ProviderAvailability>(DEFAULT_AVAILABILITY)
  const resolvedNextPath = useMemo(() => nextPath ?? getCurrentPath(), [nextPath])

  const handleMarketingChange = useCallback((checked: boolean) => {
    setMarketingOptIn(checked)
    try {
      if (checked) {
        window.localStorage.setItem("cln_pending_marketing_consent", "1")
      } else {
        window.localStorage.removeItem("cln_pending_marketing_consent")
      }
    } catch {
      // 무시: 스토리지 접근 실패 시 동의는 /account 토글에서 직접 처리한다.
    }
  }, [])
```

Current code (the provider button grid close + trailing copy, lines 102-111):

```tsx
        </div>

        {error ? (
          <p role="alert" className="text-[13px] leading-5 text-[#B85C33]">
            {error}
          </p>
        ) : null}
        <p className="text-[11px] leading-5 text-[#A39E98]">
          로그인 정보는 자료 열람 기록과 상담 후속 안내에만 사용됩니다.
        </p>
```

New code:

```tsx
        </div>

        <label className="flex items-start gap-2 text-[12px] leading-5 text-[#6B6661]">
          <input
            type="checkbox"
            checked={marketingOptIn}
            onChange={(event) => handleMarketingChange(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[rgba(0,0,0,0.2)] accent-[#084734]"
          />
          <span>
            (선택) 신규 자료·웨비나·제품 소식을 이메일로 받아보겠습니다. 로그인 후 계정 설정에서 언제든
            해제할 수 있습니다.
          </span>
        </label>

        {error ? (
          <p role="alert" className="text-[13px] leading-5 text-[#B85C33]">
            {error}
          </p>
        ) : null}
        <p className="text-[11px] leading-5 text-[#A39E98]">
          로그인 정보는 자료 열람 기록과 상담 후속 안내에만 사용됩니다.
        </p>
```

- [ ] **Step 4: Add a vitest test for the POST update at `tests/api/account-marketing-consent.test.ts`** using the admin-mock + direct-handler-invocation pattern (mirror `tests/api/track-event.test.ts`). Mocks both `@/lib/supabase/admin` (to assert the scoped `update().eq()` call) and `@/lib/auth/public-user` (`getPublicUserContext`). Covers: 401 when not logged in, 400 on missing/non-boolean `consent`, and the happy path asserting `update({ marketing_consent: true })` scoped by the user id. Scope the run per D7: `npx vitest run --dir tests tests/api/account-marketing-consent.test.ts`.

NEW FILE — full content:

```ts
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const eq = vi.fn()
const update = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ update }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

const getPublicUserContext = vi.fn()
vi.mock("@/lib/auth/public-user", () => ({
  getPublicUserContext,
}))

import { POST } from "@/app/api/account/marketing-consent/route"

function consentRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/account/marketing-consent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://classin.kr",
    },
    body: JSON.stringify(body),
  })
}

describe("account marketing-consent POST", () => {
  beforeEach(() => {
    from.mockClear()
    update.mockClear()
    eq.mockReset()
    eq.mockResolvedValue({ error: null })
    getPublicUserContext.mockReset()
  })

  it("returns 401 when not logged in", async () => {
    getPublicUserContext.mockResolvedValue(null)
    const res = await POST(consentRequest({ consent: true }))
    expect(res.status).toBe(401)
    expect(from).not.toHaveBeenCalled()
  })

  it("returns 400 when consent is missing or not boolean", async () => {
    getPublicUserContext.mockResolvedValue({ user: { id: "user-1" }, profile: {} })
    const res = await POST(consentRequest({ consent: "yes" }))
    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it("updates marketing_consent scoped by the logged-in user id", async () => {
    getPublicUserContext.mockResolvedValue({ user: { id: "user-1" }, profile: {} })
    const res = await POST(consentRequest({ consent: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, consent: true })
    expect(from).toHaveBeenCalledWith("user_profiles")
    expect(update).toHaveBeenCalledWith({ marketing_consent: true })
    expect(eq).toHaveBeenCalledWith("id", "user-1")
  })

  it("supports withdrawal with consent:false", async () => {
    getPublicUserContext.mockResolvedValue({ user: { id: "user-1" }, profile: {} })
    const res = await POST(consentRequest({ consent: false }))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ marketing_consent: false })
    expect(eq).toHaveBeenCalledWith("id", "user-1")
  })
})
```

- [ ] **Step 5: Verify (static gate + scoped test).** Run, in repo root:

```bash
npx eslint app components lib --max-warnings=0
npm run typecheck
npx vitest run --dir tests tests/api/account-marketing-consent.test.ts
npm run build
```

MANUAL (login round-trip — do not automate per D7): `npm run dev`, open a login-gated surface, check the consent box, complete Google/Naver OAuth, land back authenticated, mount the toggle (A9 `/account` or a temporary mount), confirm `user_profiles.marketing_consent` flipped to `true` for the user; then toggle off and confirm it flips to `false` (withdrawal symmetric).

- [ ] **Step 6: Commit.**

```bash
git add app/api/account/marketing-consent/route.ts components/account/MarketingConsentToggle.tsx components/auth/PublicLoginDialog.tsx tests/api/account-marketing-consent.test.ts
git commit -m "feat(account): first-login marketing-consent capture + write path + withdrawal toggle"
```

---

**Notes for the assembler / reviewer**
- No migration or `database.types.ts` change is needed: `user_profiles.marketing_consent: boolean` already exists (line 118), so D6 does not apply to this task.
- D8 honored: both GET read and POST write use `createSupabaseAdminClient()` (service_role); a server/anon client would return zero rows under RLS. Auth identity is taken from `getPublicUserContext()` (SSR session) and the DB op is always scoped by `context.user.id`.
- Same-origin POST guard reuses `isCrossOriginRequest` exactly like `app/api/consent/route.ts`.
- First-login mechanism is a single concrete path (localStorage `cln_pending_marketing_consent`, drained once by the toggle) — chosen over a cookie threaded through `app/auth/callback/route.ts` to keep the OAuth callback untouched and keep opt-in/withdraw in one symmetric control.
- Files (absolute): `/Users/clmagi/Desktop/Projects/classin_home/app/api/account/marketing-consent/route.ts`, `/Users/clmagi/Desktop/Projects/classin_home/components/account/MarketingConsentToggle.tsx`, `/Users/clmagi/Desktop/Projects/classin_home/components/auth/PublicLoginDialog.tsx`, `/Users/clmagi/Desktop/Projects/classin_home/tests/api/account-marketing-consent.test.ts`.

---

### Task 9: Minimal member surface /account

DEPENDS on A8 (provides `components/account/MarketingConsentToggle.tsx`) and A3. Reads use `material_downloads` (created by `supabase/migrations/20260615_public_material_downloads.sql`) — no new columns needed. All DB access uses `createSupabaseAdminClient()` (service_role) per D8; a server/anon client returns zero rows under RLS. Signed URLs are NEVER stored — `/account` only links back to `/api/materials/<slug>/download` which re-issues a fresh 60s signed URL.

**Placement decision (repository helper):** New file `lib/repositories/account-downloads.ts`, NOT an extension of `lib/materials.ts`. `lib/materials.ts` is the write/issue path (`prepareMaterialDownload` → `recordDownload`) and owns signed-URL minting; `lib/repositories/` is the canonical read-path home (mirrors `lead-magnet-metrics.ts`, which already does `createSupabaseAdminClient()` + scoped SELECT). Keeping the account read separate avoids importing the storage/stitch surface of `materials.ts` into a page render.

- [ ] **Step 1: Create the repository read helper `lib/repositories/account-downloads.ts`.** Service-role admin client, SELECT `material_downloads` scoped by `user_id`, ordered by `created_at desc` (uses partial index `material_downloads_user_created_idx`). De-dupe per `material_slug` keeping the most recent row so `/account` shows one entry per material.

```typescript
import "server-only"

import type { MaterialDownload } from "@/lib/supabase/database.types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export interface AccountMaterialDownload {
  slug: string
  gateType: MaterialDownload["gate_type"]
  lastDownloadedAt: string
}

/**
 * Returns the premium/login materials a user has downloaded, one row per
 * material slug (most recent first). Service-role only — RLS blocks anon/server
 * reads of material_downloads. Signed URLs are never returned here; /account
 * re-hits /api/materials/<slug>/download to mint a fresh signed URL.
 */
export async function getMaterialDownloadsByUser(
  userId: string
): Promise<AccountMaterialDownload[]> {
  if (!userId) return []

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("material_downloads")
    .select("material_slug, gate_type, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error || !data) {
    if (error) {
      console.warn("[account-downloads] select failed:", error.message)
    }
    return []
  }

  const seen = new Set<string>()
  const result: AccountMaterialDownload[] = []
  for (const row of data) {
    const slug = row.material_slug as string
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    result.push({
      slug,
      gateType: row.gate_type as MaterialDownload["gate_type"],
      lastDownloadedAt: row.created_at as string,
    })
  }

  return result
}
```

- [ ] **Step 2: Create the logout client component `components/account/AccountLogoutButton.tsx`.** Logout requires a client-side POST to `/api/auth/session/logout` (the existing route — `app/api/auth/session/logout/route.ts` already exports `POST`) followed by a hard redirect to `/`. Server-side it cannot mutate the auth cookie post-render, so this is a small client island.

```typescript
"use client"

import * as React from "react"

export function AccountLogoutButton() {
  const [pending, setPending] = React.useState(false)

  async function handleLogout() {
    if (pending) return
    setPending(true)
    try {
      await fetch("/api/auth/session/logout", { method: "POST" })
    } catch {
      // best-effort: even if the request fails, send the user home so the
      // stale UI is dismissed; the next protected fetch will re-gate them.
    } finally {
      window.location.assign("/")
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="inline-flex items-center justify-center rounded-[6px] border border-black/[0.08] bg-white px-4 py-2 text-sm font-semibold text-[#615D59] transition-colors hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "로그아웃 중…" : "로그아웃"}
    </button>
  )
}
```

- [ ] **Step 3: Create the member page `app/account/page.tsx` (server component).** Redirect to `/` if not logged in (`getPublicUserContext()` returns `null`). Otherwise render name/email, the list of downloaded premium materials with a re-view link (re-hitting the download route — never a stored signed URL), mount `MarketingConsentToggle` (A8), and the logout button. Material titles come from `getLeadMagnetTitleFromStore(slug)`; unpublished/removed magnets fall back to the slug.

```typescript
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Download } from "lucide-react"

import { MarketingConsentToggle } from "@/components/account/MarketingConsentToggle"
import { AccountLogoutButton } from "@/components/account/AccountLogoutButton"
import { getPublicUserContext } from "@/lib/auth/public-user"
import { getMaterialDownloadsByUser } from "@/lib/repositories/account-downloads"
import { getLeadMagnetTitleFromStore } from "@/lib/repositories/lead-magnets"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "내 계정",
  robots: { index: false, follow: false },
}

export default async function AccountPage() {
  const context = await getPublicUserContext()
  if (!context) {
    redirect("/")
  }

  const downloads = await getMaterialDownloadsByUser(context.user.id)
  const items = await Promise.all(
    downloads.map(async (download) => ({
      ...download,
      title: (await getLeadMagnetTitleFromStore(download.slug)) || download.slug,
    }))
  )

  const displayName = context.profile.name?.trim() || "회원"
  const email = context.user.email ?? context.profile.email ?? null

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <section className="px-4 pb-16 pt-28 sm:px-6 md:pt-36">
        <div className="mx-auto max-w-[840px]">
          <div className="flex flex-col gap-4 border border-black/[0.08] bg-white p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#084734]/60">
                내 계정
              </p>
              <h1 className="mt-2 text-[1.6rem] font-bold tracking-[-0.03em] text-[#111110] md:text-[2rem]">
                {displayName} 님
              </h1>
              {email ? (
                <p className="mt-1 text-sm text-[#615D59]">{email}</p>
              ) : null}
            </div>
            <AccountLogoutButton />
          </div>

          <section className="mt-6 border border-black/[0.08] bg-white p-6 md:p-8">
            <h2 className="text-xl font-bold tracking-[-0.03em] text-[#111110]">
              받은 자료
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-[#615D59]">
              로그인 시 받은 자료를 다시 내려받을 수 있습니다. 다운로드 링크는 보안을 위해 매번 새로 발급됩니다.
            </p>

            {items.length > 0 ? (
              <ul className="mt-6 divide-y divide-black/[0.08] border-y border-black/[0.08]">
                {items.map((item) => (
                  <li
                    key={item.slug}
                    className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold leading-6 text-[#111110]">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-[12px] text-[#A39E98]">
                        최근 다운로드 {new Date(item.lastDownloadedAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                    <a
                      href={`/api/materials/${item.slug}/download`}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[6px] bg-[#084734] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#065c41]"
                    >
                      <Download className="h-4 w-4" />
                      다시 받기
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 border border-dashed border-black/[0.12] bg-[#FAFAF8] p-6 text-center text-sm text-[#615D59]">
                아직 받은 자료가 없습니다. 자료실에서 로그인 자료를 받아보세요.
              </p>
            )}
          </section>

          <section className="mt-6 border border-black/[0.08] bg-white p-6 md:p-8">
            <h2 className="text-xl font-bold tracking-[-0.03em] text-[#111110]">
              마케팅 수신 설정
            </h2>
            <div className="mt-4">
              <MarketingConsentToggle />
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}
```

> **Integration (authoritative, per reconciliation #2):** `MarketingConsentToggle` (Task 8) is **self-fetching and takes no props** — it reads/writes its value via `/api/account/marketing-consent` and drains the first-login `localStorage` intent on mount. Mount it as `<MarketingConsentToggle />`. Do **not** read `context.profile.marketing_consent` (that field is **not** on `PublicUserProfile`, and no change to that interface is needed). The DB column `user_profiles.marketing_consent` already exists (migration `20260615`).

- [ ] **Step 4: Create the session-aware header entry `components/auth/SessionNavEntry.tsx` (client component).** Calls `GET /api/auth/session` on mount; when a user is present it renders an `/account` link. Renders nothing while loading or when logged out, so the header is unchanged for anonymous visitors.

```typescript
"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { UserRound } from "lucide-react"

interface SessionResponse {
  user: { id: string; email: string | null; name: string | null } | null
}

export function SessionNavEntry({ className }: { className?: string }) {
  const [loggedIn, setLoggedIn] = React.useState(false)
  const pathname = usePathname()

  React.useEffect(() => {
    let active = true
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<SessionResponse>) : null))
      .then((data) => {
        if (active) setLoggedIn(Boolean(data?.user))
      })
      .catch(() => {
        if (active) setLoggedIn(false)
      })
    return () => {
      active = false
    }
  }, [pathname])

  if (!loggedIn) return null

  return (
    <Link
      href="/account"
      prefetch={false}
      className={
        className ??
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[15px] font-semibold text-[#615D59] transition-colors hover:text-[#084734]"
      }
    >
      <UserRound className="h-4 w-4" />
      내 계정
    </Link>
  )
}
```

- [ ] **Step 5: Mount `SessionNavEntry` in the public header `components/sections/Header.tsx`.** Two edits: add the import, then render it in the desktop right-side action cluster (just before the "자료 받아보기" link). It self-hides for anonymous users, so no layout change for logged-out visitors.

Edit 5a — add the import. Current:

```typescript
import { TrackedLink } from "@/components/TrackedLink"
import { cn } from "@/lib/utils"
import { Menu, X, Pencil, Presentation } from "lucide-react"
```

New:

```typescript
import { TrackedLink } from "@/components/TrackedLink"
import { SessionNavEntry } from "@/components/auth/SessionNavEntry"
import { cn } from "@/lib/utils"
import { Menu, X, Pencil, Presentation } from "lucide-react"
```

Edit 5b — render it in the desktop action cluster. Current:

```typescript
                <div className="hidden md:flex items-center gap-4">
                    <TrackedLink
                        href="/resources"
                        prefetch={false}
                        ctaId="gnb_resources"
                        className="hidden font-semibold text-[15px] text-[#615D59] transition-colors hover:text-[#084734] md:flex"
                    >
                        자료 받아보기
                    </TrackedLink>
```

New:

```typescript
                <div className="hidden md:flex items-center gap-4">
                    <SessionNavEntry />
                    <TrackedLink
                        href="/resources"
                        prefetch={false}
                        ctaId="gnb_resources"
                        className="hidden font-semibold text-[15px] text-[#615D59] transition-colors hover:text-[#084734] md:flex"
                    >
                        자료 받아보기
                    </TrackedLink>
```

- [ ] **Step 6: Add a vitest admin-mock test `tests/repositories/account-downloads.test.ts`.** Mocks `@/lib/supabase/admin` per the `tests/api/track-event.test.ts` pattern, asserts the query is scoped by `user_id`, ordered `created_at desc`, and that rows are de-duped per slug (most recent kept). Page/login round-trip is MANUAL per D7.

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest"

const order = vi.fn()
const eq = vi.fn(() => ({ order }))
const select = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ select }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

import { getMaterialDownloadsByUser } from "@/lib/repositories/account-downloads"

describe("getMaterialDownloadsByUser", () => {
  beforeEach(() => {
    from.mockClear()
    select.mockClear()
    eq.mockClear()
    order.mockReset()
  })

  it("returns [] for an empty userId without querying", async () => {
    const result = await getMaterialDownloadsByUser("")
    expect(result).toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it("scopes by user_id, orders by created_at desc, and de-dupes per slug", async () => {
    order.mockResolvedValue({
      data: [
        { material_slug: "academy-checklist", gate_type: "login", created_at: "2026-06-20T10:00:00Z" },
        { material_slug: "academy-checklist", gate_type: "login", created_at: "2026-06-10T10:00:00Z" },
        { material_slug: "onboarding-guide", gate_type: "login", created_at: "2026-06-15T10:00:00Z" },
      ],
      error: null,
    })

    const result = await getMaterialDownloadsByUser("user-123")

    expect(from).toHaveBeenCalledWith("material_downloads")
    expect(select).toHaveBeenCalledWith("material_slug, gate_type, created_at")
    expect(eq).toHaveBeenCalledWith("user_id", "user-123")
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false })
    expect(result).toEqual([
      { slug: "academy-checklist", gateType: "login", lastDownloadedAt: "2026-06-20T10:00:00Z" },
      { slug: "onboarding-guide", gateType: "login", lastDownloadedAt: "2026-06-15T10:00:00Z" },
    ])
  })

  it("returns [] and does not throw when the query errors", async () => {
    order.mockResolvedValue({ data: null, error: { message: "rls denied" } })
    const result = await getMaterialDownloadsByUser("user-123")
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 7: Verify, then commit.** Run the static gate (D7), the scoped unit test, and the build.

```bash
npx vitest run --dir tests tests/repositories/account-downloads.test.ts
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
git add lib/repositories/account-downloads.ts app/account/page.tsx components/account/AccountLogoutButton.tsx components/auth/SessionNavEntry.tsx components/sections/Header.tsx tests/repositories/account-downloads.test.ts
git commit -m "feat(account): minimal /account member surface with download history, consent toggle, session-aware header entry"
```

**MANUAL verification (D7 — not automatable):** `npm run dev`, log in via a configured provider, download a `gate=login` material, visit `/account` → confirm name/email render, the material appears once with a "다시 받기" link, clicking it mints a fresh signed URL (network tab shows `/api/materials/<slug>/download` → 302/redirect, not a cached URL), the `SessionNavEntry` "내 계정" link shows in the header only while logged in, and the logout button POSTs `/api/auth/session/logout` then lands on `/` with the header entry gone.

---

### Task 10: Remove vitest footguns (test scripts + .worktrees exclude)

Per D7: there is no `npm test` script today, and a bare `npx vitest run` globs stale `.worktrees/**` copies of test files (the whole suite is NOT green because of those duplicates). This task adds the two missing scripts and excludes `.worktrees` at the config level so even a bare run skips stale copies. It is self-contained and independent of the feature tasks — it only edits `package.json` and `vitest.config.ts`.

- [ ] **Step 1: Add `test` and `test:watch` scripts to `package.json`.**

  File: `/Users/clmagi/Desktop/Projects/classin_home/package.json`

  The current `scripts` block (lines 5-23) is:

  ```json
    "scripts": {
      "dev": "next dev --port 3888",
      "prebuild": "npm run check:vercel-crons",
      "build": "next build",
      "postbuild": "npm run check:public-content",
      "start": "next start",
      "lint": "eslint",
      "typecheck": "tsc --noEmit --incremental false",
      "generate:segment-landings": "node scripts/generate-segment-landings.mjs",
      "check:vercel-crons": "node scripts/check-vercel-crons.mjs",
      "check:public-content": "node scripts/check-public-content-visibility.mjs",
      "sync:cs-figma-guides": "node scripts/generate-cs-figma-guides.mjs",
      "sync:cs-figma-assets": "node scripts/generate-cs-figma-assets-manifest.mjs",
      "export:cs-figma-assets": "node scripts/export-cs-figma-asset-requirements.mjs",
      "import:cs-figma-assets": "node scripts/import-cs-figma-assets.mjs",
      "check:cs-figma-assets": "node scripts/check-cs-figma-assets.mjs",
      "check:alpha-db": "npx tsx scripts/check-alpha-db.ts",
      "sync:channel-docs": "npx tsx scripts/sync-channel-documents.ts"
    },
  ```

  Replace it with (adds `test` and `test:watch` right after `typecheck`; both scope to `--dir tests` so they never glob stale `.worktrees` copies):

  ```json
    "scripts": {
      "dev": "next dev --port 3888",
      "prebuild": "npm run check:vercel-crons",
      "build": "next build",
      "postbuild": "npm run check:public-content",
      "start": "next start",
      "lint": "eslint",
      "typecheck": "tsc --noEmit --incremental false",
      "test": "vitest run --dir tests",
      "test:watch": "vitest --dir tests",
      "generate:segment-landings": "node scripts/generate-segment-landings.mjs",
      "check:vercel-crons": "node scripts/check-vercel-crons.mjs",
      "check:public-content": "node scripts/check-public-content-visibility.mjs",
      "sync:cs-figma-guides": "node scripts/generate-cs-figma-guides.mjs",
      "sync:cs-figma-assets": "node scripts/generate-cs-figma-assets-manifest.mjs",
      "export:cs-figma-assets": "node scripts/export-cs-figma-asset-requirements.mjs",
      "import:cs-figma-assets": "node scripts/import-cs-figma-assets.mjs",
      "check:cs-figma-assets": "node scripts/check-cs-figma-assets.mjs",
      "check:alpha-db": "npx tsx scripts/check-alpha-db.ts",
      "sync:channel-docs": "npx tsx scripts/sync-channel-documents.ts"
    },
  ```

- [ ] **Step 2: Add `test.exclude` (`.worktrees` + vitest defaults) to `vitest.config.ts`.**

  File: `/Users/clmagi/Desktop/Projects/classin_home/vitest.config.ts`

  The current full file is:

  ```ts
  import { defineConfig } from "vitest/config"
  import path from "path"

  export default defineConfig({
    test: {
      environment: "node",
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
        "server-only": path.resolve(__dirname, "tests/__mocks__/server-only.ts"),
        "@/lib/google": path.resolve(__dirname, "tests/__mocks__/lib-google.ts"),
      },
    },
  })
  ```

  Replace the whole file with (adds an `exclude` array — the standard vitest defaults plus `**/.worktrees/**` — so a bare `npx vitest run` never globs stale worktree copies):

  ```ts
  import { defineConfig } from "vitest/config"
  import path from "path"

  export default defineConfig({
    test: {
      environment: "node",
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.idea/**",
        "**/.git/**",
        "**/.cache/**",
        "**/.worktrees/**",
      ],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
        "server-only": path.resolve(__dirname, "tests/__mocks__/server-only.ts"),
        "@/lib/google": path.resolve(__dirname, "tests/__mocks__/lib-google.ts"),
      },
    },
  })
  ```

  Note: vitest's built-in default `exclude` is replaced (not merged) when you set `test.exclude`, so the standard ignores (`node_modules`, `dist`, `.idea`, `.git`, `.cache`) are listed explicitly to preserve them; `**/.worktrees/**` is the new entry that kills the stale-copy footgun.

- [ ] **Step 3: Verify.** Run the static gate is not required for this config-only change, but confirm the two footguns are gone:

  ```bash
  cd /Users/clmagi/Desktop/Projects/classin_home
  # 1. Scoped run still passes (Supabase-admin-mock pattern test):
  npx vitest run --dir tests tests/api/track-event.test.ts
  # 2. New script works and excludes .worktrees:
  npm test
  # 3. Confirm a bare run no longer globs .worktrees (should report no .worktrees paths):
  npx vitest run 2>&1 | grep -i ".worktrees" || echo "OK: no .worktrees globbed"
  ```

  Expected: step 1 passes; step 2 runs only `tests/**`; step 3 prints `OK: no .worktrees globbed`. Do NOT gate on whole-suite 0 failures (per D7, ~10 pre-existing data-coupled files fail on HEAD).

- [ ] **Step 4: Commit.**

  ```bash
  cd /Users/clmagi/Desktop/Projects/classin_home
  git add package.json vitest.config.ts
  git commit -m "test(infra): add test scripts and exclude .worktrees from vitest

  - add npm run test / test:watch scoped to --dir tests
  - exclude **/.worktrees/** (plus vitest defaults) so a bare vitest run
    no longer globs stale worktree copies of test files

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

