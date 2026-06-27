/**
 * Supabase 인증 에러 메시지를 사용자용 한국어 문구로 매핑한다.
 * 매칭되지 않는 경우 일반 안내 문구로 폴백한다.
 */
export function mapAuthError(message: string | null | undefined): string {
  const raw = (message ?? "").toLowerCase()

  if (!raw) return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."

  if (raw.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다."
  }
  if (raw.includes("email not confirmed")) {
    return "이메일 확인이 완료되지 않았습니다. 메일함에서 확인 링크를 눌러 주세요."
  }
  if (raw.includes("user already registered") || raw.includes("already been registered")) {
    return "이미 가입된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해 주세요."
  }
  if (raw.includes("password should be at least") || raw.includes("password is too short")) {
    return "비밀번호는 최소 8자 이상이어야 합니다."
  }
  if (raw.includes("unable to validate email") || raw.includes("invalid email")) {
    return "이메일 형식이 올바르지 않습니다."
  }
  if (raw.includes("for security purposes") || raw.includes("rate limit") || raw.includes("too many")) {
    return "요청이 많아 잠시 후 다시 시도해 주세요."
  }
  if (raw.includes("token has expired") || raw.includes("expired") || raw.includes("invalid token")) {
    return "링크가 만료되었거나 유효하지 않습니다. 다시 시도해 주세요."
  }
  if (raw.includes("new password should be different")) {
    return "기존과 다른 새 비밀번호를 입력해 주세요."
  }

  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
}

/** 클라이언트 측 기본 검증. 통과 시 null, 실패 시 한국어 메시지를 반환한다. */
export function validateEmail(email: string): string | null {
  const value = email.trim()
  if (!value) return "이메일을 입력해 주세요."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "이메일 형식이 올바르지 않습니다."
  return null
}

export function validatePassword(password: string): string | null {
  if (!password) return "비밀번호를 입력해 주세요."
  if (password.length < 8) return "비밀번호는 최소 8자 이상이어야 합니다."
  return null
}
