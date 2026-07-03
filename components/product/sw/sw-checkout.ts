import { trackEvent } from "@/lib/analytics"

export const CHECKOUT_ENABLED = process.env.NEXT_PUBLIC_SW_CHECKOUT_ENABLED === "true"
export const CHECKOUT_HREF = CHECKOUT_ENABLED ? "/checkout" : "/contact#contact-form"
export const CHECKOUT_CTA_LABEL = CHECKOUT_ENABLED ? "지금 바로 결제 시작" : "지금 무료로 시작하기"
export const CHECKOUT_SUB_LABEL = CHECKOUT_ENABLED ? "카드·네이버페이로 즉시 시작" : "설치 없이 바로 체험 · 카드 등록 불필요"

export const trackCheckoutClick = (location: string) => {
    if (CHECKOUT_ENABLED) {
        trackEvent("begin_checkout", { button: location, page: "/product/sw" })
    } else {
        trackEvent("click_cta", { button: location, page: "/product/sw", destination: "contact_form" })
    }
}
