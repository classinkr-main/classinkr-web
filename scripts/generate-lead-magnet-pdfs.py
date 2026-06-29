from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "lead-magnets.json"
PUBLIC_DIR = ROOT / "public"
OUTPUT_DIR = PUBLIC_DIR / "materials" / "lead-magnets"

SITE_URL = os.environ.get("NEXT_PUBLIC_SITE_URL", "https://classin.ai.kr").rstrip("/")
# 폰트 탐색 경로 — macOS·Windows·Linux 순으로 폴백한다.
# 환경변수 LEAD_MAGNET_FONT 로 명시 경로를 지정할 수도 있다.
FONT_PATHS = [
    Path(os.environ["LEAD_MAGNET_FONT"]) if os.environ.get("LEAD_MAGNET_FONT") else None,
    Path("/Users/clmagi/Library/Fonts/PretendardVariable.ttf"),
    Path.home() / "Library/Fonts/PretendardVariable.ttf",
    Path("C:/Windows/Fonts/PretendardVariable.ttf"),
    Path("C:/Windows/Fonts/Pretendard-Regular.ttf"),
    Path("C:/Windows/Fonts/malgun.ttf"),
    Path("/usr/share/fonts/truetype/pretendard/PretendardVariable.ttf"),
    Path("/usr/share/fonts/truetype/nanum/NanumGothic.ttf"),
]
FONT_PATHS = [path for path in FONT_PATHS if path is not None]

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_X = 48
TOP_Y = PAGE_HEIGHT - 54
BOTTOM_Y = 56
CONTENT_WIDTH = PAGE_WIDTH - (MARGIN_X * 2)

GREEN = "#084734"
GREEN_HOVER = "#065c41"
NEAR_BLACK = "#111110"
WARM_DARK = "#31302E"
WARM_GRAY = "#615D59"
WARM_GRAY_LIGHT = "#A39E98"
WARM_WHITE = "#F6F5F4"
PAGE_WHITE = "#FAFAF8"
WHITE = "#FFFFFF"
BORDER = "#E5E2DD"
WARNING = "#B85C33"


def color(value: str):
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) / 255 for index in (0, 2, 4))


def register_font() -> str:
    for path in FONT_PATHS:
        if not path.exists():
            continue
        pdfmetrics.registerFont(TTFont("Pretendard", str(path)))
        return "Pretendard"
    raise FileNotFoundError("PretendardVariable.ttf font was not found.")


FONT = register_font()


def clean_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value)
    return re.sub(r"\s+", " ", text.replace("\u00a0", " ")).strip()


def wrap_text(text: str, font: str, size: float, max_width: float) -> list[str]:
    text = clean_text(text)
    if not text:
        return []

    lines: list[str] = []
    current = ""
    tokens = re.split(r"(\s+)", text)

    def append_token(token: str) -> None:
        nonlocal current
        candidate = f"{current}{token}"
        if pdfmetrics.stringWidth(candidate, font, size) <= max_width:
            current = candidate
            return

        if current.strip():
            lines.append(current.rstrip())
            current = token.lstrip()
        else:
            current = ""
            for char in token:
                candidate_char = f"{current}{char}"
                if pdfmetrics.stringWidth(candidate_char, font, size) <= max_width:
                    current = candidate_char
                else:
                    if current:
                        lines.append(current)
                    current = char

        while current and pdfmetrics.stringWidth(current, font, size) > max_width:
            chunk = ""
            for char in current:
                if pdfmetrics.stringWidth(f"{chunk}{char}", font, size) <= max_width:
                    chunk += char
                else:
                    break
            if not chunk:
                break
            lines.append(chunk)
            current = current[len(chunk) :].lstrip()

    for token in tokens:
        append_token(token)

    if current.strip():
        lines.append(current.rstrip())
    return lines


def text_height(text: str, font: str, size: float, leading: float, max_width: float) -> float:
    lines = wrap_text(text, font, size, max_width)
    return len(lines) * leading


def with_pdf_tracking(href: str, source_slug: str) -> str:
    if not href.startswith("/"):
        return href
    split = urlsplit(href)
    query = dict(parse_qsl(split.query, keep_blank_values=True))
    query.setdefault("utm_source", "pdf")
    query.setdefault("utm_medium", "lead_magnet")
    query.setdefault("utm_campaign", source_slug)
    return urlunsplit((split.scheme, split.netloc, split.path, urlencode(query), split.fragment))


def absolute_url(href: str, source_slug: str) -> str:
    tracked = with_pdf_tracking(href, source_slug)
    if tracked.startswith("http://") or tracked.startswith("https://") or tracked.startswith("mailto:"):
        return tracked
    return f"{SITE_URL}/{tracked.lstrip('/')}"


def category_label(category: str) -> str:
    labels = {
        "operations": "운영",
        "hardware": "하드웨어",
        "software": "소프트웨어",
        "case-study": "사례",
        "security": "보안",
    }
    return labels.get(category, category)


def tier_label(tier: str) -> str:
    return "심화" if tier == "advanced" else "기본"


class PdfDocument:
    def __init__(self, path: Path, title: str):
        self.path = path
        self.canvas = canvas.Canvas(str(path), pagesize=A4)
        self.canvas.setTitle(title)
        self.canvas.setAuthor("ClassIn Korea")
        self.canvas.setCreator("ClassIn Korea Resource Library")
        self.page_number = 1
        self.y = TOP_Y

    def save(self) -> None:
        self.draw_footer()
        self.canvas.save()

    def draw_footer(self) -> None:
        c = self.canvas
        c.setStrokeColorRGB(*color(BORDER))
        c.setLineWidth(0.5)
        c.line(MARGIN_X, 38, PAGE_WIDTH - MARGIN_X, 38)
        c.setFont(FONT, 8.5)
        c.setFillColorRGB(*color(WARM_GRAY_LIGHT))
        c.drawString(MARGIN_X, 24, "ClassIn Korea Resource Library")
        c.drawRightString(PAGE_WIDTH - MARGIN_X, 24, f"{self.page_number}")

    def new_page(self) -> None:
        self.draw_footer()
        self.canvas.showPage()
        self.page_number += 1
        self.y = TOP_Y

    def ensure_space(self, height: float) -> None:
        if self.y - height < BOTTOM_Y:
            self.new_page()

    def line(self, x1: float = MARGIN_X, x2: float = PAGE_WIDTH - MARGIN_X, gap: float = 16) -> None:
        self.ensure_space(gap + 2)
        self.canvas.setStrokeColorRGB(*color(BORDER))
        self.canvas.setLineWidth(0.6)
        self.canvas.line(x1, self.y, x2, self.y)
        self.y -= gap

    def text(
        self,
        value: str,
        *,
        x: float = MARGIN_X,
        size: float = 10.5,
        leading: float = 16,
        font: str = FONT,
        max_width: float = CONTENT_WIDTH,
        fill: str = WARM_GRAY,
        after: float = 7,
    ) -> None:
        lines = wrap_text(value, font, size, max_width)
        if not lines:
            return
        self.ensure_space(len(lines) * leading + after)
        self.canvas.setFont(font, size)
        self.canvas.setFillColorRGB(*color(fill))
        for line in lines:
            self.canvas.drawString(x, self.y, line)
            self.y -= leading
        self.y -= after

    def label(self, value: str, *, after: float = 8, fill: str = GREEN) -> None:
        self.text(
            value.upper(),
            size=8.5,
            leading=11,
            fill=fill,
            after=after,
            max_width=CONTENT_WIDTH,
        )

    def heading(self, value: str, *, size: float = 20, after: float = 12) -> None:
        self.text(
            value,
            size=size,
            leading=size + 6,
            fill=NEAR_BLACK,
            after=after,
            max_width=CONTENT_WIDTH,
        )

    def bullet_list(self, items: list[str], *, numbered: bool = False) -> None:
        for index, item in enumerate(items, start=1):
            prefix = f"{index}." if numbered else "-"
            prefix_width = 22
            max_width = CONTENT_WIDTH - prefix_width
            lines = wrap_text(item, FONT, 10.2, max_width)
            if not lines:
                continue
            self.ensure_space(len(lines) * 15 + 7)
            self.canvas.setFont(FONT, 9.6)
            self.canvas.setFillColorRGB(*color(GREEN if numbered else WARM_GRAY_LIGHT))
            self.canvas.drawString(MARGIN_X, self.y, prefix)
            self.canvas.setFont(FONT, 10.2)
            self.canvas.setFillColorRGB(*color(WARM_DARK))
            for line_index, line in enumerate(lines):
                self.canvas.drawString(MARGIN_X + prefix_width, self.y, line)
                self.y -= 15
                if line_index == 0:
                    self.canvas.setFillColorRGB(*color(WARM_GRAY))
            self.y -= 5

    def metric_row(self, items: list[tuple[str, str]]) -> None:
        col_gap = 10
        col_width = (CONTENT_WIDTH - col_gap * (len(items) - 1)) / len(items)
        height = 58
        self.ensure_space(height + 12)
        for index, (label, value) in enumerate(items):
            x = MARGIN_X + (col_width + col_gap) * index
            self.canvas.setFillColorRGB(*color(WHITE))
            self.canvas.setStrokeColorRGB(*color(BORDER))
            self.canvas.rect(x, self.y - height + 9, col_width, height, fill=1, stroke=1)
            self.canvas.setFont(FONT, 8.2)
            self.canvas.setFillColorRGB(*color(WARM_GRAY_LIGHT))
            self.canvas.drawString(x + 12, self.y - 14, label)
            self.canvas.setFont(FONT, 10.2)
            self.canvas.setFillColorRGB(*color(NEAR_BLACK))
            lines = wrap_text(value, FONT, 10.2, col_width - 24)
            for line_index, line in enumerate(lines[:2]):
                self.canvas.drawString(x + 12, self.y - 32 - line_index * 13, line)
        self.y -= height + 12

    def note_box(self, title: str, body: str, *, fill: str = WARM_WHITE, accent: str = GREEN) -> None:
        body_lines = wrap_text(body, FONT, 10.2, CONTENT_WIDTH - 34)
        height = 46 + len(body_lines) * 15
        self.ensure_space(height + 12)
        self.canvas.setFillColorRGB(*color(fill))
        self.canvas.setStrokeColorRGB(*color(BORDER))
        self.canvas.rect(MARGIN_X, self.y - height + 12, CONTENT_WIDTH, height, fill=1, stroke=1)
        self.canvas.setFillColorRGB(*color(accent))
        self.canvas.rect(MARGIN_X, self.y - height + 12, 3, height, fill=1, stroke=0)
        self.canvas.setFont(FONT, 10.5)
        self.canvas.setFillColorRGB(*color(NEAR_BLACK))
        self.canvas.drawString(MARGIN_X + 16, self.y - 15, title)
        self.canvas.setFont(FONT, 9.7)
        self.canvas.setFillColorRGB(*color(WARM_GRAY))
        line_y = self.y - 33
        for line in body_lines:
            self.canvas.drawString(MARGIN_X + 16, line_y, line)
            line_y -= 15
        self.y -= height + 10

    def checklist_item(self, code: str, item: str) -> None:
        text_x = MARGIN_X + 62
        max_width = CONTENT_WIDTH - 62
        lines = wrap_text(item, FONT, 9.8, max_width)
        height = max(24, len(lines) * 14 + 10)
        self.ensure_space(height + 4)
        top = self.y
        self.canvas.setStrokeColorRGB(*color(BORDER))
        self.canvas.setLineWidth(0.5)
        self.canvas.line(MARGIN_X, top + 3, PAGE_WIDTH - MARGIN_X, top + 3)
        self.canvas.rect(MARGIN_X, top - 12, 9, 9, fill=0, stroke=1)
        self.canvas.setFont(FONT, 8.2)
        self.canvas.setFillColorRGB(*color(GREEN))
        self.canvas.drawString(MARGIN_X + 18, top - 11, code)
        self.canvas.setFont(FONT, 9.8)
        self.canvas.setFillColorRGB(*color(WARM_DARK))
        line_y = top - 11
        for line in lines:
            self.canvas.drawString(text_x, line_y, line)
            line_y -= 14
        self.y -= height

    def score_band(self, band: dict) -> None:
        description = clean_text(band.get("description"))
        max_width = CONTENT_WIDTH - 112
        lines = wrap_text(description, FONT, 9.6, max_width)
        height = max(52, 32 + len(lines) * 13)
        self.ensure_space(height + 4)
        self.canvas.setStrokeColorRGB(*color(BORDER))
        self.canvas.rect(MARGIN_X, self.y - height + 8, CONTENT_WIDTH, height, fill=0, stroke=1)
        self.canvas.setFont(FONT, 11)
        self.canvas.setFillColorRGB(*color(GREEN))
        self.canvas.drawString(MARGIN_X + 14, self.y - 19, clean_text(band.get("range")))
        self.canvas.setFont(FONT, 10.5)
        self.canvas.setFillColorRGB(*color(NEAR_BLACK))
        self.canvas.drawString(MARGIN_X + 112, self.y - 18, clean_text(band.get("label")))
        self.canvas.setFont(FONT, 9.6)
        self.canvas.setFillColorRGB(*color(WARM_GRAY))
        line_y = self.y - 35
        for line in lines:
            self.canvas.drawString(MARGIN_X + 112, line_y, line)
            line_y -= 13
        self.y -= height + 6

    def link_row(self, label: str, href: str, description: str, source_slug: str) -> None:
        url = absolute_url(href, source_slug)
        description_lines = wrap_text(description, FONT, 9.4, CONTENT_WIDTH - 34)
        label_lines = wrap_text(label, FONT, 10.3, CONTENT_WIDTH - 34)
        height = 38 + len(label_lines) * 14 + len(description_lines) * 13
        self.ensure_space(height + 6)
        top = self.y
        self.canvas.setFillColorRGB(*color(WHITE))
        self.canvas.setStrokeColorRGB(*color(BORDER))
        self.canvas.rect(MARGIN_X, top - height + 8, CONTENT_WIDTH, height, fill=1, stroke=1)
        line_y = top - 18
        self.canvas.setFont(FONT, 10.3)
        self.canvas.setFillColorRGB(*color(GREEN))
        for line in label_lines:
            self.canvas.drawString(MARGIN_X + 16, line_y, line)
            line_y -= 14
        self.canvas.setFont(FONT, 9.4)
        self.canvas.setFillColorRGB(*color(WARM_GRAY))
        for line in description_lines:
            self.canvas.drawString(MARGIN_X + 16, line_y, line)
            line_y -= 13
        self.canvas.linkURL(
            url,
            (MARGIN_X, top - height + 8, PAGE_WIDTH - MARGIN_X, top + 8),
            relative=0,
            thickness=0,
        )
        self.y -= height + 6


def draw_cover(doc: PdfDocument, magnet: dict) -> None:
    guide = magnet.get("pdfGuide") or {}
    item_count = sum(len(section.get("items") or []) for section in magnet.get("sections") or [])
    c = doc.canvas

    c.setFillColorRGB(*color(PAGE_WHITE))
    c.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    c.setFillColorRGB(*color(GREEN))
    c.rect(MARGIN_X, PAGE_HEIGHT - 82, 92, 4, fill=1, stroke=0)

    doc.y = PAGE_HEIGHT - 112
    doc.label("ClassIn Resource Library", after=14)
    doc.text(
        clean_text(magnet.get("title")),
        size=28,
        leading=34,
        fill=NEAR_BLACK,
        after=16,
        max_width=CONTENT_WIDTH - 12,
    )
    doc.text(
        clean_text(guide.get("subtitle") or magnet.get("summary")),
        size=13.5,
        leading=21,
        fill=WARM_DARK,
        after=12,
        max_width=CONTENT_WIDTH - 20,
    )
    doc.text(
        clean_text(guide.get("outcome") or magnet.get("summary")),
        size=10.8,
        leading=17,
        fill=WARM_GRAY,
        after=22,
        max_width=CONTENT_WIDTH - 20,
    )
    doc.metric_row(
        [
            ("대상", clean_text(magnet.get("audience"))),
            ("형식", f"{tier_label(magnet.get('tier', 'basic'))} · {category_label(magnet.get('category', ''))} · PDF"),
            ("분량", f"{item_count}문항 · 약 {magnet.get('estimatedMinutes')}분"),
        ]
    )
    doc.note_box(
        "이 자료를 먼저 보는 이유",
        clean_text(
            guide.get("expertNote")
            or "도입 전 질문을 같은 기준으로 정리하면 가격 비교보다 먼저 확인해야 할 운영 병목이 보입니다."
        ),
        fill=WHITE,
    )
    doc.text("PDF 안의 링크는 필요한 자료와 상담 페이지로 바로 연결됩니다.", size=9.4, leading=14, fill=WARM_GRAY_LIGHT, after=4)
    doc.link_row(
        "ClassIn 도입 상담 신청",
        "/contact#contact-form",
        "체크 결과를 바탕으로 쇼룸, 데모, 견적 확인 범위를 정리합니다.",
        clean_text(magnet.get("slug")),
    )
    doc.new_page()


def draw_story(doc: PdfDocument, magnet: dict) -> bool:
    story = magnet.get("storyGuide") or {}
    if not story:
        return False

    doc.label("01 / 판단 흐름")
    doc.heading(clean_text(story.get("title")) or "도입 전 판단 흐름")
    if story.get("body"):
        doc.text(clean_text(story.get("body")), size=10.8, leading=17, fill=WARM_GRAY, after=12)
    beats = [clean_text(item) for item in story.get("beats") or [] if clean_text(item)]
    if beats:
        doc.text("수업 한 편을 기준으로 확인할 장면", size=12.5, leading=16, fill=NEAR_BLACK, after=5)
        doc.bullet_list(beats, numbered=True)
    if story.get("takeaway"):
        doc.note_box(
            clean_text(story.get("eyebrow")) or "판단 기준",
            clean_text(story.get("takeaway")),
            fill=WARM_WHITE,
        )
    return True


def draw_usage(doc: PdfDocument, magnet: dict) -> None:
    guide = magnet.get("pdfGuide") or {}
    doc.label("02 / 사용법")
    doc.heading("PDF를 이렇게 사용하세요")
    if guide.get("bestUsedWhen"):
        doc.text("언제 유용한가", size=12.5, leading=16, fill=NEAR_BLACK, after=5)
        doc.bullet_list(list(guide.get("bestUsedWhen") or []))
    if guide.get("howToUse"):
        doc.text("추천 사용 순서", size=12.5, leading=16, fill=NEAR_BLACK, after=5)
        doc.bullet_list(list(guide.get("howToUse") or []), numbered=True)
    if guide.get("discussionPrompts"):
        doc.note_box(
            "상담 전에 답해볼 질문",
            " / ".join(clean_text(item) for item in guide.get("discussionPrompts") or []),
            fill=WARM_WHITE,
        )
    voice = magnet.get("expertVoice")
    if voice:
        speaker = clean_text(voice.get("speaker"))
        role = clean_text(voice.get("role"))
        byline = f"{speaker} · {role}" if role else speaker
        doc.note_box(
            f"현장 한마디 — {byline}",
            clean_text(voice.get("comment")),
            fill=WHITE,
        )


def draw_worksheet(doc: PdfDocument, magnet: dict) -> None:
    worksheet = magnet.get("worksheet")
    if not worksheet:
        return
    columns = [clean_text(col) for col in worksheet.get("columns") or []]
    rows = list(worksheet.get("rows") or [])
    if not columns or not rows:
        return

    doc.label("02-1 / 계산표")
    doc.heading(clean_text(worksheet.get("title")))
    intro = clean_text(worksheet.get("intro"))
    if intro:
        doc.text(intro, after=10)

    label_width = CONTENT_WIDTH * 0.40
    col_width = (CONTENT_WIDTH - label_width) / len(columns)
    row_height = 23
    c = doc.canvas

    doc.ensure_space(row_height * (len(rows) + 1) + 16)
    header_top = doc.y
    c.setFont(FONT, 8.6)
    c.setFillColorRGB(*color(GREEN))
    c.drawString(MARGIN_X + 2, header_top - 12, "항목")
    for index, col in enumerate(columns):
        x = MARGIN_X + label_width + col_width * index
        c.drawString(x + 4, header_top - 12, col)
    doc.y -= row_height
    c.setStrokeColorRGB(*color(BORDER))
    c.setLineWidth(0.7)
    c.line(MARGIN_X, doc.y + 7, PAGE_WIDTH - MARGIN_X, doc.y + 7)

    for row in rows:
        label = clean_text(row.get("label"))
        highlight = bool(row.get("highlight"))
        doc.ensure_space(row_height + 4)
        row_top = doc.y
        if highlight:
            c.setFillColorRGB(*color(WARM_WHITE))
            c.rect(MARGIN_X, row_top - row_height + 8, CONTENT_WIDTH, row_height, fill=1, stroke=0)
        c.setFont(FONT, 9.4)
        c.setFillColorRGB(*color(NEAR_BLACK if highlight else WARM_DARK))
        c.drawString(MARGIN_X + 2, row_top - 13, label)
        c.setStrokeColorRGB(*color(WARM_GRAY_LIGHT))
        c.setLineWidth(0.5)
        for index in range(len(columns)):
            x = MARGIN_X + label_width + col_width * index
            c.line(x + 4, row_top - 17, x + col_width - 6, row_top - 17)
        c.setStrokeColorRGB(*color(BORDER))
        c.setLineWidth(0.5)
        c.line(MARGIN_X, row_top - row_height + 6, PAGE_WIDTH - MARGIN_X, row_top - row_height + 6)
        doc.y -= row_height
    doc.y -= 8

    formula = clean_text(worksheet.get("formula"))
    if formula:
        doc.note_box("계산식", formula, fill=WHITE)
    note = clean_text(worksheet.get("note"))
    if note:
        doc.text(note, size=9.2, leading=14, fill=WARM_GRAY_LIGHT, after=6)


def draw_case_cards(doc: PdfDocument, magnet: dict) -> None:
    cards = magnet.get("caseCards")
    if not cards:
        return
    doc.label("02-2 / 도입 사례")
    doc.heading("우리와 비슷한 학원은 이렇게 바뀌었습니다")
    c = doc.canvas
    for card in cards:
        label = clean_text(card.get("label"))
        profile = clean_text(card.get("profile"))
        challenge_lines = wrap_text(f"고민  {clean_text(card.get('challenge'))}", FONT, 9.6, CONTENT_WIDTH - 28)
        change_lines = wrap_text(f"변화  {clean_text(card.get('change'))}", FONT, 9.6, CONTENT_WIDTH - 28)
        quote = clean_text(card.get("quote"))
        quote_lines = wrap_text(quote, FONT, 9.2, CONTENT_WIDTH - 36) if quote else []
        height = 42 + (len(challenge_lines) + len(change_lines)) * 14
        if quote_lines:
            height += len(quote_lines) * 13 + 8
        doc.ensure_space(height + 10)
        top = doc.y
        c.setFillColorRGB(*color(PAGE_WHITE))
        c.setStrokeColorRGB(*color(BORDER))
        c.rect(MARGIN_X, top - height + 10, CONTENT_WIDTH, height, fill=1, stroke=1)
        c.setFont(FONT, 10.5)
        c.setFillColorRGB(*color(NEAR_BLACK))
        c.drawString(MARGIN_X + 14, top - 16, label)
        c.setFont(FONT, 8.4)
        c.setFillColorRGB(*color(WARM_GRAY_LIGHT))
        c.drawString(MARGIN_X + 14, top - 29, profile)
        line_y = top - 45
        c.setFont(FONT, 9.6)
        c.setFillColorRGB(*color(WARM_GRAY))
        for line in challenge_lines:
            c.drawString(MARGIN_X + 14, line_y, line)
            line_y -= 14
        c.setFillColorRGB(*color(WARM_DARK))
        for line in change_lines:
            c.drawString(MARGIN_X + 14, line_y, line)
            line_y -= 14
        if quote_lines:
            line_y -= 2
            c.setFillColorRGB(*color(GREEN))
            c.rect(MARGIN_X + 14, line_y - len(quote_lines) * 13 + 10, 2, len(quote_lines) * 13, fill=1, stroke=0)
            c.setFont(FONT, 9.2)
            c.setFillColorRGB(*color(WARM_DARK))
            for line in quote_lines:
                c.drawString(MARGIN_X + 22, line_y, line)
                line_y -= 13
        doc.y -= height + 10
    doc.text(
        "운영 변화 중심의 익명 사례입니다. 우리 학원과 조건이 가장 가까운 사례는 상담에서 안내해 드립니다.",
        size=8.8,
        leading=13,
        fill=WARM_GRAY_LIGHT,
        after=6,
    )


def draw_script_samples(doc: PdfDocument, magnet: dict) -> None:
    samples = magnet.get("scriptSamples")
    if not samples:
        return
    doc.label("02-3 / 복사해서 쓰는 멘트")
    doc.heading("상황별 메시지 예시")
    for sample in samples:
        doc.text(clean_text(sample.get("scenario")), size=11.5, leading=15, fill=NEAR_BLACK, after=4)
        doc.note_box("권장", clean_text(sample.get("good")), fill=WARM_WHITE, accent=GREEN)
        avoid = clean_text(sample.get("avoid"))
        if avoid:
            doc.note_box("피하기", avoid, fill=WARM_WHITE, accent=WARNING)
        why = clean_text(sample.get("why"))
        if why:
            doc.text(why, size=8.8, leading=13, fill=WARM_GRAY_LIGHT, after=10)


def draw_deliverables(doc: PdfDocument, magnet: dict) -> None:
    doc.ensure_space(260)
    doc.label("03 / 구성")
    doc.heading("이 자료에 포함된 것")
    doc.bullet_list(list(magnet.get("deliverables") or []))
    doc.text("상담 전에 준비하면 좋은 자료", size=12.5, leading=16, fill=NEAR_BLACK, after=5)
    doc.bullet_list(list(magnet.get("consultationPrep") or []))


def draw_checklist(doc: PdfDocument, magnet: dict) -> None:
    doc.label("04 / 체크리스트")
    doc.heading("전체 점검 문항")
    doc.text(
        "각 문항은 현재 상태가 안정적이면 1점, 불안정하거나 확인이 필요하면 0점으로 표시하세요. 애매한 항목은 0점으로 두는 편이 실제 도입 검토에 더 도움이 됩니다.",
        after=12,
    )
    for section_index, section in enumerate(magnet.get("sections") or [], start=1):
        doc.ensure_space(76)
        doc.text(
            f"{section_index}. {clean_text(section.get('title'))}",
            size=13,
            leading=17,
            fill=NEAR_BLACK,
            after=3,
        )
        doc.text(clean_text(section.get("description")), size=9.6, leading=14, fill=WARM_GRAY, after=9)
        for item_index, item in enumerate(section.get("items") or [], start=1):
            doc.checklist_item(f"{section_index}-{item_index}", clean_text(item))
        doc.y -= 6


def draw_scoring(doc: PdfDocument, magnet: dict) -> None:
    doc.label("05 / 점수 해석")
    doc.heading("총점보다 낮게 나온 영역을 먼저 보세요")
    for band in magnet.get("scoreBands") or []:
        doc.score_band(band)
    red_flags = list(magnet.get("redFlags") or [])
    if red_flags:
        doc.note_box(
            "재검토 신호",
            " / ".join(clean_text(item) for item in red_flags),
            fill=WARM_WHITE,
            accent=WARNING,
        )


def draw_action_plan(doc: PdfDocument, magnet: dict) -> None:
    doc.label("06 / 실행 플랜")
    doc.heading("실행 플랜")
    for step in magnet.get("actionPlan") or []:
        doc.ensure_space(72)
        doc.text(clean_text(step.get("day")), size=8.8, leading=11, fill=GREEN, after=2)
        doc.text(clean_text(step.get("title")), size=12.5, leading=16, fill=NEAR_BLACK, after=5)
        doc.bullet_list(list(step.get("tasks") or []))


def draw_links(doc: PdfDocument, magnet: dict, magnets_by_slug: dict[str, dict]) -> None:
    guide = magnet.get("pdfGuide") or {}
    source_slug = clean_text(magnet.get("slug"))
    doc.label("07 / 다음 단계")
    doc.heading("관련 자료와 상담 링크")
    doc.text(
        "이 PDF의 링크는 다음 판단에 필요한 자료와 상담 페이지로 연결됩니다. 체크 결과에 맞춰 추가 자료를 이어서 확인하세요.",
        after=12,
    )

    for related_slug in guide.get("relatedMagnets") or []:
        related = magnets_by_slug.get(related_slug)
        if not related:
            continue
        related_guide = related.get("pdfGuide") or {}
        doc.link_row(
            clean_text(related.get("title")),
            f"/resources/{related_slug}#download",
            clean_text(related_guide.get("outcome") or related.get("summary")),
            source_slug,
        )

    for cta in guide.get("consultationCtas") or []:
        doc.link_row(
            clean_text(cta.get("label")),
            clean_text(cta.get("href")),
            clean_text(cta.get("description") or "ClassIn 상담 페이지로 이동합니다."),
            source_slug,
        )

    source_links = list(magnet.get("sourceLinks") or [])
    if source_links:
        doc.text("참고 링크", size=12.5, leading=16, fill=NEAR_BLACK, after=5)
        for link in source_links:
            doc.link_row(
                clean_text(link.get("label")),
                clean_text(link.get("href")),
                clean_text(link.get("description") or "자료 검토에 참고할 수 있는 외부 링크입니다."),
                source_slug,
            )


def output_path_for(magnet: dict) -> Path:
    resource_url = clean_text(magnet.get("resourceUrl"))
    if resource_url.startswith("/"):
        return PUBLIC_DIR / resource_url.lstrip("/")
    return OUTPUT_DIR / f"{clean_text(magnet.get('slug'))}.pdf"


def build_pdf(magnet: dict, magnets_by_slug: dict[str, dict]) -> Path:
    output_path = output_path_for(magnet)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    doc = PdfDocument(output_path, clean_text(magnet.get("title")))
    draw_cover(doc, magnet)
    if draw_story(doc, magnet):
        doc.line()
    draw_usage(doc, magnet)
    doc.line()
    draw_deliverables(doc, magnet)
    draw_worksheet(doc, magnet)
    draw_case_cards(doc, magnet)
    draw_script_samples(doc, magnet)
    doc.new_page()
    draw_checklist(doc, magnet)
    doc.new_page()
    draw_scoring(doc, magnet)
    doc.line()
    draw_action_plan(doc, magnet)
    doc.line()
    draw_links(doc, magnet, magnets_by_slug)
    doc.save()
    return output_path


def main() -> None:
    magnets = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    magnets_by_slug = {magnet["slug"]: magnet for magnet in magnets}
    selected_slugs = set(sys.argv[1:])

    paths: list[Path] = []
    for magnet in magnets:
        if not magnet.get("published"):
            continue
        if selected_slugs and magnet.get("slug") not in selected_slugs:
            continue
        paths.append(build_pdf(magnet, magnets_by_slug))

    for path in paths:
        print(path.relative_to(ROOT))
    print(f"Generated {len(paths)} PDF files.")


if __name__ == "__main__":
    main()
