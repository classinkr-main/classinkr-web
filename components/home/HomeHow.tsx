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
