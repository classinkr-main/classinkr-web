import { comparisonGeometry, type BarDomain } from "@/lib/branch/compass-overview";

/** 소수 행 비교용 SVG. 목표·0 기준선과 실제 숫자는 hover 없이 읽을 수 있다. */
export default function ComparisonBar({ value, target, domain, label }: {
  value: number | null; target?: number | null; domain: BarDomain; label: string;
}) {
  const geometry = comparisonGeometry(value, domain, target);
  if (!geometry) return <span className="text-[12px] text-[#615D59]">미평가</span>;
  return <svg role="img" aria-label={label} viewBox="0 0 100 14" preserveAspectRatio="none" className="h-5 w-full overflow-visible">
    <rect x="0" y="3" width="100" height="8" rx="2" fill="#F6F5F4" />
    <rect x={geometry.start} y="3" width={geometry.width} height="8" rx="2" fill="#084734" />
    {domain.min < 0 ? <line x1={geometry.zero} x2={geometry.zero} y1="0" y2="14" stroke="#615D59" strokeWidth="0.5" /> : null}
    {geometry.target != null ? <line x1={geometry.target} x2={geometry.target} y1="0" y2="14" stroke="#615D59" strokeWidth="0.5" strokeDasharray="1 1" /> : null}
  </svg>;
}
