import { HOME_OG_KICKER, HOME_OG_TITLE_LINES } from "@/lib/og/home-card"
import { renderOgImage } from "@/lib/og/template"

// 메타데이터 이미지 설정은 정적 분석되므로 리터럴로 둔다(값은 lib/og/template.tsx 의 OG_IMAGE_SIZE 와 같다).
export const alt = "클래스인 Classin — 좋은 수업을, 강사의 개인기에서 학원의 시스템으로"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OGImage() {
  return renderOgImage({
    kicker: HOME_OG_KICKER,
    titleLines: HOME_OG_TITLE_LINES,
    titleSize: 80,
  })
}
