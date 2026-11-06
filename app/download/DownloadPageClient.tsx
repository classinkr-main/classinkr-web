"use client"

import * as React from "react"
import Image from "next/image"
import { ArrowDown, ArrowRight, ArrowUpRight, Download } from "lucide-react"

import {
  AppleGlyph,
  AppStoreGlyph,
  GooglePlayGlyph,
  LinuxGlyph,
  WindowsGlyph,
} from "@/components/auth/brand-glyphs"
import { TrackedLink } from "@/components/TrackedLink"
import { buttonVariants } from "@/components/ui/button"
import {
  CLASSIN_VERSION,
  PRIMARY_DOWNLOADS,
  SECONDARY_DOWNLOADS,
  detectPrimaryOs,
  fileExtension,
  formatFileSize,
  isStoreVariant,
  macChipFromArchitecture,
  type DetectedOs,
  type DownloadPlatform,
  type DownloadVariant,
  type MacChip,
} from "@/lib/downloads"
import { cn } from "@/lib/utils"

const CONTAINER = "mx-auto max-w-[1040px] px-4 sm:px-6"
const TEXT_LINK =
  "inline-flex min-h-11 items-center gap-1 text-ui font-semibold text-fg-accent hover:underline underline-offset-4"

// 버튼이 놓인 자리 — click_cta 의 source 로 실린다(서버 적재·GA4 모두 허용 키). 버튼 ID 는 기존 형식 그대로
type Placement = "download_hero" | "download_list" | "download_classinx"

// ── 기기 감지 ──────────────────────────────────────────────

const subscribeNothing = () => () => {}

// 서버·첫 하이드레이션은 null(= Windows 기본 화면), 마운트 뒤 실제 기기
function useDetectedOs(): DetectedOs | null {
  return React.useSyncExternalStore(
    subscribeNothing,
    () => detectPrimaryOs(navigator.userAgent, navigator.maxTouchPoints),
    () => null,
  )
}

type UaDataNavigator = Navigator & {
  userAgentData?: {
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>
  }
}

// Chromium 계열에서만 Mac 칩을 알 수 있다. 모르면 null — 화면은 Apple Silicon 을 먼저 권하고 확인 방법을 적는다
function useMacChip(enabled: boolean): MacChip | null {
  const [chip, setChip] = React.useState<MacChip | null>(null)
  React.useEffect(() => {
    if (!enabled) return
    const uaData = (navigator as UaDataNavigator).userAgentData
    if (!uaData?.getHighEntropyValues) return
    let alive = true
    uaData
      .getHighEntropyValues(["architecture"])
      .then((values) => {
        if (alive) setChip(macChipFromArchitecture(values.architecture))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [enabled])
  return enabled ? chip : null
}

// ── 데이터 ────────────────────────────────────────────────

function platformById(id: DownloadPlatform["id"]): DownloadPlatform {
  const platform = [...PRIMARY_DOWNLOADS, ...SECONDARY_DOWNLOADS].find((p) => p.id === id)
  if (!platform) throw new Error(`download platform missing: ${id}`)
  return platform
}

const windows = platformById("windows")
const mac = platformById("mac")
const mobile = platformById("mobile")
const linux = platformById("linux")
const classinx = platformById("classinx")

const appStore = mobile.variants.find((v) => v.matchOs === "ios") ?? mobile.variants[0]
const googlePlay = mobile.variants.find((v) => v.matchOs === "android") ?? mobile.variants[1]
const macVariantFor = (chip: MacChip) =>
  mac.variants.find((v) => v.label === (chip === "intel" ? "Intel" : "Apple Silicon")) ?? mac.variants[0]
const classinx64 = classinx.variants.find((v) => v.label.includes("64")) ?? classinx.variants[0]
const classinxRest = classinx.variants.filter((v) => v !== classinx64)

// 기존 계측 ID 형식 유지 (download_{platform}_{variant})
function ctaIdFor(platform: DownloadPlatform, variant: DownloadVariant) {
  const suffix = (variant.matchOs ?? variant.label).toLowerCase().replace(/\s+/g, "_")
  return `download_${platform.id}_${suffix}`
}

const sizeOf = (variant: DownloadVariant) => (variant.bytes ? formatFileSize(variant.bytes) : null)

// "Windows 7 이상 · .exe · 259MB" — 빈 칸은 건너뛴다
const metaLine = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join(" · ")

// ── 버튼 ──────────────────────────────────────────────────

// 파일은 같은 탭에서 바로 내려받는다(CDN 이 바이너리 MIME 으로 응답해 페이지가 바뀌지 않는다 — 빈 새 탭이 뜨지 않게).
// 스토어는 새 탭으로 연다. 화살표 모양이 둘을 가른다: ↓ 파일, ↗ 스토어
function VariantLink({
  platform,
  variant,
  placement,
  primary = false,
  size = "md",
  className,
  onStart,
  children,
}: {
  platform: DownloadPlatform
  variant: DownloadVariant
  placement: Placement
  primary?: boolean
  size?: "md" | "cta"
  className?: string
  onStart: (href: string) => void
  children: React.ReactNode
}) {
  const store = isStoreVariant(variant)
  return (
    <TrackedLink
      href={variant.href}
      ctaId={ctaIdFor(platform, variant)}
      tracking={{ source: placement, platform: platform.id, variant: variant.label, version: CLASSIN_VERSION }}
      prefetch={false}
      {...(store ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      onClick={store ? undefined : () => onStart(variant.href)}
      className={cn(buttonVariants({ variant: primary ? "default" : "line", size }), className)}
    >
      {children}
    </TrackedLink>
  )
}

// 줄 버튼 안의 이름 + 크기. 크기는 흐린 글자. 공백 글자는 flex 배치에서 사라지고 화면 낭독기 이름("Intel 357MB")에만 남는다
function FileLabel({ label, variant }: { label: string; variant: DownloadVariant }) {
  const size = sizeOf(variant)
  return (
    <>
      <Download aria-hidden />
      {label}
      {size ? (
        <>
          {" "}
          <span className="font-normal tabular-nums text-fg-muted">{size}</span>
        </>
      ) : null}
    </>
  )
}

function StoreLabel({ label }: { label: string }) {
  return (
    <>
      {label}
      <ArrowUpRight aria-hidden />
    </>
  )
}

// 내려받기를 누른 뒤의 안내. 영역(role=status)은 늘 있고 글자만 바뀐다 — 화면 낭독기가 변화를 읽는다
function StartedNote({
  show,
  retry,
  className,
}: {
  show: boolean
  retry?: { platform: DownloadPlatform; variant: DownloadVariant }
  className?: string
}) {
  return (
    <p role="status" className={cn("text-caption text-fg-body break-keep", show ? className : "sr-only")}>
      {show ? (
        <>
          <span aria-hidden className="status-dot mr-2" />
          다운로드를 시작했습니다. 브라우저의 다운로드 목록에서 파일을 열어 설치하세요.
          {retry ? (
            <>
              {" "}
              <TrackedLink
                href={retry.variant.href}
                ctaId="download_retry"
                tracking={{ platform: retry.platform.id, variant: retry.variant.label, version: CLASSIN_VERSION }}
                prefetch={false}
                className="link-body whitespace-nowrap"
              >
                시작되지 않았다면 다시 받기
              </TrackedLink>
            </>
          ) : null}
        </>
      ) : null}
    </p>
  )
}

// ── 히어로 사양 — 감지된 기기에 따라 버튼·안내·설치 순서가 정해진다 ──

interface HeroAction {
  platform: DownloadPlatform
  variant: DownloadVariant
  label: React.ReactNode
}

interface HeroSpec {
  device: string
  primary: HeroAction
  secondary?: HeroAction
  meta: string
  helper?: string
  steps: Array<{ title: string; body: string }>
  guides: GuideLink[]
}

const LOGIN_STEP = {
  title: "로그인",
  body: "계정으로 로그인하면 바로 수업에 들어갈 수 있습니다. 처음이라면 회원 가입부터 합니다.",
}
const PC_GUIDE = { href: "/docs/start/pc-install", label: "PC 설치 가이드", ctaId: "download_guide_pc_install" }
const MOBILE_GUIDE = {
  href: "/docs/start/mobile-install",
  label: "모바일 설치 가이드",
  ctaId: "download_guide_mobile_install",
}
const SIGNUP_GUIDE = { href: "/docs/start/signup", label: "회원 가입 가이드", ctaId: "download_guide_signup" }
const PC_TROUBLESHOOTING = {
  href: "/docs/start/pc-install-troubleshooting",
  label: "설치가 안 될 때",
  ctaId: "download_guide_install_troubleshooting",
}

type GuideLink = typeof PC_GUIDE
const MAC_CHIP_HELP =
  "칩 확인: Apple 메뉴 > 이 Mac에 관하여에서 ‘칩’에 Apple M으로 시작하는 이름이 보이면 Apple Silicon, ‘프로세서’에 Intel이 보이면 Intel입니다."

const CHIP_NAME: Record<MacChip, string> = { "apple-silicon": "Apple Silicon", intel: "Intel" }

function pcSteps(ext: string | null) {
  return [
    { title: "설치 파일 받기", body: `위 버튼으로 ${ext ?? "설치"} 파일을 내려받습니다.` },
    { title: "실행해 설치", body: "내려받은 파일을 열고 화면 안내에 따라 설치합니다." },
    LOGIN_STEP,
  ]
}

function storeSteps(store: string) {
  return [
    { title: "앱 설치", body: `${store}에서 Classin을 설치합니다. 위 버튼을 누르면 바로 열립니다.` },
    { title: "앱 열기", body: "설치가 끝나면 홈 화면의 Classin 앱을 엽니다." },
    LOGIN_STEP,
  ]
}

function heroSpecFor(detected: DetectedOs | null, macChip: MacChip | null): HeroSpec {
  if (detected === "mac") {
    const chip = macChip ?? "apple-silicon"
    const other: MacChip = chip === "intel" ? "apple-silicon" : "intel"
    const primary = macVariantFor(chip)
    const secondary = macVariantFor(other)
    return {
      device: macChip ? `Mac (${CHIP_NAME[macChip]})` : "Mac",
      primary: {
        platform: mac,
        variant: primary,
        label: (
          <>
            <Download aria-hidden />
            {CHIP_NAME[chip]} Mac용 다운로드
          </>
        ),
      },
      secondary: {
        platform: mac,
        variant: secondary,
        label: (
          <>
            <Download aria-hidden />
            {CHIP_NAME[other]} Mac용
          </>
        ),
      },
      meta: metaLine("macOS", fileExtension(primary), sizeOf(primary), `버전 ${CLASSIN_VERSION}`),
      helper: macChip ? undefined : MAC_CHIP_HELP,
      steps: pcSteps(fileExtension(primary)),
      guides: [PC_GUIDE, SIGNUP_GUIDE, PC_TROUBLESHOOTING],
    }
  }

  if (detected === "ios" || detected === "android") {
    const ios = detected === "ios"
    const variant = ios ? appStore : googlePlay
    return {
      device: ios ? "iPhone · iPad" : "Android",
      primary: {
        platform: mobile,
        variant,
        label: (
          <>
            {ios ? <AppStoreGlyph /> : <GooglePlayGlyph />}
            {variant.label}에서 받기
            <ArrowUpRight aria-hidden />
          </>
        ),
      },
      meta: metaLine(ios ? "iOS · iPadOS" : "Android", `${variant.label}로 이동합니다`),
      steps: storeSteps(variant.label),
      guides: [MOBILE_GUIDE, SIGNUP_GUIDE],
    }
  }

  const variant = windows.variants[0]
  return {
    device: "Windows",
    primary: {
      platform: windows,
      variant,
      label: (
        <>
          <Download aria-hidden />
          Windows용 다운로드
        </>
      ),
    },
    meta: metaLine(windows.note, fileExtension(variant), sizeOf(variant), `버전 ${CLASSIN_VERSION}`),
    steps: pcSteps(fileExtension(variant)),
    guides: [PC_GUIDE, SIGNUP_GUIDE, PC_TROUBLESHOOTING],
  }
}

// ── 기기별 목록 ───────────────────────────────────────────

interface DeviceRow {
  key: string
  name: string
  detail: string
  glyph: React.ReactNode
  platform: DownloadPlatform
  variants: DownloadVariant[]
  current: boolean
}

function deviceRows(detected: DetectedOs | null, macChip: MacChip | null): DeviceRow[] {
  const macFirst = macChip ?? "apple-silicon"
  const macOrder = [macVariantFor(macFirst), macVariantFor(macFirst === "intel" ? "apple-silicon" : "intel")]
  return [
    {
      key: "windows",
      name: "Windows",
      detail: metaLine(windows.note, fileExtension(windows.variants[0])),
      glyph: <WindowsGlyph className="size-6" />,
      platform: windows,
      variants: windows.variants,
      current: detected === "windows",
    },
    {
      key: "mac",
      name: "Mac",
      detail: metaLine("macOS", "Apple Silicon·Intel", fileExtension(macOrder[0])),
      glyph: <AppleGlyph className="size-6" />,
      platform: mac,
      variants: macOrder,
      current: detected === "mac",
    },
    {
      key: "ios",
      name: "iPhone · iPad",
      detail: "iOS · iPadOS · App Store",
      glyph: <AppStoreGlyph className="size-6" />,
      platform: mobile,
      variants: [appStore],
      current: detected === "ios",
    },
    {
      key: "android",
      name: "Android",
      detail: "Android · Google Play",
      glyph: <GooglePlayGlyph className="size-6" />,
      platform: mobile,
      variants: [googlePlay],
      current: detected === "android",
    },
    {
      key: "linux",
      name: "Linux",
      detail: metaLine("x86_64·arm64", `${fileExtension(linux.variants[0])} 패키지`),
      glyph: <LinuxGlyph className="size-6" />,
      platform: linux,
      variants: linux.variants,
      current: false,
    },
  ]
}

// 목록 버튼 이름 — Windows 는 하나뿐이라 '다운로드', 나머지는 칩·스토어 이름
const rowButtonLabel = (row: DeviceRow, variant: DownloadVariant) =>
  row.variants.length === 1 && !isStoreVariant(variant) ? "다운로드" : variant.label

// ── 페이지 ────────────────────────────────────────────────

export function DownloadPageClient() {
  const detected = useDetectedOs()
  const macChip = useMacChip(detected === "mac")
  const [startedHref, setStartedHref] = React.useState<string | null>(null)

  const hero = heroSpecFor(detected, macChip)
  const rows = deviceRows(detected, macChip)
  const heroActions = [hero.primary, hero.secondary].filter((a): a is HeroAction => Boolean(a))
  const heroStarted = heroActions.find((a) => a.variant.href === startedHref)
  const classinxVariants = [classinx64, ...classinxRest]
  const classinxStarted = classinxVariants.find((v) => v.href === startedHref)

  return (
    <>
      {/* 히어로 — 지금 쓰는 기기에 맞는 버튼 하나(그린 채움은 이것뿐) + 같은 기기의 다른 칩 */}
      <section className="bg-surface-paper pt-(--header-h)">
        <div className={cn(CONTAINER, "pb-16 pt-12 md:pb-24 md:pt-20")}>
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-14">
            <div>
              <h1 className="text-h1 text-fg-ink break-keep">Classin 앱 다운로드</h1>
              <p className="mt-6 max-w-deck text-body-l text-fg-body break-keep">
                지금 쓰는 기기에 맞는 설치 파일을 먼저 보여 드립니다. 계정 하나로 모든 기기에서
                로그인됩니다.
              </p>

              {/* 감지 전(서버·첫 페인트)에도 줄 높이를 지켜 버튼이 밀리지 않게 한다 */}
              <p className={cn("mt-10 text-caption text-fg-muted", !detected && "invisible")}>
                <span aria-hidden className="status-dot mr-2" />
                지금 쓰는 기기 · {hero.device}
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <VariantLink
                  platform={hero.primary.platform}
                  variant={hero.primary.variant}
                  placement="download_hero"
                  primary
                  size="cta"
                  className="w-full sm:w-auto"
                  onStart={setStartedHref}
                >
                  {hero.primary.label}
                </VariantLink>
                {hero.secondary ? (
                  <VariantLink
                    platform={hero.secondary.platform}
                    variant={hero.secondary.variant}
                    placement="download_hero"
                    size="cta"
                    className="w-full sm:w-auto"
                    onStart={setStartedHref}
                  >
                    {hero.secondary.label}
                  </VariantLink>
                ) : null}
              </div>
              <p className="mt-4 text-caption text-fg-muted">{hero.meta}</p>
              {hero.helper ? (
                <p className="mt-2 max-w-deck text-caption text-fg-muted break-keep">{hero.helper}</p>
              ) : null}
              <StartedNote
                show={Boolean(heroStarted)}
                retry={heroStarted}
                className="mt-4 max-w-deck"
              />
              <TrackedLink
                href="#all-devices"
                ctaId="download_other_devices"
                className={cn(TEXT_LINK, "mt-6")}
              >
                다른 기기용 설치 파일
                <ArrowDown aria-hidden className="size-4" />
              </TrackedLink>
            </div>

            {/* 공식 멀티디바이스 합성(투명 PNG 기반) — 틀·그림자 없이 둔다. LCP 는 H1 */}
            <Image
              src="/images/download/hero-devices.webp"
              alt="데스크톱, 태블릿, 스마트폰에서 실행되는 Classin 수업 화면"
              width={1136}
              height={737}
              loading="eager"
              sizes="(min-width: 1040px) 440px, (min-width: 1024px) 43vw, 92vw"
              className="h-auto w-full"
            />
          </div>

          {/* 설치 순서 — 감지된 기기 기준. 순서 번호는 폴리오, 아이콘 없음 */}
          <div className="mt-16 border-t border-line-hair pt-8 md:mt-20">
            <h2 className="text-label text-fg-ink">설치는 세 단계</h2>
            <ol className="mt-6 grid gap-8 md:grid-cols-3">
              {hero.steps.map((step, i) => (
                <li key={step.title}>
                  <p className="text-folio tabular-nums text-fg-muted">{String(i + 1).padStart(2, "0")}</p>
                  <p className="mt-2 text-body font-semibold text-fg-ink">{step.title}</p>
                  <p className="mt-1 text-caption text-fg-muted break-keep">{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap gap-x-8 gap-y-1">
              {hero.guides.map((guide) => (
                <TrackedLink key={guide.href} href={guide.href} ctaId={guide.ctaId} className={TEXT_LINK}>
                  {guide.label}
                  <ArrowRight aria-hidden className="size-4 arrow-nudge" />
                </TrackedLink>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 기기별 설치 파일 — 먹선으로 닫은 목록. 버튼은 모두 line(↓ 파일 · ↗ 스토어) */}
      <section id="all-devices" className="bg-surface-paper pb-16 md:pb-24">
        <div className={CONTAINER}>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <h2 className="text-h2 text-fg-ink break-keep">기기별 설치 파일</h2>
            <p className="text-caption text-fg-muted break-keep">
              버전 {CLASSIN_VERSION} · 설치 파일은 EEO 공식 배포 서버에서 내려받습니다
            </p>
          </div>
          <ul className="mt-10 border-t border-line-ink">
            {rows.map((row) => {
              const rowStarted = row.variants.find((v) => v.href === startedHref)
              return (
                <li
                  key={row.key}
                  className="grid gap-5 border-b border-line-hair py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-8"
                >
                  <div className="flex items-start gap-4">
                    <span className="mt-0.5 text-fg-ink">{row.glyph}</span>
                    <div className="min-w-0">
                      <h3 className="flex flex-wrap items-center gap-x-3 text-body-l font-semibold text-fg-ink">
                        {row.name}
                        {row.current ? (
                          <span className="text-caption font-medium text-fg-muted">
                            <span aria-hidden className="status-dot mr-1.5" />
                            지금 쓰는 기기
                          </span>
                        ) : null}
                      </h3>
                      <p className="mt-1 text-caption text-fg-muted">{row.detail}</p>
                      <StartedNote show={Boolean(rowStarted)} className="mt-2" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 md:justify-end">
                    {row.variants.map((variant) => (
                      <VariantLink
                        key={variant.href}
                        platform={row.platform}
                        variant={variant}
                        placement="download_list"
                        className="flex-1 sm:flex-none"
                        onStart={setStartedHref}
                      >
                        {isStoreVariant(variant) ? (
                          <StoreLabel label={variant.label} />
                        ) : (
                          <FileLabel label={rowButtonLabel(row, variant)} variant={variant} />
                        )}
                      </VariantLink>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {/* 교실용 도구 — ClassIn X. 3역할(도해·부록·FinalCTA) 밖이라 paper(surfaces §P5) */}
      <section className="bg-surface-paper pb-20 md:pb-32">
        <div className={CONTAINER}>
          <div className="flex flex-col gap-10 border-t border-line-ink pt-10 md:pt-14 lg:flex-row lg:items-center lg:gap-14">
            <div className="lg:w-[46%]">
              <p className="text-label text-fg-ink">교실용 도구</p>
              <h2 className="mt-3 text-h2 text-fg-ink">ClassIn X</h2>
              <p className="mt-4 text-body text-fg-body break-keep">
                오프라인 교실 수업을 클라우드로 확장합니다. 교실 전자칠판(IFP)에 설치하는 Windows
                전용 앱입니다.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                {classinxVariants.map((variant) => (
                  <VariantLink
                    key={variant.href}
                    platform={classinx}
                    variant={variant}
                    placement="download_classinx"
                    className="flex-1 sm:flex-none"
                    onStart={setStartedHref}
                  >
                    <FileLabel label={variant.label} variant={variant} />
                  </VariantLink>
                ))}
              </div>
              <p className="mt-4 text-caption text-fg-muted break-keep">
                {metaLine("Windows 전용", fileExtension(classinx64), `버전 ${CLASSIN_VERSION}`)} · 보통은
                64bit를 받습니다. 32bit Windows가 설치된 기기에서만 32bit를 쓰세요.
              </p>
              <StartedNote
                show={Boolean(classinxStarted)}
                retry={classinxStarted ? { platform: classinx, variant: classinxStarted } : undefined}
                className="mt-4"
              />
            </div>
            <div className="lg:w-[54%]">
              <Image
                src="/images/download/classinx-board.webp"
                alt="교실 전자칠판에서 ClassIn X로 수업을 진행하는 모습"
                width={1092}
                height={809}
                loading="lazy"
                sizes="(min-width: 1040px) 520px, (min-width: 1024px) 50vw, 92vw"
                className="mx-auto h-auto w-full max-w-[540px]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 마지막 띠(V5-A) — sunken + 이중 괘선 + primary 52 + 텍스트 링크, 왼쪽 정렬 */}
      <section className="rule-double bg-surface-sunken py-20 md:py-32">
        <div className={CONTAINER}>
          <h2 className="text-h2 text-fg-ink break-keep text-balance">
            설치 전에 수업 화면부터 보고 싶다면
          </h2>
          <p className="mt-4 max-w-deck text-body-l text-fg-body break-keep">
            수업 화면 구성과 운영 흐름은 상담에서 데모로 먼저 확인할 수 있습니다.
          </p>
          <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
            <TrackedLink
              href="/contact"
              ctaId="download_help_contact"
              className={cn(buttonVariants({ size: "cta" }), "w-full sm:w-auto")}
            >
              도입 상담 받기
              <ArrowRight aria-hidden className="arrow-nudge" />
            </TrackedLink>
            <TrackedLink href="/faq" ctaId="download_help_faq" className={TEXT_LINK}>
              자주 묻는 질문
              <ArrowRight aria-hidden className="size-4 arrow-nudge" />
            </TrackedLink>
          </div>
        </div>
      </section>
    </>
  )
}
