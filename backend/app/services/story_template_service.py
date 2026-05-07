import uuid
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.story_template import StoryTemplate
from app.schemas.story_template import StoryTemplateCreate


BUILTIN_TEMPLATES = [
    {
        "name": "三幕式结构",
        "description": "经典的好莱坞三幕式结构，适合大多数叙事类型。第一幕建置（25%）、第二幕对抗（50%）、第三幕解决（25%）。",
        "genre_hint": "通用",
        "structure": {
            "phases": [
                {
                    "name": "第一幕：建置",
                    "ratio": 0.25,
                    "description": "介绍主角的日常生活、世界观和核心冲突的触发事件",
                    "guides": [
                        "主角的日常生活是什么样的？",
                        "故事发生在什么世界/时代？",
                        "什么事件打破了主角的平衡？",
                        "主角最初的目标是什么？",
                    ],
                },
                {
                    "name": "第二幕：对抗",
                    "ratio": 0.50,
                    "description": "冲突不断升级，主角面对障碍、盟友和敌人，在挣扎中成长",
                    "guides": [
                        "主角遇到了哪些障碍？",
                        "谁是盟友？谁是敌人？",
                        "主角在中途发生了什么转变？",
                        "一切看似失败的低谷是什么？",
                    ],
                },
                {
                    "name": "第三幕：解决",
                    "ratio": 0.25,
                    "description": "最终对决、高潮和结局，主角完成内在和外在的转变",
                    "guides": [
                        "最终对决/高潮是什么？",
                        "主角如何获胜（或失败）？",
                        "主角从起点到终点发生了什么变化？",
                        "故事结束时世界变成了什么样？",
                    ],
                },
            ]
        },
    },
    {
        "name": "英雄之旅",
        "description": "约瑟夫·坎贝尔的英雄之旅，12 个阶段。适合冒险、奇幻、成长类故事。",
        "genre_hint": "奇幻/冒险",
        "structure": {
            "phases": [
                {
                    "name": "平凡世界",
                    "ratio": 0.08,
                    "description": "展示英雄的日常生活",
                    "guides": ["英雄的日常是什么？他缺少什么？"],
                },
                {
                    "name": "冒险召唤",
                    "ratio": 0.08,
                    "description": "英雄收到改变的召唤",
                    "guides": ["什么事件或信息召唤英雄踏上旅程？"],
                },
                {
                    "name": "拒绝召唤",
                    "ratio": 0.05,
                    "description": "英雄犹豫、恐惧或拒绝",
                    "guides": ["英雄为什么犹豫？他在害怕什么？"],
                },
                {
                    "name": "遇见导师",
                    "ratio": 0.08,
                    "description": "导师出现，给予英雄指引或工具",
                    "guides": ["导师是谁？他给了英雄什么？"],
                },
                {
                    "name": "跨越门槛",
                    "ratio": 0.08,
                    "description": "英雄正式踏上冒险旅程",
                    "guides": ["英雄如何跨越不可逆转的门槛？"],
                },
                {
                    "name": "考验、盟友、敌人",
                    "ratio": 0.15,
                    "description": "英雄面对考验，结识盟友，遭遇敌人",
                    "guides": ["英雄遇到了什么考验？盟友和敌人分别是谁？"],
                },
                {
                    "name": "接近最深处的洞穴",
                    "ratio": 0.08,
                    "description": "英雄准备面对最大的危险",
                    "guides": ["英雄为最终挑战做了什么准备？"],
                },
                {
                    "name": "磨难",
                    "ratio": 0.10,
                    "description": "英雄面对最大的恐惧，经历死亡与重生",
                    "guides": ["英雄经历了什么样的死亡/重生？"],
                },
                {
                    "name": "奖赏",
                    "ratio": 0.05,
                    "description": "英雄获得奖赏（宝物、知识、能力）",
                    "guides": ["英雄获得了什么？"],
                },
                {
                    "name": "归途",
                    "ratio": 0.08,
                    "description": "英雄踏上归途，可能面临追击",
                    "guides": ["归途中遇到了什么阻碍？"],
                },
                {
                    "name": "复活",
                    "ratio": 0.10,
                    "description": "英雄在最终考验中完成蜕变",
                    "guides": ["英雄如何在最后的考验中证明自己的蜕变？"],
                },
                {
                    "name": "带着万灵药归来",
                    "ratio": 0.07,
                    "description": "英雄回到平凡世界，带回了改变世界的东西",
                    "guides": ["英雄带回了什么？世界/英雄如何改变？"],
                },
            ]
        },
    },
    {
        "name": "起承转合",
        "description": "东亚传统四段式叙事结构，节奏紧凑，适合中短篇。起（引入）→ 承（发展）→ 转（转折）→ 合（结局）。",
        "genre_hint": "通用/东亚",
        "structure": {
            "phases": [
                {
                    "name": "起：引入",
                    "ratio": 0.20,
                    "description": "引入人物、背景和基本矛盾",
                    "guides": ["主要人物是谁？故事背景是什么？基本矛盾是什么？"],
                },
                {
                    "name": "承：发展",
                    "ratio": 0.30,
                    "description": "矛盾发展、人物关系深化",
                    "guides": ["矛盾如何发展？人物关系发生了什么变化？"],
                },
                {
                    "name": "转：转折",
                    "ratio": 0.30,
                    "description": "出人意料的转折，故事走向发生根本改变",
                    "guides": ["什么意外事件改变了故事走向？真相是什么？"],
                },
                {
                    "name": "合：结局",
                    "ratio": 0.20,
                    "description": "矛盾解决，故事收束",
                    "guides": ["矛盾如何解决？人物的最终命运是什么？"],
                },
            ]
        },
    },
    {
        "name": "雪花法",
        "description": "从一句话概括开始，逐层扩展为完整大纲。适合需要严密逻辑的复杂故事。",
        "genre_hint": "推理/悬疑",
        "structure": {
            "phases": [
                {
                    "name": "核心一句话",
                    "ratio": 0.0,
                    "description": "用一句话概括整个故事（不是章节，是大纲引导）",
                    "guides": ["用一句话说清楚：谁？在什么情况下？做了什么？结果如何？"],
                },
                {
                    "name": "五句话扩展",
                    "ratio": 0.10,
                    "description": "将一句话扩展为五个关键情节点",
                    "guides": ["开端、发展1、中点转折、发展2、结局各是什么？"],
                },
                {
                    "name": "人物弧光",
                    "ratio": 0.10,
                    "description": "为主要人物建立完整弧光",
                    "guides": ["每个主要人物的目标、动机、矛盾、转变是什么？"],
                },
                {
                    "name": "大纲展开",
                    "ratio": 0.40,
                    "description": "将五句话逐段展开为详细的章节大纲",
                    "guides": ["每个情节点需要多少章来展开？每章的核心事件是什么？"],
                },
                {
                    "name": "细节丰富",
                    "ratio": 0.40,
                    "description": "在大纲基础上丰富场景、对话、细节",
                    "guides": ["每个关键场景的环境、情绪、对话要点是什么？"],
                },
            ]
        },
    },
    {
        "name": "Save the Cat（15 拍）",
        "description": "布莱克·斯奈德的 15 拍结构，广泛用于商业小说和影视剧本。",
        "genre_hint": "商业/类型小说",
        "structure": {
            "phases": [
                {
                    "name": "第一幕（1-5 拍）",
                    "ratio": 0.25,
                    "description": "开场画面 → 主题陈述 → 铺垫 → 催化剂 → 争论",
                    "guides": [
                        "开场画面：故事开始时的世界是什么样？",
                        "主题陈述：有人对主角说出故事的核心主题",
                        "铺垫：展示主角的日常世界和缺陷",
                        "催化剂：改变一切的事件",
                        "争论：主角真的要踏上这段旅程吗？",
                    ],
                },
                {
                    "name": "第二幕上半（6-10 拍）",
                    "ratio": 0.25,
                    "description": "进入第二幕 → B 故事 → 游戏时间 → 中点 → 反派逼近",
                    "guides": [
                        "进入第二幕：主角进入新世界",
                        "B 故事：爱情线或副线故事开始",
                        "游戏时间：展示故事承诺的核心乐趣",
                        "中点：虚假胜利或虚假失败",
                        "反派逼近：压力增大，反派的力量显现",
                    ],
                },
                {
                    "name": "第二幕下半（11-12 拍）",
                    "ratio": 0.15,
                    "description": "一无所有 → 灵魂至暗时刻",
                    "guides": [
                        "一无所有：主角失去一切，跌入谷底",
                        "灵魂至暗时刻：主角在绝望中找到内在力量",
                    ],
                },
                {
                    "name": "第三幕（13-15 拍）",
                    "ratio": 0.35,
                    "description": "终局 → 终场画面",
                    "guides": [
                        "终局：主角运用所学解决冲突",
                        "终场画面：与开场画面形成对比，展示主角的改变",
                    ],
                },
            ]
        },
    },
]


async def seed_templates(db: AsyncSession) -> None:
    """Seed builtin story templates if not present."""
    result = await db.execute(select(StoryTemplate).where(StoryTemplate.is_builtin == True).limit(1))
    if result.scalars().first():
        return

    for tpl in BUILTIN_TEMPLATES:
        db.add(StoryTemplate(
            name=tpl["name"],
            description=tpl["description"],
            structure=tpl["structure"],
            genre_hint=tpl["genre_hint"],
            is_builtin=True,
        ))
    await db.commit()


async def list_templates(db: AsyncSession) -> list[StoryTemplate]:
    result = await db.execute(select(StoryTemplate).order_by(StoryTemplate.is_builtin.desc(), StoryTemplate.created_at))
    return list(result.scalars().all())


async def get_template(db: AsyncSession, template_id: uuid.UUID) -> Optional[StoryTemplate]:
    result = await db.execute(select(StoryTemplate).where(StoryTemplate.id == template_id))
    return result.scalars().first()


async def create_template(db: AsyncSession, data: StoryTemplateCreate) -> StoryTemplate:
    tpl = StoryTemplate(**data.model_dump())
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    return tpl


async def delete_template(db: AsyncSession, template_id: uuid.UUID) -> bool:
    tpl = await get_template(db, template_id)
    if not tpl or tpl.is_builtin:
        return False
    await db.delete(tpl)
    await db.commit()
    return True
