"use client"

const academies = [
    "부천 정율사관",
    "부산 과사람",
    "부산 예림학원",
    "강남 세정학원",
    "평택 윤유경플러스",
    "부산 KJ 영재센터",
    "청라 케슬에듀",
    "익산 U2M수학",
    "서울 올파이 학원",
    "청주 이미숙국어",
    "대구 학문당",
    "천안 제이스칸",
    "부산 라임라잇수학",
    "12inEdu",
    "노원 국풍2000",
    "제주 더솔루션",
    "광교 U2M",
    "평촌 에스키어학원",
    "한국학원대학교",
    "고양 킹콩수학",
    "모나르떼",
    "아신대학교",
    "디지털미디어고등학교",
    "표창원범죄연구소",
    "홍성 STC세임잉글리쉬",
    "부산 미소에듀",
    "인천 에듀엠학원",
    "수원 미지원교육",
    "동대문 수학의힘",
    "부천 진수학",
    "동탄 남명학원",
    "의정부 권경욱어학원",
    "서울 라플라스수학",
    "서울 두드림학원",
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
