from app.exporters.base import BaseExporter, ExportResult


class TxtExporter(BaseExporter):
    @property
    def format_name(self) -> str:
        return "txt"

    @property
    def display_name(self) -> str:
        return "TXT 文本"

    @property
    def file_extension(self) -> str:
        return ".txt"

    @property
    def media_type(self) -> str:
        return "text/plain; charset=utf-8"

    async def export(self, project_data: dict) -> ExportResult:
        lines = []

        # Cover
        lines.append(f"\n{'=' * 50}")
        lines.append(f"  {project_data['project_name']}")
        lines.append(f"{'=' * 50}\n")

        if project_data.get("project_description"):
            lines.append(project_data["project_description"])
            lines.append("")

        # Table of Contents
        lines.append(f"\n{'─' * 30}")
        lines.append("  目 录")
        lines.append(f"{'─' * 30}\n")

        for chapter in project_data["chapters"]:
            title = chapter["title"]
            word_count = chapter.get("word_count", 0)
            toc_line = f"  {title}"
            if word_count > 0:
                toc_line += f"  ({word_count} 字)"
            lines.append(toc_line)

        lines.append(f"\n{'─' * 30}\n")

        # Chapters
        for chapter in project_data["chapters"]:
            lines.append(f"\n{'=' * 40}")
            lines.append(f"  {chapter['title']}")
            lines.append(f"{'=' * 40}\n")

            if chapter.get("content"):
                lines.append(chapter["content"])
            else:
                lines.append("（本章尚未生成）")

        lines.append(f"\n\n{'=' * 50}")
        lines.append(f"  全书完 · 共 {project_data['total_words']} 字")
        lines.append(f"{'=' * 50}")

        content = "\n".join(lines)
        return ExportResult(
            filename=f"{project_data['project_name']}.txt",
            content=content,
            media_type=self.media_type,
        )
