import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Reveal } from "@/components/landing/Reveal"
import { HOME_COPY } from "./home-copy"

const { explore } = HOME_COPY

// 증거 띠(sunken)를 그대로 잇는다 — 윗 여백 없음. 카드·테두리 없이 평문 링크 셋
export function HomeExplore() {
  return (
    <section className="bg-surface-sunken pb-16 md:pb-24">
      <Reveal className="mx-auto max-w-[1040px] px-4 sm:px-6">
        <h2 className="text-h2 text-fg-ink break-keep text-balance">{explore.heading}</h2>
        <ul className="mt-10 grid gap-8 md:grid-cols-3">
          {explore.items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="block">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-body-l font-semibold text-fg-ink">{item.title}</h3>
                  <ArrowRight aria-hidden className="size-4 shrink-0 text-fg-accent arrow-nudge" />
                </div>
                <p className="mt-2 text-caption text-fg-body break-keep">{item.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  )
}
