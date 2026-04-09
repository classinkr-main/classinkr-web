import { redirect } from "next/navigation"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { PortalNav } from "@/components/partner-portal/PortalNav"

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  if (hasSupabaseBrowserEnv()) {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      redirect("/partner/login")
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f2] text-[#1a1a1a]">
      <div className="sticky top-0 z-20 border-b border-[#e7e0d6] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#084734] text-[10px] font-bold text-white">C</span>
            <span className="text-sm font-semibold text-[#1a1a1a]">파트너 포털</span>
          </div>
          <PortalNav />
        </div>
      </div>
      {children}
    </div>
  )
}
