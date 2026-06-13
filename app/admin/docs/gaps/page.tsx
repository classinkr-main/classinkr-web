"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Sparkles, RefreshCw, ClipboardCopy, Check } from "lucide-react"
import { adminFetchJson } from "@/lib/admin-client"

interface GapCluster {
  id: string
  label: string
  question: string
  category: string | null
  sampleCount: number
  lastSeenAt: string
  status: string
}

interface ZeroResultSearch {
  query: string
  count: number
  lastSeenAt: string
}

interface Backlog {
  gapClusters: GapCluster[]
  zeroResultSearches: ZeroResultSearch[]
  warning?: string
}

interface DocDraft {
  title: string
  contentMarkdown: string
  suggestedCategory: string
  grounding: { title: string; urlPath: string }[]
}

interface EvalReport {
  total: number
  deterministic: {
    categoryMatchRate: number
    modeOkRate: number
    sourceRate: number
  }
  judge: {
    enabled: boolean
    judged: number
    faithfulRate: number | null
    hallucinationRate: number | null
    avgScore: number | null
  }
  failures: { id: string; flags: string[] }[]
}

function pct(value: number | null | undefined) {
  if (value == null) return "—"
  return `${Math.round(value * 100)}%`
}

export default function DocsGapsPage() {
  const [backlog, setBacklog] = useState<Backlog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [draftingKey, setDraftingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<DocDraft | null>(null)
  const [copied, setCopied] = useState(false)

  const [evalRunning, setEvalRunning] = useState(false)
  const [evalReport, setEvalReport] = useState<EvalReport | null>(null)

  const loadBacklog = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await adminFetchJson<Backlog>("/api/admin/docs/gaps")
      setBacklog(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "문서 보강 큐를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBacklog()
  }, [loadBacklog])

  const generateDraft = async (key: string, question: string) => {
    setDraftingKey(key)
    setDraft(null)
    setCopied(false)
    try {
      const data = await adminFetchJson<DocDraft>("/api/admin/docs/gaps/draft", {
        method: "POST",
        body: JSON.stringify({ question }),
      })
      setDraft(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "초안 생성에 실패했습니다.")
    } finally {
      setDraftingKey(null)
    }
  }

  const runEval = async () => {
    setEvalRunning(true)
    try {
      const data = await adminFetchJson<EvalReport>("/api/admin/chatbot/eval", {
        method: "POST",
        body: JSON.stringify({ judge: true }),
      })
      setEvalReport(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "품질 평가 실행에 실패했습니다.")
    } finally {
      setEvalRunning(false)
    }
  }

  const copyDraft = () => {
    if (!draft) return
    navigator.clipboard
      .writeText(`# ${draft.title}\n\n${draft.contentMarkdown}`)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 text-[#111110]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em]">문서 보강 큐</h1>
          <p className="mt-1.5 text-sm text-[#615D59]">
            매핑 문서가 없는 질문 클러스터와 결과 없는 검색어입니다. 초안을 생성해 검토 후 게시하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={loadBacklog}
          className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] px-3.5 py-2 text-sm font-medium text-[#615D59] transition-colors hover:text-[#084734]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          새로고침
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-[#FBEAE2] px-4 py-3 text-sm text-[#B85C33]">{error}</p>
      )}

      {/* 품질 평가 */}
      <section className="mt-6 rounded-[20px] border border-black/[0.08] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">챗봇 품질 평가</h2>
            <p className="mt-1 text-sm text-[#615D59]">골든셋을 실제 파이프라인에 돌려 baseline을 측정합니다.</p>
          </div>
          <button
            type="button"
            onClick={runEval}
            disabled={evalRunning}
            className="inline-flex items-center gap-2 rounded-full bg-[#084734] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-60"
          >
            {evalRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            평가 실행
          </button>
        </div>

        {evalReport && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="카테고리 적중" value={pct(evalReport.deterministic.categoryMatchRate)} />
            <Metric label="모드 적합" value={pct(evalReport.deterministic.modeOkRate)} />
            <Metric label="출처 확보" value={pct(evalReport.deterministic.sourceRate)} />
            <Metric
              label={evalReport.judge.enabled ? "근거 충실 (심판)" : "심판 비활성"}
              value={evalReport.judge.enabled ? pct(evalReport.judge.faithfulRate) : "—"}
            />
            {evalReport.judge.enabled && (
              <>
                <Metric label="환각" value={pct(evalReport.judge.hallucinationRate)} />
                <Metric
                  label="평균 점수"
                  value={evalReport.judge.avgScore != null ? `${evalReport.judge.avgScore.toFixed(2)}/5` : "—"}
                />
              </>
            )}
            <Metric label="케이스" value={`${evalReport.total}개`} />
          </div>
        )}
      </section>

      {loading ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-[#615D59]">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
        </p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* 무매핑 클러스터 */}
          <section>
            <h2 className="mb-3 text-base font-semibold">
              문서 없는 질문 <span className="text-[#615D59]">({backlog?.gapClusters.length ?? 0})</span>
            </h2>
            <ul className="space-y-2.5">
              {(backlog?.gapClusters ?? []).map((cluster) => (
                <li key={cluster.id} className="rounded-[16px] border border-black/[0.08] bg-white p-4">
                  <p className="text-sm font-medium text-[#111110]">{cluster.question}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-[#615D59]">
                    {cluster.category && <span>{cluster.category}</span>}
                    <span>샘플 {cluster.sampleCount}건</span>
                    <span>·</span>
                    <span>{cluster.status}</span>
                  </div>
                  <DraftButton
                    busy={draftingKey === `c:${cluster.id}`}
                    onClick={() => generateDraft(`c:${cluster.id}`, cluster.question)}
                  />
                </li>
              ))}
              {(backlog?.gapClusters.length ?? 0) === 0 && (
                <li className="text-sm text-[#615D59]">문서 없는 질문 클러스터가 없습니다.</li>
              )}
            </ul>
          </section>

          {/* zero-result 검색 */}
          <section>
            <h2 className="mb-3 text-base font-semibold">
              결과 없는 검색어 <span className="text-[#615D59]">({backlog?.zeroResultSearches.length ?? 0})</span>
            </h2>
            <ul className="space-y-2.5">
              {(backlog?.zeroResultSearches ?? []).map((search) => (
                <li key={search.query} className="rounded-[16px] border border-black/[0.08] bg-white p-4">
                  <p className="text-sm font-medium text-[#111110]">{search.query}</p>
                  <p className="mt-1.5 text-[12px] text-[#615D59]">검색 {search.count}회</p>
                  <DraftButton
                    busy={draftingKey === `s:${search.query}`}
                    onClick={() => generateDraft(`s:${search.query}`, search.query)}
                  />
                </li>
              ))}
              {(backlog?.zeroResultSearches.length ?? 0) === 0 && (
                <li className="text-sm text-[#615D59]">결과 없는 검색어가 없습니다.</li>
              )}
            </ul>
          </section>
        </div>
      )}

      {/* 생성된 초안 */}
      {draft && (
        <section className="mt-8 rounded-[20px] border border-[#dcebd9] bg-[#ECFDF5] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#084734]" />
              <h2 className="text-base font-semibold">AI 초안 — 검토 후 게시</h2>
            </div>
            <button
              type="button"
              onClick={copyDraft}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#084734]/15 bg-white px-3 py-1.5 text-[12px] font-medium text-[#084734]"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
              {copied ? "복사됨" : "Markdown 복사"}
            </button>
          </div>
          <p className="mt-3 text-lg font-bold text-[#111110]">{draft.title}</p>
          <p className="mt-1 text-[12px] text-[#615D59]">추천 카테고리: {draft.suggestedCategory}</p>
          {draft.grounding.length > 0 && (
            <p className="mt-1 text-[12px] text-[#615D59]">
              근거: {draft.grounding.map((g) => g.title).join(", ")}
            </p>
          )}
          <textarea
            readOnly
            value={draft.contentMarkdown}
            className="mt-3 h-72 w-full rounded-[12px] border border-black/[0.08] bg-white p-3 font-mono text-[13px] leading-6 text-[#111110]"
          />
          <p className="mt-2 text-[11px] text-[#615D59]">
            ※ AI 초안입니다. 사실 확인 후 문서 작성 화면에 붙여 넣어 게시하세요.
          </p>
        </section>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-black/[0.06] bg-[#FAFAF8] p-3">
      <p className="text-[11px] text-[#615D59]">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-[#111110]">{value}</p>
    </div>
  )
}

function DraftButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#084734]/15 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5] disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      AI 초안 생성
    </button>
  )
}
