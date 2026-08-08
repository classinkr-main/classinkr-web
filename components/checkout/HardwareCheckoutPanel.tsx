"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowRight, Minus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckoutRequestForm } from "@/components/checkout/CheckoutRequestForm"
import {
  HARDWARE_CATALOG,
  HARDWARE_ORDER_NOTE,
  HARDWARE_QTY_MAX,
  HARDWARE_QTY_MIN,
  buildHardwareRequestItems,
  clampHardwareQty,
  computeHardwareTotalKrw,
  countHardwareUnits,
  createEmptyHardwareQuantities,
  formatHardwareKrw,
  getHardwareItem,
  type HardwareCatalogItem,
  type HardwareQuantities,
} from "@/lib/billing/hardware-catalog"
import { trackEvent } from "@/lib/analytics"

const SOURCE_PAGE = "/checkout?type=hw"

/**
 * `?sku=hw-board-86,hw-camera-t1` 의 값 → 프리셀렉트할 카탈로그 sku 목록.
 * 제품 페이지·랜딩의 "이 구성으로 도입 신청" CTA 가 구성을 실어 보내는 통로다.
 * 미등록·중복 sku 는 조용히 버린다(빈 장바구니로 시작하는 기존 동작으로 흡수).
 */
export function readPreselectedSkus(raw: string | null): string[] {
  if (!raw) return []

  const selected: string[] = []
  for (const token of raw.split(",")) {
    const sku = token.trim()
    if (!sku || selected.includes(sku) || !getHardwareItem(sku)) continue
    selected.push(sku)
  }
  return selected
}

/** 프리셀렉트된 품목만 수량 1로 올린 초기 상태. */
export function createPreselectedHardwareQuantities(raw: string | null): HardwareQuantities {
  const quantities = createEmptyHardwareQuantities()
  for (const sku of readPreselectedSkus(raw)) {
    quantities[sku] = 1
  }
  return quantities
}

const SINGLE_ITEMS = HARDWARE_CATALOG.filter((item) => item.group === "single")
const PACKAGE_ITEMS = HARDWARE_CATALOG.filter((item) => item.group === "package")

function QtyStepper({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (next: number) => void
  label: string
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-black/[0.08] bg-white">
      <button
        type="button"
        aria-label={`${label} 수량 감소`}
        onClick={() => onChange(clampHardwareQty(value - 1))}
        disabled={value <= HARDWARE_QTY_MIN}
        className="flex h-9 w-9 items-center justify-center rounded-l-lg text-[#44514A] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      <input
        type="number"
        inputMode="numeric"
        aria-label={`${label} 수량`}
        min={HARDWARE_QTY_MIN}
        max={HARDWARE_QTY_MAX}
        value={value}
        onChange={(event) => {
          const raw = Number.parseInt(event.target.value, 10)
          onChange(clampHardwareQty(Number.isFinite(raw) ? raw : HARDWARE_QTY_MIN))
        }}
        className="h-9 w-12 border-x border-black/[0.08] bg-white text-center text-[13px] font-semibold tabular-nums text-[#111110] focus:outline-none focus:ring-1 focus:ring-[#084734]"
      />

      <button
        type="button"
        aria-label={`${label} 수량 증가`}
        onClick={() => onChange(clampHardwareQty(value + 1))}
        disabled={value >= HARDWARE_QTY_MAX}
        className="flex h-9 w-9 items-center justify-center rounded-r-lg text-[#44514A] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function ItemCard({
  item,
  qty,
  onQtyChange,
  featured = false,
}: {
  item: HardwareCatalogItem
  qty: number
  onQtyChange: (next: number) => void
  featured?: boolean
}) {
  const selected = qty > 0

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-white transition-colors ${
        selected ? "border-[#084734]/45" : "border-black/[0.08]"
      }`}
    >
      {featured ? <div className="h-[3px] w-full bg-[#084734]" /> : null}

      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-4">
          {item.image ? (
            <Image
              src={item.image.src}
              alt={item.image.alt}
              width={224}
              height={168}
              className="h-[64px] w-[84px] shrink-0 rounded-lg border border-black/[0.08] bg-[#F6F5F4] object-cover sm:h-[76px] sm:w-[100px]"
            />
          ) : null}

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7C8A83]">
              {item.spec}
            </p>
            <h3 className="mt-1.5 text-[17px] font-semibold text-[#111110]">{item.name}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#615D59]">{item.description}</p>
            {item.note ? (
              <p className="mt-2 text-[11px] text-[#7C8A83]">{item.note}</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-3">
          <p className="text-[19px] font-semibold tabular-nums tracking-tight text-[#111110]">
            {formatHardwareKrw(item.priceKrw)}
          </p>
          <QtyStepper value={qty} onChange={onQtyChange} label={item.name} />
        </div>
      </div>
    </div>
  )
}

function GroupHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="text-[13px] font-semibold tracking-tight text-[#111110]">{title}</h2>
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#7C8A83]">
        {eyebrow}
      </span>
      <span className="h-px flex-1 bg-black/[0.08]" />
    </div>
  )
}

export function HardwareCheckoutPanel() {
  // `?sku=` 딥링크 구성으로 시작한다. SSR 에서도 같은 값이라 하이드레이션이 어긋나지 않는다.
  const initialSkuParam = useSearchParams().get("sku")
  const [quantities, setQuantities] = useState<HardwareQuantities>(() =>
    createPreselectedHardwareQuantities(initialSkuParam)
  )
  const [requestOpen, setRequestOpen] = useState(false)
  // SW 패널과 동일한 인라인 주문자 정보 — 주문 모달에 프리필된다(모달에서 수정 가능).
  const [buyer, setBuyer] = useState({ org: "", name: "", phone: "", email: "" })

  const totalKrw = useMemo(() => computeHardwareTotalKrw(quantities), [quantities])
  const unitCount = useMemo(() => countHardwareUnits(quantities), [quantities])
  const requestItems = useMemo(() => buildHardwareRequestItems(quantities), [quantities])
  const hasSelection = requestItems.length > 0

  function setQty(sku: string, next: number) {
    setQuantities((current) => ({ ...current, [sku]: clampHardwareQty(next) }))
  }

  function openRequest() {
    trackEvent("click_cta", {
      button: "hw_checkout_request_open",
      page: "/checkout",
      product_family: "hardware",
      item_count: requestItems.length,
      value: totalKrw,
      currency: "KRW",
    })
    setRequestOpen(true)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,400px)]">
      {/* LEFT — Catalog */}
      <section className="space-y-8">
        <div className="space-y-3">
          <GroupHeading title="Single Items" eyebrow="Classin Signature" />
          <div className="space-y-3">
            {SINGLE_ITEMS.map((item) => (
              <ItemCard
                key={item.sku}
                item={item}
                qty={quantities[item.sku] ?? 0}
                onQtyChange={(next) => setQty(item.sku, next)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <GroupHeading title="Package" eyebrow="One-Stop Solution" />
          <div className="space-y-3">
            {PACKAGE_ITEMS.map((item) => (
              <ItemCard
                key={item.sku}
                item={item}
                qty={quantities[item.sku] ?? 0}
                onQtyChange={(next) => setQty(item.sku, next)}
                featured
              />
            ))}
          </div>
        </div>

        <p className="text-[12px] leading-relaxed text-[#7C8A83]">
          표기 금액은 부가세 별도 기준이며, 교실 수·설치 환경에 따라 최종 견적이 달라질 수 있습니다.
          정확한 구성은 담당자와의 상담에서 확정합니다.
        </p>
      </section>

      {/* RIGHT — Summary + request CTA */}
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl border border-black/[0.08] bg-white p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7C8A83]">
            Order summary
          </p>

          {hasSelection ? (
            <ul className="mt-4 space-y-2.5">
              {requestItems.map((line) => (
                <li key={line.sku} className="flex items-start justify-between gap-3 text-[13px]">
                  <span className="min-w-0 text-[#44514A]">
                    {line.name}
                    <span className="ml-1.5 text-[#7C8A83]">× {line.qty}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-[#111110]">
                    {formatHardwareKrw(line.qty * line.unitAmount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[13px] leading-relaxed text-[#A39E98]">
              수량을 올리면 구성과 합계가 여기에 표시됩니다.
            </p>
          )}

          <div className="mt-4 flex items-baseline justify-between border-t border-black/5 pt-4">
            <div>
              <p className="text-[13px] font-semibold text-[#111110]">합계</p>
              <p className="mt-0.5 text-[11px] text-[#7C8A83]">
                {unitCount > 0 ? `${unitCount}점 선택` : "선택 없음"}
              </p>
            </div>
            <p className="text-[26px] font-semibold tabular-nums tracking-tight text-[#111110]">
              {formatHardwareKrw(totalKrw)}
            </p>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-[#7C8A83]">
            <span className="text-[#084734]">*</span> {HARDWARE_ORDER_NOTE}
          </p>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white p-6">
          <p className="text-[13px] font-semibold text-[#111110]">주문자 정보</p>

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="hw-buyer-org" className="text-[12px] text-[#44514A]">
                기관명 / 학원명
              </Label>
              <Input
                id="hw-buyer-org"
                value={buyer.org}
                onChange={(event) => setBuyer((c) => ({ ...c, org: event.target.value }))}
                placeholder="예: 무궁화학원"
                autoComplete="organization"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hw-buyer-name" className="text-[12px] text-[#44514A]">
                  담당자명
                </Label>
                <Input
                  id="hw-buyer-name"
                  value={buyer.name}
                  onChange={(event) => setBuyer((c) => ({ ...c, name: event.target.value }))}
                  placeholder="홍길동"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hw-buyer-phone" className="text-[12px] text-[#44514A]">
                  연락처
                </Label>
                <Input
                  id="hw-buyer-phone"
                  type="tel"
                  value={buyer.phone}
                  onChange={(event) => setBuyer((c) => ({ ...c, phone: event.target.value }))}
                  placeholder="010-0000-0000"
                  autoComplete="tel"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hw-buyer-email" className="text-[12px] text-[#44514A]">
                이메일 <span className="text-[#A39E98]">(선택)</span>
              </Label>
              <Input
                id="hw-buyer-email"
                type="email"
                value={buyer.email}
                onChange={(event) => setBuyer((c) => ({ ...c, email: event.target.value }))}
                placeholder="ops@classin.co.kr"
                autoComplete="email"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white p-6">
          <p className="text-[13px] font-semibold text-[#111110]">주문 신청</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[#615D59]">
            구성을 담아 주문을 남기시면 담당자가 연락드려 결제와 설치 일정을 함께 진행합니다.
          </p>

          <Button
            type="button"
            size="lg"
            className="mt-4 h-12 w-full rounded-lg bg-[#084734] text-[14px] font-semibold text-white hover:bg-[#065C41]"
            disabled={!hasSelection}
            onClick={openRequest}
          >
            주문 신청하기
          </Button>

          {!hasSelection ? (
            <p className="mt-2 text-center text-[11px] text-[#A39E98]">
              품목 수량을 1개 이상 선택해 주세요.
            </p>
          ) : null}

          <Link
            href="/contact#contact-form"
            onClick={() =>
              trackEvent("click_cta", {
                button: "hw_checkout_consult",
                page: "/checkout",
                product_family: "hardware",
              })
            }
            className="group mt-3 flex items-center justify-center gap-1.5 text-[13px] font-medium text-[#084734] transition-colors hover:text-[#065C41]"
          >
            구성부터 상담받기
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </aside>

      <CheckoutRequestForm
        open={requestOpen}
        onOpenChange={setRequestOpen}
        kind="hardware"
        items={requestItems}
        sourcePage={SOURCE_PAGE}
        summaryTitle={unitCount > 0 ? `선택 구성 ${unitCount}점` : "선택 구성"}
        summaryValue={formatHardwareKrw(totalKrw)}
        summaryNote={HARDWARE_ORDER_NOTE}
        initialContact={buyer}
      />
    </div>
  )
}
