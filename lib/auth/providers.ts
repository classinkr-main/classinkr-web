export interface ProviderAvailability {
  google: boolean
  naver: boolean
  kakao: boolean
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
  }
}
