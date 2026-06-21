"use client"

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react"
import { useEditor, EditorContent, Extension } from "@tiptap/react"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import StarterKit from "@tiptap/starter-kit"
import Highlight from "@tiptap/extension-highlight"
import Placeholder from "@tiptap/extension-placeholder"
import Link from "@tiptap/extension-link"
import Image from "@tiptap/extension-image"
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

// ProseMirror 플러그인: {{green:text}} 구문을 에디터에서 초록색으로 시각화
const GreenTextDecoration = Extension.create({
  name: "greenTextDecoration",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("greenTextDecoration"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return
              const regex = /\{\{green:.*?\}\}/g
              let match: RegExpExecArray | null
              while ((match = regex.exec(node.text)) !== null) {
                decorations.push(
                  Decoration.inline(
                    pos + match.index,
                    pos + match.index + match[0].length,
                    { class: "rich-editor-brand-green" }
                  )
                )
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
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

const ResizableMarkdownImage = Image.extend({
  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult => {
    const { title, width } = parseImageTitle(token.title)
    return helpers.createNode("image", {
      src: typeof token.href === "string" ? token.href : "",
      alt: typeof token.text === "string" ? token.text : "",
      title,
      ...(width ? { width } : {}),
    })
  },
  renderMarkdown: (node: JSONContent) => {
    const attrs = node.attrs ?? {}
    const src = typeof attrs.src === "string" ? attrs.src : ""
    const alt = typeof attrs.alt === "string" ? attrs.alt : ""
    const title = typeof attrs.title === "string" ? attrs.title : ""
    const width = normalizeImageWidth(node.attrs?.width)
    const titleParts = [title, width ? `width=${width}` : ""].filter(Boolean)

    return titleParts.length > 0
      ? `![${escapeMarkdown(alt)}](${src} "${escapeMarkdown(titleParts.join(" | "))}")`
      : `![${escapeMarkdown(alt)}](${src})`
  },
})

export interface RichMarkdownEditorHandle {
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
        Highlight.configure({ multicolor: false }),
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
        Placeholder.configure({ placeholder }),
        GreenTextDecoration,
        Markdown.configure({
          html: false,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const markdown = (editor.storage as any).markdown.getMarkdown() as string
        lastEmitted.current = markdown
        onChange(markdown)
      },
      onSelectionUpdate({ editor }) {
        const { from, to } = editor.state.selection
        setHasSelection(to - from > 5)
      },
    })

    // 외부에서 value가 변경될 때(언두/리두, 드래프트 불러오기 등) 에디터에 반영
    useEffect(() => {
      if (!editor || value === lastEmitted.current) return
      lastEmitted.current = value
      skipNextUpdate.current = true
      editor.commands.setContent(value)
    }, [editor, value])

    const isEmpty = editor?.isEmpty ?? (!value || value.trim() === "")

    useImperativeHandle(ref, () => ({
      toggleBold: () => editor?.chain().focus().toggleBold().run(),
      toggleItalic: () => editor?.chain().focus().toggleItalic().run(),
      setHeading: (level) => editor?.chain().focus().toggleHeading({ level }).run(),
      toggleBlockquote: () => editor?.chain().focus().toggleBlockquote().run(),
      toggleBulletList: () => editor?.chain().focus().toggleBulletList().run(),
      toggleOrderedList: () => editor?.chain().focus().toggleOrderedList().run(),
      toggleHighlight: () => editor?.chain().focus().toggleHighlight().run(),
      wrapBrandColor: () => {
        if (!editor) return
        const { from, to } = editor.state.selection
        const selectedText = editor.state.doc.textBetween(from, to) || "브랜드 텍스트"
        editor
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.insertText(`{{green:${selectedText}}}`, from, to)
            return true
          })
          .run()
      },
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
    }), [editor])

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
