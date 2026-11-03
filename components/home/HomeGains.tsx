import Image from "next/image"
import { Check } from "lucide-react"
import { Reveal } from "@/components/landing/Reveal"
import { GatewayLink } from "./GatewayLink"
import { HOME_COPY } from "./home-copy"

const { gains } = HOME_COPY
const CONTAINER = "mx-auto max-w-[1040px] px-4 sm:px-6"

// 행마다 지면·배치만 다르다. 1024px 미만(모바일·태블릿)은 늘 이미지 → 글, lg 부터 1·3행 이미지 왼쪽 · 2행 오른쪽(row-reverse).
// 창 캡처(2·3행)는 lg 부터 컨테이너 밖으로 흘러나간다(stageshow 창 프레이밍) — 섹션의 overflow-x-clip 이 가로 스크롤을 막는다
const LAYOUT = [
  {
    section: "bg-surface-paper pb-20 pt-12 md:pb-32 md:pt-16",
    row: "lg:flex-row",
    figure: "lg:w-[55%]",
    frame: null,
    sizes: "(min-width: 1040px) 550px, (min-width: 1024px) 55vw, 100vw",
  },
  {
    section: "overflow-x-clip bg-surface-sunken py-20 md:py-32",
    row: "lg:flex-row-reverse",
    figure: "lg:w-[60%] lg:-mr-28",
    frame: "plate-window",
    sizes: "(min-width: 1040px) 600px, (min-width: 1024px) 60vw, 100vw",
  },
  {
    section: "overflow-x-clip bg-surface-paper py-20 md:py-32",
    row: "lg:flex-row",
    figure: "lg:w-[55%]",
    frame: "plate-window max-w-[600px] lg:-ml-24",
    sizes: "(min-width: 640px) 600px, 100vw",
  },
] as const

export function HomeGains() {
  return (
    <>
      <section className="bg-surface-paper pt-20 md:pt-32">
        <div className={CONTAINER}>
          <h2 className="text-h2 text-fg-ink break-keep text-balance">{gains.heading}</h2>
        </div>
      </section>

      {gains.rows.map((row, i) => {
        const layout = LAYOUT[i]
        const image = (
          <Image
            src={row.image.src}
            alt={row.image.alt}
            width={row.image.width}
            height={row.image.height}
            sizes={layout.sizes}
            loading="lazy"
            className="h-auto w-full"
          />
        )
        // 페이지의 유일한 강조 = 먹 밑줄 한 단어(강조색은 누를 수 있는 것에만)
        const [before, after] = row.titleEmphasis ? row.title.split(row.titleEmphasis) : [row.title, ""]

        return (
          <section key={row.href} className={layout.section}>
            <Reveal className={`${CONTAINER} flex flex-col gap-10 lg:items-center lg:gap-14 ${layout.row}`}>
              {/* 1행은 투명 컷아웃이라 틀이 없다. 창 캡처만 plate-window(창 모양을 따르는 그림자 하나) */}
              <figure className={`lg:shrink-0 ${layout.figure}`}>
                {layout.frame ? <div className={layout.frame}>{image}</div> : image}
                {row.caption && <figcaption className="mt-3 text-note text-fg-muted">{row.caption}</figcaption>}
              </figure>

              <div className="lg:flex-1">
                <p className="text-caption font-medium text-fg-muted">
                  {row.phase} · {row.product}
                </p>
                <h3 className="mt-3 text-h3 text-fg-ink break-keep text-balance">
                  {before}
                  {row.titleEmphasis && (
                    <span className="underline decoration-fg-ink decoration-2 underline-offset-[0.2em]">{row.titleEmphasis}</span>
                  )}
                  {after}
                </h3>
                <p className="mt-5 text-body-l text-fg-body break-keep">{row.body}</p>
                <ul className="mt-6 space-y-3">
                  {row.checks.map((check) => (
                    <li key={check} className="flex items-start gap-2.5 text-body text-fg-ink break-keep">
                      <Check aria-hidden className="mt-[5px] size-[18px] shrink-0 text-fg-ink" />
                      {check}
                    </li>
                  ))}
                </ul>
                <GatewayLink href={row.href} className="mt-6">
                  {gains.linkLabel}
                </GatewayLink>
              </div>
            </Reveal>
          </section>
        )
      })}
    </>
  )
}
