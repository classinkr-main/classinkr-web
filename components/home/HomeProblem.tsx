import { Reveal } from "@/components/landing/Reveal"
import { GatewayLink } from "./GatewayLink"
import { HOME_COPY } from "./home-copy"

const { problem } = HOME_COPY

export function HomeProblem() {
  return (
    <section className="bg-surface-sunken py-14 md:py-20">
      <Reveal className="mx-auto max-w-[1040px] px-5">
        <h2 className="text-h2 text-fg-ink break-keep">{problem.heading}</h2>
        <ul className="mt-8 grid gap-4 md:mt-10 md:grid-cols-3">
          {problem.scenes.map((scene) => (
            <li key={scene.title} className="rounded-xl border border-line-hair bg-surface-sheet p-6">
              <h3 className="text-h3 text-fg-ink break-keep">{scene.title}</h3>
              <p className="mt-2 text-body text-fg-body break-keep">{scene.body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-h3 text-fg-ink break-keep md:mt-10">{problem.closing}</p>
        <GatewayLink href={problem.link.href} className="mt-4">{problem.link.label}</GatewayLink>
      </Reveal>
    </section>
  )
}
