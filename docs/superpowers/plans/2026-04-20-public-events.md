# Public Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /events 페이지의 더미 데이터를 제거하고 Supabase DB 기반으로 전환, admin에서 공개 행사를 등록·수정·삭제하며 admin calendar에도 연동한다.

**Architecture:** 새 `public_events` Supabase 테이블을 생성하고, repository layer를 통해 admin API routes가 CRUD를 처리한다. 이미지는 Supabase Storage `event-images` 버킷에 업로드한다. admin calendar는 `public_events`를 `source: "event"` 항목으로 병합해 표시한다.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + Storage), TypeScript, Tailwind CSS 4, Lucide React

---

## File Map

| 파일 | 역할 | 작업 |
|---|---|---|
| `lib/types/public-events.ts` | 공유 타입 정의 (server-only 없음) | Create |
| `supabase/migrations/20260420_public_events.sql` | DB 테이블 + Storage 버킷 생성 | Create |
| `lib/repositories/public-events.ts` | Supabase CRUD 함수 | Create |
| `app/api/events/route.ts` | 공개 GET 엔드포인트 | Create |
| `app/api/admin/events/route.ts` | admin GET + POST | Create |
| `app/api/admin/events/[id]/route.ts` | admin PATCH + DELETE | Create |
| `app/api/admin/events/upload/route.ts` | 이미지 업로드 | Create |
| `app/admin/events/page.tsx` | admin CRUD UI (모달 포함) | Create |
| `app/events/EventsClient.tsx` | 필터/검색/렌더링 클라이언트 컴포넌트 | Create |
| `lib/calendar-data.ts` | EventSource에 "event" 추가, public_events 병합 | Modify |
| `app/events/page.tsx` | Server Component로 전환, 더미 제거 | Modify |
| `components/admin/AdminSidebar.tsx` | "공개 행사" 메뉴 추가 | Modify |

---

### Task 1: 공유 타입 정의

**Files:**
- Create: `lib/types/public-events.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// lib/types/public-events.ts
export type EventCategory = "웨비나" | "오프라인 행사" | "프로모션" | "얼리버드" | "파트너십"
export type EventStatus = "진행 중" | "예정" | "마감"

export interface PublicEvent {
  id: string
  title: string
  description: string | null
  category: EventCategory
  tag: string | null
  startsAt: string       // ISO datetime string
  endsAt: string | null
  location: string | null
  ctaLabel: string
  ctaHref: string | null
  imagePath: string | null
  imageUrl: string | null  // Supabase Storage public URL (computed)
  highlight: boolean
  statusOverride: EventStatus | null
  status: EventStatus    // computed from dates or statusOverride
  createdAt: string
  updatedAt: string
}

export type PublicEventInsert = {
  title: string
  description?: string | null
  category: EventCategory
  tag?: string | null
  startsAt: string
  endsAt?: string | null
  location?: string | null
  ctaLabel?: string
  ctaHref?: string | null
  imagePath?: string | null
  highlight?: boolean
  statusOverride?: EventStatus | null
}

export type PublicEventUpdate = Partial<PublicEventInsert>

export const EVENT_CATEGORIES: EventCategory[] = [
  "웨비나", "오프라인 행사", "프로모션", "얼리버드", "파트너십"
]
```

- [ ] **Step 2: ESLint 통과 확인**

```bash
npx eslint lib/types/public-events.ts --max-warnings=0
```

Expected: 오류 없음

- [ ] **Step 3: Commit**

```bash
git add lib/types/public-events.ts
git commit -m "feat(events): add shared PublicEvent types"
```

---

### Task 2: Supabase 마이그레이션

**Files:**
- Create: `supabase/migrations/20260420_public_events.sql`

- [ ] **Step 1: 마이그레이션 파일 생성**

```sql
-- public_events: 공개 웹사이트 /events 탭에 표시되는 행사 정보
create table if not exists public.public_events (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  category         text not null check (category in ('웨비나', '오프라인 행사', '프로모션', '얼리버드', '파트너십')),
  tag              text,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  location         text,
  cta_label        text not null default '자세히 보기',
  cta_href         text,
  image_path       text,
  highlight        boolean not null default false,
  status_override  text check (status_override in ('진행 중', '예정', '마감')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.public_events is '공개 웹사이트 /events 탭에 표시되는 행사 정보';
comment on column public.public_events.status_override is 'NULL이면 starts_at/ends_at 기준 자동 계산, 값이 있으면 우선 적용';
comment on column public.public_events.image_path is 'Supabase Storage event-images 버킷 내 경로';

-- RLS 활성화 (anon은 SELECT만, admin 작업은 service role 클라이언트 사용)
alter table public.public_events enable row level security;

create policy "Anyone can view public events"
  on public.public_events for select
  using (true);

-- updated_at 자동 갱신
create or replace function public.public_events_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger public_events_updated_at
  before update on public.public_events
  for each row execute function public.public_events_touch_updated_at();

-- 인덱스
create index if not exists public_events_starts_at_idx on public.public_events (starts_at desc);
create index if not exists public_events_category_idx on public.public_events (category);

-- Supabase Storage 버킷 (public read)
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

create policy "Public read event images"
  on storage.objects for select
  using (bucket_id = 'event-images');

create policy "Service role manage event images"
  on storage.objects for all
  to service_role
  using (bucket_id = 'event-images');
```

- [ ] **Step 2: Supabase에 마이그레이션 적용**

Supabase 대시보드 SQL Editor에서 위 SQL을 실행하거나:

```bash
# supabase CLI가 설정된 경우
supabase db push
```

실행 후 `public_events` 테이블과 `event-images` 버킷이 생성됐는지 Supabase 대시보드에서 확인.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260420_public_events.sql
git commit -m "feat(events): add public_events table and event-images storage bucket"
```

---

### Task 3: Repository Layer

**Files:**
- Create: `lib/repositories/public-events.ts`

- [ ] **Step 1: Repository 파일 생성**

```typescript
// lib/repositories/public-events.ts
"server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type {
  EventCategory,
  EventStatus,
  PublicEvent,
  PublicEventInsert,
  PublicEventUpdate,
} from "@/lib/types/public-events"

interface PublicEventRow {
  id: string
  title: string
  description: string | null
  category: string
  tag: string | null
  starts_at: string
  ends_at: string | null
  location: string | null
  cta_label: string
  cta_href: string | null
  image_path: string | null
  highlight: boolean
  status_override: string | null
  created_at: string
  updated_at: string
}

function computeStatus(row: PublicEventRow): EventStatus {
  if (row.status_override) return row.status_override as EventStatus
  const now = new Date()
  if (now < new Date(row.starts_at)) return "예정"
  if (!row.ends_at || now <= new Date(row.ends_at)) return "진행 중"
  return "마감"
}

function getImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null
  const supabase = createSupabaseAdminClient()
  const { data } = supabase.storage.from("event-images").getPublicUrl(imagePath)
  return data.publicUrl
}

function rowToEvent(row: PublicEventRow): PublicEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as EventCategory,
    tag: row.tag,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    imagePath: row.image_path,
    imageUrl: getImageUrl(row.image_path),
    highlight: row.highlight,
    statusOverride: row.status_override as EventStatus | null,
    status: computeStatus(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listPublicEvents(): Promise<PublicEvent[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("public_events")
    .select("*")
    .order("starts_at", { ascending: false })
  if (error) throw error
  return (data as PublicEventRow[]).map(rowToEvent)
}

export async function getAllEventsForAdmin(): Promise<PublicEvent[]> {
  return listPublicEvents()
}

export async function createPublicEvent(input: PublicEventInsert): Promise<PublicEvent> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("public_events")
    .insert({
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      tag: input.tag ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      location: input.location ?? null,
      cta_label: input.ctaLabel ?? "자세히 보기",
      cta_href: input.ctaHref ?? null,
      image_path: input.imagePath ?? null,
      highlight: input.highlight ?? false,
      status_override: input.statusOverride ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return rowToEvent(data as PublicEventRow)
}

export async function updatePublicEvent(
  id: string,
  patch: PublicEventUpdate
): Promise<PublicEvent | null> {
  const supabase = createSupabaseAdminClient()
  const dbPatch: Record<string, unknown> = {}
  if (patch.title !== undefined) dbPatch.title = patch.title
  if (patch.description !== undefined) dbPatch.description = patch.description
  if (patch.category !== undefined) dbPatch.category = patch.category
  if (patch.tag !== undefined) dbPatch.tag = patch.tag
  if (patch.startsAt !== undefined) dbPatch.starts_at = patch.startsAt
  if (patch.endsAt !== undefined) dbPatch.ends_at = patch.endsAt
  if (patch.location !== undefined) dbPatch.location = patch.location
  if (patch.ctaLabel !== undefined) dbPatch.cta_label = patch.ctaLabel
  if (patch.ctaHref !== undefined) dbPatch.cta_href = patch.ctaHref
  if (patch.imagePath !== undefined) dbPatch.image_path = patch.imagePath
  if (patch.highlight !== undefined) dbPatch.highlight = patch.highlight
  if (patch.statusOverride !== undefined) dbPatch.status_override = patch.statusOverride

  const { data, error } = await supabase
    .from("public_events")
    .update(dbPatch)
    .eq("id", id)
    .select()
    .single()
  if (error) {
    if (error.code === "PGRST116") return null
    throw error
  }
  return rowToEvent(data as PublicEventRow)
}

export async function deletePublicEvent(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from("public_events").delete().eq("id", id)
  if (error) throw error
}
```

- [ ] **Step 2: ESLint 확인**

```bash
npx eslint lib/repositories/public-events.ts --max-warnings=0
```

Expected: 오류 없음

- [ ] **Step 3: Commit**

```bash
git add lib/repositories/public-events.ts
git commit -m "feat(events): add public-events repository with Supabase CRUD"
```

---

### Task 4: Public API Route

**Files:**
- Create: `app/api/events/route.ts`

- [ ] **Step 1: 공개 GET 라우트 생성**

```typescript
// app/api/events/route.ts
import { NextResponse } from "next/server"
import { listPublicEvents } from "@/lib/repositories/public-events"

export async function GET() {
  try {
    const events = await listPublicEvents()
    return NextResponse.json(events)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "행사 목록 조회에 실패했습니다." },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: ESLint 확인**

```bash
npx eslint app/api/events/route.ts --max-warnings=0
```

- [ ] **Step 3: Commit**

```bash
git add app/api/events/route.ts
git commit -m "feat(events): add public GET /api/events endpoint"
```

---

### Task 5: Admin API Routes (GET/POST + PATCH/DELETE + Upload)

**Files:**
- Create: `app/api/admin/events/route.ts`
- Create: `app/api/admin/events/[id]/route.ts`
- Create: `app/api/admin/events/upload/route.ts`

- [ ] **Step 1: admin GET/POST 라우트 생성**

```typescript
// app/api/admin/events/route.ts
import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getAllEventsForAdmin, createPublicEvent } from "@/lib/repositories/public-events"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  try {
    const events = await getAllEventsForAdmin()
    return NextResponse.json(events)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "행사 목록 조회에 실패했습니다." },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  try {
    const body = await req.json()
    if (!body.title || !body.category || !body.startsAt) {
      return NextResponse.json(
        { error: "title, category, startsAt은 필수입니다." },
        { status: 400 }
      )
    }
    const event = await createPublicEvent(body)
    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "행사 생성에 실패했습니다." },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: admin PATCH/DELETE 라우트 생성**

```typescript
// app/api/admin/events/[id]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { updatePublicEvent, deletePublicEvent } from "@/lib/repositories/public-events"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  try {
    const patch = await req.json()
    const updated = await updatePublicEvent(id, patch)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "행사 수정에 실패했습니다." },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err
  const { id } = await params
  try {
    await deletePublicEvent(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "행사 삭제에 실패했습니다." },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: 이미지 업로드 라우트 생성**

```typescript
// app/api/admin/events/upload/route.ts
import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ error: "file은 필수입니다." }, { status: 400 })
    }
    const supabase = createSupabaseAdminClient()
    const ext = file.name.split(".").pop() ?? "jpg"
    const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const buffer = await file.arrayBuffer()
    const { error } = await supabase.storage
      .from("event-images")
      .upload(storagePath, buffer, { contentType: file.type, upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from("event-images").getPublicUrl(storagePath)
    return NextResponse.json({ path: storagePath, url: data.publicUrl })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "이미지 업로드에 실패했습니다." },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 4: ESLint 확인**

```bash
npx eslint app/api/admin/events/ --max-warnings=0
```

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/events/
git commit -m "feat(events): add admin CRUD and image upload API routes"
```

---

### Task 6: Admin Sidebar 메뉴 추가

**Files:**
- Modify: `components/admin/AdminSidebar.tsx`

- [ ] **Step 1: Globe import 추가 및 NAV 항목 추가**

`components/admin/AdminSidebar.tsx` 의 import 블록에 `Globe` 추가:

```typescript
// 기존 import (7~25번 줄) 에서 아래처럼 Globe 추가
import {
  BarChart2,
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Code2,
  FileText,
  Globe,          // ← 추가
  Handshake,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Settings,
  SquareChevronLeft,
  SquareChevronRight,
  Ticket,
  UserCog,
  Users,
} from "lucide-react"
```

NAV 배열에서 `/admin/calendar` 항목 바로 뒤에 추가:

```typescript
// 기존 (52번 줄)
{ href: "/admin/calendar", label: "캘린더", icon: <CalendarDays className="h-4 w-4" />, roles: [...ALL_STAFF, "BRANCH"], section: "workspace" },
// 아래 줄 추가
{ href: "/admin/events", label: "공개 행사", icon: <Globe className="h-4 w-4" />, roles: STAFF_ADMIN, section: "workspace" },
```

- [ ] **Step 2: ESLint 확인**

```bash
npx eslint components/admin/AdminSidebar.tsx --max-warnings=0
```

- [ ] **Step 3: Commit**

```bash
git add components/admin/AdminSidebar.tsx
git commit -m "feat(events): add 공개 행사 menu item to admin sidebar"
```

---

### Task 7: Admin Events 페이지

**Files:**
- Create: `app/admin/events/page.tsx`

- [ ] **Step 1: 페이지 파일 생성**

```typescript
// app/admin/events/page.tsx
"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Image from "next/image"
import { Plus, Pencil, Trash2, X, Upload, ImageIcon } from "lucide-react"
import { getToken } from "@/lib/admin-client"
import type { PublicEvent, EventCategory, EventStatus } from "@/lib/types/public-events"
import { EVENT_CATEGORIES } from "@/lib/types/public-events"

// ─── helpers ──────────────────────────────────────────────────────────────────

function adminFetch(url: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...options?.headers,
    },
  })
}

function adminUpload(url: string, formData: FormData) {
  return fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  })
}

function toLocalDatetime(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toISOString().slice(0, 16)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}`
}

// ─── types ────────────────────────────────────────────────────────────────────

type StatusOverrideOption = "auto" | EventStatus

interface FormState {
  title: string
  description: string
  category: EventCategory
  tag: string
  startsAt: string
  endsAt: string
  location: string
  ctaLabel: string
  ctaHref: string
  highlight: boolean
  statusOverride: StatusOverrideOption
}

const DEFAULT_FORM: FormState = {
  title: "",
  description: "",
  category: "프로모션",
  tag: "",
  startsAt: "",
  endsAt: "",
  location: "",
  ctaLabel: "자세히 보기",
  ctaHref: "",
  highlight: false,
  statusOverride: "auto",
}

function eventToForm(event: PublicEvent): FormState {
  return {
    title: event.title,
    description: event.description ?? "",
    category: event.category,
    tag: event.tag ?? "",
    startsAt: toLocalDatetime(event.startsAt),
    endsAt: toLocalDatetime(event.endsAt),
    location: event.location ?? "",
    ctaLabel: event.ctaLabel,
    ctaHref: event.ctaHref ?? "",
    highlight: event.highlight,
    statusOverride: event.statusOverride ?? "auto",
  }
}

// ─── status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: EventStatus }) {
  const styles: Record<EventStatus, string> = {
    "진행 중": "bg-emerald-50 text-emerald-700 border border-emerald-200",
    "예정": "bg-blue-50 text-blue-700 border border-blue-200",
    "마감": "bg-gray-50 text-gray-400 border border-gray-200",
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${styles[status]}`}>
      {status}
    </span>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function AdminEventsPage() {
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<PublicEvent | null>(null)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ── fetch ──────────────────────────────────────────────────────────────────

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminFetch("/api/admin/events")
      if (!res.ok) throw new Error(await res.text())
      setEvents(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // ── modal helpers ──────────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null)
    setForm(DEFAULT_FORM)
    setImageFile(null)
    setImagePreview(null)
    setSaveError(null)
    setModalOpen(true)
  }

  function openEdit(event: PublicEvent) {
    setEditing(event)
    setForm(eventToForm(event))
    setImageFile(null)
    setImagePreview(event.imageUrl)
    setSaveError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    setImageFile(null)
    setImagePreview(null)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  // ── save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.title || !form.category || !form.startsAt) {
      setSaveError("제목, 카테고리, 시작일시는 필수입니다.")
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      let imagePath: string | undefined = editing?.imagePath ?? undefined

      // 이미지 업로드
      if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        const uploadRes = await adminUpload("/api/admin/events/upload", fd)
        if (!uploadRes.ok) throw new Error("이미지 업로드 실패")
        const uploadData = await uploadRes.json() as { path: string }
        imagePath = uploadData.path
      }

      const payload = {
        title: form.title,
        description: form.description || null,
        category: form.category,
        tag: form.tag || null,
        startsAt: form.startsAt,
        endsAt: form.endsAt || null,
        location: form.location || null,
        ctaLabel: form.ctaLabel || "자세히 보기",
        ctaHref: form.ctaHref || null,
        imagePath: imagePath ?? null,
        highlight: form.highlight,
        statusOverride: form.statusOverride === "auto" ? null : form.statusOverride,
      }

      if (editing) {
        const res = await adminFetch(`/api/admin/events/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(await res.text())
      } else {
        const res = await adminFetch("/api/admin/events", {
          method: "POST",
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(await res.text())
      }

      closeModal()
      await fetchEvents()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setSaving(false)
    }
  }

  // ── delete ─────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!window.confirm("이 행사를 삭제하시겠습니까?")) return
    setDeletingId(id)
    try {
      const res = await adminFetch(`/api/admin/events/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error(await res.text())
      await fetchEvents()
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패")
    } finally {
      setDeletingId(null)
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#111110]">공개 행사 관리</h1>
          <p className="text-[13px] text-[#1a1a1a]/40 mt-0.5">/events 페이지에 표시되는 행사를 등록·수정합니다.</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-[#111110] text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          행사 추가
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 text-[13px] rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-[13px] text-[#1a1a1a]/30">불러오는 중...</div>
      ) : events.length === 0 ? (
        <div className="py-16 text-center text-[13px] text-[#1a1a1a]/30">
          등록된 행사가 없습니다. 행사 추가 버튼을 눌러 시작하세요.
        </div>
      ) : (
        <div className="border border-[rgba(0,0,0,0.08)] rounded-xl overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-[#F6F5F4] text-[#1a1a1a]/50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">제목</th>
                <th className="px-4 py-3 font-medium">카테고리</th>
                <th className="px-4 py-3 font-medium">기간</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">Highlight</th>
                <th className="px-4 py-3 font-medium w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(0,0,0,0.06)]">
              {events.map((event) => (
                <tr key={event.id} className="bg-white hover:bg-[#F6F5F4]/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-[#111110] line-clamp-1">{event.title}</span>
                  </td>
                  <td className="px-4 py-3 text-[#1a1a1a]/50">{event.category}</td>
                  <td className="px-4 py-3 text-[#1a1a1a]/50">
                    {formatDate(event.startsAt)}
                    {event.endsAt ? ` ~ ${formatDate(event.endsAt)}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={event.status} />
                  </td>
                  <td className="px-4 py-3">
                    {event.highlight ? (
                      <span className="text-emerald-600 font-medium">ON</span>
                    ) : (
                      <span className="text-[#1a1a1a]/25">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(event)}
                        className="p-1.5 text-[#1a1a1a]/40 hover:text-[#111110] transition-colors"
                        title="수정"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(event.id)}
                        disabled={deletingId === event.id}
                        className="p-1.5 text-[#1a1a1a]/40 hover:text-red-600 transition-colors disabled:opacity-30"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(0,0,0,0.08)]">
              <h2 className="text-base font-semibold text-[#111110]">
                {editing ? "행사 수정" : "행사 추가"}
              </h2>
              <button onClick={closeModal} className="text-[#1a1a1a]/40 hover:text-[#111110]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4">
              {saveError && (
                <div className="px-4 py-3 bg-red-50 text-red-700 text-[13px] rounded-lg border border-red-200">
                  {saveError}
                </div>
              )}

              {/* 제목 */}
              <div>
                <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">제목 *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="행사 제목"
                  className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
                />
              </div>

              {/* 카테고리 + 태그 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">카테고리 *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as EventCategory })}
                    className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30 bg-white"
                  >
                    {EVENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">태그</label>
                  <input
                    type="text"
                    value={form.tag}
                    onChange={(e) => setForm({ ...form, tag: e.target.value })}
                    placeholder="예: HOT, 한정 100개"
                    className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
                  />
                </div>
              </div>

              {/* 설명 */}
              <div>
                <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">설명</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="행사 상세 설명"
                  rows={3}
                  className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30 resize-none"
                />
              </div>

              {/* 시작일시 + 종료일시 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">시작일시 *</label>
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                    className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">종료일시</label>
                  <input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                    className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
                  />
                </div>
              </div>

              {/* 장소 */}
              <div>
                <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">장소</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="예: 온라인 (Zoom), COEX 서울"
                  className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
                />
              </div>

              {/* CTA */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">CTA 버튼 텍스트</label>
                  <input
                    type="text"
                    value={form.ctaLabel}
                    onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
                    placeholder="자세히 보기"
                    className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">CTA URL</label>
                  <input
                    type="text"
                    value={form.ctaHref}
                    onChange={(e) => setForm({ ...form, ctaHref: e.target.value })}
                    placeholder="/contact"
                    className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30"
                  />
                </div>
              </div>

              {/* 이미지 업로드 */}
              <div>
                <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">포스터 이미지</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative border-2 border-dashed border-[rgba(0,0,0,0.12)] rounded-xl overflow-hidden cursor-pointer hover:border-[#111110]/20 transition-colors"
                  style={{ minHeight: 120 }}
                >
                  {imagePreview ? (
                    <div className="relative w-full h-40">
                      <Image
                        src={imagePreview}
                        alt="미리보기"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <Upload className="w-6 h-6 text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[120px] gap-2 text-[#1a1a1a]/30">
                      <ImageIcon className="w-8 h-8" />
                      <span className="text-[12px]">클릭하여 이미지 업로드</span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Highlight + 상태 override */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.highlight}
                    onClick={() => setForm({ ...form, highlight: !form.highlight })}
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      form.highlight ? "bg-emerald-500" : "bg-[#e0e0dc]"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        form.highlight ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span className="text-[13px] text-[#1a1a1a]/60">대표 노출 (Highlight)</span>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[#1a1a1a]/50 mb-1.5">상태 설정</label>
                  <select
                    value={form.statusOverride}
                    onChange={(e) => setForm({ ...form, statusOverride: e.target.value as StatusOverrideOption })}
                    className="w-full px-3 py-2 border border-[rgba(0,0,0,0.12)] rounded-lg text-[13px] focus:outline-none focus:border-[#111110]/30 bg-white"
                  >
                    <option value="auto">자동 (날짜 기준)</option>
                    <option value="진행 중">진행 중</option>
                    <option value="예정">예정</option>
                    <option value="마감">마감</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[rgba(0,0,0,0.08)]">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-[13px] text-[#1a1a1a]/50 hover:text-[#111110] transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-[#111110] text-white text-[13px] font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40"
              >
                {saving ? "저장 중..." : editing ? "수정 완료" : "행사 등록"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: ESLint 확인**

```bash
npx eslint app/admin/events/page.tsx --max-warnings=0
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/events/page.tsx
git commit -m "feat(events): add admin events CRUD page with image upload modal"
```

---

### Task 8: Admin Calendar 연동

**Files:**
- Modify: `lib/calendar-data.ts`

`lib/calendar-data.ts` 에서 두 곳을 수정한다.

- [ ] **Step 1: EventSource 타입에 "event" 추가**

```typescript
// 기존 (19번 줄)
export type EventSource = "calendar" | "partner"
// 변경
export type EventSource = "calendar" | "partner" | "event"
```

- [ ] **Step 2: getPublicEventsAsCalendarEvents 함수 추가**

`getAllEvents` 함수 바로 위에 추가:

```typescript
// ─── public events → CalendarEvent 변환 ───────────────────────────────────────

interface PublicEventCalendarRow {
  id: string
  title: string
  starts_at: string
  ends_at: string | null
  created_at: string
  updated_at: string
}

async function getPublicEventsAsCalendarEvents(): Promise<CalendarEvent[]> {
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from("public_events")
      .select("id, title, starts_at, ends_at, created_at, updated_at")
      .order("starts_at")
    if (error) return []
    return (data as PublicEventCalendarRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      date: row.starts_at.slice(0, 10),
      endDate: row.ends_at ? row.ends_at.slice(0, 10) : undefined,
      type: "launch" as EventType,
      source: "event" as EventSource,
      sourceLabel: "공개 행사",
      readonly: true,
      href: "/admin/events",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  } catch {
    return []
  }
}
```

- [ ] **Step 3: getAllEvents와 getEventsByMonth에 public events 병합**

```typescript
// 기존 getAllEvents (370번 줄 부근)
export async function getAllEvents(): Promise<CalendarEvent[]> {
  const [partnerEvents] = await Promise.all([getPartnerCalendarEvents()])
  return [...getStoredEvents(), ...partnerEvents].sort(compareEvents)
}

// 변경
export async function getAllEvents(): Promise<CalendarEvent[]> {
  const [partnerEvents, publicEvents] = await Promise.all([
    getPartnerCalendarEvents(),
    getPublicEventsAsCalendarEvents(),
  ])
  return [...getStoredEvents(), ...partnerEvents, ...publicEvents].sort(compareEvents)
}
```

```typescript
// 기존 getEventsByMonth (375번 줄 부근)
export async function getEventsByMonth(year: number, month: number): Promise<CalendarEvent[]> {
  const [partnerEvents] = await Promise.all([getPartnerCalendarEvents({ year, month })])
  const prefix = `${year}-${String(month).padStart(2, "0")}`
  return [...getStoredEvents(), ...partnerEvents]
    .filter((event) => isEventVisibleInMonth(event, year, month) || event.date.startsWith(prefix))
    .sort(compareEvents)
}

// 변경
export async function getEventsByMonth(year: number, month: number): Promise<CalendarEvent[]> {
  const [partnerEvents, publicEvents] = await Promise.all([
    getPartnerCalendarEvents({ year, month }),
    getPublicEventsAsCalendarEvents(),
  ])
  const prefix = `${year}-${String(month).padStart(2, "0")}`
  return [...getStoredEvents(), ...partnerEvents, ...publicEvents]
    .filter((event) => isEventVisibleInMonth(event, year, month) || event.date.startsWith(prefix))
    .sort(compareEvents)
}
```

- [ ] **Step 4: ESLint 확인**

```bash
npx eslint lib/calendar-data.ts --max-warnings=0
```

- [ ] **Step 5: Commit**

```bash
git add lib/calendar-data.ts
git commit -m "feat(events): merge public_events into admin calendar as source:event"
```

---

### Task 9: 공개 /events 페이지 리팩터

**Files:**
- Create: `app/events/EventsClient.tsx`
- Modify: `app/events/page.tsx`

- [ ] **Step 1: EventsClient.tsx 생성**

현재 `app/events/page.tsx`의 UI 로직(StatusBadge, EventsPage 컴포넌트, 필터/검색)을 분리해 새 파일로 만든다. `EventItem` 타입 대신 `PublicEvent`를 사용하고 필드명을 맞춘다.

```typescript
// app/events/EventsClient.tsx
"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Calendar, MapPin, Tag, ArrowRight, Search, ExternalLink } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type { PublicEvent, EventStatus } from "@/lib/types/public-events"

const CATEGORIES = ["전체", "웨비나", "오프라인 행사", "프로모션", "얼리버드", "파트너십"] as const

function formatKoreanDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}`
}

function StatusBadge({ status }: { status: EventStatus }) {
  const styles: Record<EventStatus, string> = {
    "진행 중": "bg-emerald-50 text-emerald-700 border border-emerald-200",
    "예정": "bg-[#ECFDF5] text-[#084734] border border-[#D1FAE5]",
    "마감": "bg-[#f0f0ec] text-[#1a1a1a]/40 border border-[#e8e8e4]",
  }
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${styles[status]}`}>
      {status}
    </span>
  )
}

export default function EventsClient({ events }: { events: PublicEvent[] }) {
  const [activeCategory, setActiveCategory] = useState("전체")
  const [searchQuery, setSearchQuery] = useState("")
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = activeCategory === "전체"
      ? events
      : events.filter((e) => e.category === activeCategory)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.description ?? "").toLowerCase().includes(q)
      )
    }
    return list
  }, [activeCategory, searchQuery, events])

  const highlighted = filtered.filter((e) => e.highlight)
  const rest = filtered.filter((e) => !e.highlight)
  const isAnyHovered = hoveredId !== null

  const activeCount = events.filter((e) => e.status === "진행 중").length
  const upcomingCount = events.filter((e) => e.status === "예정").length

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#1a1a1a] selection:bg-emerald-100 selection:text-emerald-900">

      {/* Hero */}
      <section className="relative pt-32 md:pt-40 pb-6 px-6">
        <div className="max-w-[1100px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-8 lg:gap-12 items-center">

            {/* Left */}
            <div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="text-[13px] font-medium text-[#1a1a1a]/35 tracking-wide uppercase mb-5"
              >
                Events &amp; Promotions
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.05 }}
                className="text-[2.5rem] md:text-[3.5rem] lg:text-[4rem] font-extrabold leading-[1.05] tracking-[-0.035em] text-[#111110] mb-5"
              >
                행사 &amp;<br />프로모션
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-[15px] md:text-[16px] text-[#1a1a1a]/45 max-w-sm leading-relaxed mb-8"
              >
                클래스인의 최신 이벤트, 웨비나, 특가 프로모션을 한눈에 확인하세요.
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="flex items-center gap-6 text-[13px] text-[#1a1a1a]/30"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  진행 중 {activeCount}건
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#084734]" />
                  예정 {upcomingCount}건
                </span>
              </motion.div>
            </div>

            {/* Right: Featured */}
            {highlighted.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.15 }}
              >
                {(() => {
                  const event = highlighted[0]
                  return (
                    <div className="relative rounded-2xl overflow-hidden text-white min-h-[340px] md:min-h-[400px]">
                      {event.imageUrl ? (
                        <Image
                          src={event.imageUrl}
                          alt={event.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 to-[#084734]" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
                      <div className="relative z-10 p-8 md:p-10 flex flex-col h-full min-h-[340px] md:min-h-[400px]">
                        <div className="flex items-center gap-2.5 mb-auto">
                          <StatusBadge status={event.status} />
                        </div>
                        <div className="mt-auto">
                          <span className="text-[11px] text-white/40 uppercase tracking-wider mb-2 block">
                            {event.category}
                          </span>
                          <h2 className="text-2xl md:text-[1.75rem] font-bold leading-snug tracking-[-0.02em] mb-3">
                            {event.title}
                          </h2>
                          <p className="text-[13px] text-white/55 leading-relaxed mb-5 line-clamp-2">
                            {event.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-4 text-[12px] text-white/40 mb-6">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              {formatKoreanDate(event.startsAt)}
                              {event.endsAt ? ` ~ ${formatKoreanDate(event.endsAt)}` : ""}
                            </span>
                            {event.location && (
                              <span className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5" />
                                {event.location}
                              </span>
                            )}
                          </div>
                          {event.ctaHref && (
                            <Link
                              href={event.ctaHref}
                              className="inline-flex items-center gap-2 bg-white text-[#111110] text-[13px] font-semibold px-6 py-2.5 rounded-lg hover:bg-emerald-50 transition-colors duration-200 shadow-lg"
                            >
                              {event.ctaLabel}
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="max-w-[1100px] mx-auto px-6 mt-6 mb-2">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-[#e8e8e4]"
        >
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-[#111110] text-white"
                      : "text-[#1a1a1a]/40 hover:text-[#1a1a1a]/70 hover:bg-[#f0f0ec]"
                  }`}
                >
                  {cat}
                </button>
              )
            })}
          </div>
          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1a1a1a]/20" />
            <input
              type="text"
              placeholder="검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-52 pl-9 pr-3 py-2 bg-transparent border border-[#e8e8e4] rounded-lg text-[13px] text-[#1a1a1a] placeholder:text-[#1a1a1a]/25 focus:outline-none focus:border-[#1a1a1a]/20 transition-colors"
            />
          </div>
        </motion.div>
        <div className="flex items-center justify-between pt-4 pb-2">
          <span className="text-[12px] text-[#1a1a1a]/30 font-medium">
            {rest.length}개의 행사·프로모션
          </span>
          <span className="text-[12px] text-[#1a1a1a]/25">최신순</span>
        </div>
      </section>

      {/* Event List */}
      <section className="max-w-[1100px] mx-auto px-6 pb-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory + searchQuery}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {rest.map((event, index) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <article
                  className="grid grid-cols-1 md:grid-cols-[160px_1fr_120px_160px] gap-4 md:gap-6 py-6 border-b border-[#ebebea] transition-opacity duration-300"
                  style={{
                    opacity: isAnyHovered ? (hoveredId === event.id ? 1 : 0.3) : 1,
                  }}
                  onMouseEnter={() => setHoveredId(event.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="flex md:flex-col gap-2 md:gap-2 md:pt-0.5">
                    <span className="text-[12px] font-medium text-[#1a1a1a]/40">{event.category}</span>
                    <StatusBadge status={event.status} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <h2 className="text-[17px] md:text-[19px] font-semibold leading-snug tracking-[-0.015em] text-[#111110]">
                      {event.title}
                    </h2>
                    <p className="text-[13px] text-[#1a1a1a]/38 leading-relaxed line-clamp-2">
                      {event.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      <span className="text-[11px] text-[#1a1a1a]/30 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatKoreanDate(event.startsAt)}
                        {event.endsAt ? ` ~ ${formatKoreanDate(event.endsAt)}` : ""}
                      </span>
                      {event.location && (
                        <>
                          <span className="text-[#1a1a1a]/10">·</span>
                          <span className="text-[11px] text-[#1a1a1a]/30 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {event.location}
                          </span>
                        </>
                      )}
                      {event.tag && (
                        <>
                          <span className="text-[#1a1a1a]/10">·</span>
                          <span className="text-[11px] text-emerald-600/70 font-medium flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {event.tag}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {event.imageUrl ? (
                    <div className="hidden md:block relative w-full h-[110px] rounded-xl overflow-hidden bg-[#f0f0ec] shrink-0">
                      <Image
                        src={event.imageUrl}
                        alt={`${event.title} 포스터`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="hidden md:block" />
                  )}

                  <div className="flex md:flex-col md:items-end md:justify-center gap-3">
                    {event.ctaHref ? (
                      <Link
                        href={event.ctaHref}
                        className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg transition-colors duration-200 ${
                          event.status === "마감"
                            ? "bg-[#f0f0ec] text-[#1a1a1a]/30 cursor-not-allowed pointer-events-none"
                            : "bg-[#111110] text-white hover:bg-emerald-700"
                        }`}
                      >
                        {event.ctaLabel}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    ) : null}
                  </div>
                </article>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>

        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-28 text-center"
          >
            <div className="w-12 h-12 bg-[#f0f0ec] rounded-xl flex items-center justify-center mx-auto mb-4">
              <Search className="w-5 h-5 text-[#1a1a1a]/20" />
            </div>
            <h3 className="text-base font-semibold text-[#111110] mb-1">검색 결과가 없습니다</h3>
            <p className="text-[13px] text-[#1a1a1a]/30">다른 키워드나 카테고리를 선택해 보세요.</p>
          </motion.div>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: page.tsx를 Server Component로 교체**

`app/events/page.tsx` 전체를 아래로 교체한다 (기존 487줄 전부 삭제):

```typescript
// app/events/page.tsx
import { listPublicEvents } from "@/lib/repositories/public-events"
import EventsClient from "./EventsClient"

export const dynamic = "force-dynamic"

export default async function EventsPage() {
  let events = []
  try {
    events = await listPublicEvents()
  } catch {
    // DB 연결 실패 시 빈 목록으로 graceful degradation
    events = []
  }
  return <EventsClient events={events} />
}
```

- [ ] **Step 3: ESLint 확인**

```bash
npx eslint app/events/ --max-warnings=0
```

- [ ] **Step 4: Commit**

```bash
git add app/events/page.tsx app/events/EventsClient.tsx
git commit -m "feat(events): replace hardcoded dummy data with DB-backed server component"
```

---

### Task 10: 최종 검증

**Files:**
- (없음 — 빌드/린트만)

- [ ] **Step 1: ESLint 전체 통과**

```bash
npx eslint app components lib --max-warnings=0
```

Expected: 오류 0, 경고 0

- [ ] **Step 2: 빌드 통과**

```bash
npm run build
```

Expected: `✓ Compiled successfully` — 빌드 에러 없음

- [ ] **Step 3: 개발 서버에서 수동 검증**

```bash
npm run dev
```

체크리스트:
- [ ] `/events` → 빈 목록 또는 DB에 등록된 행사가 표시됨 (더미 데이터 없음)
- [ ] `/admin/events` → 행사 목록 테이블 로드
- [ ] 행사 추가 버튼 → 모달 오픈, 필드 입력 → 등록 후 목록에 반영
- [ ] 이미지 업로드 → 미리보기 표시 → 저장 후 `/events`에서 이미지 표시
- [ ] 행사 수정 → 기존 값 pre-fill → 저장 반영
- [ ] 행사 삭제 → confirm → 목록에서 제거
- [ ] `/admin/calendar` → 등록한 행사가 해당 날짜에 "launch" 색상으로 표시

- [ ] **Step 4: Final Commit**

```bash
git add -A
git commit -m "feat(events): complete public events feature — DB-backed /events page + admin CRUD + calendar integration"
```
