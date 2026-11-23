// 챗봇 위젯의 작은 버튼이 보이는 크기는 그대로 두고 누르는 영역만 44px 로 넓힌다(WCAG 2.5.5·iOS 44pt 기준).
// 투명한 ::before 를 버튼 밖으로 내민다. Tailwind 4 의 before: 는 content: '' 를 자동으로 넣는다.
// 색·배경·보더·모서리는 넣지 않으므로 화면에는 보이지 않는다.
// 함정: absolute 인 ::before 는 버튼의 padding 상자(보더 안쪽)를 기준으로 놓인다. 보더 1px 버튼에
// -inset-1(4px)을 주면 36 - 2 + 8 = 42px 이고, 보더 바깥으로는 3px 만 나온다.

/** 보더 1px 인 36px(h-9) 버튼 → 44px. padding 상자에서 사방 5px = 보더 바깥 4px. */
export const CHATBOT_HIT_AREA_CLASS = "relative before:absolute before:-inset-[5px]"

/** 보더 없는 32px(h-8 w-8) 버튼 → 44px. 사방 6px. */
export const CHATBOT_HIT_AREA_32_CLASS = "relative before:absolute before:-inset-1.5"
