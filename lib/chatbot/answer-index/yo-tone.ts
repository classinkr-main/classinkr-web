/**
 * 요체 변환(R3 a1, 답 꼴 규격 S7·D1): compiled 답 글의 니다체 문장 끝을 요체로 바꾼다. 결정적이고 모델·네트워크를 부르지 않는다.
 *
 * 지키는 것
 * - 문장 끝 낱말의 어미만 바꾼다(합니다 → 해요, 됩니다 → 돼요, 입니다 → 예요·이에요, 있습니다 → 있어요, 누릅니다 → 눌러요 …).
 *   어간은 사전과 규칙으로만 고른다. 사전에 없거나 갈래가 둘인 어간(살다·사다, 걷다(걷기·걷어 올림) 등)은 바꾸지 않고 남긴다(unconverted, L18 경고).
 * - 바꾸지 않는 것: 따옴표('…' "…")·「」·『』·[ ] 안의 화면 문구, 영어 글, 문장 끝이 아닌 자리.
 *   말투 잠금 카드(toneLocked)·정책 글은 부르는 쪽(shape.ts·respond.ts)이 건너뛴다.
 * - 바꾼 뒤 두 가지를 검사한다. 하나라도 어긋나면 원문을 그대로 낸다(reverted).
 *   ① 토큰 보존: 숫자·[ ]·영문 토큰과 부정어(않·없·못·안·불가·아니·말고·금지·지 마) 수가 같다.
 *   ② 안전 규칙(safety-rules.ts, V-3): 원문에 없던 위반이 생기지 않는다.
 * - 스위치 CHATBOT_COMPILED_TONE: yo(기본) · off. compiled 경로(shape.ts 다듬기 단계)에서만 돈다. legacy 경로에는 닿지 않는다.
 */
import { findSafetyViolations } from "./safety-rules"

type Env = Record<string, string | undefined>

export type CompiledTone = "yo" | "off"

/** CHATBOT_COMPILED_TONE: yo(기본) · off(·0·false·nida). */
export function compiledTone(env: Env = process.env): CompiledTone {
  const value = env.CHATBOT_COMPILED_TONE?.trim().toLowerCase()
  return value === "off" || value === "0" || value === "false" || value === "nida" ? "off" : "yo"
}

// ─── 한글 낱자 ───────────────────────────────────────────────────────────

const HANGUL_BASE = 0xac00
const HANGUL_LAST = 0xd7a3

/** 중성 번호(ㅏ 0 … ㅣ 20). */
const V = { a: 0, ae: 1, ya: 2, eo: 4, e: 5, yeo: 6, o: 8, wa: 9, oe: 11, u: 13, wo: 14, wi: 16, eu: 18, ui: 19, i: 20 } as const
/** 종성 번호. */
const J = { none: 0, rieul: 8, bieup: 17, digeut: 7, siot: 19, ssang_siot: 20, hieut: 27 } as const

interface Syllable {
  cho: number
  jung: number
  jong: number
}

function decompose(ch: string | undefined): Syllable | null {
  if (!ch) return null
  const code = ch.charCodeAt(0)
  if (code < HANGUL_BASE || code > HANGUL_LAST) return null
  const offset = code - HANGUL_BASE
  return { cho: Math.floor(offset / 588), jung: Math.floor((offset % 588) / 28), jong: offset % 28 }
}

function compose(cho: number, jung: number, jong = 0): string {
  return String.fromCharCode(HANGUL_BASE + cho * 588 + jung * 28 + jong)
}

const isHangul = (ch: string | undefined) => decompose(ch) !== null

/** 숫자 뒤 단위의 읽는 소리 받침(GB 기가바이트·mm 밀리미터·kg 킬로그램·Hz 헤르츠·W 와트·㎡ 제곱미터·° 도·% 퍼센트). */
const UNIT_FINALS: ReadonlyArray<readonly [RegExp, boolean]> = [
  [/\d\s?(?:GB|MB|KB|TB)$/, false],
  [/\d\s?(?:mm|cm|km|m)$/, false],
  [/\d\s?(?:kg|g)$/, true],
  [/\d\s?(?:Hz|W|V)$/, false],
  [/\d\s?[㎡°℃%]$/, false],
]

/** 받침 유무(입니다 → 이에요·예요). 한글·숫자(읽는 소리)·대문자 약어만 판단하고 그 밖은 null. */
function hasFinal(text: string): boolean | null {
  // 끝의 괄호 덧말은 읽지 않는다: '저장 32GB)입니다'는 괄호 앞 낱말로 고른다('안드로이드 11(…)입니다' → 11이에요).
  // 띄어 쓴 '진행 중 입니다'는 앞 낱말에 붙여 읽는다.
  const trimmed = text.replace(/["'”’\]」』]+$/, "").replace(/\([^()\n]*\)$/, "").replace(/[ \t]+$/, "")
  const last = trimmed.at(-1)
  if (!last) return null
  const syllable = decompose(last)
  if (syllable) return syllable.jong !== J.none
  const unit = UNIT_FINALS.find(([re]) => re.test(trimmed))
  if (unit) return unit[1]
  if (/[0-9]/.test(last)) return "013678".includes(last)
  // 대문자 약어·모델 이름(SSD, CS21A, Classin X)은 끝 글자 이름으로 읽는다(L·M·N·R 만 받침). 소문자가 섞인 낱말(SaaS·Zoom)은 모른다.
  const latin = /[A-Za-z]+$/.exec(trimmed)?.[0]
  if (latin && /^[A-Z]+$/.test(latin)) return "LMNR".includes(last)
  return null
}

// ─── 어간 → -아/어 꼴 ────────────────────────────────────────────────────

/** 르·푸 불규칙(어간 끝 글자열 → -아/어 꼴). 사전에 없는 르 어간은 바꾸지 않는다(이르다 등 갈래가 둘). */
const VOWEL_STEM_FORMS: ReadonlyArray<readonly [string, string]> = [
  ["서두르", "서둘러"],
  ["머무르", "머물러"],
  ["게으르", "게을러"],
  ["저지르", "저질러"],
  ["우러르", "우러러"],
  ["다다르", "다다라"],
  ["누르", "눌러"],
  ["고르", "골라"],
  ["다르", "달라"],
  ["모르", "몰라"],
  ["오르", "올라"],
  ["바르", "발라"],
  ["부르", "불러"],
  ["흐르", "흘러"],
  ["자르", "잘라"],
  ["빠르", "빨라"],
  ["마르", "말라"],
  ["가르", "갈라"],
  ["거르", "걸러"],
  ["구르", "굴러"],
  ["기르", "길러"],
  ["조르", "졸라"],
  ["지르", "질러"],
  ["찌르", "찔러"],
  ["무르", "물러"],
  ["따르", "따라"],
  ["치르", "치러"],
  ["들르", "들러"],
  ["푸", "퍼"],
]

/** 이-피동·사동 동사(보이다·붙이다…): '입니다' 앞 글자열이 이것과 같으면(또는 이것으로 끝나면) '-여요'로 본다(아니면 이다 = 예요·이에요). */
const I_VERBS_EXACT = new Set(["보", "모", "놓", "쓰", "먹", "녹", "숙", "들", "높", "늘", "죽"])
const I_VERBS_SUFFIX = ["붙", "쌓", "섞", "묶", "덮", "끓", "깎", "꺾", "움직", "기울", "받아들", "끌어들"]
/** 앞 낱말이 수·가리킴 말이면 이다로 본다(한 줄입니다 / 작게 줄입니다). */
const I_VERBS_UNLESS_COUNTED = new Set(["줄", "속"])
const COUNTED_WORD_RE = /^(?:\d+|한|두|세|네|몇|첫|맨|마지막|위|아래|윗|아랫|다음|이|그|저|안쪽|바깥)$/
/** '-을 겁니다'에서 을 앞이 어간인 꼴(있을 겁니다 = 것입니다). 그 밖의 '…을/를 겁니다'는 걸다(잠금을 겁니다). */
const ADNOMINAL_EUL = new Set(["있을", "없을", "않을", "같을", "좋을", "많을", "괜찮을", "받을", "찾을", "넣을", "남을", "맞을", "적을", "읽을", "닫을", "잡을", "작을", "높을", "낮을", "늦을", "빠를", "느릴"])

/** 받침 있는 어간의 불규칙·갈래(어간 끝 글자열 → -아/어 꼴). */
const CONSONANT_STEM_FORMS: ReadonlyArray<readonly [string, string]> = [
  ["깨닫", "깨달아"],
  ["일컫", "일컬어"],
  ["듣", "들어"],
  ["싣", "실어"],
  ["묻", "물어"],
  ["낫", "나아"],
  ["짓", "지어"],
  ["잇", "이어"],
  ["붓", "부어"],
  ["젓", "저어"],
  ["긋", "그어"],
  ["커다랗", "커다래"],
  ["조그맣", "조그매"],
  ["동그랗", "동그래"],
  ["그렇", "그래"],
  ["이렇", "이래"],
  ["저렇", "저래"],
  ["어떻", "어때"],
  ["빨갛", "빨개"],
  ["하얗", "하얘"],
  ["파랗", "파래"],
  ["노랗", "노래"],
  ["까맣", "까매"],
  ["시끄럽", "시끄러워"],
  ["부드럽", "부드러워"],
  ["어지럽", "어지러워"],
  ["아름답", "아름다워"],
  ["어렵", "어려워"],
  ["가깝", "가까워"],
  ["무겁", "무거워"],
  ["가볍", "가벼워"],
  ["즐겁", "즐거워"],
  ["고맙", "고마워"],
  ["반갑", "반가워"],
  ["귀엽", "귀여워"],
  ["두렵", "두려워"],
  ["부럽", "부러워"],
  ["아깝", "아까워"],
  ["차갑", "차가워"],
  ["뜨겁", "뜨거워"],
  ["무섭", "무서워"],
  ["더럽", "더러워"],
  ["놀랍", "놀라워"],
  ["두껍", "두꺼워"],
  ["쉽", "쉬워"],
  ["돕", "도와"],
  ["곱", "고와"],
  ["춥", "추워"],
  ["덥", "더워"],
  ["맵", "매워"],
  ["눕", "누워"],
  ["밉", "미워"],
]

/** ㅂ·ㄷ·ㅅ·ㅎ 받침 가운데 규칙 활용으로 확인한 어간 끝 글자(그 밖의 이 받침 어간은 바꾸지 않는다). */
const REGULAR_TRICKY_FINALS = new Set(["잡", "좁", "뽑", "접", "씹", "업", "집", "입", "받", "닫", "믿", "얻", "쏟", "뜯", "돋", "씻", "벗", "웃", "앗", "솟", "빗", "좋", "놓", "넣", "낳", "쌓", "닿", "땋"])

/** 형용사 '-하겠습니다'(추정 → 겠어요). 이 밖의 '-하겠습니다'는 약속(-할게요)으로 본다. */
const ADJECTIVE_HA_ROOTS = ["필요", "가능", "불편", "편", "중요", "충분", "곤란", "복잡", "편리", "적합", "간편", "다양", "정확", "확실", "명확", "안전", "유용", "동일", "어색", "부족"]

function endsWithAny(text: string, table: ReadonlyArray<readonly [string, string]>): [string, string] | null {
  for (const [stem, form] of table) if (text.endsWith(stem)) return [stem, form]
  return null
}

/** 모음 조화: 앞 음절 중성이 ㅏ·ㅑ·ㅗ 면 아, 아니면 어. */
const brightVowel = (jung: number) => jung === V.a || jung === V.ya || jung === V.o

/**
 * 받침 없는 어간(ㅂ니다 앞)의 -아/어 꼴. prefix 는 어간 마지막 글자 앞 글자열, last 는 마지막 글자. 모르면 null.
 * context.before 는 이 낱말 앞 글(겁니다의 '-ㄹ 거'·'걸다' 가름에 쓴다).
 */
function vowelStemForm(stem: string, before: string): string | null {
  const special = endsWithAny(stem, VOWEL_STEM_FORMS)
  if (special) return stem.slice(0, stem.length - special[0].length) + special[1]
  const last = stem.at(-1)!
  const prefix = stem.slice(0, -1)
  const syllable = decompose(last)
  if (!syllable || syllable.jong !== J.none) return null
  switch (last) {
    case "하":
      return `${prefix}해`
    case "되":
      return `${prefix}돼`
    case "뵈":
      return `${prefix}봬`
    case "아":
      return `${prefix}알아` // 압니다 = 알다
    case "여":
      return `${prefix}열어` // 엽니다 = 열다
    case "드":
      return `${prefix}들어` // 만듭니다·듭니다 = (만)들다
    case "머":
      return `${prefix}멀어`
    case "도":
      return `${prefix}돌아` // 돕니다 = 돌다(돕다는 돕습니다)
    case "노":
      return `${prefix}놀아`
    case "다":
      return prefix ? null : "달아" // 답니다 = 달다
    case "거":
      // '-ㄹ 겁니다'(= 것입니다)는 convertNidaWord 가 거예요로 따로 맡는다. 여기는 걸다.
      return prefix || isWillGeot(before) ? null : "걸어"
    case "기":
      return prefix ? `${prefix}겨` : "길어" // 생깁니다 → 생겨 / 깁니다 = 길다
    case "시":
      return `${prefix}세` // 높임 -시-: 하십니다 → 하세요
    case "니":
      return prefix.endsWith("아") ? null : `${prefix}녀` // 아닙니다는 따로(아니에요)
    case "르":
      return null // 사전에 없는 르 어간
    default:
      break
  }
  const { cho, jung } = syllable
  if (jung === V.i) return last === "이" ? null : `${prefix}${compose(cho, V.yeo)}`
  if (jung === V.o) return ["보", "오", "쏘", "꼬"].includes(last) ? `${prefix}${compose(cho, V.wa)}` : null
  if (jung === V.u) {
    if (!prefix && !["주", "두", "꾸", "추"].includes(last)) return null
    return `${prefix}${compose(cho, V.wo)}`
  }
  if (jung === V.eu) {
    if (!prefix) return compose(cho, V.eo)
    const before = decompose(prefix.at(-1))
    if (!before) return null
    return `${prefix}${compose(cho, brightVowel(before.jung) ? V.a : V.eo)}`
  }
  if (jung === V.a) {
    if (prefix || ["가", "나", "자", "타", "차", "짜", "싸", "까"].includes(last)) return stem
    return null
  }
  if (jung === V.eo) return prefix || last === "서" ? stem : null
  if (jung === V.ae || jung === V.e) return stem
  if (jung === V.yeo) return stem
  if (jung === V.wi || jung === V.ui) return `${stem}어`
  return null
}

/** 받침 있는 어간(습니다 앞)의 -아/어 꼴. 모르면 null. */
function consonantStemForm(stem: string): string | null {
  const last = decompose(stem.at(-1))
  if (!last || last.jong === J.none) return null
  if (last.jong === J.ssang_siot) return `${stem}어`
  const special = endsWithAny(stem, CONSONANT_STEM_FORMS)
  if (special) return stem.slice(0, stem.length - special[0].length) + special[1]
  if (stem.endsWith("롭")) return `${stem.slice(0, -1)}로워`
  const tricky = last.jong === J.bieup || last.jong === J.digeut || last.jong === J.siot || last.jong === J.hieut
  if (tricky && !REGULAR_TRICKY_FINALS.has(stem.at(-1)!)) return null
  return `${stem}${brightVowel(last.jung) ? "아" : "어"}`
}

// ─── 낱말 하나 ───────────────────────────────────────────────────────────

/** 이다(입니다) 꼴: 앞 글자 받침으로 예요·이에요. '것입니다'는 거예요. 받침을 모르면 null. */
function copulaForm(prefix: string, before: string): string | null {
  if (prefix.endsWith("것")) return `${prefix.slice(0, -1)}거예요`
  const final = hasFinal(prefix || before)
  if (final === null) return null
  return `${prefix}${final ? "이에요" : "예요"}`
}

/** 앞 글의 마지막 낱말. */
const previousWord = (before: string) => before.trimEnd().split(/\s+/).at(-1) ?? ""

/** '입니다'의 앞 글자열이 이-동사인지(보입니다 → 보여요). */
function isIVerb(prefix: string, before: string): boolean {
  if (I_VERBS_EXACT.has(prefix)) return true
  if (I_VERBS_SUFFIX.some((stem) => prefix.endsWith(stem))) return true
  if (I_VERBS_UNLESS_COUNTED.has(prefix)) return /\s$/.test(before) && !COUNTED_WORD_RE.test(previousWord(before))
  return false
}

/** 겁니다가 '-ㄹ 것입니다'의 준말인지(할 겁니다 → 할 거예요). 아니면 걸다(보호 잠금을 겁니다 → 걸어요). */
function isWillGeot(before: string): boolean {
  if (!/[가-힣]\s$/.test(before)) return false
  const word = previousWord(before)
  if (word.endsWith("를")) return false
  if (word.endsWith("을")) return ADNOMINAL_EUL.has(word)
  return decompose(word.at(-1))?.jong === J.rieul
}

/**
 * 문장 끝 낱말 하나(니다·니까로 끝나는 한글 글자열)를 요체로. run 은 '니다/니까' 앞 한글 글자열(받침 ㅂ 음절로 끝난다), ending 은 '니다'·'니까',
 * before 는 그 앞 글. 바꿀 수 없으면 null.
 */
export function convertNidaWord(run: string, ending: "니다" | "니까", before = ""): string | null {
  const tail = decompose(run.at(-1))
  if (!tail || tail.jong !== J.bieup) return null
  const head = run.slice(0, -1)
  const question = ending === "니까"
  const tailChar = run.at(-1)!
  // 습니다(·옛 읍니다): 받침 있는 어간.
  const consonant = tailChar === "습" || (tailChar === "읍" && (decompose(head.at(-1))?.jong ?? 0) !== J.none)
  if (consonant) {
    if (!head || !isHangul(head.at(-1))) return null
    if (question) return `${head}나요`
    if (head.endsWith("드리겠")) return `${head.slice(0, -3)}드릴게요`
    if (head.endsWith("하겠")) {
      const root = head.slice(0, -2)
      if (!ADJECTIVE_HA_ROOTS.some((adjective) => root.endsWith(adjective))) return `${root}할게요`
    }
    const form = consonantStemForm(head)
    return form ? `${form}요` : null
  }
  // ㅂ니다: 받침 없는 어간(마지막 음절의 ㅂ 을 뗀다).
  const stem = `${head}${compose(tail.cho, tail.jung)}`
  const last = stem.at(-1)!
  const prefix = stem.slice(0, -1)
  if (stem.endsWith("아니")) return question ? `${stem.slice(0, -1)}닌가요` : `${stem}에요`
  if (last === "이" && !isIVerb(prefix, before)) {
    if (question) return prefix || isHangul(before.trimEnd().at(-1)) ? `${prefix}인가요` : null
    return copulaForm(prefix, before)
  }
  // '-ㄹ 겁니다'(= 것입니다): 거예요·건가요.
  if (last === "거" && !prefix && isWillGeot(before)) return question ? "건가요" : "거예요"
  if (question) return last === "이" ? `${prefix}이나요` : `${stem}나요`
  // 여기까지 온 '이'는 이-동사(보이다·붙이다): 보여요.
  const form = last === "이" ? `${prefix}여` : vowelStemForm(stem, before)
  return form ? `${form}요` : null
}

// ─── 글 전체 ─────────────────────────────────────────────────────────────

/** 인용 구간(화면 문구): 따옴표·「」·『』·[ ]. 말투를 바꾸지 않는다(style-audit stripQuoted 와 같은 구간). */
const QUOTED_SPAN_RE = /'[^'\n]*'|"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’|「[^」\n]*」|『[^』\n]*』|\[[^\]\n]*\]/g

function quotedSpans(text: string): Array<[number, number]> {
  return Array.from(text.matchAll(QUOTED_SPAN_RE), (match) => [match.index ?? 0, (match.index ?? 0) + match[0].length] as [number, number])
}

const inSpans = (spans: ReadonlyArray<[number, number]>, at: number) => spans.some(([start, end]) => at >= start && at < end)

/**
 * 문장 끝: 뒤에 문장 부호·닫는 따옴표·괄호가 오고 이어서 공백·줄 끝(한글이 바로 붙지 않는다).
 * 콜론 뒤에 목록이 이어지는 앞말("…더 빨리 확인합니다: 쓰는 기기, …")도 문장 끝으로 본다(R3 반박 검토: 이 꼴이 니다체로 남아 말투가 섞였다).
 */
const SENTENCE_END = String.raw`(?=[.!?…~]*["'”’)\]」』]*[.!?…]*(?:\s|$)|[:：](?:\s|$))`
const NIDA_WORD_RE = new RegExp(String.raw`([가-힣]+)(니다|니까)${SENTENCE_END}`, "g")

/** 낱말 덩이 규칙(사전보다 먼저): '-하시기 바랍니다' → '-해 주세요', '-십시오' → '-세요'. */
const PHRASE_RULES: ReadonlyArray<{ re: RegExp; to: (match: RegExpExecArray) => string | null }> = [
  { re: new RegExp(String.raw`([가-힣]*?)하시(?:기를?|길)\s?바랍니다${SENTENCE_END}`, "g"), to: (m) => `${m[1]}해 주세요` },
  { re: new RegExp(String.raw`([가-힣]*?)주시(?:기를?|길)\s?바랍니다${SENTENCE_END}`, "g"), to: (m) => `${m[1]}주세요` },
  {
    re: new RegExp(String.raw`([가-힣]+?)으?시(?:기를?|길)\s?바랍니다${SENTENCE_END}`, "g"),
    to: (m) => {
      const stem = m[1]
      const last = decompose(stem.at(-1))
      if (!last) return null
      const form = last.jong === J.none ? vowelStemForm(stem, "") : consonantStemForm(stem)
      return form ? `${form} 주세요` : null
    },
  },
  { re: new RegExp(String.raw`(참고|확인|양해|문의|주의|협조|이용|숙지|참조)\s?바랍니다${SENTENCE_END}`, "g"), to: (m) => `${m[1]}해 주세요` },
  // 상담 마무리 줄의 "…알려 주시면 더 빨리 확인합니다"는 상대가 하는 일을 말하는 꼴이라 '확인해요'보다 '확인할 수 있어요'가 맞다(service 고정 문구와 같은 말).
  { re: new RegExp(String.raw`(더\s?빨리\s)확인합니다${SENTENCE_END}`, "g"), to: (m) => `${m[1]}확인할 수 있어요` },
  { re: new RegExp(String.raw`([가-힣]+)십시오${SENTENCE_END}`, "g"), to: (m) => `${m[1]}세요` },
]

interface Edit {
  start: number
  end: number
  to: string
}

/** 바꿀 자리 모음(인용 밖, 겹치지 않게 앞에서부터). */
function collectEdits(text: string): { edits: Edit[]; unconverted: string[] } {
  const spans = quotedSpans(text)
  const edits: Edit[] = []
  const unconverted: string[] = []
  const taken = (start: number, end: number) => edits.some((edit) => start < edit.end && end > edit.start)
  for (const rule of PHRASE_RULES) {
    rule.re.lastIndex = 0
    for (let match = rule.re.exec(text); match; match = rule.re.exec(text)) {
      const start = match.index
      const end = start + match[0].length
      if (inSpans(spans, start) || taken(start, end)) continue
      const to = rule.to(match)
      if (to !== null) edits.push({ start, end, to })
    }
  }
  NIDA_WORD_RE.lastIndex = 0
  for (let match = NIDA_WORD_RE.exec(text); match; match = NIDA_WORD_RE.exec(text)) {
    const start = match.index
    const end = start + match[0].length
    if (inSpans(spans, start) || taken(start, end)) continue
    const tail = decompose(match[1].at(-1))
    if (!tail || tail.jong !== J.bieup) continue // 그러니까 같은 낱말
    const to = convertNidaWord(match[1], match[2] as "니다" | "니까", text.slice(Math.max(0, start - 40), start))
    if (to === null) unconverted.push(match[0])
    else edits.push({ start, end, to })
  }
  edits.sort((a, b) => a.start - b.start)
  return { edits, unconverted }
}

function applyEdits(text: string, edits: readonly Edit[]): string {
  let out = ""
  let cursor = 0
  for (const edit of edits) {
    out += text.slice(cursor, edit.start) + edit.to
    cursor = edit.end
  }
  return out + text.slice(cursor)
}

const NEGATION_RE = /(않|없|못|안\s|불가|아니|아닙|아닌|말고|금지|지\s?마)/g

/** 토큰 보존 검사용 주머니: 숫자·[ ]·영문 토큰(정렬), 부정어 수. */
export function toneTokenBag(text: string) {
  const sorted = (values: string[]) => values.sort().join("|")
  return {
    numbers: sorted(Array.from(text.matchAll(/\d+(?:[.,]\d+)*/g), (m) => m[0])),
    brackets: sorted(Array.from(text.matchAll(/\[[^\]\n]+\]/g), (m) => m[0].replace(/\s+/g, ""))),
    english: sorted(Array.from(text.matchAll(/[A-Za-z][A-Za-z0-9.+-]*/g), (m) => m[0].toLowerCase())),
    negations: String(Array.from(text.matchAll(NEGATION_RE)).length),
  }
}

function sameTokens(a: string, b: string): boolean {
  const x = toneTokenBag(a)
  const y = toneTokenBag(b)
  return x.numbers === y.numbers && x.brackets === y.brackets && x.english === y.english && x.negations === y.negations
}

function violationKeys(text: string): Set<string> {
  return new Set(findSafetyViolations(text).map((rule) => rule.key))
}

export interface YoToneResult {
  text: string
  /** 바꾼 문장 끝 수(되돌렸으면 0). */
  changed: number
  /** 사전에 없어 바꾸지 않은 문장 끝 낱말(L18 경고, 사전 채우기용). */
  unconverted: string[]
  /** 토큰 보존·안전 규칙 검사에 걸려 원문을 그대로 냈는지. */
  reverted: boolean
}

/** 영어 답(한글이 없는 글)은 바꾸지 않는다. */
const hasHangul = (text: string) => /[가-힣]/.test(text)

/**
 * 니다체 문장 끝을 요체로 바꾼다. 인용 안·문장 끝이 아닌 자리·사전 밖 어간은 그대로 둔다. 토큰 보존·안전 규칙 검사에 걸리면 원문을 낸다.
 */
export function toYoTone(text: string): YoToneResult {
  if (!hasHangul(text) || (!/니[다까]/.test(text) && !/십시오/.test(text))) return { text, changed: 0, unconverted: [], reverted: false }
  const { edits, unconverted } = collectEdits(text)
  if (edits.length === 0) return { text, changed: 0, unconverted, reverted: false }
  const converted = applyEdits(text, edits)
  if (!sameTokens(text, converted)) return { text, changed: 0, unconverted, reverted: true }
  const before = violationKeys(text)
  if ([...violationKeys(converted)].some((key) => !before.has(key))) return { text, changed: 0, unconverted, reverted: true }
  return { text: converted, changed: edits.length, unconverted, reverted: false }
}

/** 글자 보존 대조용(shape.ts contentSignature): 검사 없이 같은 규칙으로만 바꾼다(전후 양쪽에 같은 변환을 걸어 비교한다). */
export function yoToneForSignature(text: string): string {
  if (!hasHangul(text)) return text
  const { edits } = collectEdits(text)
  return edits.length > 0 ? applyEdits(text, edits) : text
}
