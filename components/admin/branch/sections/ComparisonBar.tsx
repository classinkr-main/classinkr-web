import { comparisonGeometry, type BarDomain } from "@/lib/branch/compass-overview";

/** 소수 행 비교용 SVG. 목표·0 기준선과 실제 숫자는 hover 없이 읽을 수 있다. */
export default function ComparisonBar({ value, target, domain, label }: {
  value: number | null; target?: number | null; domain: BarDomain; label: string;
}) {
  const geometry = comparisonGeometry(value, domain, target);
  if (!geometry) return <span className="text-[12px] text-[#615D59]">미평가</span>;
  return <svg role="img" aria-label={label} viewBox="0 0 100 14" preserveAspectRatio="none" className="h-5 w-full overflow-visible">
    <defs>
      <linearGradient id="compBarGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#065C41" />
        <stop offset="100%" stopColor="#084734" />
      </linearGradient>
    </defs>
    <rect x="0" y="3" width="100" height="8" rx="4" fill="#F0EFEA" stroke="rgba(0,0,0,0.04)" strokeWidth="0.5" />
    <rect
      x={geometry.start}
      y="3"
      width={geometry.width}
      height="8"
      rx="4"
      fill="url(#compBarGrad)"
      style={{ transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1), x 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
    />
    <rect
      x={geometry.start}
      y="3.5"
      width={geometry.width}
      height="2"
      rx="1"
      fill="rgba(255,255,255,0.22)"
      style={{ transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1), x 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}
    />
    {domain.min < 0 ? <line x1={geometry.zero} x2={geometry.zero} y1="0" y2="14" stroke="#A39E98" strokeWidth="0.75" /> : null}
    {geometry.target != null ? (
      <g>
        <line x1={geometry.target} x2={geometry.target} y1="0.5" y2="13.5" stroke="#31302E" strokeWidth="0.75" strokeDasharray="1.5 1.5" />
        <polygon points={`${geometry.target - 1.5},0 ${geometry.target + 1.5},0 ${geometry.target},2`} fill="#31302E" />
      </g>
    ) : null}
  </svg>;
}
