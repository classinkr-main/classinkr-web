"use client"

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react"
import { CalendarCheck, CircleAlert, FileUp, Info, Loader2, Pencil, Plus, Power, PowerOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { adminFetchJson } from "@/lib/admin-client"
import type { TeamContactImportPlan } from "@/lib/team-contacts/csv-import"
import {
  TEAM_CONTACT_LIMITS,
  TEAM_CONTACT_ORG_LABEL,
  type TeamContactAreaOptions,
  type TeamContactOrg,
  type TeamContactRecord,
} from "@/lib/team-contacts/model"

// 설정 › 담당자 표(2026-11-26) — internal_team_contacts 편집. 갈매봇·위컴 1:1 담당자 안내가 이 표의 1차·대리 담당을 쓴다.
// 읽기는 SUPER_ADMIN·ADMIN, 쓰기(추가·수정·비활성화·확인일·CSV 넣기)는 SUPER_ADMIN 만 — 버튼 숨김은 편의이고 경계는 API 다.

interface ListResponse {
  available: boolean
  warning: string | null
  rows: TeamContactRecord[]
  areas: TeamContactAreaOptions
  viewer: { canEdit: boolean }
}

interface ImportResponse {
  plan: TeamContactImportPlan
  result?: { created: number; updated: number; failed: Array<{ area: string; error: string }> }
}

interface FormState {
  id: string | null
  org: TeamContactOrg
  area: string
  role: string
  name: string
  deputy: string
  channel: string
  prep: string
  adminLink: string
  note: string
  confirmedAt: string
  sortOrder: string
}

type Notice = { tone: "ok" | "error"; text: string } | null

const API = "/api/admin/team-contacts"

function emptyForm(org: TeamContactOrg, area: string): FormState {
  return { id: null, org, area, role: "", name: "", deputy: "", channel: "", prep: "", adminLink: "", note: "", confirmedAt: "", sortOrder: "0" }
}

function formOf(row: TeamContactRecord): FormState {
  return {
    id: row.id,
    org: row.org,
    area: row.area,
    role: row.role ?? "",
    name: row.name ?? "",
    deputy: row.deputy ?? "",
    channel: row.channel ?? "",
    prep: row.prep.join(" · "),
    adminLink: row.adminLink ?? "",
    note: row.note ?? "",
    confirmedAt: row.confirmedAt ?? "",
    sortOrder: String(row.sortOrder),
  }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-[#111110]">{label}</span>
      {hint ? <span className="ml-1.5 text-[11px] text-[#1a1a1a]/40">{hint}</span> : null}
      <div className="mt-1">{children}</div>
    </label>
  )
}

const SELECT_CLASS =
  "h-10 w-full rounded-(--radius-control) border border-[#E5E5E0] bg-white px-3 text-[14px] text-[#111110] disabled:bg-[#F6F5F4] disabled:opacity-50"

export function TeamContactsPanel() {
  const [data, setData] = useState<ListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [org, setOrg] = useState<TeamContactOrg>("KR")
  const [showInactive, setShowInactive] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null)
  const [plan, setPlan] = useState<TeamContactImportPlan | null>(null)
  const [importBusy, setImportBusy] = useState<"preview" | "apply" | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setData(await adminFetchJson<ListResponse>(`${API}${showInactive ? "?inactive=1" : ""}`, { cache: "no-store" }))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "담당자 표를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [showInactive])

  useEffect(() => {
    void load()
  }, [load])

  const canEdit = data?.viewer.canEdit === true && data.available
  const areas = useMemo(() => data?.areas[org] ?? [], [data, org])
  const areaLabel = useMemo(() => new Map(areas.map((area) => [area.key, area])), [areas])
  const rows = (data?.rows ?? []).filter((row) => row.org === org)
  const activeAreas = new Set(rows.filter((row) => row.active).map((row) => row.area))
  const emptyAreas = org === "KR" ? areas.filter((area) => area.usedInAnswers && !activeAreas.has(area.key)) : []

  const startNew = (area?: string) => {
    const first = area ?? areas.find((option) => !activeAreas.has(option.key))?.key ?? areas[0]?.key ?? ""
    setForm(emptyForm(org, first))
    setNotice(null)
  }

  const save = async () => {
    if (!form) return
    setSaving(true)
    setNotice(null)
    const body = {
      ...(form.id ? {} : { org: form.org, area: form.area }),
      role: form.role,
      name: form.name,
      deputy: form.deputy,
      channel: form.channel,
      prep: form.prep,
      adminLink: form.adminLink,
      note: form.note,
      confirmedAt: form.confirmedAt,
      sortOrder: form.sortOrder,
    }
    try {
      await adminFetchJson(form.id ? `${API}/${form.id}` : API, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      setForm(null)
      setNotice({ tone: "ok", text: form.id ? "고쳤습니다." : "추가했습니다." })
      await load()
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "저장하지 못했습니다." })
    } finally {
      setSaving(false)
    }
  }

  const rowAction = async (row: TeamContactRecord, action: "confirm" | "activate" | "deactivate") => {
    setBusyId(row.id)
    setNotice(null)
    try {
      await adminFetchJson(`${API}/${row.id}`, {
        method: action === "deactivate" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        ...(action === "deactivate" ? {} : { body: JSON.stringify({ action }) }),
      })
      setNotice({ tone: "ok", text: action === "confirm" ? "오늘 날짜로 확인일을 찍었습니다." : action === "activate" ? "다시 켰습니다." : "비활성화했습니다." })
      await load()
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "처리하지 못했습니다." })
    } finally {
      setBusyId(null)
    }
  }

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    setPlan(null)
    setNotice(null)
    if (!file) return
    if (file.size > 200_000) {
      setNotice({ tone: "error", text: "CSV 가 너무 큽니다(200KB 이하)." })
      return
    }
    setCsv({ name: file.name, text: await file.text() })
  }

  const runImport = async (apply: boolean) => {
    if (!csv) return
    setImportBusy(apply ? "apply" : "preview")
    setNotice(null)
    try {
      const response = await adminFetchJson<ImportResponse>(`${API}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csv.text, apply }),
      })
      if (apply) {
        const result = response.result
        setPlan(null)
        setCsv(null)
        setNotice({
          tone: result && result.failed.length > 0 ? "error" : "ok",
          text: result
            ? `넣었습니다 — 새로 ${result.created}행, 고침 ${result.updated}행${result.failed.length ? `, 실패 ${result.failed.length}행(${result.failed.map((item) => item.area).join(", ")})` : ""}.`
            : "넣었습니다.",
        })
        setOrg("KR")
        await load()
      } else {
        setPlan(response.plan)
      }
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "CSV 를 처리하지 못했습니다." })
    } finally {
      setImportBusy(null)
    }
  }

  const writes = plan ? plan.counts.create + plan.counts.update : 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-[#111110]">담당자 표</h2>
        <p className="mt-1 text-[13px] text-[#1a1a1a]/45">
          갈매봇·위컴 1:1 의 담당자 안내가 업무 영역별 1차·대리 담당을 이 표에서 읽습니다(1분 안에 반영). 위컴 단체방에는 이름 없이 역할만 나갑니다.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl bg-[#f0f0ec] px-4 py-3.5 text-[13px] text-[#1a1a1a]/60">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1a1a1a]/40" />
        <p>
          연락 방법 칸에는 종류만 적습니다(예: 위컴 1:1, KR 운영방). 전화번호·이메일은 어느 칸에도 넣지 않습니다. 본사 행은 저장만 하고, 본사 안내는
          문서의 본사 담당 표를 그대로 씁니다.
        </p>
      </div>

      {data && !data.available && data.warning ? (
        <div className="rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">{data.warning}</div>
      ) : null}
      {loadError ? (
        <div role="alert" className="rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
          {loadError}
        </div>
      ) : null}
      {notice ? (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={
            notice.tone === "error"
              ? "rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]"
              : "rounded-xl border border-[#cfe9dc] bg-[#ECFDF5] px-3 py-2 text-[12px] text-[#084734]"
          }
        >
          {notice.text}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(TEAM_CONTACT_ORG_LABEL) as TeamContactOrg[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setOrg(key)
              setForm(null)
            }}
            aria-pressed={org === key}
            className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              org === key ? "border-[#111110] bg-[#111110] text-white" : "border-[#e8e8e4] bg-white text-[#1a1a1a]/65 hover:border-[#c8c8c4]"
            }`}
          >
            {TEAM_CONTACT_ORG_LABEL[key]}
          </button>
        ))}
        <label className="ml-1 inline-flex items-center gap-1.5 text-[12px] text-[#1a1a1a]/55">
          <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
          비활성 행도 보기
        </label>
        {canEdit ? (
          <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => startNew()} disabled={saving || areas.length === 0}>
            <Plus className="h-3.5 w-3.5" /> 행 추가
          </Button>
        ) : null}
      </div>

      {emptyAreas.length > 0 ? (
        <div className="rounded-xl border border-[#e8e8e4] bg-white px-4 py-3">
          <p className="text-[12px] font-semibold text-[#111110]">비어 있는 영역 {emptyAreas.length}곳</p>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">이 영역 질문은 역할·어드민 계정 권한으로만 답합니다.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {emptyAreas.map((area) =>
              canEdit ? (
                <button
                  key={area.key}
                  type="button"
                  onClick={() => startNew(area.key)}
                  className="rounded-md bg-[#fafaf8] px-2 py-1 text-[11px] font-medium text-[#1a1a1a]/60 hover:bg-[#f0f0ec]"
                >
                  {area.label} +
                </button>
              ) : (
                <span key={area.key} className="rounded-md bg-[#fafaf8] px-2 py-1 text-[11px] font-medium text-[#1a1a1a]/60">
                  {area.label}
                </span>
              )
            )}
          </div>
        </div>
      ) : null}

      {form ? (
        <div className="rounded-xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
          <p className="text-[13px] font-semibold text-[#111110]">
            {form.id ? "행 고치기" : `${TEAM_CONTACT_ORG_LABEL[form.org]} 행 추가`}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="업무 영역">
              <select
                className={SELECT_CLASS}
                value={form.area}
                disabled={Boolean(form.id)}
                onChange={(event) => setForm({ ...form, area: event.target.value })}
              >
                {areas.map((area) => (
                  <option key={area.key} value={area.key}>
                    {area.label}
                    {activeAreas.has(area.key) && area.key !== form.area ? " (활성 행 있음)" : ""}
                    {area.usedInAnswers ? "" : " — 안내에 쓰지 않음"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="역할" hint="예: BD 팀 매니저 — 사람 이름은 1차·대리 칸에만">
              <Input value={form.role} maxLength={TEAM_CONTACT_LIMITS.role} onChange={(event) => setForm({ ...form, role: event.target.value })} />
            </Field>
            <Field label="1차 담당">
              <Input value={form.name} maxLength={TEAM_CONTACT_LIMITS.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field label="대리 담당">
              <Input value={form.deputy} maxLength={TEAM_CONTACT_LIMITS.deputy} onChange={(event) => setForm({ ...form, deputy: event.target.value })} />
            </Field>
            <Field label="연락 방법" hint="종류만 — 번호·주소·사람 이름 없이">
              <Input value={form.channel} maxLength={TEAM_CONTACT_LIMITS.channel} onChange={(event) => setForm({ ...form, channel: event.target.value })} />
            </Field>
            <Field label="어드민 화면 링크" hint="/admin 으로 시작">
              <Input value={form.adminLink} maxLength={TEAM_CONTACT_LIMITS.adminLink} onChange={(event) => setForm({ ...form, adminLink: event.target.value })} />
            </Field>
            <Field label="준비물" hint="· 로 나눔">
              <Input value={form.prep} onChange={(event) => setForm({ ...form, prep: event.target.value })} />
            </Field>
            <Field label="확인일" hint="1차·대리를 바꾸면 새 날짜를 넣지 않는 한 비워집니다">
              <Input type="date" value={form.confirmedAt} onChange={(event) => setForm({ ...form, confirmedAt: event.target.value })} />
            </Field>
            <Field label="비고">
              <Input value={form.note} maxLength={TEAM_CONTACT_LIMITS.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
            </Field>
            <Field label="정렬 순서">
              <Input
                type="number"
                min={0}
                max={TEAM_CONTACT_LIMITS.sortOrderMax}
                value={form.sortOrder}
                onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setForm(null)} disabled={saving}>
              취소
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !form.area}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {saving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      ) : null}

      {loading && !data ? (
        <p className="text-[13px] text-[#1a1a1a]/30">불러오는 중...</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#e8e8e4] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e8e8e4] px-5 py-4">
            <h3 className="text-[13px] font-semibold text-[#111110]">{TEAM_CONTACT_ORG_LABEL[org]}</h3>
            <span className="ml-auto text-[12px] text-[#1a1a1a]/40">{rows.length}행</span>
          </div>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[#1a1a1a]/30">아직 채운 행이 없습니다.</p>
          ) : (
            <ul>
              {rows.map((row) => {
                const area = areaLabel.get(row.area)
                const busy = busyId === row.id
                return (
                  <li key={row.id} className="border-b border-[#e8e8e4] px-4 py-3.5 last:border-0 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-semibold text-[#111110]">{area?.label ?? row.area}</p>
                      {row.role ? <span className="rounded-full bg-[#fafaf8] px-2.5 py-1 text-[11px] font-medium text-[#1a1a1a]/60">{row.role}</span> : null}
                      {area && !area.usedInAnswers ? (
                        <span className="rounded-full bg-[#fafaf8] px-2.5 py-1 text-[11px] text-[#1a1a1a]/45">안내에 쓰지 않음</span>
                      ) : null}
                      {!row.active ? (
                        <span className="rounded-full bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-semibold text-[#B85C33]">비활성</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[12px] text-[#111110]">
                      1차 {row.name ?? "—"}
                      <span className="text-[#1a1a1a]/40"> · 대리 {row.deputy ?? "—"}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-medium text-[#1a1a1a]/45">
                      {row.channel ? <span className="rounded-md bg-[#fafaf8] px-2 py-1">연락 {row.channel}</span> : null}
                      {row.prep.length ? <span className="rounded-md bg-[#fafaf8] px-2 py-1">준비 {row.prep.join(" · ")}</span> : null}
                      {row.adminLink ? <span className="rounded-md bg-[#fafaf8] px-2 py-1">{row.adminLink}</span> : null}
                      <span className="rounded-md bg-[#fafaf8] px-2 py-1">
                        {row.confirmedAt ? `확인 ${row.confirmedAt}${row.confirmedBy ? ` · ${row.confirmedBy}` : ""}` : "확인일 없음"}
                      </span>
                    </div>
                    {row.note ? <p className="mt-1.5 text-[11px] text-[#1a1a1a]/45">{row.note}</p> : null}
                    {canEdit ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {row.active ? (
                          <>
                            <Button size="sm" variant="secondary" className="gap-1" disabled={busy} onClick={() => setForm(formOf(row))}>
                              <Pencil className="h-3.5 w-3.5" /> 수정
                            </Button>
                            <Button size="sm" variant="secondary" className="gap-1" disabled={busy} onClick={() => rowAction(row, "confirm")}>
                              <CalendarCheck className="h-3.5 w-3.5" /> 확인일 찍기
                            </Button>
                            <Button size="sm" variant="secondary" className="gap-1" disabled={busy} onClick={() => rowAction(row, "deactivate")}>
                              <PowerOff className="h-3.5 w-3.5" /> 비활성화
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="secondary" className="gap-1" disabled={busy} onClick={() => rowAction(row, "activate")}>
                            <Power className="h-3.5 w-3.5" /> 다시 켜기
                          </Button>
                        )}
                        {busy ? <Loader2 className="h-4 w-4 animate-spin self-center text-[#1a1a1a]/40" /> : null}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {canEdit ? (
        <div className="rounded-xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <FileUp className="h-4 w-4 text-[#1a1a1a]/40" />
            <p className="text-[13px] font-semibold text-[#111110]">CSV 가져오기(한국 지사)</p>
          </div>
          <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
            한국 담당표 양식(업무 영역·예시 질문·1차 담당 역할·1차 담당자·대리 담당자·연락 방법·준비해 갈 것·관련 어드민 화면 링크·비고·확인일)의 CSV 를
            올리면 미리보기를 보여 줍니다. 영역마다 있는 행은 고치고 없는 행은 만듭니다. CSV 의 빈 칸은 지금 값을 지우지 않습니다.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-[12px]" aria-label="담당표 CSV 파일" />
            {csv ? (
              <Button size="sm" variant="outline" onClick={() => runImport(false)} disabled={importBusy !== null}>
                {importBusy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                미리보기
              </Button>
            ) : null}
          </div>
          {plan ? (
            <div className="mt-4 space-y-3">
              <p className="text-[12px] text-[#111110]">
                새로 {plan.counts.create} · 고침 {plan.counts.update} · 그대로 {plan.counts.same} · 건너뜀 {plan.counts.skipped}
              </p>
              {plan.items.length > 0 ? (
                <ul className="divide-y divide-[#e8e8e4] rounded-lg border border-[#e8e8e4]">
                  {plan.items.map((item) => (
                    <li key={`${item.line}:${item.area}`} className="px-3 py-2 text-[12px]">
                      <span className="font-semibold text-[#111110]">{item.areaLabel}</span>
                      <span className="ml-2 text-[#1a1a1a]/50">
                        {item.action === "create" ? "새로 만듦" : item.action === "update" ? `고침(${item.changes.join(", ")})` : "그대로"}
                      </span>
                      <span className="ml-2 text-[#1a1a1a]/60">
                        1차 {item.input.name ?? "—"} · 대리 {item.input.deputy ?? "—"}
                        {item.input.channel ? ` · ${item.input.channel}` : ""}
                      </span>
                      {!item.usedInAnswers ? <span className="ml-2 text-[11px] text-[#1a1a1a]/40">안내에 쓰지 않음</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {plan.skipped.length > 0 || plan.notes.length > 0 ? (
                <ul className="space-y-1 rounded-lg bg-[#fafaf8] px-3 py-2 text-[11px] text-[#1a1a1a]/60">
                  {plan.skipped.map((skip) => (
                    <li key={`skip:${skip.line}`} className="flex gap-1.5">
                      <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-[#B85C33]" />
                      {skip.line}째 줄{skip.area ? `(${skip.area})` : ""} 건너뜀 — {skip.reason}
                    </li>
                  ))}
                  {plan.notes.map((note, index) => (
                    <li key={`note:${note.line}:${index}`} className="flex gap-1.5">
                      <Info className="mt-0.5 h-3 w-3 shrink-0 text-[#1a1a1a]/40" />
                      {note.line}째 줄 — {note.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setPlan(null)} disabled={importBusy !== null}>
                  취소
                </Button>
                <Button size="sm" onClick={() => runImport(true)} disabled={importBusy !== null || writes === 0}>
                  {importBusy === "apply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {writes > 0 ? `${writes}행 넣기` : "넣을 행 없음"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
