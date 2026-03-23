"use client"

import { useState, useEffect } from "react"
import { Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SiteSettings } from "@/lib/db"

function adminFetch(url: string, options?: RequestInit) {
  const token = sessionStorage.getItem("admin_password") ?? ""
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
}

interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-[#e8e8e4] last:border-0">
      <div>
        <p className="text-[14px] font-medium text-[#111110]">{label}</p>
        <p className="text-[12px] text-[#1a1a1a]/40 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
          checked ? "bg-[#111110]" : "bg-[#e8e8e4]"
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    adminFetch("/api/admin/settings")
      .then((r) => r.json())
      .then(setSettings)
  }, [])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await adminFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return (
      <div className="px-8 pt-12 text-[13px] text-[#1a1a1a]/30">불러오는 중...</div>
    )
  }

  return (
    <div className="px-8 pt-12 pb-20 max-w-2xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">Settings</h1>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-1.5" />
          {saved ? "저장됨" : saving ? "저장 중..." : "저장"}
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-[#e8e8e4] px-6 mb-6">
        <ToggleRow
          label="데모 신청 폼"
          description="홈페이지 데모 신청 버튼 및 모달 활성화"
          checked={settings.demoFormEnabled}
          onChange={(v) => setSettings({ ...settings, demoFormEnabled: v })}
        />
        <ToggleRow
          label="블로그 섹션"
          description="홈페이지 블로그 섹션 표시"
          checked={settings.blogSectionEnabled}
          onChange={(v) => setSettings({ ...settings, blogSectionEnabled: v })}
        />
        <ToggleRow
          label="데모 배너"
          description="상단 데모 안내 배너 표시"
          checked={settings.demoBannerEnabled}
          onChange={(v) => setSettings({ ...settings, demoBannerEnabled: v })}
        />
        <ToggleRow
          label="공지 배너"
          description="전체 공지 배너 표시"
          checked={settings.noticeBannerEnabled}
          onChange={(v) => setSettings({ ...settings, noticeBannerEnabled: v })}
        />
      </div>

      <div className="bg-white rounded-xl border border-[#e8e8e4] px-6 py-5 space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">데모 배너 문구</label>
          <Input
            value={settings.demoBannerText}
            onChange={(e) => setSettings({ ...settings, demoBannerText: e.target.value })}
            placeholder="예: 2025년 신학기 무료 체험 신청 중"
          />
        </div>
        <div>
          <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">공지 배너 문구</label>
          <Input
            value={settings.noticeBannerText}
            onChange={(e) => setSettings({ ...settings, noticeBannerText: e.target.value })}
            placeholder="예: 시스템 점검 안내 (00:00 ~ 06:00)"
          />
        </div>
      </div>
    </div>
  )
}
