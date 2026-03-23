import { Construction } from "lucide-react"

interface Props {
  title: string
  description: string
  phase?: string
}

export default function AdminComingSoon({ title, description, phase }: Props) {
  return (
    <div className="px-8 pt-12 pb-20">
      <div className="mb-8">
        <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
        <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">{title}</h1>
      </div>

      <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-[#e8e8e4] border-dashed">
        <Construction className="w-8 h-8 text-[#1a1a1a]/20 mb-4" />
        <p className="text-[14px] font-medium text-[#111110] mb-1">{description}</p>
        {phase && (
          <span className="mt-3 text-[11px] px-2.5 py-1 rounded-full bg-[#f0f0ec] text-[#1a1a1a]/50 font-medium">
            {phase}
          </span>
        )}
      </div>
    </div>
  )
}
