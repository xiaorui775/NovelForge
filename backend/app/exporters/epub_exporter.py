import io
from app.exporters.base import BaseExporter, ExportResult


class EpubExporter(BaseExporter):
    @property
    def format_name(self) -> str:
        return "epub"

    @property
    def display_name(self) -> str:
        return "EPUB 电子书"

    @property
    def file_extension(self) -> str:
        return ".epub"

    @property
    def media_type(self) -> str:
        return "application/epub+zip"

    async def export(self, project_data: dict) -> ExportResult:
        from ebooklib import epub

        book = epub.EpubBook()
        book.set_identifier(project_data["project_name"])
        book.set_title(project_data["project_name"])
        book.set_language(project_data.get("language", "zh-CN"))
        book.add_author("NovelForge AI")

        style = """
        body { font-family: serif; line-height: 1.8; margin: 1em; }
        h1 { text-align: center; margin-bottom: 2em; }
        h2 { margin-top: 2em; }
        p { text-indent: 2em; margin: 0.5em 0; }
        """
        css = epub.EpubItem(
            uid="style",
            file_name="style/default.css",
            media_type="text/css",
            content=style.encode(),
        )
        book.add_item(css)

        chapters = []
        for chapter in project_data["chapters"]:
            content = ""
            if chapter.get("content"):
                paragraphs = chapter["content"].split("\n")
                content = "\n".join([f"<p>{p}</p>" for p in paragraphs if p.strip()])

            epub_chapter = epub.EpubHtml(
                title=chapter["title"],
                file_name=f"chapter_{chapter['chapter_number']}.xhtml",
                lang=project_data.get("language", "zh-CN"),
            )
            epub_chapter.content = f"<h2>{chapter['title']}</h2>\n{content}"
            epub_chapter.add_item(css)
            book.add_item(epub_chapter)
            chapters.append(epub_chapter)

        book.toc = chapters
        book.add_item(epub.EpubNcx())
        book.add_item(epub.EpubNav())
        book.spine = ["nav"] + chapters

        buffer = io.BytesIO()
        epub.write_epub(buffer, book)
        buffer.seek(0)

        return ExportResult(
            filename=f"{project_data['project_name']}.epub",
            content=buffer.getvalue(),
            media_type=self.media_type,
        )
