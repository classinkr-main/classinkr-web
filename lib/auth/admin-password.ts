export const ADMIN_PASSWORD_CHANGED_NOTICE_KEY = "admin_password_change_notice"

export function validateAdminPasswordChange(input: {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}): string | null {
  const { currentPassword, newPassword, confirmPassword } = input

  if (!currentPassword) return "현재 비밀번호를 입력해 주세요."
  if (!newPassword) return "새 비밀번호를 입력해 주세요."
  if (newPassword === currentPassword) return "현재 비밀번호와 다른 새 비밀번호를 입력해 주세요."

  if (newPassword !== confirmPassword) return "새 비밀번호 확인이 일치하지 않습니다."
  return null
}
