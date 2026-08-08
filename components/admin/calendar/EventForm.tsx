"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EventType } from "@/lib/calendar-data"

import { EVENT_TYPES } from "./event-style"

export interface EventFormData {
  title: string
  date: string
  endDate: string
  time: string
  endTime: string
  type: EventType
  description: string
  assignees: string
  allDay: boolean
}

export const EMPTY_EVENT_FORM: EventFormData = {
  title: "",
  date: "",
  endDate: "",
  time: "",
  endTime: "",
  type: "team",
  description: "",
  assignees: "",
  allDay: false,
}

interface EventFormProps {
  initial: EventFormData
  onSave: (data: EventFormData) => void
  onCancel: () => void
  loading: boolean
  isEdit: boolean
}

export function EventForm({ initial, onSave, onCancel, loading, isEdit }: EventFormProps) {
  const [form, setForm] = useState<EventFormData>(initial)
  const set = (key: keyof EventFormData, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSave(form)
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label>제목 *</Label>
        <Input
          value={form.title}
          onChange={(event) => set("title", event.target.value)}
          placeholder="일정 제목"
          required
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label>유형 *</Label>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {EVENT_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => set("type", type.value)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-all ${
                form.type === type.value
                  ? `${type.bg} ${type.color} border-current`
                  : "border-[#e8e8e4] bg-white text-[#1a1a1a]/50 hover:border-[#1a1a1a]/30"
              }`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${type.dot}`} />
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>시작일 *</Label>
          <Input
            type="date"
            value={form.date}
            onChange={(event) => set("date", event.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>종료일</Label>
          <Input
            type="date"
            value={form.endDate}
            onChange={(event) => set("endDate", event.target.value)}
            min={form.date}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="allDay"
          checked={form.allDay}
          onChange={(event) => set("allDay", event.target.checked)}
          className="rounded border-input"
        />
        <Label htmlFor="allDay" className="cursor-pointer font-normal">
          종일
        </Label>
      </div>

      {!form.allDay && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>시작 시간</Label>
            <Input
              type="time"
              value={form.time}
              onChange={(event) => set("time", event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>종료 시간</Label>
            <Input
              type="time"
              value={form.endTime}
              onChange={(event) => set("endTime", event.target.value)}
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>담당자</Label>
        <Input
          value={form.assignees}
          onChange={(event) => set("assignees", event.target.value)}
          placeholder="홍길동, 김철수 (쉼표로 구분)"
        />
      </div>

      <div className="space-y-1.5">
        <Label>메모</Label>
        <textarea
          value={form.description}
          onChange={(event) => set("description", event.target.value)}
          placeholder="상세 내용"
          rows={3}
          className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          취소
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "저장 중..." : isEdit ? "수정" : "추가"}
        </Button>
      </div>
    </form>
  )
}
