/**
 * 마케팅 픽셀 철회/복구.
 *
 * `next/script`는 언마운트 시 아무것도 정리하지 않는다 — 주입한 `<script>`를 남기고,
 * cleanup 함수도 없으며, 모듈 스코프 `LoadCache`가 절대 비워지지 않아 **같은 페이지
 * 세션에서 인라인 스니펫이 두 번 실행되지 않는다**. 따라서 AppChrome이 픽셀
 * 컴포넌트를 언마운트해도 `window.fbq`·`window.kakaoPixel`·`_fbp` 쿠키는 그대로 살아
 * 있고, fbevents.js가 스스로 하는 자동 추적은 우리 게이트를 거치지 않는다.
 *
 * 패턴은 `lib/channel-talk.ts`의 `shutdownChannelTalk()`을 따른다 — 실제로 내리고,
 * 재동의 시 되살릴 수 있어야 한다.
 */

const KAKAO_PIXEL_SRC = "https://t1.daumcdn.net/adfit/static/kp.js"
/** fbevents.js가 심는 1st-party 광고 식별 쿠키. */
const META_COOKIES = ["_fbp", "_fbc"]

// window.fbq / window.kakaoPixel 전역 타입은 lib/analytics.ts 의 `declare global`
// 한 곳에서만 선언한다(중복 선언은 TS2717). 전역 증강이라 import는 필요 없다.

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined"
}

/**
 * 쿠키를 만료시킨다. fbevents.js는 등록 가능한 상위 도메인에 쿠키를 심으므로
 * host-only부터 상위 도메인까지 후보를 모두 시도한다(공개 접미사는 브라우저가 무시).
 */
function expireCookie(name: string) {
  const parts = window.location.hostname.split(".")
  const domains: (string | null)[] = [null]
  for (let index = 0; index < parts.length - 1; index += 1) {
    domains.push(`.${parts.slice(index).join(".")}`)
  }

  for (const domain of domains) {
    document.cookie = `${name}=; path=/; max-age=0${domain ? `; domain=${domain}` : ""}`
  }
}

function removeScriptsBySrc(fragment: string) {
  document.querySelectorAll(`script[src*="${fragment}"]`).forEach((node) => node.remove())
}

/**
 * Meta 픽셀 발화를 중단하고 광고 식별 쿠키를 지운다.
 *
 * `window.fbq` 자체는 **남긴다** — `LoadCache` 때문에 인라인 스니펫을 다시 실행할 수
 * 없으므로, 전역을 지우면 재동의해도 복구할 방법이 없어진다. 대신 Meta 공식 API인
 * `fbq('consent','revoke')`로 전송을 멈춘다.
 */
export function revokeMetaPixel(): void {
  if (!isBrowser()) return
  window.fbq?.("consent", "revoke")
  for (const name of META_COOKIES) expireCookie(name)
}

/**
 * Meta PageView 중복 방지 상태.
 *
 * `MetaPixelScript`의 모듈 스코프 변수로 두면 철회→재동의로 컴포넌트가 리마운트돼도
 * Next 모듈 레지스트리가 값을 유지해서, **같은 경로에서 재동의하면 PageView가 영영
 * 누락된다**(다른 경로로 이동해야 발화). 픽셀 생명주기와 함께 관리해 재동의 시
 * 초기화될 수 있도록 이 모듈로 옮긴다.
 */
let lastMetaPageViewPath: string | null = null

export function getLastMetaPageViewPath(): string | null {
  return lastMetaPageViewPath
}

export function setLastMetaPageViewPath(path: string | null): void {
  lastMetaPageViewPath = path
}

/** 재동의 시 Meta 픽셀 전송을 다시 허용한다. */
export function grantMetaPixel(): void {
  if (!isBrowser()) return
  window.fbq?.("consent", "grant")
  // 철회 중 머물던 경로에서 재동의해도 PageView가 다시 잡히도록 dedup을 푼다.
  lastMetaPageViewPath = null
}

/**
 * Kakao 픽셀을 내린다. Kakao에는 공식 opt-out API가 없어 스크립트와 전역을 걷어내는
 * 방법밖에 없다. 재동의 시 `restoreKakaoPixel()`이 스크립트를 다시 주입한다
 * (`next/script`의 LoadCache가 재실행을 막으므로 직접 주입해야 한다).
 */
export function shutdownKakaoPixel(): void {
  if (!isBrowser()) return
  removeScriptsBySrc("t1.daumcdn.net/adfit/static/kp.js")
  delete window.kakaoPixel
}

/** 철회로 걷어냈던 Kakao 픽셀을 다시 올린다. */
export function restoreKakaoPixel(): void {
  if (!isBrowser()) return
  if (window.kakaoPixel) return
  if (document.querySelector(`script[src="${KAKAO_PIXEL_SRC}"]`)) return

  const script = document.createElement("script")
  script.src = KAKAO_PIXEL_SRC
  script.async = true
  document.body.appendChild(script)
}

/** 마케팅 동의 철회 — 픽셀 전송 중단 + 광고 쿠키 삭제. */
export function revokeMarketingPixels(): void {
  revokeMetaPixel()
  shutdownKakaoPixel()
}

/** 마케팅 재동의 — 철회로 내렸던 픽셀을 되살린다. */
export function grantMarketingPixels(): void {
  grantMetaPixel()
  restoreKakaoPixel()
}
