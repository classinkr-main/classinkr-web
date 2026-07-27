"use client"

import { useEffect, useState } from "react"
import {
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  ShieldCheck,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { clearAdminSessionStorage } from "@/lib/admin-client"
import {
  ADMIN_PASSWORD_CHANGED_NOTICE_KEY,
  validateAdminPasswordChange,
} from "@/lib/auth/admin-password"
import { mapAuthError } from "@/lib/auth/auth-messages"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

const CURRENT_PASSWORD_ERROR = "현재 비밀번호가 올바르지 않습니다."

export function SecurityPanel() {
  const useSupabaseAuth = hasSupabaseBrowserEnv()
  const [accountEmail, setAccountEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPasswords, setShowPasswords] = useState(false)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!useSupabaseAuth) return

    let active = true
    const supabase = createSupabaseBrowserClient()

    void supabase.auth.getUser().then(({ data }) => {
      if (active) setAccountEmail(data.user?.email ?? "로그인 세션 확인 필요")
    })

    return () => {
      active = false
    }
  }, [useSupabaseAuth])

  const handlePasswordChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")

    const validationError = validateAdminPasswordChange({
      currentPassword,
      newPassword,
      confirmPassword,
    })
    if (validationError) {
      setError(validationError)
      return
    }

    if (!useSupabaseAuth) {
      setError("로컬 관리자 비밀번호는 환경변수에서만 변경할 수 있습니다.")
      return
    }

    setSubmitting(true)

    try {
      const supabase = createSupabaseBrowserClient()
      const { data: userData, error: userError } = await supabase.auth.getUser()
      const email = userData.user?.email

      if (userError || !email) {
        setError("로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요.")
        return
      }

      const { error: reauthenticationError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })

      if (reauthenticationError) {
        setError(CURRENT_PASSWORD_ERROR)
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateError) {
        setError(mapAuthError(updateError.message))
        return
      }

      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")

      await supabase.auth.signOut({ scope: "global" })
      await fetch("/api/admin/auth/logout", { method: "POST" }).catch(() => null)
      clearAdminSessionStorage()
      sessionStorage.setItem(ADMIN_PASSWORD_CHANGED_NOTICE_KEY, "success")
      window.location.assign("/admin/login")
    } catch {
      setError("비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!useSupabaseAuth) {
    return (
      <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
        <div className="border-b border-[#e8e8e4] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[#084734]" />
            <h2 className="text-[14px] font-semibold text-[#111110]">계정 보안</h2>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
            관리자 비밀번호와 로그인 세션을 관리합니다.
          </p>
        </div>
        <div className="px-4 py-5 sm:px-6">
          <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] p-4">
            <p className="text-[13px] font-medium text-[#111110]">로컬 관리자 모드</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
              이 환경의 비밀번호는 화면에서 바꿀 수 없습니다. 배포 환경의 비밀 환경변수를 교체해 주세요.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
        <div className="border-b border-[#e8e8e4] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[#084734]" />
            <h2 className="text-[14px] font-semibold text-[#111110]">비밀번호 변경</h2>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/45">
            본인 계정의 비밀번호만 변경할 수 있습니다. 변경이 끝나면 모든 기기에서 로그아웃됩니다.
          </p>
        </div>

        <form onSubmit={handlePasswordChange} className="space-y-5 px-4 py-5 sm:px-6">
          <div className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#1a1a1a]/35">
              로그인 계정
            </p>
            <p className="mt-1 break-all text-[13px] font-medium text-[#111110]">
              {accountEmail || "계정 확인 중..."}
            </p>
          </div>

          <div className="grid gap-4">
            <PasswordField
              id="admin-current-password"
              label="현재 비밀번호"
              value={currentPassword}
              onChange={setCurrentPassword}
              visible={showPasswords}
              autoComplete="current-password"
            />
            <PasswordField
              id="admin-new-password"
              label="새 비밀번호"
              value={newPassword}
              onChange={setNewPassword}
              visible={showPasswords}
              autoComplete="new-password"
            />
            <PasswordField
              id="admin-confirm-password"
              label="새 비밀번호 확인"
              value={confirmPassword}
              onChange={setConfirmPassword}
              visible={showPasswords}
              autoComplete="new-password"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowPasswords((visible) => !visible)}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#1a1a1a]/50 transition-colors hover:text-[#111110]"
          >
            {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPasswords ? "비밀번호 숨기기" : "비밀번호 표시"}
          </button>

          {error ? (
            <p role="alert" aria-live="polite" className="rounded-xl bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-[#e8e8e4] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-[12px] leading-relaxed text-[#1a1a1a]/45">
              <LogOut className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              변경 후 새 비밀번호로 다시 로그인해야 합니다.
            </div>
            <Button
              type="submit"
              disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
              className="gap-1.5"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {submitting ? "변경 중..." : "비밀번호 변경"}
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-[#e8e8e4] bg-[#ECFDF5] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#084734]" />
          <div>
            <p className="text-[13px] font-medium text-[#084734]">보안 처리 방식</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#084734]/70">
              입력한 비밀번호는 화면 상태에서만 사용하며 저장소나 로그에 남기지 않습니다. 현재 비밀번호를
              다시 확인한 뒤 변경하고, 완료 시 전체 로그인 세션을 종료합니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  visible,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  visible: boolean
  autoComplete: "current-password" | "new-password"
}) {
  return (
    <label htmlFor={id} className="grid gap-1.5">
      <span className="text-[12px] font-medium text-[#111110]">{label}</span>
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        spellCheck={false}
      />
    </label>
  )
}
