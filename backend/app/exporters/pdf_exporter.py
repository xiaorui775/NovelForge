from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor

from app.exporters.base import BaseExporter, ExportResult


def _register_fonts():
    """Register CJK fonts if available."""
    import os
    font_paths = [
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "C:\\Windows\\Fonts\\msyh.ttc",
    ]
    for path in font_paths:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("CJK", path))
                return "CJK"
            except Exception:
                continue
    return "Helvetica"


FONT_NAME = _register_fonts()


class PdfExporter(BaseExporter):
    @property
    def format_name(self) -> str:
        return "pdf"

    @property
    def display_name(self) -> str:
        return "PDF 文档"

    @property
    def file_extension(self) -> str:
        return ".pdf"

    @property
    def media_type(self) -> str:
        return "application/pdf"

    async def export(self, project_data: dict) -> ExportResult:
        from io import BytesIO

        buffer = BytesIO()

        # Page number tracking
        page_numbers = {}

        def _header_footer(canvas, doc):
            """Add header and footer to each page"""
            canvas.saveState()
            page_num = canvas.getPageNumber()

            # Skip header/footer on cover page (page 1)
            if page_num > 1:
                # Footer: page number centered
                canvas.setFont(FONT_NAME, 9)
                canvas.setFillColor(HexColor("#999999"))
                canvas.drawCentredString(
                    A4[0] / 2, 1.5 * cm,
                    f"— {page_num} —"
                )

                # Header: book name (odd pages right, even pages left)
                if page_num > 2:  # Skip TOC page
                    canvas.setFont(FONT_NAME, 8)
                    canvas.setFillColor(HexColor("#bbbbbb"))
                    if page_num % 2 == 0:
                        canvas.drawString(2.5 * cm, A4[1] - 1.5 * cm, project_data["project_name"])
                    else:
                        canvas.drawRightString(A4[0] - 2.5 * cm, A4[1] - 1.5 * cm, project_data["project_name"])

            canvas.restoreState()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=2.5 * cm,
            rightMargin=2.5 * cm,
            topMargin=3 * cm,
            bottomMargin=3 * cm,
        )

        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            "BookTitle",
            parent=styles["Title"],
            fontName=FONT_NAME,
            fontSize=28,
            alignment=TA_CENTER,
            spaceAfter=30,
        )
        desc_style = ParagraphStyle(
            "BookDesc",
            parent=styles["Normal"],
            fontName=FONT_NAME,
            fontSize=12,
            alignment=TA_CENTER,
            textColor=HexColor("#666666"),
            spaceAfter=40,
        )
        toc_title_style = ParagraphStyle(
            "TOCTitle",
            parent=styles["Title"],
            fontName=FONT_NAME,
            fontSize=22,
            alignment=TA_CENTER,
            spaceAfter=30,
        )
        toc_item_style = ParagraphStyle(
            "TOCItem",
            parent=styles["Normal"],
            fontName=FONT_NAME,
            fontSize=12,
            leading=24,
        )
        chapter_style = ParagraphStyle(
            "ChapterTitle",
            parent=styles["Heading1"],
            fontName=FONT_NAME,
            fontSize=20,
            spaceBefore=20,
            spaceAfter=20,
        )
        body_style = ParagraphStyle(
            "BookBody",
            parent=styles["Normal"],
            fontName=FONT_NAME,
            fontSize=12,
            leading=20,
            alignment=TA_JUSTIFY,
            firstLineIndent=24,
        )
        end_style = ParagraphStyle(
            "BookEnd",
            parent=styles["Normal"],
            fontName=FONT_NAME,
            fontSize=12,
            alignment=TA_CENTER,
            spaceBefore=40,
        )

        story = []

        # Cover page
        story.append(Spacer(1, 6 * cm))
        story.append(Paragraph(project_data["project_name"], title_style))
        story.append(Spacer(1, 1 * cm))

        if project_data.get("project_description"):
            story.append(Paragraph(project_data["project_description"], desc_style))

        story.append(PageBreak())

        # Table of Contents
        story.append(Paragraph("目 录", toc_title_style))
        story.append(Spacer(1, 1 * cm))

        for chapter in project_data["chapters"]:
            title = chapter["title"]
            word_count = chapter.get("word_count", 0)
            toc_text = f"{title}"
            if word_count > 0:
                toc_text += f"  ({word_count} 字)"
            story.append(Paragraph(toc_text, toc_item_style))

        story.append(PageBreak())

        # Chapters
        for chapter in project_data["chapters"]:
            story.append(Paragraph(chapter["title"], chapter_style))

            if chapter.get("content"):
                for line in chapter["content"].split("\n"):
                    line = line.strip()
                    if line:
                        # Escape XML special chars for reportlab
                        safe = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                        story.append(Paragraph(safe, body_style))
            else:
                story.append(Paragraph("（本章尚未生成）", body_style))

            story.append(PageBreak())

        # Ending
        story.append(Spacer(1, 6 * cm))
        story.append(Paragraph(f"全书完 · 共 {project_data['total_words']} 字", end_style))

        doc.build(story, onFirstPage=_header_footer, onLaterPages=_header_footer)
        content = buffer.getvalue()

        return ExportResult(
            filename=f"{project_data['project_name']}.pdf",
            content=content,
            media_type=self.media_type,
        )
