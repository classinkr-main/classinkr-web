import Image from "next/image"
import { Reveal } from "@/components/landing/Reveal"
import { GatewayLink } from "./GatewayLink"
import { HOME_COPY } from "./home-copy"

const { proof } = HOME_COPY

export function HomeProof() {
  return (
    <section className="bg-surface-sunken py-14 md:py-20">
      <Reveal className="mx-auto max-w-[1040px] px-4 sm:px-6">
        <h2 className="text-h2 text-fg-ink break-keep">{proof.heading}</h2>
        <ul className="mt-8 grid gap-6 md:mt-10 md:grid-cols-3">
          {proof.cases.map((c) => (
            <li key={c.name}>
              <figure className="overflow-hidden rounded-xl border border-line-hair bg-surface-sunken">
                <Image
                  src={c.image.src}
                  alt={c.image.alt}
                  width={1200}
                  height={750}
                  sizes="(min-width: 768px) 320px, 100vw"
                  loading="lazy"
                  className="aspect-[16/10] w-full object-cover"
                />
              </figure>
              <p className="mt-4 text-body font-semibold text-fg-ink">{c.name}</p>
              <p className="mt-1 text-body text-fg-body break-keep">{c.result}</p>
            </li>
          ))}
        </ul>
        <GatewayLink href={proof.link.href} className="mt-8 md:mt-10">{proof.link.label}</GatewayLink>
      </Reveal>
    </section>
  )
}
