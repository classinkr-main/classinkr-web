import Image from "next/image"
import { ArrowRight } from "lucide-react"

import { IntroDownloadLink } from "@/components/introduction/IntroDownloadLink"
import { TrackedLink } from "@/components/TrackedLink"
import { getIntroAsset } from "@/lib/introduction/assets"
import { cn } from "@/lib/utils"

import { PROOF_TEXT_LINK, ProofSection, ProofSectionHead } from "./ProofParts"
import { PROOF_PRODUCT, PROOF_SOURCE } from "./proof-copy"

// 구성도: 64rem 이상 5/12칸(1296 에서 486px) − 매트 여백
const DIAGRAM_SIZES = "(min-width: 1296px) 440px, (min-width: 1024px) 36vw, calc(100vw - 72px)"

/**
 * 03 제품 — 왼쪽(7칸) 클래스인 특장점 6개를 한 줄씩(작은 화면 캡처 + 제목 + 요약), 오른쪽(5칸) 클래스인 X 구성도 ·
 * 스펙 4개 · PDF 둘(공용 IntroDownloadLink). 64rem 미만은 1열. 끝에 서비스 소개(/introduction)로 가는 링크.
 */
export function ProofProduct() {
  const { id, folio, kicker, title, lead, software, hardware, overview } = PROOF_PRODUCT
  const diagram = getIntroAsset(hardware.diagram.asset)
  return (
    <ProofSection id={id}>
      <ProofSectionHead id={id} folio={folio} kicker={kicker} title={title} lead={lead} />

      <div className="mt-12 md:mt-16 lg:grid lg:grid-cols-12 lg:gap-x-6">
        <div className="min-w-0 lg:col-span-7 lg:pr-4 xl:pr-10">
          <h3 className="text-h3 text-fg-ink">
            {software.title} <span className="font-normal text-fg-muted">{software.tag}</span>
          </h3>
          <p className="mt-3 max-w-measure text-body text-fg-body">{software.lead}</p>
          <ol className="mt-8 border-t border-line-ink">
            {software.features.map((feature, index) => {
              const shot = getIntroAsset(feature.image.asset)
              return (
                <li
                  key={feature.id}
                  className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-4 border-b border-line-hair py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-5"
                >
                  {/* 흰 화면 캡처는 sunken 매트 위에(V16) — 작은 썸네일이라 캡처 전체가 보이게 맞춘다 */}
                  <div className="relative aspect-[3/2] border border-line-hair bg-surface-sunken">
                    <Image
                      src={shot.src}
                      alt={feature.image.alt}
                      fill
                      sizes="(min-width: 640px) 120px, 88px"
                      className="object-contain p-1"
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-body font-semibold text-fg-ink">
                      <span aria-hidden="true" className="mr-2 text-folio tabular-nums text-fg-muted">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {feature.title}
                    </h4>
                    <p className="mt-1.5 text-caption text-fg-body">{feature.summary}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="mt-16 min-w-0 lg:col-span-5 lg:mt-0">
          <h3 className="text-h3 text-fg-ink">
            {hardware.title} <span className="font-normal text-fg-muted">{hardware.tag}</span>
          </h3>
          <p className="mt-3 max-w-measure text-body text-fg-body">{hardware.lead}</p>

          <figure className="mt-8">
            <div className="bg-surface-sunken p-5 lg:p-6">
              <Image
                src={diagram.src}
                alt={hardware.diagram.alt}
                width={diagram.width}
                height={diagram.height}
                sizes={DIAGRAM_SIZES}
                className="h-auto w-full border border-line-hair bg-surface-sheet"
              />
            </div>
            {hardware.diagram.caption ? (
              <figcaption className="mt-2.5 text-note text-fg-muted">{hardware.diagram.caption}</figcaption>
            ) : null}
          </figure>

          <dl className="mt-8 grid grid-cols-2 border-t border-line-ink">
            {hardware.specs.map((spec, index) => (
              <div
                key={spec.label}
                className={cn(
                  "flex flex-col-reverse justify-end gap-1 border-b border-line-hair py-4",
                  index % 2 === 0 ? "pr-4" : "border-l border-line-hair pl-4"
                )}
              >
                <dt className="text-note text-fg-muted">{spec.label}</dt>
                <dd className="text-h3 tabular-nums text-fg-ink">{spec.value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 grid gap-3">
            {hardware.downloads.map((download) => (
              <IntroDownloadLink key={download.id} download={download} />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-12 border-t border-line-hair pt-4 md:mt-16">
        <TrackedLink
          href={overview.href}
          ctaId={overview.ctaId}
          tracking={{ source: PROOF_SOURCE }}
          className={PROOF_TEXT_LINK}
        >
          {overview.label}
          <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
        </TrackedLink>
      </div>
    </ProofSection>
  )
}
