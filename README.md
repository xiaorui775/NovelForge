# NovelForge

AI 驱动的小说创作工具，面向个人创作者。从大纲构思到章节生成、角色管理、世界观构建，再到多格式导出，提供完整的小说创作工作流。

## 功能特性

### 创作核心
- **AI 章节生成** — SSE 流式输出，实时查看生成内容
- **大纲管理** — 多层级故事大纲，支持拖拽排序
- **章节编辑器** — 版本历史、恢复、对比
- **看板视图** — 拖拽式章节状态管理
- **阅读模式** — 沉浸式小说阅读体验

### 创作辅助
- **角色管理** — 全局角色库，角色弧光追踪
- **世界观构建** — 设定、规则、地理等要素管理
- **术语管理** — 自定义专有名词，AI 生成时自动引用
- **伏笔追踪** — 伏笔/契诃夫之枪管理
- **节奏分析** — 叙事节奏可视化
- **故事健康度** — 情节一致性检查
- **故事模板** — 预设结构模板（三幕式、英雄之旅等）
- **AI 助手** — 对话式创作辅助

### 工程能力
- **多格式导出** — EPUB / DOCX / PDF
- **封面生成** — AI 生成书籍封面
- **全文搜索** — 跨项目内容检索
- **数据备份** — 一键备份与恢复
- **费用追踪** — API 调用成本统计与预算控制
- **使用分析** — 创作数据可视化

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18、TypeScript、Vite、TailwindCSS、Zustand、Framer Motion |
| 后端 | FastAPI、SQLAlchemy 2 (async)、Pydantic 2、Alembic |
| 数据库 | PostgreSQL 16 (asyncpg) |
| 代理 | Nginx（反向代理 + SSE 支持） |
| AI 集成 | Adapter 模式，支持 OpenAI 兼容 API |

## 项目结构

```
NovelForge/
├── frontend/              # React 前端
│   ├── src/
│   │   ├── api/           # API 请求模块（统一 SSE 流式实现）
│   │   ├── stores/        # Zustand 状态管理
│   │   ├── components/    # 通用组件
│   │   └── pages/         # 页面组件（20+ 路由）
│   ├── Dockerfile         # 开发环境 Dockerfile
│   ├── Dockerfile.prod    # 生产环境 Dockerfile（多阶段构建）
│   └── nginx/             # 前端静态资源 nginx 配置
├── backend/               # FastAPI 后端
│   ├── app/
│   │   ├── routers/       # 路由层（23 个模块）
│   │   ├── services/      # 业务逻辑层（27 个服务）
│   │   ├── models/        # SQLAlchemy ORM（20 个模型，UUID 主键）
│   │   ├── schemas/       # Pydantic 请求/响应模型
│   │   ├── adapters/      # AI 模型适配器
│   │   └── utils/         # 工具类（加密等）
│   ├── alembic/           # Alembic 数据库迁移
│   ├── Dockerfile         # 后端 Dockerfile
│   ├── requirements.txt   # 运行依赖（锁定版本）
│   └── requirements-dev.txt # 开发依赖（测试、lint）
├── nginx/                 # Nginx 反向代理配置
├── docker-compose.yml     # Docker Compose 编排
└── .env.example           # 环境变量示例
```

## 快速开始

### 环境要求

- Node.js 20+
- Python 3.11+
- PostgreSQL 16+
- pnpm

### 1. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，设置数据库密码和加密密钥：

```env
DB_PASSWORD=your_postgres_password
ENCRYPTION_KEY=your_fernet_key    # 运行 python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 生成
DEBUG=true
LOG_LEVEL=INFO
```

### 2. 启动后端

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 运行数据库迁移
alembic upgrade head

# 启动开发服务器
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

后端 API 文档：http://localhost:8000/docs

### 3. 启动前端

```bash
cd frontend
pnpm install
pnpm dev
```

访问 http://localhost:3000

### Docker 部署

推荐使用 Docker Compose 一键部署完整服务栈（PostgreSQL + Backend + Frontend + Nginx）：

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env，设置：
# - DB_PASSWORD: PostgreSQL 密码
# - ENCRYPTION_KEY: Fernet 加密密钥（用于 API key 加密）
#   生成命令: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# 2. 一键启动所有服务
docker-compose up -d

# 3. 查看服务状态
docker-compose ps
```

**服务说明**：
- `postgres` — PostgreSQL 16 数据库（端口 5432）
- `backend` — FastAPI 后端服务（端口 8000，内部通信）
- `frontend` — React 前端静态资源服务（端口 3000，内部通信）
- `nginx` — 反向代理（端口 80），统一入口：
  - `/` → 前端
  - `/api/` → 后端（SSE 流式支持已配置）

**首次启动后**：
- 访问 http://localhost（或服务器 IP）
- 数据库迁移和种子数据自动执行
- 默认 Prompt 模板和示例数据自动创建

**停止服务**：
```bash
docker-compose down
# 清理数据卷（慎用）
docker-compose down -v
```

**生产部署建议**：
- 配置 HTTPS（修改 `nginx/nginx.conf` 添加 SSL 证书）
- 调整 PostgreSQL 密码为强密码
- 设置 `DEBUG=false` 和适当的 `LOG_LEVEL`
- 配置定期数据库备份

## 开发命令

### 前端

```bash
pnpm dev          # 开发服务器 (端口 3000)
pnpm build        # TypeScript 检查 + 生产构建
pnpm lint         # ESLint 检查
pnpm format       # Prettier 格式化
pnpm test         # Vitest 单元测试
pnpm test:e2e     # Playwright 端到端测试
```

### 后端

```bash
uvicorn app.main:app --reload    # 开发服务器
pytest                           # 运行测试（需要安装 requirements-dev.txt）
pip install -r requirements-dev.txt  # 安装开发依赖
ruff check .                     # Lint
ruff format .                    # 格式化
alembic upgrade head             # 执行迁移
alembic revision --autogenerate -m "描述"  # 创建新迁移
```

### Docker

```bash
docker-compose up -d             # 启动所有服务（后台运行）
docker-compose ps                # 查看服务状态
docker-compose logs -f backend   # 查看后端日志
docker-compose down              # 停止所有服务
docker-compose down -v           # 停止并删除数据卷（清理数据库）
```

## 架构设计

### 数据模型

```
Project → Outline → ChapterOutline → Chapter → ChapterVersion
```

角色（Character）和世界观（Worldview）为全局实体，通过大纲与项目关联。

### SSE 流式生成

章节生成使用 Server-Sent Events 实现流式输出：

- **后端**：`StreamingResponse(text/event-stream)`
- **前端**：统一 SSE 工具函数 `frontend/src/api/sse.ts`，解析 `data:` 前缀的 JSON 事件
- **事件类型**：`token`、`done`、`error`、`batch_start`、`batch_next`、`batch_done`、`round_start`、`round_token`、`round_complete`
- **支持场景**：章节生成、续写、批量生成、AI 聊天、改写、精修、头脑风暴

### AI 适配器模式

通过 `BaseModelAdapter` 抽象层支持不同 AI 提供商。当前实现 OpenAI 兼容 API（httpx），扩展新提供商只需实现适配器并在工厂中注册。

### API 密钥安全

使用 Fernet 对称加密，API 密钥存储时自动加密，调用时解密。

## 界面风格

- **暗色主题**："书房"美学，背景 `#1c1915`、卡片 `#242019`、强调色 `#c9a96e`（琥珀金）
- **TailwindCSS** + 自定义工具类（`.btn-primary`、`.btn-secondary`、`.btn-ghost`、`.card`、`.input`）
- **字体**：Playfair Display + Noto Serif SC（标题）、DM Sans + Noto Sans SC（正文）
- **动画**：Framer Motion 入场动画、`glowPulse` 呼吸效果
- **中文界面**

## 版本历史与数据追踪

- **章节版本**：每次 AI 生成创建 `ChapterVersion` 记录，支持恢复和对比
- **自动保存**：编辑器 2 秒防抖自动保存，失败后指数退避重试（3s/6s/12s），页面关闭或崩溃时 localStorage 保护未保存内容
- **生成日志**：`GenerationLog` 记录每次生成的 token、费用、时长、质量评分
- **费用预算**：月度预算控制，生成前费用预估确认
- **数据验证**：自动检查生成内容质量，可选自动修改

## 许可

本项目采用 Apache-2.0 License 开源协议。
