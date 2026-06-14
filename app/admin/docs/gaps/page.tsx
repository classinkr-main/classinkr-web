"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Sparkles, RefreshCw, ClipboardCopy, Check } from "lucide-react"
import { adminFetchJson } from "@/lib/admin-client"
import { buildDocDraftArticlePayload } from "@/lib/chatbot/doc-draft-article"

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

interface DraftSource {
  key: string
  question: string
  clusterId?: string
}

interface CreatedArticle {
  id: string
  publicPath: string
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

type AlphaReadinessStatus = "ok" | "warning" | "blocked"

interface AlphaReadinessCheck {
  key: string
  label: string
  status: AlphaReadinessStatus
  detail: string
  action?: string
  artifacts?: string[]
}

interface AlphaReadinessReport {
  generatedAt: string
  overallStatus: AlphaReadinessStatus
  summary: Record<AlphaReadinessStatus, number>
  checks: AlphaReadinessCheck[]
  warnings: string[]
}

const READINESS_PLACEHOLDER_LABELS = [
  "Supabase 운영 연결",
  "챗봇 DB 스키마",
  "Gemini 인식 엔진",
  "공개 문서 원본",
  "RAG 문서 청크",
  "임베딩 백필",
  "시작 추천 질문",
  "문서 보강 큐",
]

function pct(value: number | null | undefined) {
  if (value == null) return "—"
  return `${Math.round(value * 100)}%`
}

export default function DocsGapsPage() {
  const router = useRouter()
  const [backlog, setBacklog] = useState<Backlog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [draftingKey, setDraftingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<DocDraft | null>(null)
  const [draftSource, setDraftSource] = useState<DraftSource | null>(null)
  const [savingDraftArticle, setSavingDraftArticle] = useState(false)
  const [copied, setCopied] = useState(false)

  const [evalRunning, setEvalRunning] = useState(false)
  const [evalReport, setEvalReport] = useState<EvalReport | null>(null)
  const [readiness, setReadiness] = useState<AlphaReadinessReport | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(true)

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

  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true)
    try {
      const data = await adminFetchJson<AlphaReadinessReport>("/api/admin/docs/alpha-readiness")
      setReadiness(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "알파 준비도를 불러오지 못했습니다.")
    } finally {
      setReadinessLoading(false)
    }
  }, [])

  const refreshAll = useCallback(() => {
    void loadBacklog()
    void loadReadiness()
  }, [loadBacklog, loadReadiness])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  const generateDraft = async (key: string, question: string) => {
    setDraftingKey(key)
    setDraft(null)
    setDraftSource(null)
    setCopied(false)
    try {
      const data = await adminFetchJson<DocDraft>("/api/admin/docs/gaps/draft", {
        method: "POST",
        body: JSON.stringify({ question }),
      })
      setDraft(data)
      setDraftSource({
        key,
        question,
        clusterId: key.startsWith("c:") ? key.slice(2) : undefined,
      })
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

  const saveDraftAsArticle = async () => {
    if (!draft || !draftSource) return

    setSavingDraftArticle(true)
    setError("")
    try {
      const article = await adminFetchJson<CreatedArticle>("/api/admin/docs/articles", {
        method: "POST",
        body: JSON.stringify(
          buildDocDraftArticlePayload({
            draft,
            question: draftSource.question,
          })
        ),
      })

      if (draftSource.clusterId) {
        await adminFetchJson(`/api/admin/chatbot/questions/${draftSource.clusterId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "approved", mappedArticleId: article.id }),
        }).catch(() => null)
      }

      router.push(`/admin/docs/${article.id}/edit`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 초안을 문서로 저장하지 못했습니다.")
    } finally {
      setSavingDraftArticle(false)
    }
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
          onClick={refreshAll}
          className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] px-3.5 py-2 text-sm font-medium text-[#615D59] transition-colors hover:text-[#084734]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          새로고침
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-[#FBEAE2] px-4 py-3 text-sm text-[#B85C33]">{error}</p>
      )}

      <AlphaReadinessPanel report={readiness} loading={readinessLoading} onRefresh={loadReadiness} />

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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveDraftAsArticle}
                disabled={savingDraftArticle}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#084734] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-60"
              >
                {savingDraftArticle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                초안을 문서로 저장
              </button>
              <button
                type="button"
                onClick={copyDraft}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#084734]/15 bg-white px-3 py-1.5 text-[12px] font-medium text-[#084734]"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                {copied ? "복사됨" : "Markdown 복사"}
              </button>
            </div>
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
            ※ AI 초안입니다. 저장하면 문서 편집 화면에서 최종 검수하세요.
          </p>
        </section>
      )}
    </div>
  )
}

function AlphaReadinessPanel({
  report,
  loading,
  onRefresh,
}: {
  report: AlphaReadinessReport | null
  loading: boolean
  onRefresh: () => void
}) {
  const status = report?.overallStatus ?? "warning"
  const statusMeta = getReadinessStatusMeta(status)
  const checks = report?.checks ?? []

  return (
    <section className="mt-6 rounded-[20px] border border-black/[0.08] bg-[#ECFDF5] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">챗봇 알파 준비도</h2>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusMeta.badgeClass}`}>
              {loading ? "확인 중" : statusMeta.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#615D59]">
            운영 DB, 문서 근거, 임베딩, 추천 질문, 보강 큐를 한 번에 점검합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#084734]/15 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#F6F5F4] disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          준비도 확인
        </button>
      </div>

      {report && (
        <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-[#615D59]">
          <span>정상 {report.summary.ok}</span>
          <span>주의 {report.summary.warning}</span>
          <span>막힘 {report.summary.blocked}</span>
          <span>{new Date(report.generatedAt).toLocaleString("ko-KR")}</span>
        </div>
      )}

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {loading && checks.length === 0
          ? READINESS_PLACEHOLDER_LABELS.map((label) => (
              <div key={label} className="rounded-[14px] border border-black/[0.06] bg-white/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#111110]">{label}</p>
                  <span className="rounded-full bg-[#F6F5F4] px-2 py-0.5 text-[11px] text-[#615D59]">대기</span>
                </div>
                <p className="mt-1 text-[12px] text-[#615D59]">상태를 확인하는 중입니다.</p>
              </div>
            ))
          : checks.map((check) => {
              const meta = getReadinessStatusMeta(check.status)
              return (
                <div key={check.key} className="rounded-[14px] border border-black/[0.06] bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-[#111110]">{check.label}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-[#615D59]">{check.detail}</p>
                  {check.action && <p className="mt-1 text-[12px] font-medium text-[#084734]">{check.action}</p>}
                  {check.artifacts && check.artifacts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {check.artifacts.map((artifact) => (
                        <code
                          key={artifact}
                          className="max-w-full rounded-md border border-black/[0.06] bg-[#F6F5F4] px-1.5 py-1 text-[11px] leading-4 text-[#615D59]"
                        >
                          {artifact}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
      </div>

      {(report?.warnings.length ?? 0) > 0 && (
        <div className="mt-3 rounded-[12px] border border-[#B85C33]/20 bg-[#FBEAE2] px-3 py-2 text-[12px] text-[#B85C33]">
          {report?.warnings.join(" · ")}
        </div>
      )}
    </section>
  )
}

function getReadinessStatusMeta(status: AlphaReadinessStatus) {
  if (status === "ok") {
    return { label: "준비됨", badgeClass: "bg-[#ECFDF5] text-[#084734]" }
  }
  if (status === "warning") {
    return { label: "확인 필요", badgeClass: "bg-[#FFF7ED] text-[#B85C33]" }
  }
  return { label: "막힘", badgeClass: "bg-[#FBEAE2] text-[#B85C33]" }
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
