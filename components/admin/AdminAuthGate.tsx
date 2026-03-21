"use client"

import { useState } from "react"
import { Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface AdminAuthGateProps {
    onAuth: () => void
}

export default function AdminAuthGate({ onAuth }: AdminAuthGateProps) {
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        setLoading(true)

        try {
            const res = await fetch("/api/admin/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            })

            if (res.ok) {
                sessionStorage.setItem("admin_password", password)
                onAuth()
            } else {
                setError("비밀번호가 올바르지 않습니다.")
            }
        } catch {
            setError("서버 연결에 실패했습니다.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAF8] px-4">
            <div className="w-full max-w-sm">
                <div className="bg-white rounded-2xl border border-[#e8e8e4] p-8 shadow-sm">
                    <div className="flex items-center justify-center w-12 h-12 bg-[#f0f0ec] rounded-xl mx-auto mb-6">
                        <Lock className="w-5 h-5 text-[#1a1a1a]/40" />
                    </div>
                    <h1 className="text-lg font-semibold text-[#111110] text-center mb-1">
                        관리자 인증
                    </h1>
                    <p className="text-[13px] text-[#1a1a1a]/40 text-center mb-6">
                        블로그 관리 페이지에 접근하려면 비밀번호를 입력하세요.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <Input
                            type="password"
                            placeholder="비밀번호"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoFocus
                        />
                        {error && (
                            <p className="text-[13px] text-red-500">{error}</p>
                        )}
                        <Button type="submit" className="w-full" disabled={loading || !password}>
                            {loading ? "확인 중..." : "로그인"}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    )
}
