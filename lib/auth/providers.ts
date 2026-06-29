export interface ProviderAvailability {
  google: boolean
  naver: boolean
  kakao: boolean
  apple: boolean
}

function isEnabled(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase()
  return v === "true" || v === "1"
}

/**
 * Reads provider env vars. Typed as a broad index-signature record so callers can
 * pass `process.env` directly (NodeJS.ProcessEnv is structurally a
 * Record<string, string | undefined>) without re-listing keys at every call site —
 * a narrow all-optional shape would be a TS "weak type" and reject process.env (TS2559).
 */
type ProviderEnv = Record<string, string | undefined>

export function resolveProviderAvailability(env: ProviderEnv): ProviderAvailability {
  return {
    google: true,
    naver: Boolean(env.NAVER_CLIENT_ID?.trim() && env.NAVER_CLIENT_SECRET?.trim()),
    kakao: Boolean(env.KAKAO_REST_API_KEY?.trim()),
    // Apple은 Supabase 네이티브 프로바이더(앱 측 시크릿 불필요). Supabase에 설정한 뒤
    // APPLE_LOGIN_ENABLED=true 로 노출한다.
    apple: isEnabled(env.APPLE_LOGIN_ENABLED),
  }
}
