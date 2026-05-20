export type Testimonial = {
    id: string
    badge: string
    role: string
    quote: string
    summary: string
    highlight?: boolean
    rating?: number
}

export const TESTIMONIALS: Testimonial[] = [
    {
        id: "olm-eng-director",
        badge: "수능/내신 영어학원",
        role: "올***영어 원장",
        quote:
            "솔직히 클래스인이 없으면 학원 운영이 안 됩니다. 듣기·단어 자동채점만으로도 보조 강사 업무량과 학원 운영 인력 부담이 확 줄었어요.",
        summary: "듣기·단어 자동채점으로 반복 채점과 보조 운영 업무 부담을 줄였다는 후기",
        highlight: true,
        rating: 5,
    },
    {
        id: "imisook-korean-ceo",
        badge: "국어 전문 학원",
        role: "권** 대표",
        quote:
            "오프라인 수업이 신석기 문화라면, 기존 전자칠판은 청동기, 클래스인은 철기 문화에 가깝습니다. 광선검까지 진화하길 기대합니다.",
        summary: "오프라인 칠판과 일반 전자칠판 대비 수업 방식의 변화를 크게 체감했다는 후기",
        highlight: true,
        rating: 5,
    },
    {
        id: "rhino-tutor",
        badge: "강사 회원",
        role: "라**",
        quote:
            "클래스인 덕분에 돈 벌면서 유학 공부할 수 있게 됐어요. 9월에 해외 의대 5학년으로 편입합니다.",
        summary: "장소 제약을 줄여 수업과 개인 학업을 병행할 수 있었다는 강사 후기",
        highlight: true,
        rating: 5,
    },
    {
        id: "growin-up",
        badge: "어학원",
        role: "부산 **에듀 원장",
        quote:
            "결제 완료했습니다. 아주 잘 사용하고 있어요. 감사합니다.",
        summary: "도입 후 실제 결제와 지속 사용으로 이어진 만족 피드백",
        rating: 5,
    },
    {
        id: "jans-english",
        badge: "어학원",
        role: "고** 원장",
        quote:
            "저도 열심히 활용해서, 우리 지역에서 클래스인의 전도사가 되어보겠습니다.",
        summary: "지역 학원 현장에서 계속 활용하고 주변에 추천하고 싶다는 후기",
        rating: 5,
    },
    {
        id: "barungeul-korean",
        badge: "국어 전문 학원",
        role: "김** 대표",
        quote: "덕분에 좋은 문물을 접했습니다. 감사합니다.",
        summary: "기존 수업 운영 방식과 다른 디지털 수업 경험을 긍정적으로 받아들였다는 후기",
        rating: 5,
    },
    {
        id: "yerim-edu",
        badge: "입시 학원",
        role: "천** 부원장",
        quote:
            "진심으로 응대해 주시고 잘 케어해 주신 덕분에, 저희가 불편함 없이 쓰고 있다고 직원분들이 입을 모아 말합니다.",
        summary: "제품 사용뿐 아니라 도입 지원과 운영 케어에 만족했다는 후기",
        rating: 5,
    },
]
