export default function Loading() {
  return (
    <div className="px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10">
      <div className="animate-pulse space-y-6">
        <div className="h-12 rounded-2xl bg-[#f0f0ec]" />
        <div className="h-32 rounded-2xl bg-[#f0f0ec]" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-[#f0f0ec]" />)}
        </div>
      </div>
    </div>
  )
}
