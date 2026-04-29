"use client"
import type { Team } from "../types"

type KpiTeam = Exclude<Team, "ALL">

interface TeamKpiData {
  metrics: string[]
  members: Array<{ name: string; scores: Record<string, number> }>
}

const TEAM_ORDER: KpiTeam[] = ["BD", "MKT", "CSM"]

const TEAM_KPI_DUMMY: Record<KpiTeam, TeamKpiData> = {
  BD: {
    metrics: ["Lead", "Account", "Solution", "Opportunity", "Visit"],
    members: [
      { name: "Han", scores: { Lead: 82, Account: 76, Solution: 68, Opportunity: 74, Visit: 91 } },
      { name: "Wangchan", scores: { Lead: 88, Account: 81, Solution: 72, Opportunity: 85, Visit: 79 } },
      { name: "Junhyuk", scores: { Lead: 71, Account: 69, Solution: 64, Opportunity: 70, Visit: 76 } },
    ],
  },
  MKT: {
    metrics: ["Lead", "Account", "Content", "Event"],
    members: [
      { name: "Gyusung", scores: { Lead: 78, Account: 74, Content: 92, Event: 68 } },
      { name: "Heesung", scores: { Lead: 73, Account: 70, Content: 88, Event: 76 } },
    ],
  },
  CSM: {
    metrics: ["Template", "Case Study", "Event"],
    members: [
      { name: "Somang", scores: { Template: 84, "Case Study": 72, Event: 77 } },
      { name: "Minjae", scores: { Template: 79, "Case Study": 68, Event: 74 } },
    ],
  },
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function teamAverage(data: TeamKpiData) {
  return average(data.members.flatMap((member) => data.metrics.map((metric) => member.scores[metric] ?? 0)))
}

function scoreTone(score: number) {
  if (score >= 85) return "bg-emerald-50 text-emerald-700"
  if (score >= 70) return "bg-amber-50 text-amber-700"
  return "bg-rose-50 text-rose-700"
}

export default function TeamKpiIndexSection({ team }: { team: Team }) {
  const visibleTeams = team === "ALL" ? TEAM_ORDER : [team]

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-[#111110]/70">팀 KPI 지수</h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/55">더미 데이터</span>
          <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[10px] font-medium text-[#1a1a1a]/55">KPI 탭 기준 예정</span>
        </div>
      </div>
      <div className="space-y-3">
        {visibleTeams.map((teamName) => {
          const data = TEAM_KPI_DUMMY[teamName]
          const avg = teamAverage(data)
          return (
            <article key={teamName} className="rounded-2xl border border-[#e8e8e4] bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0f0ec] px-4 py-3">
                <div>
                  <p className="text-[12px] font-semibold text-[#1a1a1a]/60">{teamName}</p>
                  <p className="mt-1 text-[20px] font-bold text-[#111110]">{avg.toFixed(0)}%</p>
                </div>
                <div className="text-right text-[11px] text-[#1a1a1a]/45">
                  <p>{data.members.length}명</p>
                  <p>{data.metrics.join(" / ")}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="bg-[#fafaf8] text-[#1a1a1a]/60">
                    <tr>
                      <th className="px-3 py-2 text-left">멤버</th>
                      {data.metrics.map((metric) => (
                        <th key={metric} className="px-3 py-2 text-right">{metric}</th>
                      ))}
                      <th className="px-3 py-2 text-right">평균</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.members.map((member) => {
                      const memberAvg = average(data.metrics.map((metric) => member.scores[metric] ?? 0))
                      return (
                        <tr key={`${teamName}-${member.name}`} className="border-t border-[#f0f0ec]">
                          <td className="px-3 py-2 font-medium">{member.name}</td>
                          {data.metrics.map((metric) => {
                            const score = member.scores[metric] ?? 0
                            return (
                              <td key={`${member.name}-${metric}`} className="px-3 py-2 text-right">
                                <span className={`inline-flex min-w-12 justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${scoreTone(score)}`}>
                                  {score}
                                </span>
                              </td>
                            )
                          })}
                          <td className="px-3 py-2 text-right font-semibold">{memberAvg.toFixed(0)}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
