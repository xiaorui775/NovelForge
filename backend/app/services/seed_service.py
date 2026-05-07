import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.models.character import Character, CharacterRelation
from app.models.generation import PromptTemplate
from app.models.worldview import Worldview

logger = logging.getLogger(__name__)

PRESET_TEMPLATES = [
    {
        "name": "玄幻·标准",
        "type": "玄幻",
        "content": (
            "你是一位资深的玄幻小说作家，擅长构建宏大的修炼体系和热血的战斗场面。\n\n"
            "请根据以下大纲撰写第{chapter_number}章内容。\n\n"
            "【世界观要求】\n"
            "- 功法体系、修炼境界需逻辑自洽\n"
            "- 战斗描写注重招式细节和力量对比\n"
            "- 适当引入奇遇、突破等爽点\n\n"
            "【章节信息】\n"
            "章节标题：{chapter_title}\n"
            "章节概述：{chapter_summary}\n"
            "详细大纲：{detail_outline}\n\n"
            "【前文摘要】\n"
            "{prev_summaries}\n\n"
            "【专有名词（请保持一致）】\n"
            "{terminologies}\n\n"
            "【参考风格】\n"
            "{style_reference}\n\n"
            "【要求】\n"
            "- 字数：{min_words}-{max_words}字\n"
            "- 语言：{language}\n"
            "- 对话占比：约{dialogue_ratio}%\n"
            "- 直接输出正文内容，不要包含章节标题和作者注释"
        ),
    },
    {
        "name": "仙侠·标准",
        "type": "仙侠",
        "content": (
            "你是一位仙侠小说作家，擅长描写修仙悟道、法宝神兵和天地异象。\n\n"
            "请根据以下大纲撰写第{chapter_number}章内容。\n\n"
            "【世界观要求】\n"
            "- 修仙体系：炼气、筑基、金丹、元婴、化神等境界\n"
            "- 法宝、丹药、阵法等修仙元素\n"
            "- 天劫、渡劫等关键情节\n"
            "- 仙凡之别的世界观\n\n"
            "【章节信息】\n"
            "章节标题：{chapter_title}\n"
            "章节概述：{chapter_summary}\n"
            "详细大纲：{detail_outline}\n\n"
            "【前文摘要】\n"
            "{prev_summaries}\n\n"
            "【专有名词（请保持一致）】\n"
            "{terminologies}\n\n"
            "【参考风格】\n"
            "{style_reference}\n\n"
            "【要求】\n"
            "- 字数：{min_words}-{max_words}字\n"
            "- 语言：{language}\n"
            "- 对话占比：约{dialogue_ratio}%\n"
            "- 直接输出正文内容，不要包含章节标题和作者注释"
        ),
    },
    {
        "name": "都市·标准",
        "type": "都市",
        "content": (
            "你是一位都市小说作家，擅长刻画现代社会中的人物关系和心理博弈。\n\n"
            "请根据以下大纲撰写第{chapter_number}章内容。\n\n"
            "【写作要求】\n"
            "- 场景描写贴近现实生活\n"
            "- 对话自然口语化，符合人物身份\n"
            "- 注重人物心理活动描写\n"
            "- 情节推进合理，避免过度巧合\n\n"
            "【章节信息】\n"
            "章节标题：{chapter_title}\n"
            "章节概述：{chapter_summary}\n"
            "详细大纲：{detail_outline}\n\n"
            "【前文摘要】\n"
            "{prev_summaries}\n\n"
            "【专有名词（请保持一致）】\n"
            "{terminologies}\n\n"
            "【参考风格】\n"
            "{style_reference}\n\n"
            "【要求】\n"
            "- 字数：{min_words}-{max_words}字\n"
            "- 语言：{language}\n"
            "- 对话占比：约{dialogue_ratio}%\n"
            "- 直接输出正文内容，不要包含章节标题和作者注释"
        ),
    },
    {
        "name": "科幻·标准",
        "type": "科幻",
        "content": (
            "你是一位科幻小说作家，擅长构建严谨的科技设定和引人深思的未来世界。\n\n"
            "请根据以下大纲撰写第{chapter_number}章内容。\n\n"
            "【写作要求】\n"
            "- 科技设定需有内在逻辑\n"
            "- 世界观细节丰富但不堆砌\n"
            "- 硬科幻元素与人文思考结合\n"
            "- 专业术语使用准确\n\n"
            "【章节信息】\n"
            "章节标题：{chapter_title}\n"
            "章节概述：{chapter_summary}\n"
            "详细大纲：{detail_outline}\n\n"
            "【前文摘要】\n"
            "{prev_summaries}\n\n"
            "【专有名词（请保持一致）】\n"
            "{terminologies}\n\n"
            "【参考风格】\n"
            "{style_reference}\n\n"
            "【要求】\n"
            "- 字数：{min_words}-{max_words}字\n"
            "- 语言：{language}\n"
            "- 对话占比：约{dialogue_ratio}%\n"
            "- 直接输出正文内容，不要包含章节标题和作者注释"
        ),
    },
    {
        "name": "悬疑·标准",
        "type": "悬疑",
        "content": (
            "你是一位悬疑小说作家，擅长铺设伏笔、制造悬念和逻辑推理。\n\n"
            "请根据以下大纲撰写第{chapter_number}章内容。\n\n"
            "【写作要求】\n"
            "- 伏笔铺设自然，前后呼应\n"
            "- 线索逻辑清晰，推理合理\n"
            "- 节奏控制：张弛有度\n"
            "- 氛围营造：紧张感和压迫感\n"
            "- 结尾留悬念，吸引继续阅读\n\n"
            "【章节信息】\n"
            "章节标题：{chapter_title}\n"
            "章节概述：{chapter_summary}\n"
            "详细大纲：{detail_outline}\n\n"
            "【前文摘要】\n"
            "{prev_summaries}\n\n"
            "【专有名词（请保持一致）】\n"
            "{terminologies}\n\n"
            "【参考风格】\n"
            "{style_reference}\n\n"
            "【要求】\n"
            "- 字数：{min_words}-{max_words}字\n"
            "- 语言：{language}\n"
            "- 对话占比：约{dialogue_ratio}%\n"
            "- 直接输出正文内容，不要包含章节标题和作者注释"
        ),
    },
]


async def seed_prompt_templates() -> None:
    """插入默认 Prompt 预设模板（幂等操作）"""
    async with async_session() as session:
        # 检查是否已有预设
        result = await session.execute(
            select(PromptTemplate).where(
                PromptTemplate.type.in_([t["type"] for t in PRESET_TEMPLATES])
            )
        )
        existing_types = {t.type for t in result.scalars().all()}

        added = 0
        for preset in PRESET_TEMPLATES:
            if preset["type"] not in existing_types:
                template = PromptTemplate(
                    name=preset["name"],
                    type=preset["type"],
                    content=preset["content"],
                    is_default=True,
                )
                session.add(template)
                added += 1

        if added > 0:
            await session.commit()
            logger.info(f"已插入 {added} 个预设 Prompt 模板")


PRESET_CHARACTERS = [
    {
        "name": "示例·主角",
        "role_type": "主角",
        "description": "一位出身平凡但心怀大志的青年，因偶然机遇踏上修炼之路。性格坚韧不拔，重情重义，在逆境中不断成长。",
        "性格特点": "坚韧、正义感强、重情义、有时冲动",
        "background": "出生于偏远山村，父母早逝，由村中长者抚养长大。自幼体弱多病，却有着不服输的性格。一次山中采药时意外获得神秘传承，从此命运改变。",
    },
    {
        "name": "示例·导师",
        "role_type": "导师",
        "description": "隐居山林的世外高人，曾是名震天下的强者，因故隐退。性格沉稳睿智，对主角亦师亦父。",
        "性格特点": "睿智、沉稳、偶尔幽默、对弟子严格但关爱",
        "background": "年轻时纵横天下，经历了一场惨痛的变故后选择隐居。在主角身上看到了年轻时的自己，决定倾囊相授。",
    },
    {
        "name": "示例·反派",
        "role_type": "反派",
        "description": "表面风度翩翩的世家公子，实则心狠手辣、野心勃勃。为了达到目的不择手段，是主角最大的对手。",
        "性格特点": "阴险、城府深、极度自负、对弱者毫无同情",
        "background": "出身名门望族，自幼被灌输权力至上的观念。天赋极高却心术不正，视主角为眼中钉，多次设计陷害。",
    },
    {
        "name": "示例·红颜",
        "role_type": "女主",
        "description": "才貌双全的世家千金，性格温婉却内心坚强。与主角相识于微时，一路相伴，是主角最坚实的后盾。",
        "性格特点": "温婉、聪慧、内心坚强、善解人意",
        "background": "出身书香门第，自幼饱读诗书。因家族变故与主角结识，被主角的真诚和勇气所打动，逐渐产生深厚感情。",
    },
    {
        "name": "示例·兄弟",
        "role_type": "配角",
        "description": "主角的发小和过命兄弟，性格豪爽仗义。实力虽不及主角，但在关键时刻总能挺身而出。",
        "性格特点": "豪爽、仗义、大大咧咧、重兄弟情义",
        "background": "与主角同村长大，自幼一起练武。修炼天赋平平，但凭借勤奋和主角的帮助也踏上了修炼之路。是主角最信任的伙伴。",
    },
    {
        "name": "示例·村长",
        "role_type": "路人",
        "description": "偏远山村的年迈村长，为人正直善良。虽是普通人，却有着丰富的人生智慧和朴素的价值观。",
        "性格特点": "慈祥、固执、唠叨但句句在理",
        "background": "在村中生活了一辈子，见过无数年轻人走出大山却再也没回来。将主角视如己出，在主角离开时千叮万嘱。",
    },
]


PRESET_WORLDVIEWS = [
    {
        "name": "示例·玄幻世界观",
        "description": "一个以灵气修炼为核心的大陆，强者为尊，弱肉强食。大陆分为九大域，每个域都有各自的势力和规则。",
        "rules": (
            "【修炼体系】\n"
            "炼气 → 筑基 → 金丹 → 元婴 → 化神 → 合体 → 大乘 → 渡劫 → 飞升\n\n"
            "【势力分布】\n"
            "- 东域：剑修圣地，以剑道闻名\n"
            "- 南域：丹药世家聚集，炼丹术发达\n"
            "- 西域：体修为主，肉身强横\n"
            "- 北域：魔修势力盘踞，正邪对立\n"
            "- 中域：最强势力汇聚，天道院所在\n\n"
            "【核心规则】\n"
            "1. 灵气是修炼的根本，灵气浓郁之地被称为灵脉\n"
            "2. 天材地宝可辅助修炼和炼丹\n"
            "3. 渡劫是飞升前的最后一关，失败则陨落\n"
            "4. 正邪之分在于修炼功法的来源，而非善恶"
        ),
    },
    {
        "name": "示例·都市世界观",
        "description": "现代都市背景下，隐藏着不为人知的异能者群体。表面平静的社会下暗流涌动，各方势力在暗中角力。",
        "rules": (
            "【异能体系】\n"
            "- 觉醒者：拥有特殊能力的普通人，概率约万分之一\n"
            "- 异能分级：D（低危）→ C（中危）→ B（高危）→ A（超危）→ S（灭世级）\n"
            "- 异能类型：元素系、精神系、肉体强化系、空间系、时间系\n\n"
            "【势力分布】\n"
            "- 异能管理局：政府机构，负责监管和保护异能者\n"
            "- 暗影组织：地下势力，利用异能者谋取私利\n"
            "- 守护者联盟：自发组织，维护异能者与普通人的平衡\n\n"
            "【核心规则】\n"
            "1. 异能者身份对普通人保密\n"
            "2. 禁止对普通人使用异能\n"
            "3. 异能冲突由管理局仲裁\n"
            "4. S级异能者被视为国家级战略资源"
        ),
    },
]


PRESET_RELATIONS = [
    ("示例·主角", "示例·导师", "师徒", "主角的修炼导师，传授功法和战斗技巧"),
    ("示例·主角", "示例·红颜", "恋人", "相识于微时的青梅竹马，互相扶持"),
    ("示例·主角", "示例·反派", "宿敌", "命运的对手，多次交锋互有胜负"),
    ("示例·导师", "示例·反派", "旧识", "曾有过一段不为人知的过往"),
    ("示例·主角", "示例·兄弟", "兄弟", "同村长大的过命兄弟，互相扶持"),
    ("示例·兄弟", "示例·反派", "对立", "兄弟视反派为主角的威胁，处处提防"),
    ("示例·村长", "示例·主角", "养育之恩", "村长将主角视如己出，含辛茹苦抚养长大"),
    ("示例·村长", "示例·导师", "旧交", "村长年轻时曾救过隐居前的导师一命"),
]


async def seed_sample_data() -> None:
    """插入示例角色和世界观（幂等操作，按名称去重）"""
    async with async_session() as session:
        # 检查示例角色是否已存在
        sample_names = [p["name"] for p in PRESET_CHARACTERS]
        existing_chars = await session.execute(
            select(Character.name).where(Character.name.in_(sample_names))
        )
        existing_char_names = {row[0] for row in existing_chars.all()}

        # 修正历史数据：role_type "女主角" → "女主"（与前端 roleTypes 一致）
        fix_result = await session.execute(
            select(Character).where(Character.role_type == "女主角")
        )
        for char in fix_result.scalars().all():
            char.role_type = "女主"

        added_chars = 0
        for preset in PRESET_CHARACTERS:
            if preset["name"] in existing_char_names:
                continue
            char = Character(
                name=preset["name"],
                role_type=preset["role_type"],
                description=preset["description"],
                personality=preset.get("性格特点", ""),
                background=preset["background"],
            )
            session.add(char)
            added_chars += 1

        if added_chars > 0:
            await session.flush()
            logger.info(f"已插入 {added_chars} 个示例角色")

        # 查询所有预设角色（包括已有的和新建的），按名称建立 ID 映射
        all_chars_result = await session.execute(
            select(Character).where(Character.name.in_(sample_names))
        )
        char_name_to_id = {c.name: c.id for c in all_chars_result.scalars().all()}

        # 检查已有关系，避免重复创建
        existing_rels = await session.execute(
            select(
                CharacterRelation.from_character_id,
                CharacterRelation.to_character_id,
                CharacterRelation.relation_type,
            )
        )
        existing_rel_set = {(r[0], r[1], r[2]) for r in existing_rels.all()}

        added_rels = 0
        for from_name, to_name, rel_type, desc in PRESET_RELATIONS:
            from_id = char_name_to_id.get(from_name)
            to_id = char_name_to_id.get(to_name)
            if not from_id or not to_id:
                continue
            if (from_id, to_id, rel_type) in existing_rel_set:
                continue
            rel = CharacterRelation(
                from_character_id=from_id,
                to_character_id=to_id,
                relation_type=rel_type,
                description=desc,
            )
            session.add(rel)
            added_rels += 1

        if added_rels > 0:
            logger.info(f"已插入 {added_rels} 条角色关系")

        # 检查示例世界观是否已存在
        wv_names = [p["name"] for p in PRESET_WORLDVIEWS]
        existing_wvs = await session.execute(
            select(Worldview.name).where(Worldview.name.in_(wv_names))
        )
        existing_wv_names = {row[0] for row in existing_wvs.all()}

        if len(existing_wv_names) < len(wv_names):
            added_wv = 0
            for preset in PRESET_WORLDVIEWS:
                if preset["name"] in existing_wv_names:
                    continue
                wv = Worldview(
                    name=preset["name"],
                    description=preset["description"],
                    rules=preset["rules"],
                )
                session.add(wv)
                added_wv += 1
            if added_wv > 0:
                logger.info(f"已插入 {added_wv} 个示例世界观")

        await session.commit()
