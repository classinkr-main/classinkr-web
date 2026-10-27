"use client"

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react"
import { useEditor, EditorContent, Mark, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import Placeholder from "@tiptap/extension-placeholder"
import Link from "@tiptap/extension-link"
import Image from "@tiptap/extension-image"
import { TableKit } from "@tiptap/extension-table"
import { Markdown } from "tiptap-markdown"
import { Image as ImageIcon, LayoutTemplate, Link2, Loader2, Sparkles, Upload, Wand2, X } from "lucide-react"
import type { JSONContent, MarkdownParseHelpers, MarkdownParseResult, MarkdownToken } from "@tiptap/core"
import {
  buildSlashCommandMarkdown,
  filterSlashCommands,
  type SlashCommand,
} from "@/lib/admin/docs-editor-usability"
import {
  hasAttachmentImageReference,
  LOCAL_IMAGE_ACCEPT,
  normalizeLocalImageFiles,
} from "@/lib/admin/local-image-upload"
import {
  normalizePublicImageUrl,
  TEMP_ATTACHMENT_IMAGE_ERROR,
  UNSAFE_IMAGE_URL_ERROR,
} from "@/lib/admin/public-content-validation"
import { getAdminToken } from "@/lib/admin-client"

// 공개 렌더러 전용 인라인 문법({{green:…}}, ==…==)을 편집기의 진짜 서식(마크)으로 읽고 쓴다.
// 예전엔 글자 그대로 들고 표식만 숨겨서, 커서가 들어가면 "{{green:" "}}" 가 드러났고 굵게와 겹치면 숨김이 깨졌다.
// 저장되는 마크다운은 그대로다 — 마크가 같은 표식으로 직렬화된다(lib/blog-markdown.ts 가 그린다).
type InlineRuleState = {
  src: string
  pos: number
  posMax: number
  md: { inline: { tokenize: (state: InlineRuleState) => void } }
  push: (type: string, tag: string, nesting: number) => unknown
}
type MarkdownItLike = {
  inline: { ruler: { before: (beforeName: string, ruleName: string, rule: (state: InlineRuleState, silent: boolean) => boolean) => void } }
  renderer: { rules: Record<string, unknown> }
}

// tiptap-markdown 은 parse 때마다 setup 을 다시 부른다 — 같은 규칙이 쌓이지 않게 한 번만 등록한다.
const registeredWrapRules = new WeakMap<object, Set<string>>()

/** open…close 를 같은 HTML 로 감싸는 인라인 규칙. 안쪽의 굵게·기울임·링크는 그대로 파싱된다. */
function registerWrapRule(md: MarkdownItLike, name: string, open: string, close: string, html: [string, string]) {
  const names = registeredWrapRules.get(md) ?? new Set<string>()
  if (names.has(name)) return
  names.add(name)
  registeredWrapRules.set(md, names)

  md.inline.ruler.before("emphasis", name, (state, silent) => {
    const start = state.pos
    if (!state.src.startsWith(open, start)) return false
    const contentStart = start + open.length
    // 공개 렌더러와 같은 규칙: 가장 가까운 닫는 표식까지, 비어 있으면 서식이 아니다.
    const end = state.src.indexOf(close, contentStart)
    if (end <= contentStart || end + close.length > state.posMax) return false
    if (!silent) {
      state.push(`${name}_open`, "", 1)
      const outerMax = state.posMax
      state.pos = contentStart
      state.posMax = end
      state.md.inline.tokenize(state)
      state.posMax = outerMax
      state.push(`${name}_close`, "", -1)
    }
    state.pos = end + close.length
    return true
  })
  md.renderer.rules[`${name}_open`] = () => html[0]
  md.renderer.rules[`${name}_close`] = () => html[1]
}

// 브랜드색 {{green:…}}. 툴바 '브랜드색'이 굵게처럼 켜고 끈다.
const BrandGreen = Mark.create({
  name: "brandGreen",
  parseHTML() {
    return [{ tag: "span[data-brand-green]" }]
  },
  renderHTML() {
    return ["span", { "data-brand-green": "", class: "rich-editor-brand-green" }, 0]
  },
  addStorage() {
    return {
      markdown: {
        serialize: { open: "{{green:", close: "}}", mixable: true, expelEnclosingWhitespace: true },
        parse: {
          setup(md: MarkdownItLike) {
            registerWrapRule(md, "brand_green", "{{green:", "}}", ['<span data-brand-green="">', "</span>"])
          },
        },
      },
    }
  },
})

// 툴바 형광펜(Highlight 마크)을 공개 렌더러 문법 ==…== 로 저장한다. tiptap-markdown 기본값은
// html 모드에서만 <mark> 로 쓰고 html:false 에서는 표식을 버려, 저장하면 형광펜이 사라졌다.
const MarkdownHighlight = Highlight.extend({
  addStorage() {
    return {
      markdown: {
        serialize: { open: "==", close: "==", mixable: true, expelEnclosingWhitespace: true },
        // 저장된 ==…== 를 다시 형광펜 마크로 읽는다(Highlight 는 <mark> 를 마크로 받는다).
        parse: {
          setup(md: MarkdownItLike) {
            registerWrapRule(md, "classin_mark", "==", "==", ["<mark>", "</mark>"])
          },
        },
      },
    }
  },
})

const IMAGE_WIDTH_PRESETS = [
  { label: "가득", value: "" },
  { label: "크게", value: "720" },
  { label: "보통", value: "560" },
  { label: "작게", value: "360" },
] as const

type SavedSelection = { from: number; to: number }
type ImageInsertItem = { src: string; alt: string; width?: number }

function getClipboardImageFiles(dataTransfer: DataTransfer) {
  const itemFiles = Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file && file.type.startsWith("image/")))

  if (itemFiles.length > 0) return itemFiles

  return Array.from(dataTransfer.files ?? []).filter((file) => file.type.startsWith("image/"))
}

function escapeMarkdown(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\]/g, "\\]")
}

function normalizeImageWidth(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10)
  if (!Number.isFinite(numberValue)) return null
  return Math.min(1200, Math.max(120, Math.round(numberValue)))
}

function parseImageTitle(rawTitle: unknown) {
  const title = typeof rawTitle === "string" ? rawTitle : ""
  const widthMatch = title.match(/(?:^|\s|\|)width=(\d{2,4})(?:px)?(?:\s|\||$)/i)
  const width = widthMatch ? normalizeImageWidth(widthMatch[1]) : null
  const cleanTitle = title
    .replace(/\s*\|?\s*width=\d{2,4}(?:px)?\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim()

  return { title: cleanTitle || null, width }
}

/**
 * 내재 크기가 없는 이미지(viewBox 만 있는 SVG 가 대표적)가 편집 영역에서 0×0 으로
 * 접히는 것을 막는다.
 *
 * 리사이즈 노드뷰는 `<div display:flex>` 컨테이너 > `<div position:relative>` 래퍼 >
 * `<img>` 구조를 만든다. 래퍼는 flex 자식이라 폭이 shrink-to-fit 인데, 내재 폭 없이
 * 비율만 있는 이미지는 최대콘텐츠 기여가 0 이라 래퍼가 0 으로 접히고 이미지도 함께
 * 사라진다(Chrome 실측). 편집자에게는 빈 자리로 보여 실수로 지우기 쉽다.
 *
 * 그래서 실제로 접혔을 때만 래퍼를 컨테이너 폭까지 늘려 비율대로 그린다. 폭이 정해진
 * 이미지(리사이즈 결과 = img 인라인 style)는 건드리지 않아야 리사이즈 핸들이 이미지
 * 모서리에 붙어 있으므로, img 의 style 변화를 관찰해 폴백을 되돌린다.
 *
 * @returns 정리 함수. 이미지가 없으면 null.
 */
function keepCollapsedImageVisible(container: HTMLElement): (() => void) | null {
  const image = container.querySelector("img")
  if (!image) return null

  const syncWrapperWidth = () => {
    const wrapper = image.parentElement
    if (!wrapper) return
    if (image.style.width) {
      // 폭이 정해졌다 — 래퍼는 이미지 크기로 되돌린다(핸들이 이미지에 붙게).
      wrapper.style.width = ""
      return
    }
    // 폴백을 이미 적용했다면 다시 재지 않는다. 폴백 덕에 폭이 생겼으므로 진동한다.
    if (wrapper.style.width) return
    // 아직 문서에 붙기 전이거나 로드 전이면 폭이 0 인 게 정상이다 — 접힘으로 오판하면
    // 정상 이미지까지 전폭으로 늘어난다. load 이벤트가 다시 부른다.
    if (!image.isConnected) return
    if (!image.complete || image.naturalWidth === 0) return
    if (image.getBoundingClientRect().width > 0) return
    wrapper.style.width = "100%"
  }

  // requestAnimationFrame 은 숨은 탭·숨은 패널에서 아예 발화하지 않는다(실측). 편집기는
  // 탭 뒤에서 마운트될 수 있으므로 타이머로 미룬다.
  let timer: number | null = null
  const schedule = () => {
    if (timer !== null) return
    timer = window.setTimeout(() => {
      timer = null
      syncWrapperWidth()
    }, 0)
  }

  image.addEventListener("load", schedule)
  // 리사이즈 중·직후에는 노드뷰가 img 인라인 style 로 폭을 쓴다 — 그때 폴백을 되돌린다.
  const styleObserver = new MutationObserver(schedule)
  styleObserver.observe(image, { attributes: true, attributeFilter: ["style"] })
  schedule()

  return () => {
    if (timer !== null) window.clearTimeout(timer)
    image.removeEventListener("load", schedule)
    styleObserver.disconnect()
  }
}

const ResizableMarkdownImage = Image.extend({
  addNodeView() {
    const renderNodeView = this.parent?.()
    if (!renderNodeView) return null

    return (props) => {
      const nodeView = renderNodeView(props)
      const cleanup =
        nodeView.dom instanceof HTMLElement ? keepCollapsedImageVisible(nodeView.dom) : null
      if (!cleanup) return nodeView

      const destroyNodeView = nodeView.destroy?.bind(nodeView)
      nodeView.destroy = () => {
        cleanup()
        destroyNodeView?.()
      }
      return nodeView
    }
  },
  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult => {
    const { title, width } = parseImageTitle(token.title)
    return helpers.createNode("image", {
      src: typeof token.href === "string" ? token.href : "",
      alt: typeof token.text === "string" ? token.text : "",
      title,
      ...(width ? { width } : {}),
    })
  },
  renderMarkdown: (node: JSONContent) => imageToMarkdown(node.attrs ?? {}),
  // 실제 저장 경로(tiptap-markdown). 이미지는 블록 노드라 closeBlock 이 없으면 다음 문단이
  // 같은 줄(`![..](..)문단`)에 붙어 공개 페이지에서 원문 그대로 보였다.
  addStorage() {
    return {
      ...this.parent?.(),
      markdown: {
        serialize(state: { write: (text: string) => void; closeBlock: (node: unknown) => void }, node: { attrs: Record<string, unknown> }) {
          state.write(imageToMarkdown(node.attrs))
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})

function imageToMarkdown(attrs: Record<string, unknown>) {
  const rawSrc = typeof attrs.src === "string" ? attrs.src : ""
  const alt = typeof attrs.alt === "string" ? attrs.alt : ""
  // markdown-it 이 퍼센트 인코딩한 한글 경로를 원래 표기로 되돌린다(공백·괄호만 다시 인코딩).
  let src = rawSrc
  try {
    src = decodeURI(rawSrc)
  } catch {
    src = rawSrc
  }
  src = src.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29")
  // 불러온 글의 width= 는 제목 문자열에 남아 있다 — 리사이즈한 폭이 있으면 그것을, 없으면 원래 값을 쓴다.
  const parsed = parseImageTitle(attrs.title)
  const width = normalizeImageWidth(attrs.width) ?? parsed.width
  const titleParts = [parsed.title ?? "", width ? `width=${width}` : ""].filter(Boolean)

  return titleParts.length > 0
    ? `![${escapeMarkdown(alt)}](${src} "${escapeMarkdown(titleParts.join(" | "))}")`
    : `![${escapeMarkdown(alt)}](${src})`
}

// onChange 트레일링 디바운스(ms): 키 입력마다 마크다운 직렬화 + 부모(수천 줄) 전체 리렌더를 막는다.
const EMIT_DEBOUNCE_MS = 200

export interface RichMarkdownEditorHandle {
  /** 디바운스로 대기 중인 본문 변경을 부모로 즉시 전파한다 — 저장(버튼/Cmd+S) 직전에 호출. */
  flush: () => void
  toggleBold: () => void
  toggleItalic: () => void
  setHeading: (level: 2 | 3) => void
  toggleBlockquote: () => void
  toggleBulletList: () => void
  toggleOrderedList: () => void
  toggleHighlight: () => void
  wrapBrandColor: () => void
  insertLink: () => void
  insertImage: () => void
  insertMarkdown: (markdown: string) => void
  insertDivider: () => void
}

interface RichMarkdownEditorProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  imageUploadEndpoint?: string
  onTemplateClick?: () => void
  onAiDraftClick?: () => void
  onSelectionOptimize?: (text: string) => void
}

const RichMarkdownEditor = forwardRef<RichMarkdownEditorHandle, RichMarkdownEditorProps>(
  function RichMarkdownEditor(
    {
      value,
      onChange,
      placeholder = "본문을 작성해주세요",
      imageUploadEndpoint,
      onTemplateClick,
      onAiDraftClick,
      onSelectionOptimize,
    },
    ref
  ) {
    const lastEmitted = useRef(value)
    const skipNextUpdate = useRef(false)
    const onChangeRef = useRef(onChange)
    const emitTimerRef = useRef<number | null>(null)
    const pendingEmitRef = useRef(false)
    const savedSelection = useRef<SavedSelection | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [hasSelection, setHasSelection] = useState(false)
    const [showImageDialog, setShowImageDialog] = useState(false)
    const [imageUrl, setImageUrl] = useState("")
    const [imageAlt, setImageAlt] = useState("")
    const [imageWidth, setImageWidth] = useState<(typeof IMAGE_WIDTH_PRESETS)[number]["value"]>("")
    const [imageError, setImageError] = useState("")
    const [uploadingImages, setUploadingImages] = useState(false)
    const [draggingImages, setDraggingImages] = useState(false)
    const [slashMenu, setSlashMenu] = useState<{ query: string; range: SavedSelection } | null>(null)
    const [slashIndex, setSlashIndex] = useState(0)
    const slashQuery = slashMenu?.query ?? ""
    const slashCommands = useMemo(
      () => (slashMenu ? filterSlashCommands(slashQuery).slice(0, 6) : []),
      [slashMenu, slashQuery]
    )

    useEffect(() => {
      setSlashIndex(0)
    }, [slashQuery])

    useEffect(() => {
      onChangeRef.current = onChange
    }, [onChange])

    const clearEmitTimer = useCallback(() => {
      if (emitTimerRef.current !== null) {
        window.clearTimeout(emitTimerRef.current)
        emitTimerRef.current = null
      }
    }, [])

    // 대기 중 변경을 지금 직렬화해 부모로 전파한다.
    // 에디터를 변형하지 않는 읽기 전용 경로라 한글 IME 조합(composition)을 깨지 않으며,
    // lastEmitted를 먼저 갱신하므로 부모 에코(value 동기화 effect)가 setContent를 호출하지 않는다.
    const emitPendingChange = useCallback(
      (editorInstance: Editor) => {
        clearEmitTimer()
        if (!pendingEmitRef.current || editorInstance.isDestroyed) return
        pendingEmitRef.current = false
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const markdown = (editorInstance.storage as any).markdown.getMarkdown() as string
        if (markdown === lastEmitted.current) return
        lastEmitted.current = markdown
        onChangeRef.current(markdown)
      },
      [clearEmitTimer]
    )

    // 트레일링 디바운스 예약. 한글 IME 주의: 조합 중(view.composing)에는 발화를 연기하고
    // (한글은 마지막 음절이 조합 상태로 남을 수 있다) 조합 종료 후 첫 만료 때 전파한다.
    const scheduleEmit = useCallback(
      (editorInstance: Editor) => {
        const arm = () => {
          clearEmitTimer()
          emitTimerRef.current = window.setTimeout(() => {
            emitTimerRef.current = null
            if (editorInstance.isDestroyed) return
            if (editorInstance.view.composing) {
              arm()
              return
            }
            emitPendingChange(editorInstance)
          }, EMIT_DEBOUNCE_MS)
        }
        arm()
      },
      [clearEmitTimer, emitPendingChange]
    )

    const closeImageDialog = () => {
      setShowImageDialog(false)
      setImageError("")
    }

    const selectedWidth = () => normalizeImageWidth(imageWidth) ?? undefined

    const insertImages = (items: ImageInsertItem[]) => {
      if (!editor || items.length === 0) return
      const selection = savedSelection.current
      const chain = editor.chain().focus()
      if (selection) chain.setTextSelection(selection)

      chain
        .insertContent(
          items.flatMap((item, index) => [
            {
              type: "image",
              attrs: {
                src: item.src,
                alt: item.alt,
                ...(item.width ? { width: item.width } : {}),
              },
            },
            ...(index === items.length - 1 ? [{ type: "paragraph" }] : []),
          ])
        )
        .run()
      savedSelection.current = null
    }

    const uploadFile = async (file: File) => {
      if (!imageUploadEndpoint) throw new Error("업로드 경로가 설정되지 않았습니다.")
      const formData = new FormData()
      formData.append("file", file)
      const response = await fetch(imageUploadEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAdminToken()}` },
        body: formData,
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error || `${file.name} 업로드에 실패했습니다.`)
      }
      const data = (await response.json()) as { url?: string }
      if (!data.url) throw new Error(`${file.name} 업로드 URL을 받지 못했습니다.`)
      return data.url
    }

    const handleFiles = async (files: FileList | File[]) => {
      const result = normalizeLocalImageFiles(Array.from(files))
      if (!result.ok) {
        setImageError(result.message)
        return
      }
      if (result.files.length === 0) return

      setUploadingImages(true)
      setImageError("")
      try {
        const uploaded: ImageInsertItem[] = []
        for (const file of result.files) {
          const src = await uploadFile(file)
          const filename = file.name || `clipboard-image-${uploaded.length + 1}`
          uploaded.push({
            src,
            alt: imageAlt.trim() || filename.replace(/\.[^.]+$/, ""),
            width: selectedWidth(),
          })
        }
        insertImages(uploaded)
        setImageAlt("")
        closeImageDialog()
      } catch (error) {
        setImageError(error instanceof Error ? error.message : "이미지 업로드 중 오류가 발생했습니다.")
      } finally {
        setUploadingImages(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    }

    const hasDraggedFiles = (event: DragEvent<HTMLElement>) =>
      Array.from(event.dataTransfer.types).includes("Files")

    const saveDropSelection = (event: DragEvent<HTMLElement>) => {
      const position = editor?.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      })
      if (position) savedSelection.current = { from: position.pos, to: position.pos }
    }

    const handleEditorDragEnter = (event: DragEvent<HTMLDivElement>) => {
      if (!imageUploadEndpoint || !hasDraggedFiles(event)) return
      event.preventDefault()
      setDraggingImages(true)
    }

    const handleEditorDragOver = (event: DragEvent<HTMLDivElement>) => {
      if (!imageUploadEndpoint || !hasDraggedFiles(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "copy"
      setDraggingImages(true)
    }

    const handleEditorDragLeave = (event: DragEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null
      if (nextTarget && event.currentTarget.contains(nextTarget)) return
      setDraggingImages(false)
    }

    const handleEditorDrop = (event: DragEvent<HTMLDivElement>) => {
      if (!imageUploadEndpoint) return
      const files = Array.from(event.dataTransfer.files)
      if (files.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      setDraggingImages(false)
      saveDropSelection(event)
      void handleFiles(files)
    }

    const handleEditorPaste = (event: ClipboardEvent<HTMLDivElement>) => {
      if (!imageUploadEndpoint) return

      const files = getClipboardImageFiles(event.clipboardData)
      if (files.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        if (editor) {
          const { from, to } = editor.state.selection
          savedSelection.current = { from, to }
        }
        void handleFiles(files)
        return
      }

      const html = event.clipboardData.getData("text/html")
      const text = event.clipboardData.getData("text/plain")
      if (hasAttachmentImageReference(html) || hasAttachmentImageReference(text)) {
        event.preventDefault()
        event.stopPropagation()
        setImageError(TEMP_ATTACHMENT_IMAGE_ERROR)
      }
    }

    const canOpenSlashMenu = () => {
      if (!editor) return false
      const { from, to } = editor.state.selection
      if (from !== to) return false
      const previousText = editor.state.doc.textBetween(Math.max(0, from - 1), from, "\n", "\n")
      return previousText === "" || /\s/.test(previousText)
    }

    const closeSlashMenuAsText = (suffix = "") => {
      if (!editor || !slashMenu) {
        setSlashMenu(null)
        return
      }
      editor
        .chain()
        .focus()
        .setTextSelection(slashMenu.range)
        .insertContent(`/${slashMenu.query}${suffix}`)
        .run()
      setSlashMenu(null)
    }

    const runSlashCommand = (command: SlashCommand) => {
      if (!editor || !slashMenu) return
      const chain = editor.chain().focus().setTextSelection(slashMenu.range)
      setSlashMenu(null)

      if (command.id === "image") {
        savedSelection.current = slashMenu.range
        setImageError("")
        setShowImageDialog(true)
        return
      }

      if (command.id === "h2" || command.id === "h3") {
        chain
          .insertContent([
            {
              type: "heading",
              attrs: { level: command.id === "h2" ? 2 : 3 },
              content: [{ type: "text", text: command.id === "h2" ? "새 섹션" : "세부 항목" }],
            },
            { type: "paragraph" },
          ])
          .run()
        return
      }

      if (command.id === "divider") {
        chain.setHorizontalRule().run()
        return
      }

      chain.insertContent(buildSlashCommandMarkdown(command.id)).run()
    }

    const handleEditorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (!editor || event.metaKey || event.ctrlKey || event.altKey) return

      if (slashMenu) {
        if (event.key === "ArrowDown") {
          event.preventDefault()
          setSlashIndex((current) => (slashCommands.length === 0 ? 0 : (current + 1) % slashCommands.length))
          return
        }
        if (event.key === "ArrowUp") {
          event.preventDefault()
          setSlashIndex((current) =>
            slashCommands.length === 0 ? 0 : (current - 1 + slashCommands.length) % slashCommands.length
          )
          return
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault()
          const command = slashCommands[Math.min(slashIndex, slashCommands.length - 1)]
          if (command) runSlashCommand(command)
          return
        }
        if (event.key === "Escape") {
          event.preventDefault()
          closeSlashMenuAsText()
          return
        }
        if (event.key === "Backspace") {
          event.preventDefault()
          if (!slashMenu.query) {
            setSlashMenu(null)
            return
          }
          setSlashMenu({ ...slashMenu, query: slashMenu.query.slice(0, -1) })
          return
        }
        if (event.key === " ") {
          event.preventDefault()
          closeSlashMenuAsText(" ")
          return
        }
        if (event.key.length === 1) {
          event.preventDefault()
          setSlashMenu({ ...slashMenu, query: `${slashMenu.query}${event.key}` })
        }
        return
      }

      if (event.key === "/" && canOpenSlashMenu()) {
        event.preventDefault()
        const { from, to } = editor.state.selection
        setSlashMenu({ query: "", range: { from, to } })
      }
    }

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({ link: false }),
        MarkdownHighlight.configure({ multicolor: false }),
        BrandGreen,
        Link.configure({ openOnClick: false }),
        ResizableMarkdownImage.configure({
          allowBase64: false,
          resize: {
            enabled: true,
            directions: ["bottom-left", "bottom-right", "top-left", "top-right"],
            minWidth: 120,
            minHeight: 80,
            alwaysPreserveAspectRatio: true,
          },
        }),
        // 블로그 본문 표(비교표·요약표)가 편집 탭에서 문단으로 풀려 저장 시 사라지지 않게 한다.
        // tiptap-markdown 은 "table" 노드가 있을 때만 표를 마크다운 표로 다시 쓴다.
        TableKit.configure({ table: { resizable: false } }),
        Placeholder.configure({ placeholder }),
        Markdown.configure({
          html: false,
          // 줄바꿈을 지킨다 — 끄면 인용 상자(여러 줄 > …)가 한 줄로 합쳐져 공개 페이지 줄바꿈이 사라진다.
          // 줄 끝 역슬래시로 저장되고 lib/blog-markdown.ts 가 줄바꿈으로 그린다.
          breaks: true,
          tightLists: true,
          bulletListMarker: "-",
          transformPastedText: true,
        }),
      ],
      content: value,
      editorProps: {
        attributes: { class: "rich-editor-content" },
      },
      onUpdate({ editor }) {
        if (skipNextUpdate.current) {
          skipNextUpdate.current = false
          return
        }
        // 키 입력마다 직렬화·부모 리렌더하지 않고 트레일링 디바운스로 모아 전파한다.
        // 저장 경로는 flush()로 대기분을 즉시 회수한다.
        pendingEmitRef.current = true
        scheduleEmit(editor)
      },
      onSelectionUpdate({ editor }) {
        const { from, to } = editor.state.selection
        setHasSelection(to - from > 5)
      },
    })

    // 외부에서 value가 변경될 때(언두/리두, 드래프트 불러오기 등) 에디터에 반영
    useEffect(() => {
      if (!editor || value === lastEmitted.current) return
      // 외부 주입이 이기도록 디바운스 대기분은 폐기한다
      // (주입 직후 타이머가 만료되며 정규화된 마크다운을 역전파하는 것 방지).
      clearEmitTimer()
      pendingEmitRef.current = false
      lastEmitted.current = value
      skipNextUpdate.current = true
      editor.commands.setContent(value)
    }, [editor, value, clearEmitTimer])

    // 언마운트(블로그 작성/미리보기 탭 전환 등) 시 대기 중 변경을 마지막으로 전파해 상실을 막는다.
    useEffect(() => {
      if (!editor) return
      return () => {
        if (!pendingEmitRef.current) return
        pendingEmitRef.current = false
        clearEmitTimer()
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const markdown = (editor.storage as any).markdown.getMarkdown() as string
          if (markdown !== lastEmitted.current) {
            lastEmitted.current = markdown
            onChangeRef.current(markdown)
          }
        } catch {
          // 에디터가 이미 파괴돼 직렬화가 불가하면 마지막 전파본을 유지한다.
        }
      }
    }, [editor, clearEmitTimer])

    const isEmpty = editor?.isEmpty ?? (!value || value.trim() === "")

    useImperativeHandle(ref, () => ({
      flush: () => {
        if (!editor) return
        emitPendingChange(editor)
      },
      toggleBold: () => editor?.chain().focus().toggleBold().run(),
      toggleItalic: () => editor?.chain().focus().toggleItalic().run(),
      setHeading: (level) => editor?.chain().focus().toggleHeading({ level }).run(),
      toggleBlockquote: () => editor?.chain().focus().toggleBlockquote().run(),
      toggleBulletList: () => editor?.chain().focus().toggleBulletList().run(),
      toggleOrderedList: () => editor?.chain().focus().toggleOrderedList().run(),
      toggleHighlight: () => editor?.chain().focus().toggleHighlight().run(),
      // 굵게처럼 선택 구간에 켜고 끈다(선택이 없으면 이어서 치는 글자에 적용).
      wrapBrandColor: () => editor?.chain().focus().toggleMark("brandGreen").run(),
      insertLink: () => {
        if (!editor) return
        const { from, to } = editor.state.selection
        if (from !== to) {
          const url = window.prompt("링크 URL을 입력하세요:")
          if (url) editor.chain().focus().setLink({ href: url }).run()
        } else {
          const url = window.prompt("링크 URL을 입력하세요:")
          if (!url) return
          const label = window.prompt("링크 텍스트:") ?? url
          editor
            .chain()
            .focus()
            .insertContent({
              type: "text",
              text: label,
              marks: [{ type: "link", attrs: { href: url } }],
            })
            .run()
        }
      },
      insertImage: () => {
        if (editor) {
          const { from, to } = editor.state.selection
          savedSelection.current = { from, to }
        }
        setImageError("")
        setShowImageDialog(true)
      },
      insertMarkdown: (markdown) => {
        if (!editor || !markdown.trim()) return
        editor.chain().focus().insertContent(markdown).run()
      },
      insertDivider: () => editor?.chain().focus().setHorizontalRule().run(),
    }), [editor, emitPendingChange])

    const handleOptimizeClick = () => {
      if (!onSelectionOptimize) return
      if (hasSelection && editor) {
        const { from, to } = editor.state.selection
        const text = editor.state.doc.textBetween(from, to, "\n")
        if (text.trim()) { onSelectionOptimize(text); return }
      }
      onSelectionOptimize("")
    }

    const hasQuickActions = onTemplateClick || onAiDraftClick || onSelectionOptimize

    return (
      <div className="relative">
        {slashMenu && (
          <div className="absolute left-5 top-5 z-30 w-[min(340px,calc(100%-40px))] overflow-hidden rounded-xl border border-[#e8e8e4] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#f0f0ec] px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1a1a1a]/45">
                / 명령
              </span>
              <span className="font-mono text-[11px] text-[#084734]">
                {slashQuery ? `/${slashQuery}` : "/"}
              </span>
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5">
              {slashCommands.length === 0 ? (
                <div className="px-3 py-4 text-center text-[12px] text-[#1a1a1a]/35">
                  일치하는 명령이 없습니다
                </div>
              ) : (
                slashCommands.map((command, index) => {
                  const active = index === Math.min(slashIndex, slashCommands.length - 1)
                  return (
                    <button
                      key={command.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => runSlashCommand(command)}
                      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        active ? "bg-[#ECFDF5] text-[#084734]" : "text-[#111110] hover:bg-[#F6F5F4]"
                      }`}
                    >
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${
                        active ? "border-[#084734]/25 bg-white" : "border-[#e8e8e4] bg-[#FAFAF8]"
                      }`}>
                        {command.id === "image" ? <ImageIcon className="h-3.5 w-3.5" /> : command.label.slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold">{command.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-[#1a1a1a]/45">
                          {command.description}
                        </span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}

        {showImageDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
            <div className="w-full max-w-[520px] rounded-2xl border border-[#e8e8e4] bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#111110]">이미지 삽입</p>
                  <p className="mt-1 text-[12px] text-[#1a1a1a]/45">
                    커서 위치에 들어가며, 여러 장을 선택하면 선택 순서대로 삽입됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeImageDialog}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#1a1a1a]/35 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
                  aria-label="닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-[#1a1a1a]/55">
                    이미지 설명
                  </label>
                  <input
                    value={imageAlt}
                    onChange={(event) => setImageAlt(event.target.value)}
                    placeholder="예) 세미나 현장 사진"
                    className="h-10 w-full rounded-xl border border-[#e8e8e4] bg-white px-3 text-sm outline-none transition-colors focus:border-[#084734]"
                  />
                </div>

                <div>
                  <p className="mb-1.5 text-[12px] font-medium text-[#1a1a1a]/55">초기 크기</p>
                  <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-[#f5f5f2] p-1">
                    {IMAGE_WIDTH_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setImageWidth(preset.value)}
                        className={`rounded-lg px-2 py-2 text-[12px] font-medium transition-colors ${
                          imageWidth === preset.value
                            ? "bg-white text-[#084734] shadow-sm"
                            : "text-[#1a1a1a]/45 hover:text-[#111110]"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-[#1a1a1a]/35">
                    삽입 후 이미지를 클릭하고 모서리를 드래그하면 다시 조절할 수 있습니다.
                  </p>
                </div>

                {imageUploadEndpoint && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={LOCAL_IMAGE_ACCEPT}
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        if (event.target.files) void handleFiles(event.target.files)
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImages}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#084734]/30 bg-emerald-50/50 px-4 py-4 text-sm font-semibold text-[#084734] transition-colors hover:border-[#084734]/60 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploadingImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {uploadingImages ? "업로드 중..." : "파일 업로드해서 삽입"}
                    </button>
                    <p className="mt-1.5 text-center text-[11px] text-[#1a1a1a]/35">
                      JPG, PNG, WebP, GIF · 파일당 최대 5MB
                    </p>
                  </div>
                )}

                <div className="relative flex items-center gap-2 text-[11px] text-[#1a1a1a]/30">
                  <span className="h-px flex-1 bg-[#e8e8e4]" />
                  <span>또는 URL로 삽입</span>
                  <span className="h-px flex-1 bg-[#e8e8e4]" />
                </div>

                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/25" />
                    <input
                      value={imageUrl}
                      onChange={(event) => setImageUrl(event.target.value)}
                      placeholder="https://... 또는 /images/..."
                      className="h-10 w-full rounded-xl border border-[#e8e8e4] bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#084734]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const src = normalizePublicImageUrl(imageUrl)
                      if (!src) {
                        setImageError(imageUrl.trim() ? UNSAFE_IMAGE_URL_ERROR : "이미지 URL을 입력해주세요.")
                        return
                      }
                      insertImages([{ src, alt: imageAlt.trim(), width: selectedWidth() }])
                      setImageUrl("")
                      setImageAlt("")
                      closeImageDialog()
                    }}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#111110] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#084734]"
                  >
                    <ImageIcon className="h-4 w-4" />
                    삽입
                  </button>
                </div>

                {imageError && (
                  <div className="rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
                    {imageError}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* A. 빈 상태 플레이스홀더 CTA */}
        {isEmpty && hasQuickActions && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 pb-16">
            <p className="text-[12px] text-[#1a1a1a]/30">또는 빠르게 시작하기</p>
            <div className="pointer-events-auto flex gap-2">
              {onTemplateClick && (
                <button
                  type="button"
                  onClick={onTemplateClick}
                  className="flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#615D59] shadow-sm hover:border-[#084734] hover:text-[#084734] transition-colors"
                >
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  템플릿 불러오기
                </button>
              )}
              {onAiDraftClick && (
                <button
                  type="button"
                  onClick={onAiDraftClick}
                  className="flex items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] font-medium text-[#615D59] shadow-sm hover:border-[#084734] hover:text-[#084734] transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  AI 초안 생성
                </button>
              )}
            </div>
          </div>
        )}

        <div
          className={`relative min-h-[600px] rounded-2xl border bg-[#fcfcfb] px-5 py-4 transition-colors focus-within:border-[#084734] ${
            draggingImages ? "border-[#084734]" : "border-[#e8e8e4]"
          }`}
          onDragEnter={handleEditorDragEnter}
          onDragOver={handleEditorDragOver}
          onDragLeave={handleEditorDragLeave}
          onDrop={handleEditorDrop}
          onPaste={handleEditorPaste}
          onKeyDown={handleEditorKeyDown}
        >
          <EditorContent editor={editor} />
          {(draggingImages || uploadingImages) && (
            <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-xl border border-dashed border-[#084734]/40 bg-[#ECFDF5]/80 text-sm font-semibold text-[#084734]">
              <span className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-sm">
                {uploadingImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploadingImages ? "이미지 업로드 중..." : "이미지를 놓으면 본문에 삽입됩니다"}
              </span>
            </div>
          )}
        </div>

        {imageError && !showImageDialog && (
          <div className="mt-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-[12px] text-[#B85C33]">
            {imageError}
          </div>
        )}

        {/* B. 하단 미니 액션바 */}
        {hasQuickActions && (
          <div className="mt-2 flex items-center gap-1.5 px-1">
            <span className="text-[10px] text-[#1a1a1a]/25">빠른 실행</span>
            <span className="h-3 w-px bg-[#e8e8e4]" />
            {onTemplateClick && (
              <button
                type="button"
                onClick={onTemplateClick}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[#1a1a1a]/45 hover:bg-[#f0f0ec] hover:text-[#111110] transition-colors"
              >
                <LayoutTemplate className="h-3 w-3" />
                템플릿
              </button>
            )}
            {onSelectionOptimize && (
              <button
                type="button"
                onClick={handleOptimizeClick}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
                  hasSelection
                    ? "bg-[#ECFDF5] text-[#084734] hover:bg-[#D1FAE5]"
                    : "text-[#1a1a1a]/45 hover:bg-[#f0f0ec] hover:text-[#111110]"
                }`}
              >
                <Wand2 className="h-3 w-3" />
                {hasSelection ? "선택 구간 다듬기" : "전체 다듬기"}
              </button>
            )}
            {onAiDraftClick && (
              <button
                type="button"
                onClick={onAiDraftClick}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[#1a1a1a]/45 hover:bg-[#f0f0ec] hover:text-[#111110] transition-colors"
              >
                <Sparkles className="h-3 w-3" />
                AI 초안
              </button>
            )}
          </div>
        )}
      </div>
    )
  }
)

export default RichMarkdownEditor
