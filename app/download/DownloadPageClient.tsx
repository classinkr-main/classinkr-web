"use client"

import * as React from "react"
import Image from "next/image"
import { Download, Smartphone } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import {
  CLASSIN_VERSION,
  PRIMARY_DOWNLOADS,
  SECONDARY_DOWNLOADS,
  detectPrimaryOs,
  highlightPlatformId,
  type DetectedOs,
  type DownloadPlatform,
  type DownloadVariant,
  type PlatformId,
} from "@/lib/downloads"

// Windows 브랜드 글리프 — lucide에 브랜드 아이콘이 없어 인라인 유지
function WindowsGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M3.1 5.6 10.6 4.55v7.1H3.1V5.6Zm0 12.85 7.5 1.05v-7.05H3.1v6Zm8.35-14.1L20.9 3v8.65h-9.45V4.35Zm0 15.35 9.45 1.3v-8.6h-9.45v7.3Z" />
    </svg>
  )
}

// Apple·App Store·Google Play·Linux 글리프 — simple-icons 공식 패스(모노크롬)
function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  )
}

function AppStoreGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8.8086 14.9194l6.1107-11.0368c.0837-.1513.1682-.302.2437-.4584.0685-.142.1267-.2854.1646-.4403.0803-.3259.0588-.6656-.066-.9767-.1238-.3095-.3417-.5678-.6201-.7355a1.4175 1.4175 0 0 0-.921-.1924c-.3207.043-.6135.1935-.8443.4288-.1094.1118-.1996.2361-.2832.369-.092.1463-.175.2979-.259.4492l-.3864.6979-.3865-.6979c-.0837-.1515-.1667-.303-.2587-.4492-.0837-.1329-.1739-.2572-.2835-.369-.2305-.2353-.5233-.3857-.844-.429a1.4181 1.4181 0 0 0-.921.1926c-.2784.1677-.4964.426-.6203.7355-.1246.311-.1461.6508-.066.9767.038.155.0962.2984.1648.4403.0753.1564.1598.307.2437.4584l1.248 2.2543-4.8625 8.7825H2.0295c-.1676 0-.3351-.0007-.5026.0092-.1522.009-.3004.0284-.448.0714-.3108.0906-.5822.2798-.7783.548-.195.2665-.3006.5929-.3006.9279 0 .3352.1057.6612.3006.9277.196.2683.4675.4575.7782.548.1477.043.296.0623.4481.0715.1675.01.335.009.5026.009h13.0974c.0171-.0357.059-.1294.1-.2697.415-1.4151-.6156-2.843-2.0347-2.843zM3.113 18.5418l-.7922 1.5008c-.0818.1553-.1644.31-.2384.4705-.067.1458-.124.293-.1611.452-.0785.3346-.0576.6834.0645 1.0029.1212.3175.3346.583.607.7549.2727.172.5891.2416.9013.1975.3139-.044.6005-.1986.8263-.4402.1072-.1148.1954-.2424.2772-.3787.0902-.1503.1714-.3059.2535-.4612L6 19.4636c-.0896-.149-.9473-1.4704-2.887-.9218m20.5861-3.0056a1.4707 1.4707 0 0 0-.779-.5407c-.1476-.0425-.2961-.0616-.4483-.0705-.1678-.0099-.3352-.0091-.503-.0091H18.648l-4.3891-7.817c-.6655.7005-.9632 1.485-1.0773 2.1976-.1655 1.0333.0367 2.0934.546 3.0004l5.2741 9.3933c.084.1494.167.299.2591.4435.0837.131.1739.2537.2836.364.231.2323.5238.3809.8449.4232.3192.0424.643-.0244.9217-.1899.2784-.1653.4968-.4204.621-.7257.1246-.3072.146-.6425.0658-.9641-.0381-.1529-.0962-.2945-.165-.4346-.0753-.1543-.1598-.303-.2438-.4524l-1.216-2.1662h1.596c.1677 0 .3351.0009.5029-.009.1522-.009.3007-.028.4483-.0705a1.4707 1.4707 0 0 0 .779-.5407A1.5386 1.5386 0 0 0 24 16.452a1.539 1.539 0 0 0-.3009-.9158Z" />
    </svg>
  )
}

function GooglePlayGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z" />
    </svg>
  )
}

function LinuxGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7zm2.185 8.958c.037.6.343 1.245.882 1.377.588.134 1.434-.333 1.791-.765l.211-.01c.315-.007.577.01.847.268l.003.003c.208.199.305.53.391.876.085.4.154.78.409 1.066.486.527.645.906.636 1.14l.003-.007v.018l-.003-.012c-.015.262-.185.396-.498.595-.63.401-1.746.712-2.457 1.57-.618.737-1.37 1.14-2.036 1.191-.664.053-1.237-.2-1.574-.898l-.005-.003c-.21-.4-.12-1.025.056-1.69.176-.668.428-1.344.463-1.897.037-.714.076-1.335.195-1.814.12-.465.308-.797.641-.984l.045-.022zm-10.814.049h.01c.053 0 .105.005.157.014.376.055.706.333 1.023.752l.91 1.664.003.003c.243.533.754 1.064 1.189 1.637.434.598.77 1.131.729 1.57v.006c-.057.744-.48 1.148-1.125 1.294-.645.135-1.52.002-2.395-.464-.968-.536-2.118-.469-2.857-.602-.369-.066-.61-.2-.723-.4-.11-.2-.113-.602.123-1.23v-.004l.002-.003c.117-.334.03-.752-.027-1.118-.055-.401-.083-.71.043-.94.16-.334.396-.4.69-.533.294-.135.64-.202.915-.47h.002v-.002c.256-.268.445-.601.668-.838.19-.201.38-.336.663-.336zm7.159-9.074c-.435.201-.945.535-1.488.535-.542 0-.97-.267-1.28-.466-.154-.134-.28-.268-.373-.335-.164-.134-.144-.333-.074-.333.109.016.129.134.199.2.096.066.215.2.36.333.292.2.68.467 1.167.467.485 0 1.053-.267 1.398-.466.195-.135.445-.334.648-.467.156-.136.149-.267.279-.267.128.016.034.134-.147.332a8.097 8.097 0 01-.69.468zm-1.082-1.583V5.64c-.006-.02.013-.042.029-.05.074-.043.18-.027.26.004.063 0 .16.067.15.135-.006.049-.085.066-.135.066-.055 0-.092-.043-.141-.068-.052-.018-.146-.008-.163-.065zm-.551 0c-.02.058-.113.049-.166.066-.047.025-.086.068-.14.068-.05 0-.13-.02-.136-.068-.01-.066.088-.133.15-.133.08-.031.184-.047.259-.005.019.009.036.03.03.05v.02h.003z" />
    </svg>
  )
}

// ClassIn X 전용 전자칠판(IFP) 글리프 — 보드·스탠드·판서(그린 액센트)·학생 타일
function BoardGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="2.75" y="3.6" width="18.5" height="12.2" rx="2" />
      <path d="M9.3 15.8v3.7M14.7 15.8v3.7" />
      <path d="M7 19.5h10" />
      <path d="M6.3 8.1c1.5-1.3 2.9.9 4.4-.3" stroke="#084734" />
      <path d="M6.3 11.6h4.2" />
      <rect x="14.9" y="6.5" width="3.5" height="2.7" rx="0.8" strokeWidth="1.4" />
      <rect x="14.9" y="10.5" width="3.5" height="2.7" rx="0.8" strokeWidth="1.4" />
    </svg>
  )
}

// 기존 계측 ID 형식 유지 (download_{platform}_{variant})
function ctaIdFor(platform: DownloadPlatform, variant: DownloadVariant) {
  const suffix = (variant.matchOs ?? variant.label).toLowerCase().replace(/\s+/g, "_")
  return `download_${platform.id}_${suffix}`
}

function DownloadButton({
  platform,
  variant,
  appearance = "outline",
  size = "md",
  label,
}: {
  platform: DownloadPlatform
  variant: DownloadVariant
  appearance?: "solid" | "outline"
  size?: "md" | "lg" | "xl"
  label?: React.ReactNode
}) {
  const sizeClass =
    size === "xl"
      ? "rounded-[8px] px-6 py-3 text-[15px]"
      : size === "lg"
        ? "rounded-[8px] px-5 py-2.5 text-[14px]"
        : "rounded-[6px] px-3.5 py-2 text-[13px]"
  const lookClass =
    appearance === "solid"
      ? "bg-[#084734] text-white shadow-sm hover:bg-[#065c41]"
      : "border border-[#084734]/25 bg-white text-[#084734] hover:bg-[#ECFDF5]"
  return (
    <TrackedLink
      href={variant.href}
      ctaId={ctaIdFor(platform, variant)}
      tracking={{ platform: platform.id, variant: variant.label, version: CLASSIN_VERSION }}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 ${sizeClass} ${lookClass}`}
    >
      {label ?? variant.label}
    </TrackedLink>
  )
}

// 히어로 표시 사양 — 감지된 OS에 따라 아이콘·카피·CTA가 결정된다 (이미지는 공식 멀티디바이스 합성 공용)
interface HeroSpec {
  icon: React.ReactNode
  platformLine: string
  requirement: string
  helper: string
  actions: React.ReactNode
}

function useHeroSpec(detected: DetectedOs | null): HeroSpec | null {
  const heroId = highlightPlatformId(detected ?? "windows")
  const windows = PRIMARY_DOWNLOADS.find((p) => p.id === "windows")
  const mac = PRIMARY_DOWNLOADS.find((p) => p.id === "mac")
  const mobile = PRIMARY_DOWNLOADS.find((p) => p.id === "mobile")

  if (heroId === "mac" && mac) {
    const primary = mac.variants.find((v) => v.label === "Apple Silicon") ?? mac.variants[0]
    const rest = mac.variants.filter((v) => v !== primary)
    return {
      icon: <AppleGlyph className="h-4 w-4" />,
      platformLine: "Mac에서 수업을 시작하세요",
      requirement: "macOS · Apple Silicon과 Intel 지원",
      helper: "2020년 이후 출시된 Mac은 대부분 Apple Silicon입니다.",
      actions: (
        <>
          <DownloadButton
            platform={mac}
            variant={primary}
            appearance="solid"
            size="xl"
            label={
              <>
                <Download className="h-4 w-4" aria-hidden="true" />
                Apple Silicon용 다운로드
              </>
            }
          />
          {rest.map((variant) => (
            <DownloadButton
              key={variant.href}
              platform={mac}
              variant={variant}
              size="xl"
              label={`${variant.label} Mac`}
            />
          ))}
        </>
      ),
    }
  }

  if (heroId === "mobile" && mobile) {
    return {
      icon: <Smartphone className="h-4 w-4" aria-hidden="true" />,
      platformLine: "모바일에서 수업을 시작하세요",
      requirement: "iOS · Android",
      helper: "학생과 학부모도 같은 앱으로 참여합니다.",
      actions: mobile.variants.map((variant) => (
        <DownloadButton
          key={variant.href}
          platform={mobile}
          variant={variant}
          size="xl"
          appearance={detected && variant.matchOs === detected ? "solid" : "outline"}
          label={
            detected && variant.matchOs === detected ? (
              <>
                <Download className="h-4 w-4" aria-hidden="true" />
                {variant.label}
              </>
            ) : (
              variant.label
            )
          }
        />
      )),
    }
  }

  if (!windows) return null
  return {
    icon: <WindowsGlyph className="h-4 w-4" />,
    platformLine: "Windows에서 수업을 시작하세요",
    requirement: "Windows 7 이상 · .exe 설치 파일",
    helper: "교실 PC와 데스크톱 수업 환경에 권장합니다.",
    actions: windows.variants.map((variant) => (
      <DownloadButton
        key={variant.href}
        platform={windows}
        variant={variant}
        appearance="solid"
        size="xl"
        label={
          <>
            <Download className="h-4 w-4" aria-hidden="true" />
            Windows용 다운로드
          </>
        }
      />
    )),
  }
}

// "다른 기기에서도" 타일 — 공식 다운로드 페이지의 Also available on 패턴
function PlatformTile({
  icon,
  caption,
  label,
  children,
}: {
  icon: React.ReactNode
  caption: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div
      className="flex flex-col rounded-[12px] border border-black/[0.08] bg-white p-5 transition-shadow duration-300 hover:shadow-[rgba(0,0,0,0.05)_0px_8px_24px,rgba(0,0,0,0.03)_0px_2px_7px]"
      style={{
        boxShadow:
          "rgba(0,0,0,0.03) 0px 3px 14px, rgba(0,0,0,0.02) 0px 1.5px 6px, rgba(0,0,0,0.015) 0px 0.6px 2.2px",
      }}
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-black/[0.06] bg-[#F6F5F4] text-[#111110]">
        {icon}
      </span>
      <p className="mt-3.5 text-[11.5px] font-medium text-[#A39E98]">{caption}</p>
      <p className="mt-0.5 text-[15px] font-bold text-[#111110]">{label}</p>
      <div className="mt-4 flex flex-wrap gap-2 pt-0.5">{children}</div>
    </div>
  )
}

export function DownloadPageClient() {
  const [detected, setDetected] = React.useState<DetectedOs | null>(null)

  React.useEffect(() => {
    setDetected(detectPrimaryOs(navigator.userAgent))
  }, [])

  const heroId: Extract<PlatformId, "windows" | "mac" | "mobile"> = highlightPlatformId(
    detected ?? "windows",
  )
  const hero = useHeroSpec(detected)

  const windows = PRIMARY_DOWNLOADS.find((p) => p.id === "windows")
  const mac = PRIMARY_DOWNLOADS.find((p) => p.id === "mac")
  const mobile = PRIMARY_DOWNLOADS.find((p) => p.id === "mobile")
  const linux = SECONDARY_DOWNLOADS.find((p) => p.id === "linux")
  const classinx = SECONDARY_DOWNLOADS.find((p) => p.id === "classinx")

  const appStore = mobile?.variants.find((v) => v.matchOs === "ios")
  const googlePlay = mobile?.variants.find((v) => v.matchOs === "android")

  const classinx64 =
    classinx?.variants.find((v) => v.label.includes("64")) ?? classinx?.variants[0]
  const classinxRest = classinx?.variants.filter((v) => v !== classinx64) ?? []

  if (!hero) return null

  return (
    <div className="relative isolate overflow-hidden">
      {/* 배경 — 상단 민트 글로우 + 웜 블롭 (넓은 면은 뉴트럴, 그린은 은은한 액센트) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px]">
        <div className="absolute left-[8%] top-[-260px] h-[520px] w-[780px] rounded-full bg-[#ECFDF5] opacity-60 blur-3xl" />
        <div className="absolute right-[4%] top-[160px] h-[280px] w-[280px] rounded-full bg-[#F6F5F4] opacity-90 blur-3xl" />
      </div>

      {/* 히어로 — 감지된 기기 전용 (공식 다운로드 페이지 패턴) */}
      <section className="pt-28 pb-4 md:pt-36 md:pb-6">
        <div className="container mx-auto max-w-[1080px] px-5">
          <div className="grid items-center gap-10 md:grid-cols-[1fr_minmax(0,500px)] md:gap-14">
            <div>
              <p className="hero-soft-enter hero-soft-enter-badge text-[12px] font-semibold uppercase tracking-[0.18em] text-[#084734]">
                Download
              </p>
              <h1 className="hero-soft-enter hero-soft-enter-title mt-3 text-[2.25rem] font-bold leading-[1.12] text-[#111110] md:text-[2.75rem]">
                Classin 앱 다운로드
              </h1>
              <p className="hero-soft-enter hero-soft-enter-copy mt-5 flex items-center gap-2.5 text-[17px] font-semibold text-[#111110] md:text-[18px]">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-black/[0.06] bg-[#F6F5F4] text-[#111110]">
                  {hero.icon}
                </span>
                {hero.platformLine}
              </p>
              <p className="hero-soft-enter hero-soft-enter-copy mt-1.5 text-[13.5px] text-[#615D59]">
                {hero.requirement}
                {detected ? (
                  <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF5] px-2.5 py-0.5 align-middle text-[11px] font-semibold text-[#084734]">
                    <span className="h-1 w-1 rounded-full bg-[#084734]" aria-hidden="true" />
                    지금 사용 중인 기기
                  </span>
                ) : null}
              </p>
              <div className="hero-soft-enter hero-soft-enter-actions mt-7 flex flex-wrap items-center gap-3">
                {hero.actions}
              </div>
              <p className="hero-soft-enter hero-soft-enter-actions mt-3 text-[12.5px] leading-5 text-[#A39E98]">
                {hero.helper}
              </p>
              <p className="hero-soft-enter hero-soft-enter-actions mt-6 inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#615D59]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#084734]" aria-hidden="true" />
                현재 버전 {CLASSIN_VERSION} · 설치 후 로그인하면 준비 끝
              </p>
            </div>
            <div className="hero-soft-enter hero-soft-enter-copy">
              {/* 공식 멀티디바이스 합성(투명 PNG 기반) — 스테이지 박스 없이 띄우는 공식 스타일 */}
              <Image
                src="/images/download/hero-devices.webp"
                alt="데스크톱, 태블릿, 스마트폰에서 실행되는 Classin 수업 화면"
                width={1136}
                height={737}
                priority
                sizes="(min-width: 1080px) 500px, (min-width: 768px) 46vw, 92vw"
                className="h-auto w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 다른 기기에서도 — 타일 그리드 */}
      <section className="pt-14 md:pt-20">
        <div className="container mx-auto max-w-[1080px] px-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#615D59]">
            다른 기기에서도
          </p>
          <div
            className={`mt-5 grid grid-cols-2 gap-3 md:gap-4 ${
              heroId === "mobile" ? "md:grid-cols-3" : "md:grid-cols-4"
            }`}
          >
            {heroId !== "windows" && windows ? (
              <PlatformTile
                icon={<WindowsGlyph className="h-5 w-5" />}
                caption="Windows 7 이상"
                label="Windows"
              >
                {windows.variants.map((variant) => (
                  <DownloadButton key={variant.href} platform={windows} variant={variant} />
                ))}
              </PlatformTile>
            ) : null}
            {heroId !== "mac" && mac ? (
              <PlatformTile
                icon={<AppleGlyph className="h-5 w-5" />}
                caption="Apple Silicon · Intel"
                label="macOS"
              >
                {mac.variants.map((variant) => (
                  <DownloadButton key={variant.href} platform={mac} variant={variant} />
                ))}
              </PlatformTile>
            ) : null}
            {heroId !== "mobile" && mobile && appStore ? (
              <PlatformTile
                icon={<AppStoreGlyph className="h-5 w-5" />}
                caption="iPhone · iPad"
                label="App Store"
              >
                <DownloadButton platform={mobile} variant={appStore} label="다운로드" />
              </PlatformTile>
            ) : null}
            {heroId !== "mobile" && mobile && googlePlay ? (
              <PlatformTile
                icon={<GooglePlayGlyph className="h-[18px] w-[18px]" />}
                caption="Android"
                label="Google Play"
              >
                <DownloadButton platform={mobile} variant={googlePlay} label="다운로드" />
              </PlatformTile>
            ) : null}
            {linux ? (
              <PlatformTile
                icon={<LinuxGlyph className="h-5 w-5" />}
                caption=".deb 패키지"
                label="Linux"
              >
                {linux.variants.map((variant) => (
                  <DownloadButton key={variant.href} platform={linux} variant={variant} />
                ))}
              </PlatformTile>
            ) : null}
          </div>
        </div>
      </section>

      {/* 교실용 도구 — ClassIn X 설명 카드 (웜 배경 밴드) */}
      {classinx && classinx64 ? (
        <section className="section-warm mt-20 py-16 md:mt-28 md:py-20">
          <div className="container mx-auto max-w-[1080px] px-5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#615D59]">
              교실용 도구
            </p>
            <div
              className="mt-5 overflow-hidden rounded-[16px] border border-black/[0.08] bg-white md:flex md:items-stretch"
              style={{
                boxShadow:
                  "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px",
              }}
            >
              <div className="flex flex-col justify-center p-7 md:w-[46%] md:p-10">
                <div className="flex items-center gap-4">
                  <span className="inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[12px] border border-black/[0.06] bg-[#F6F5F4] text-[#111110]">
                    <BoardGlyph className="h-8 w-8" />
                  </span>
                  <div>
                    <p className="text-[24px] font-bold leading-[1.2] tracking-[-0.02em] text-[#111110] md:text-[27px]">
                      ClassIn X
                    </p>
                    <p className="mt-1 text-[13.5px] text-[#615D59]">{classinx.note}</p>
                  </div>
                </div>
                <div className="mt-4 h-[3px] w-9 rounded-full bg-[#084734]" aria-hidden="true" />
                <p className="mt-4 text-[14px] leading-6 text-[#615D59]">
                  오프라인 교실 수업을 클라우드로 확장합니다. 교실 전자칠판(IFP)에 설치하는
                  Windows 전용 앱입니다.
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <DownloadButton
                    platform={classinx}
                    variant={classinx64}
                    appearance="solid"
                    size="lg"
                    label={
                      <>
                        <Download className="h-4 w-4" aria-hidden="true" />
                        다운로드 (64bit)
                      </>
                    }
                  />
                  {classinxRest.map((variant) => (
                    <DownloadButton
                      key={variant.href}
                      platform={classinx}
                      variant={variant}
                      size="lg"
                      label={`${variant.label} 버전`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-center p-5 md:w-[54%] md:p-8">
                <Image
                  src="/images/download/classinx-board.webp"
                  alt="교실 전자칠판에서 ClassIn X로 수업을 진행하는 모습"
                  width={1092}
                  height={809}
                  sizes="(min-width: 1080px) 540px, (min-width: 768px) 52vw, 92vw"
                  className="h-auto w-full max-w-[540px]"
                />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* 도움 스트립 */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto max-w-[720px] px-5 text-center">
          <h2 className="text-[1.5rem] font-bold leading-[1.3] text-[#111110] md:text-[1.75rem]">
            설치 전에 먼저 살펴보고 싶으신가요?
          </h2>
          <p className="mx-auto mt-3 max-w-[560px] text-[15px] leading-7 text-[#615D59]">
            수업 화면 구성과 운영 흐름은 상담에서 데모로 먼저 확인할 수 있습니다.
            <br className="hidden md:block" /> 설치 파일은 EEO 공식 CDN에서 제공되며, 계정 하나로 모든
            기기에서 로그인됩니다.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <TrackedLink
              href="/contact"
              ctaId="download_help_contact"
              className="inline-flex items-center justify-center rounded-[6px] bg-[#084734] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
            >
              도입 상담 받기
            </TrackedLink>
            <TrackedLink
              href="/faq"
              ctaId="download_help_faq"
              className="inline-flex items-center justify-center rounded-[6px] px-4 py-2.5 text-[14px] font-semibold text-[#084734] transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
            >
              자주 묻는 질문 →
            </TrackedLink>
          </div>
        </div>
      </section>
    </div>
  )
}
