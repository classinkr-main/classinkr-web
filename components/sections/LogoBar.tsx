"use client"

const academies = [
    "대치 최상위학원",
    "목동 에듀플렉스",
    "분당 리더스학원",
    "강남 탑클래스학원",
    "서초 아이비학원",
    "일산 퍼스트학원",
    "수원 영재학원",
    "인천 에이스학원",
    "부산 한울학원",
    "대구 스카이학원",
    "광주 미래학원",
    "노원 명문학원",
]

export function LogoBar() {
    return (
        <section className="py-12 bg-[#F6F5F4] overflow-hidden border-y border-[rgba(0,0,0,0.06)]">
            <div className="container mx-auto mb-6 px-4">
                <p className="text-center text-sm font-semibold text-[#A39E98] uppercase tracking-[0.15em]">
                    이미 시스템화를 선택한 학원들
                </p>
            </div>

            {/* Marquee track */}
            <div className="relative flex overflow-hidden">
                {/* Fade edges */}
                <div className="absolute left-0 top-0 bottom-0 w-32 z-10 bg-gradient-to-r from-[#F6F5F4] to-transparent pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-32 z-10 bg-gradient-to-l from-[#F6F5F4] to-transparent pointer-events-none" />

                <div
                    className="flex gap-10 whitespace-nowrap"
                    style={{ animation: 'marquee 28s linear infinite' }}
                >
                    {[...academies, ...academies].map((name, i) => (
                        <span
                            key={i}
                            className="inline-flex items-center gap-3 text-[#615D59] font-semibold text-base"
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-[#084734]/30 shrink-0" />
                            {name}
                        </span>
                    ))}
                </div>
            </div>

            <style>{`
                @keyframes marquee {
                    from { transform: translateX(0); }
                    to { transform: translateX(-50%); }
                }
            `}</style>
        </section>
    )
}
