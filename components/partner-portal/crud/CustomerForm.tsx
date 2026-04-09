"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { portalFetch } from "@/lib/partner-portal/portal-fetch"
import type { Customer } from "@/lib/partner-portal/types"

const EMPTY = {
  name: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  business_number: "",
  campus_name: "",
  region_label: "",
  notes: "",
}

interface Props {
  partnerAccountId?: string
  existing?: Customer | null
  onClose: () => void
  onSaved: () => void
}

export function CustomerForm({ partnerAccountId, existing, onClose, onSaved }: Props) {
  const isEdit = !!existing
  const [form, setForm] = useState(existing ? {
    name: existing.name,
    contact_name: existing.contact_name ?? "",
    email: existing.email ?? "",
    phone: existing.phone ?? "",
    address: existing.address ?? "",
    business_number: existing.business_number ?? "",
    campus_name: existing.campus_name ?? "",
    region_label: existing.region_label ?? "",
    notes: existing.notes ?? "",
  } : EMPTY)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const url = isEdit
      ? `/api/portal/customers/${existing.id}`
      : "/api/portal/customers"
    const method = isEdit ? "PUT" : "POST"
    const body = isEdit
      ? form
      : partnerAccountId
        ? { ...form, partner_account_id: partnerAccountId }
        : form

    const res = await portalFetch(url, {
      method,
      body: JSON.stringify(body),
    })

    if (res.ok) {
      onSaved()
      onClose()
    } else {
      const err = await res.json().catch(() => null)
      setSaveError(err?.error ?? "저장에 실패했습니다. 다시 시도해주세요.")
    }
    setSaving(false)
  }

  const field = (label: string, key: keyof typeof form, required = false, type = "text") => (
    <div>
      <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">{label}{required && " *"}</label>
      <input type={type} required={required} value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]" />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
          <h2 className="text-base font-semibold">{isEdit ? "고객 수정" : "고객 추가"}</h2>
          <button onClick={onClose} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {field("기관명", "name", true)}
            {field("담당자", "contact_name")}
            {field("이메일", "email", false, "email")}
            {field("전화번호", "phone", false, "tel")}
            {field("주소", "address")}
            {field("사업자번호", "business_number")}
            {field("캠퍼스명", "campus_name")}
            {field("지역", "region_label")}
          </div>
          <div>
            <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">메모</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2} className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a] resize-none" />
          </div>
          {saveError && (
            <div className="rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-sm text-[#B85C33]">
              {saveError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit" disabled={saving}>{saving ? "저장 중..." : isEdit ? "수정" : "추가"}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
