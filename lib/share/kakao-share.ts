/**
 * 카카오톡 공유 — Kakao JavaScript SDK 의 Share.sendScrap 으로 '친구·채팅방 고르기'를 바로 연다.
 *
 * - `NEXT_PUBLIC_KAKAO_JS_KEY`(카카오 디벨로퍼스 앱의 JavaScript 키)가 있을 때만 켠다. 없으면 null 을 돌려주고
 *   호출부가 공유 시트·링크 복사로 대신한다.
 * - 같은 앱의 [플랫폼 > Web] 사이트 도메인에 운영 도메인(https://classin.co.kr)이 등록돼 있어야 한다.
 *   sendScrap 은 넘긴 주소의 OG 태그(app/opengraph-image.tsx 카드)를 카카오가 긁어 메시지를 만든다.
 * - SDK 는 공유 버튼이 화면에 붙은 뒤 한가할 때 미리 받는다. 클릭 뒤에 받으면 데스크톱 팝업이 차단될 수 있다.
 * - CSP: script-src 에 t1.kakaocdn.net, form-action 에 sharer.kakao.com(데스크톱 팝업 POST)이 필요하다(next.config.ts).
 */

// 버전·SRI 는 한 쌍으로 바꾼다. 값은 https://t1.kakaocdn.net/kakao_js_sdk/<버전>/kakao.min.js 의 sha384.
export const KAKAO_SDK_VERSION = "2.8.4"
export const KAKAO_SDK_URL = `https://t1.kakaocdn.net/kakao_js_sdk/${KAKAO_SDK_VERSION}/kakao.min.js`
export const KAKAO_SDK_INTEGRITY = "sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w"

const SCRIPT_ID = "kakao-js-sdk"

interface KakaoSdk {
  init: (appKey: string) => void
  isInitialized: () => boolean
  Share: {
    sendScrap: (settings: { requestUrl: string; installTalk?: boolean }) => void
  }
}

declare global {
  interface Window {
    Kakao?: KakaoSdk
  }
}

export function getKakaoJsKey(): string | null {
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY?.trim()
  return key ? key : null
}

let sdkPromise: Promise<KakaoSdk> | null = null

function initialized(sdk: KakaoSdk, key: string): KakaoSdk {
  if (!sdk.isInitialized()) sdk.init(key)
  return sdk
}

/** 이미 받은(또는 이 호출에서 초기화할 수 있는) SDK. 없으면 null — 동기라 클릭 제스처 안에서 바로 쓸 수 있다. */
export function getReadyKakao(): KakaoSdk | null {
  const key = getKakaoJsKey()
  if (!key || typeof window === "undefined" || !window.Kakao) return null
  try {
    return initialized(window.Kakao, key)
  } catch {
    return null
  }
}

/** SDK 를 한 번만 받아 초기화한다. 키가 없거나 받기에 실패하면 reject(다음 호출이 다시 시도). */
export function loadKakaoSdk(): Promise<KakaoSdk> {
  const key = getKakaoJsKey()
  if (!key) return Promise.reject(new Error("NEXT_PUBLIC_KAKAO_JS_KEY 가 없습니다"))
  if (typeof window === "undefined") return Promise.reject(new Error("브라우저가 아닙니다"))

  const ready = getReadyKakao()
  if (ready) return Promise.resolve(ready)

  if (!sdkPromise) {
    sdkPromise = new Promise<KakaoSdk>((resolve, reject) => {
      const finish = () => {
        if (window.Kakao) {
          try {
            resolve(initialized(window.Kakao, key))
            return
          } catch (error) {
            reject(error)
            return
          }
        }
        reject(new Error("Kakao SDK 를 불러오지 못했습니다"))
      }

      let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
      if (!script) {
        script = document.createElement("script")
        script.id = SCRIPT_ID
        script.src = KAKAO_SDK_URL
        script.integrity = KAKAO_SDK_INTEGRITY
        script.crossOrigin = "anonymous"
        script.async = true
        document.head.appendChild(script)
      }
      script.addEventListener("load", finish, { once: true })
      script.addEventListener("error", () => reject(new Error("Kakao SDK 를 불러오지 못했습니다")), { once: true })
    }).catch((error: unknown) => {
      sdkPromise = null
      document.getElementById(SCRIPT_ID)?.remove()
      throw error
    })
  }
  return sdkPromise
}

/** 카카오톡 공유 창을 연다. SDK 가 준비돼 있으면 동기로 연다. 실패하면 false. */
export async function shareToKakao(url: string): Promise<boolean> {
  try {
    const sdk = getReadyKakao() ?? (await loadKakaoSdk())
    sdk.Share.sendScrap({ requestUrl: url })
    return true
  } catch {
    return false
  }
}
