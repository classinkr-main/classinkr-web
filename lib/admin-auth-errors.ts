export const ADMIN_AUTH_ERROR_CODE = {
  INVALID_CREDENTIALS: "ADMIN_AUTH_INVALID_CREDENTIALS",
  NOT_CONFIGURED: "ADMIN_AUTH_NOT_CONFIGURED",
  INVALID_CONFIG: "ADMIN_AUTH_CONFIG_INVALID",
} as const

export type AdminAuthErrorCode =
  (typeof ADMIN_AUTH_ERROR_CODE)[keyof typeof ADMIN_AUTH_ERROR_CODE]

export function getAdminAuthErrorMessage(code?: string): string {
  switch (code) {
    case ADMIN_AUTH_ERROR_CODE.NOT_CONFIGURED:
      return "관리자 로그인 환경변수가 배포 서버에 설정되지 않았습니다. Vercel의 ADMIN_PASSWORD 또는 ADMIN_USERS 값을 확인해 주세요."
    case ADMIN_AUTH_ERROR_CODE.INVALID_CONFIG:
      return "관리자 로그인 설정 형식이 잘못되었습니다. ADMIN_USERS JSON 또는 ADMIN_PASSWORD 값을 확인해 주세요."
    default:
      return "비밀번호가 올바르지 않습니다."
  }
}
