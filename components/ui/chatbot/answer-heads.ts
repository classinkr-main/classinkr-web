/*
 * 답 글 덩이 나누기와 복합 답 번호 머리 판정(위젯 그리기 규칙, 순수 함수 — React·DOM 없음).
 *
 * 공개 챗봇의 복합 답(물음 여럿을 한 번에 받은 답)은 물음마다 "1. 주제" 머리 줄 바로 아래 결론 줄(+ "-" 단계 줄)을 한 덩이로 두고
 * 물음 사이를 빈 줄로 나눈다(답 색인 답 조립의 번호 머리 꼴, legacy 생성 지시문의 복합 질문 줄). 위젯은 이 머리 줄만 굵게 그린다(MessageText).
 *
 * 오탐 0 이 먼저다. 카드 안 번호 단계("1. [설정] → [수업] 열기", "1. 학생 앱을 설치해요.")는 머리로 잡지 않는다:
 * 1) 덩이 첫 줄이 "n. 이름"이고, 덩이에 줄이 둘 이상이며 둘째 줄이 번호 줄이 아니다(머리 줄만 있는 덩이·번호 목록 덩이는 머리가 아니다).
 * 2) 이름이 짧은 명사구다: 30자 이하, 문장부호(. ! ? … 등)나 요체·니다체 끝으로 끝나지 않고 경로 기호(→ -> >)가 없다.
 *    따옴표로 감싼 손님 물음("…있나요")은 이름으로 본다.
 * 3) 한 답 안에서 번호 줄로 시작하는 덩이가 모두 머리이고, 번호가 덩이 순서대로 1, 2, … 로 이어지며 둘 이상이다.
 *    하나라도 어긋나면(번호 단계 덩이가 섞이거나 번호가 건너뜀) 그 답에는 머리가 없다 — 굵게 못 그리는 쪽으로 틀린다.
 */

// 글자를 덩이(빈 줄로 나뉜 줄 묶음)로 나눈다. 줄은 앞뒤 공백을 떼고 빈 줄과 '권장 순서:'·'확인 기준:' 꼬리표 줄을 뺀다.
export function splitAnswerBlocks(text: string): string[][] {
    return text
        .trim()
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) =>
            block
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .filter((line) => !/^(권장 순서|확인 기준):\s*$/i.test(line))
        )
}

const NUMBERED_LINE_RE = /^\d+[.)]\s+/
const HEAD_LINE_RE = /^(\d{1,2})\.\s+(.+)$/
const HEAD_LABEL_MAX = 30
// 문장·목록 항목처럼 끝나는 이름(문장부호, 요체·니다체 끝)은 머리가 아니다. '필요'·'개요' 같은 명사 끝은 이름이다.
const SENTENCE_END_RE = /[.。!！?？…~;,，、]$/
const SENTENCE_WORD_END_RE = /(?:요|니다)$/
const NOUN_YO_END_RE = /(?:필|개|중|수|주)요$/
// 메뉴 경로(단계 줄의 꼴)는 머리가 아니다.
const PATH_MARK_RE = /→|->|⇒|\s>\s/
// 따옴표로 감싼 손님 물음 이름("출석부를 엑셀로 받을 수 있나요").
const QUOTED_LABEL_RE = /^["“][^"“”\n]+["”]$/

export function isAnswerHeadLabel(label: string): boolean {
    // 끝 쌍점은 떼고 본다('…안 보일 때:' 꼴 카드 주제). '…해 주세요:' 는 떼어도 요체 끝이라 머리가 아니다.
    const text = label.trim().replace(/\s*:$/, "")
    if (!text || text.length > HEAD_LABEL_MAX) return false
    if (PATH_MARK_RE.test(text)) return false
    if (QUOTED_LABEL_RE.test(text)) return true
    if (SENTENCE_END_RE.test(text)) return false
    return !SENTENCE_WORD_END_RE.test(text) || NOUN_YO_END_RE.test(text)
}

// "n. 이름" 머리 줄이면 번호와 이름. 아니면 null.
export function parseAnswerHeadLine(line: string): { n: number; label: string } | null {
    const match = line.match(HEAD_LINE_RE)
    if (!match) return null
    const label = match[2].trim()
    return isAnswerHeadLabel(label) ? { n: Number(match[1]), label } : null
}

// 번호 머리 줄을 첫 줄로 둔 덩이의 자리(덩이 순서). 복합 답이 아니면 빈 배열.
export function findAnswerHeadBlocks(blocks: readonly (readonly string[])[]): number[] {
    const heads: number[] = []
    for (let at = 0; at < blocks.length; at += 1) {
        const lines = blocks[at]
        if (!lines[0] || !NUMBERED_LINE_RE.test(lines[0])) continue
        const head = parseAnswerHeadLine(lines[0])
        const isHead = head !== null && head.n === heads.length + 1 && lines.length >= 2 && !NUMBERED_LINE_RE.test(lines[1])
        if (!isHead) return []
        heads.push(at)
    }
    return heads.length >= 2 ? heads : []
}
