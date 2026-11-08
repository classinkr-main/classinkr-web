import { renderHomeOgImage } from "@/lib/og/template"

// 홈·기본 공유 카드 — C′ 로고 액자(lib/og/template.tsx). 메타데이터 이미지 설정은 정적 분석되므로 리터럴로 둔다
// (값은 lib/og/template.tsx 의 OG_IMAGE_SIZE·OG_IMAGE_CONTENT_TYPE 과 같다).
export const alt = "클래스인 Classin 로고"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OGImage() {
  return renderHomeOgImage()
}
