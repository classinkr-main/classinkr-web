export const ADMIN_AUTH_ERROR_CODE = {
  INVALID_CREDENTIALS: "ADMIN_AUTH_INVALID_CREDENTIALS",
  NOT_CONFIGURED: "ADMIN_AUTH_NOT_CONFIGURED",
  INVALID_CONFIG: "ADMIN_AUTH_CONFIG_INVALID",
  LEGACY_DISABLED: "ADMIN_AUTH_LEGACY_DISABLED",
} as const

export type AdminAuthErrorCode =
  (typeof ADMIN_AUTH_ERROR_CODE)[keyof typeof ADMIN_AUTH_ERROR_CODE]

export function getAdminAuthErrorMessage(code?: string): string {
  switch (code) {
    case ADMIN_AUTH_ERROR_CODE.LEGACY_DISABLED:
      return "운영 환경에서는 Supabase 관리자 계정으로만 로그인할 수 있습니다."
    case ADMIN_AUTH_ERROR_CODE.NOT_CONFIGURED:
      return "Supabase 관리자 로그인이 설정되지 않았습니다. 관리자에게 문의해 주세요."
    case ADMIN_AUTH_ERROR_CODE.INVALID_CONFIG:
      return "로컬 관리자 로그인 설정 형식이 잘못되었습니다."
    default:
      return "비밀번호가 올바르지 않습니다."
  }
}
