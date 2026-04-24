import { Construction } from "lucide-react"

interface Props {
  title: string
  description: string
  phase?: string
}

export default function AdminComingSoon({ title, description, phase }: Props) {
  return (
    <div className="px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-20">
      <div className="mb-6 sm:mb-8">
        <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-1">Admin</p>
        <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">{title}</h1>
      </div>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e8e8e4] bg-white px-4 py-16 text-center sm:py-24">
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
