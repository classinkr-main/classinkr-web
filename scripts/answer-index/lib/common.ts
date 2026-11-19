/**
 * 답 색인 스크립트 공용: 경로, 파일 읽기·쓰기, 평가셋 읽기.
 *
 * - 모든 출력은 같은 입력이면 같은 바이트가 되게 쓴다(시각·난수 없음, 키 순서 고정).
 * - 저장소 밖 묶음(개발용 dev5·holdout1·371, 확정용 holdout)은 인자·환경변수로만 받는다. 확정용 묶음 문장은 화면에 찍지 않는다.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { delimiter, dirname, join, relative, resolve, sep } from "node:path"

export const DATA_DIR_REL = "data/answer-index"

export function repoRoot() {
  return resolve(process.env.ANSWER_INDEX_ROOT || process.cwd())
}

/** 자료 폴더: ANSWER_INDEX_DATA_DIR(앞뒤 공백은 뗀다, 런타임 answerIndexDataDir 와 같이) 또는 <root>/data/answer-index. */
export function dataDir(root = repoRoot()) {
  return resolve(root, process.env.ANSWER_INDEX_DATA_DIR?.trim() || DATA_DIR_REL)
}

/** 저장소 기준 상대 경로(구분자는 /). */
export function toRepoPath(absPath: string, root = repoRoot()) {
  return relative(root, absPath).split(sep).join("/")
}

export function sha16Bytes(content: string | Buffer) {
  return createHash("sha256").update(content).digest("hex").slice(0, 16)
}

export function fileSha16(absPath: string) {
  return sha16Bytes(readFileSync(absPath))
}

/** 2칸 들여쓰기 JSON + 끝 줄바꿈. */
export function stableJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function writeJsonFile(absPath: string, value: unknown) {
  mkdirSync(dirname(absPath), { recursive: true })
  const content = stableJson(value)
  writeFileSync(absPath, content)
  return content
}

export function readJsonFile<T>(absPath: string): T {
  return JSON.parse(readFileSync(absPath, "utf8")) as T
}

export function readJsonIfExists<T>(absPath: string): T | null {
  return existsSync(absPath) ? readJsonFile<T>(absPath) : null
}

/** JSON Lines 읽기. 빈 줄은 건너뛴다. 줄 번호(1부터)를 함께 준다. */
export function readJsonLines<T>(absPath: string): { line: number; value: T }[] {
  const out: { line: number; value: T }[] = []
  readFileSync(absPath, "utf8")
    .split(/\r?\n/)
    .forEach((text, index) => {
      if (!text.trim()) return
      out.push({ line: index + 1, value: JSON.parse(text) as T })
    })
  return out
}

/** 디렉터리 아래 파일(재귀, 정렬). 없으면 빈 배열. */
export function listFilesRecursive(absDir: string): string[] {
  if (!existsSync(absDir)) return []
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else out.push(full)
    }
  }
  walk(absDir)
  return out
}

export function argValues(argv: string[], name: string): string[] {
  const values: string[] = []
  argv.forEach((arg, index) => {
    if (arg === name && argv[index + 1] !== undefined) values.push(argv[index + 1])
    else if (arg.startsWith(`${name}=`)) values.push(arg.slice(name.length + 1))
  })
  return values
}

export function hasFlag(argv: string[], name: string) {
  return argv.includes(name)
}

// ─── 질문 묶음 읽기 ─────────────────────────────────────────────────────

export interface QuestionSet {
  /** 표시 이름(파일 이름 또는 name=path 의 name). */
  name: string
  questions: string[]
  /** 원본 파일 내용 sha256 앞 16자. */
  sha: string
}

type QuestionLike = { question?: unknown; q?: unknown }

function pickQuestions(items: unknown): string[] {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      if (typeof item === "string") return item
      const value = item as QuestionLike
      return typeof value?.question === "string" ? value.question : typeof value?.q === "string" ? value.q : null
    })
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
}

/**
 * 질문 묶음 파일을 읽는다. 받는 꼴: 질문 배열, { cases }, { items }, { sets: [{ key, cases }] }.
 * 경로 끝에 #<key> 를 붙이면 sets 가운데 그 묶음만 읽는다.
 */
export function loadQuestionSet(spec: string, root = repoRoot()): QuestionSet {
  const named = spec.match(/^([A-Za-z0-9_.-]+)=(.+)$/)
  const rawPath = named ? named[2] : spec
  const [pathPart, setKey] = rawPath.split("#")
  const absPath = resolve(root, pathPart)
  const content = readFileSync(absPath)
  const parsed = JSON.parse(content.toString("utf8")) as unknown
  let questions: string[] = []
  if (Array.isArray(parsed)) questions = pickQuestions(parsed)
  else if (parsed && typeof parsed === "object") {
    const obj = parsed as { cases?: unknown; items?: unknown; sets?: unknown }
    if (Array.isArray(obj.sets)) {
      const sets = obj.sets as { key?: string; cases?: unknown }[]
      questions = sets.filter((set) => !setKey || set.key === setKey).flatMap((set) => pickQuestions(set.cases))
    } else questions = pickQuestions(obj.cases ?? obj.items)
  }
  const baseName = pathPart.split(/[\\/]/).pop() ?? pathPart
  return {
    name: named ? named[1] : setKey ? `${baseName}#${setKey}` : baseName,
    questions,
    sha: sha16Bytes(content),
  }
}

/** 쉼표·경로 구분자로 나눈 묶음 목록(인자와 환경변수를 합친다). */
export function splitSetSpecs(values: (string | undefined)[]) {
  return values
    .flatMap((value) => (value ?? "").split(","))
    .flatMap((value) => value.split(delimiter))
    .map((value) => value.trim())
    .filter(Boolean)
}

/** 저장소 평가셋(질문 글은 저장소에 이미 있다). key 는 inventory 걸림 수의 칸 이름. */
export const REPO_EVAL_SETS = [
  { key: "firstContact", path: "data/chatbot-first-contact-set.json" },
  { key: "fresh", path: "data/chatbot-fresh-open-set.json" },
  { key: "golden", path: "data/chatbot-golden-set.json" },
  { key: "csSymptom", path: "data/chatbot-cs-symptom-set.json" },
  { key: "persona", path: "data/chatbot-persona-eval-set.json" },
] as const

export type RepoEvalSetKey = (typeof REPO_EVAL_SETS)[number]["key"]

export function loadRepoEvalSets(root = repoRoot()) {
  return REPO_EVAL_SETS.map((set) => ({ key: set.key, set: { ...loadQuestionSet(set.path, root), name: set.path } }))
}

/** 개발용 외부 묶음: --dev-sets 인자와 ANSWER_INDEX_DEV_SETS. */
export function devSetSpecs(argv: string[]) {
  return splitSetSpecs([...argValues(argv, "--dev-sets"), process.env.ANSWER_INDEX_DEV_SETS])
}

/** 확정용 묶음: --with-holdout 인자와 ANSWER_INDEX_HOLDOUT_SETS. 문장은 기계적으로만 읽고 개수만 찍는다. */
export function holdoutSetSpecs(argv: string[]) {
  return splitSetSpecs([...argValues(argv, "--with-holdout"), process.env.ANSWER_INDEX_HOLDOUT_SETS])
}
