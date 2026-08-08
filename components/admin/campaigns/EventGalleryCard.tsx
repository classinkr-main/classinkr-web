import Image from "next/image"
import { Calendar as CalendarIcon } from "lucide-react"
import type { PublicEvent } from "@/lib/types/public-events"
import { formatRange, statusTone } from "./event-format"

export function EventGalleryCard({
  event,
  onOpen,
}: {
  event: PublicEvent
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white text-left transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
    >
      <div className="relative h-28 w-full overflow-hidden bg-[#084734]">
        {event.imageUrl ? (
          <Image
            src={event.imageUrl}
            alt={event.title}
            fill
            className="object-cover transition-transform group-hover:scale-[1.03]"
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0b5c43] to-[#084734]">
            <CalendarIcon className="h-6 w-6 text-white/50" />
          </div>
        )}
        <span
          className={`absolute left-2 top-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone(event.status)}`}
        >
          {event.status}
        </span>
      </div>
      <div className="p-3">
        <p className="truncate text-[13px] font-bold text-[#111110]">{event.title}</p>
        <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
          {formatRange(event.startsAt, event.endsAt)} · {event.category}
        </p>
      </div>
    </button>
  )
}
