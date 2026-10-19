import type { CompassKpiItem, CompassKpiPerson } from "@/lib/compass/kr-team-contract";

const display = (value: number | null) => value == null ? "미설정" : value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
const rate = (value: number | null) => value == null ? "평가 전" : `${(value * 100).toFixed(1)}%`;

function Metric({ item }: { item: CompassKpiItem }) {
  return <tr className="border-t border-[rgba(0,0,0,0.08)] align-top">
    <th scope="row" className="px-3 py-3 text-left font-medium">
      {item.label}<span className="ml-2 text-[12px] font-normal text-[#615D59]">{(item.weight * 100).toFixed(0)}% · {item.kind === "qual" ? "정성" : item.unit ?? "정량"}</span>
      {item.reason ? <p className="mt-1 text-[12px] font-normal text-[#615D59]">조정 사유: {item.reason}</p> : null}
      {item.note ? <p className="mt-1 text-[12px] font-normal text-[#615D59]">{item.note}</p> : null}
      {item.memo ? <p className="mt-1 text-[12px] font-normal text-[#615D59]">메모: {item.memo}</p> : null}
      {item.manualBy || item.manualAt ? <p className="mt-1 text-[12px] font-normal text-[#615D59]">평가·조정 {item.manualBy} {item.manualAt}</p> : null}
    </th>
    <td className="px-3 py-3 tabular-nums">{display(item.target)}{item.aside ? <p className="text-[12px] text-[#615D59]">{item.aside}</p> : null}</td>
    <td className="px-3 py-3 tabular-nums">
      {item.kind === "qual" ? item.grade ?? "평가 전" : display(item.actual)}
      <span className="ml-1 text-[12px] text-[#615D59]">{item.source === "manual" ? "수동 조정" : item.source === "auto" ? "자동" : "평가 전"}</span>
      {item.source === "manual" && item.autoValue != null ? <p className="text-[12px] text-[#615D59]">자동 집계 {display(item.autoValue)}</p> : null}
      {item.gradeSource ? <p className="text-[12px] text-[#615D59]">{item.gradeSource === "project" ? "프로젝트 채점" : "책임자 평가"}</p> : null}
    </td>
    <td className="px-3 py-3 tabular-nums">{rate(item.rate)}<span className="ml-2">{item.grade ?? "—"}</span>
      {item.score != null ? <p className="text-[12px] text-[#615D59]">{display(item.score)}점</p> : null}
      {item.projected ? <p className="mt-1 text-[12px] text-[#615D59]">월말 전망 {display(item.projected.value)} · {rate(item.projected.rate)} · {item.projected.grade}</p> : null}
    </td>
  </tr>;
}

export default function CompassKpiDetail({ person, month }: { person: CompassKpiPerson; month: string }) {
  return <div className="border-t border-[rgba(0,0,0,0.08)]">
    <div className="flex flex-wrap gap-x-4 gap-y-1 bg-[#F6F5F4] px-4 py-3 text-[12px] text-[#615D59]">
      <span>평가 {(person.ratedWeight * 100).toFixed(0)}% / 배정 {(person.weightSum * 100).toFixed(0)}%</span>
      {person.ratedWeight > 0 ? <span>{person.score.toFixed(2)}점</span> : null}
      {person.projected ? <span>월말 전망 {person.projected.grade} · {rate(person.projected.rate)}</span> : null}
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-[13px] text-[#31302E]">
      <caption className="sr-only">{person.name}의 {month} 평가 항목</caption>
      <thead className="bg-[#F6F5F4] text-left text-[#615D59]"><tr><th scope="col" className="px-3 py-2">항목 · 가중치</th><th scope="col" className="px-3 py-2">목표</th><th scope="col" className="px-3 py-2">실적 · 출처</th><th scope="col" className="px-3 py-2">달성률 · 등급</th></tr></thead>
      <tbody>{person.items.map((item) => <Metric key={item.metric} item={item} />)}</tbody>
    </table></div>
  </div>;
}
