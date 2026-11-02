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
