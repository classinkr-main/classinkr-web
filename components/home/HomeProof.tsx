import Image from "next/image"
import { Reveal } from "@/components/landing/Reveal"
import { GatewayLink } from "./GatewayLink"
import { HOME_COPY } from "./home-copy"

const { proof } = HOME_COPY
const [lead, ...others] = proof.cases
const PHOTO = "aspect-[16/10] w-full object-cover"

// 지배 이미지 하나(청주 2/3 폭) + 오른쪽에 작은 두 장. 사진은 반경 0·테두리·액자 없음(V14-A)
export function HomeProof() {
  return (
    <section className="bg-surface-sunken py-20 md:py-32">
      <Reveal className="mx-auto max-w-[1040px] px-4 sm:px-6">
        <h2 className="text-h2 text-fg-ink break-keep text-balance">{proof.heading}</h2>
        <div className="mt-10 flex flex-col gap-6 md:flex-row">
          <figure className="md:basis-2/3">
            <Image
              src={lead.image.src}
              alt={lead.image.alt}
              width={1200}
              height={750}
              sizes="(min-width: 1040px) 650px, (min-width: 768px) 66vw, 100vw"
              loading="lazy"
              className={PHOTO}
            />
            <figcaption>
              <p className="mt-4 text-body font-semibold text-fg-ink">{lead.name}</p>
              <p className="mt-1 text-body text-fg-body break-keep">{lead.result}</p>
            </figcaption>
          </figure>
          <div className="flex flex-col gap-6 md:basis-1/3">
            {others.map((c) => (
              <figure key={c.name}>
                <Image
                  src={c.image.src}
                  alt={c.image.alt}
                  width={1200}
                  height={750}
                  sizes="(min-width: 1040px) 330px, (min-width: 768px) 33vw, 100vw"
                  loading="lazy"
                  className={PHOTO}
                />
                <figcaption>
                  <p className="mt-3 text-ui font-semibold text-fg-ink">{c.name}</p>
                  <p className="mt-1 text-caption text-fg-body break-keep">{c.result}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
        <GatewayLink href={proof.link.href} className="mt-10">
          {proof.link.label}
        </GatewayLink>
      </Reveal>
    </section>
  )
}
