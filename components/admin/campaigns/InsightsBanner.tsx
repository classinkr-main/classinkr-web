"use client"

import { AlertTriangle, Lightbulb, Sparkles, Target, TrendingUp } from "lucide-react"

export type InsightTone = "positive" | "warning" | "neutral"

export interface Insight {
  id: string
  tone: InsightTone
  title: string
  body?: string
  icon?: "trend" | "alert" | "target" | "spark"
}

export interface InsightsBannerProps {
  insights: Insight[]
}

interface ToneStyle {
  chip: string
  iconWrap: string
  title: string
  body: string
}

const TONE_STYLES: Record<InsightTone, ToneStyle> = {
  positive: {
    chip: "border-[#BDEFD8] bg-[#ECFDF5]",
    iconWrap: "bg-white/70 text-[#084734]",
    title: "text-[#084734]",
    body: "text-[#084734]/70",
  },
  warning: {
    chip: "border-[#ECD29C] bg-[#FBF1E0]",
    iconWrap: "bg-white/70 text-[#A8741A]",
    title: "text-[#A8741A]",
    body: "text-[#A8741A]/70",
  },
  neutral: {
    chip: "border-[#e8e8e4] bg-white",
    iconWrap: "bg-[#fafaf8] text-[#111110]",
    title: "text-[#111110]",
    body: "text-[#1a1a1a]/45",
  },
}

function InsightIcon({ icon }: { icon?: Insight["icon"] }) {
  const className = "h-4 w-4"
  switch (icon) {
    case "trend":
      return <TrendingUp className={className} />
    case "alert":
      return <AlertTriangle className={className} />
    case "target":
      return <Target className={className} />
    case "spark":
      return <Sparkles className={className} />
    default:
      return <Lightbulb className={className} />
  }
}

export function InsightsBanner({ insights }: InsightsBannerProps) {
  if (insights.length === 0) return null

  const items = insights.slice(0, 6)

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((insight) => {
        const tone = TONE_STYLES[insight.tone] ?? TONE_STYLES.neutral
        return (
          <div
            key={insight.id}
            className={`flex items-start gap-3 rounded-2xl border p-4 ${tone.chip}`}
          >
            <span className={`mt-0.5 inline-flex shrink-0 rounded-xl p-2 ${tone.iconWrap}`}>
              <InsightIcon icon={insight.icon} />
            </span>
            <div className="min-w-0">
              <p className={`text-[13px] font-semibold leading-snug ${tone.title}`}>
                {insight.title}
              </p>
              {insight.body ? (
                <p className={`mt-1 text-[11px] leading-relaxed ${tone.body}`}>{insight.body}</p>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
