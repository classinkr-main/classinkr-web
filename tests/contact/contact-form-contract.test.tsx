import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// 화면은 제출 결과를 토스트로 알린다 — SSR 렌더에는 프로바이더가 없어 얇게 대체한다.
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: () => {} }),
}))

import ContactPage from "@/app/contact/page"

/**
 * 문의 폼의 필드 계약.
 *
 * 711줄짜리 단일 화면인데 화면 테스트가 0건이라, 필드 이름·필수 여부·자동완성이
 * 아무 안전망 없이 방치돼 있었다. 서버 계약(`lib/server/lead-capture.ts`)은 `org`·
 * `name`·`phone`·`message` 를 요구하는데 폼의 input 이름은 `org-name` 이고, 그 매핑은
 * 제출 핸들러 안에만 있다 — 이름 하나만 바뀌어도 조용히 깨진다.
 *
 * jsdom 이 없어 상호작용은 못 돌린다(저장소 관례가 renderToStaticMarkup). 여기서는
 * **마크업에 드러나는 계약**만 잡는다.
 */

function renderContact() {
  return renderToStaticMarkup(<ContactPage />)
}

function fieldOf(html: string, name: string) {
  return html
    .split(/<(?:input|select|textarea)\b/)
    .find((chunk) => chunk.includes(`name="${name}"`))
}

/**
 * 자동완성 토큰 단언.
 *
 * 이 React 버전은 `tabIndex` 는 소문자로 바꾸면서 `autoComplete` 는 camelCase 그대로
 * 직렬화한다. HTML 속성 이름은 대소문자를 가리지 않아 브라우저 동작에는 영향이 없지만,
 * 문자열 단언은 그 차이에 걸린다 — 계약은 "이 토큰이 붙어 있는가"이므로 대소문자를 뺀다.
 */
function expectAutoComplete(chunk: string | undefined, token: string) {
  expect(chunk).toBeDefined()
  expect(chunk).toMatch(new RegExp(`autocomplete="${token}"`, "i"))
}

describe("문의 폼 필드 계약", () => {
  const html = renderContact()

  it("서버가 요구하는 필드가 전부 폼에 있다", () => {
    // org 는 화면에서 org-name 이라는 다른 이름을 쓴다 — 제출 핸들러의 매핑이 유일한 다리다.
    for (const name of ["org-name", "name", "phone", "topic", "message"]) {
      expect(fieldOf(html, name), name).toBeDefined()
    }
  })

  it("문의 내용은 선택이다 — 서버 필수 검사는 조합된 message 를 보므로 계약이 깨지지 않는다", () => {
    const message = fieldOf(html, "message")
    expect(message).toBeDefined()
    expect(message).not.toContain('required=""')
  })

  it("기관명·성함·연락처·문의 유형은 필수다", () => {
    for (const name of ["org-name", "name", "phone", "topic"]) {
      expect(fieldOf(html, name), name).toContain('required=""')
    }
  })

  it("리드 자격 필드는 선택이다 — 작성 비용을 늘리지 않는다", () => {
    for (const name of ["role", "size", "email"]) {
      const field = fieldOf(html, name)
      expect(field, name).toBeDefined()
      expect(field, name).not.toContain('required=""')
    }
  })

  it("자동완성이 붙어 있다 — 모바일 타이핑 비용의 대부분이 여기서 난다", () => {
    expectAutoComplete(fieldOf(html, "org-name"), "organization")
    expectAutoComplete(fieldOf(html, "name"), "name")
    expectAutoComplete(fieldOf(html, "email"), "email")
    expectAutoComplete(fieldOf(html, "phone"), "tel-national")
    expectAutoComplete(fieldOf(html, "role"), "organization-title")
  })

  it("honeypot 은 있고 자동완성에서 빠져 있다", () => {
    const website = fieldOf(html, "website")
    expect(website).toBeDefined()
    expectAutoComplete(website, "off")
    expect(website).toContain('tabindex="-1"')
  })

  it("개인정보 수집·이용 동의 체크박스와 방침 링크가 있다", () => {
    expect(fieldOf(html, "privacy-consent")).toBeDefined()
    expect(html).toContain('href="/privacy"')
  })

  it("학원 규모는 공용 버킷 4단을 쓴다 — 자유 입력이 섞이면 집계가 쪼개진다", () => {
    for (const bucket of ["100명 이하", "100~300명", "300~500명", "500명 이상"]) {
      expect(html, bucket).toContain(`value="${bucket}"`)
    }
  })

  it("쇼룸 예약으로 가는 다리가 있다 — 예약은 문의와 필드가 다르다", () => {
    expect(html).toContain('href="/showroom"')
  })

  it("카카오 채널이 설정되지 않으면 QR 블록을 그리지 않는다", () => {
    // 스캔해도 아무 일이 없는 블록이 폼 위를 차지하던 자리다.
    expect(process.env.NEXT_PUBLIC_CONTACT_KAKAO_URL ?? "").toBe("")
    expect(html).not.toContain("/qr-code.png")
  })
})

describe("문의 폼 디자인 정합", () => {
  const html = renderContact()

  it("블루-그레이가 남아 있지 않다 — DESIGN.md §7-1", () => {
    expect(html).not.toMatch(/\bslate-\d/)
  })

  it("세리프 폰트를 쓰지 않는다", () => {
    expect(html).not.toContain("font-serif")
  })

  it("에러 색이 한 종류다 — 같은 폼에 두 계열이 섞여 있었다", () => {
    expect(html).not.toMatch(/\btext-red-\d/)
  })
})
