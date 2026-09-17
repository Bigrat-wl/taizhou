# 信息素养大赛 · 在线答题与成果收集系统

学生用自己电脑访问域名，在线完成**基础题**（22 题，含小问共 50 个填空）并**上传实践题成果**；组织者在后台导入名单、实时查看填写状态、导出答案用于人工评分。

- 学生端：登录 →（开赛倒计时）说明卡片 → 答题 → 上传成果 → 交卷锁定
- 后台：`/?admin` → 导入名单 → 状态看板（22 格三态方块）→ 导出 CSV

## 技术栈

| 层 | 选型 |
|----|------|
| 后端 | Express 5 + better-sqlite3 + multer + xlsx（**纯 JavaScript**） |
| 前端 | Vue 3 + Vite + TypeScript + Tailwind CSS v4 + Element Plus |
| 数据库 | SQLite（单文件 `server/db.sqlite`） |
| 包管理 | pnpm（工作区：`server/` + `client/`） |
| 部署 | 腾讯云 Linux + Nginx + PM2（见 `deploy/runbook.md`） |

## 环境要求

- Node **>= 22**（`better-sqlite3@13` 要求；当前开发机为 Node 24）
- pnpm（仓库根 `pnpm-workspace.yaml` 按 pnpm 12 的配置格式编写）

## 装依赖

`server/` 与 `client/` 是同一个 pnpm 工作区的两个项目，**在仓库根装一次即可**：

```bash
pnpm install
```

> pnpm 10+ 默认拦截依赖的安装脚本，`better-sqlite3` 是原生模块，已在根 `pnpm-workspace.yaml`
> 的 `allowBuilds` 里放行；不装脚本的话它只能靠包内预编译二进制，某些平台会直接跑不起来。

## 开发（两个进程）

```bash
# 终端 1：后端，固定 3000 端口
# 后台接口需要 ADMIN_KEY（未配置时后台一律 503 拒绝）
cd server && ADMIN_KEY=你的后台密码 node --watch server.js

# 终端 2：前端，5174 端口（5173 被本机系统端口转发占用，故约定 5174）
cd client && pnpm dev
```

| 地址 | 说明 |
|------|------|
| <http://localhost:5174> | 学生端 |
| <http://localhost:5174/?admin> | 后台（需填 `ADMIN_KEY`） |

**端口约定**：`vite.config.ts` 的 proxy 把 `/api` 写死指向 `http://localhost:3000`，所以**后端不能换端口**；前端有 HMR，**复用 5174 即可，不要另起一套**。

## 目录

```
server/                 Express 后端（纯 JS）
├── server.js           入口：挂载各路由 + listen
├── db.js               建表（五张表，首次启动自动创建）
├── questions.js        22 题的结构化数据（含小问 subs）
├── seed-student.js     开发用：插入测试学生
├── materials/          参赛包 zip（学生下载用，手动放入）
└── routes/
    ├── auth.js         登录 / GET /api/me
    ├── questions.js    题目 / 保存答案 / 进度 / 交卷
    ├── exam.js         开赛状态
    ├── upload.js       实践题文件上传
    ├── materials.js    参赛材料下载（公开）
    └── admin.js        后台：导入名单 / 看板 / 单学生 / 导出 / 开赛时间 / overview

client/                 Vue 3 前端
├── src/
│   ├── App.vue         壳：登录态 + 说明卡片/答题页切换 + ?admin 分支
│   ├── api.ts          请求封装（带 token）
│   ├── questions-meta.ts  题目元数据（后台方块渲染用）
│   ├── examNotes.ts    注意事项文案
│   └── views/
│       ├── LoginView.vue          登录页
│       ├── ExamIntroCard.vue      说明卡片（开赛倒计时）
│       ├── QuestionnaireView.vue  答题页（核心：侧栏题号 + 小问输入 + 上传 + 交卷）
│       └── AdminView.vue          后台
└── vite.config.ts      5174 端口 + /api 代理 + Element Plus 按需引入

docs/
├── contracts/          契约：api.md（接口）、database.md（表）
└── designs/            视觉设计规范（08-visual-spec.md）
```

## 数据表（五张）

| 表 | 用途 |
|----|------|
| `students` | 名单 + 交卷时间 `submitted_at` |
| `sessions` | 登录令牌 |
| `answers` | 答卷，按小问存：主键 `(student_id, question_no, sub_no)` |
| `uploads` | 实践题上传文件记录 |
| `settings` | 键值设置（当前用 `exam_start_at`） |

详见 `docs/contracts/database.md`。

## 关键约定

- 接口统一 `/api` 前缀、JSON 通信；前端只写相对路径 `/api/...`，不写死端口。
- **鉴权**：学生端 `Authorization: Bearer <token>`；后台 `X-Admin-Key: <ADMIN_KEY>`。
- **答案按小问存**：无小问的题 `sub_no = 0`。
- **交卷 = 批卷闸门**：`students.submitted_at` 非空即已交卷，后台只对已交卷学生开放答卷。
- **开赛时间**：存 `settings.exam_start_at`；**未设置视为已开赛**（开发/测试用）。后台可设，学生端据此显示倒计时并禁用答题。
- **导入名单是破坏性操作**：会清空全部 `students`/`answers`/`uploads`/`sessions`，仅应在开赛前执行；后台有二次确认。
- 数据库不引 ORM，直接用 better-sqlite3 写 SQL。
- Tailwind v4：`@tailwindcss/vite` 插件 + `@import "tailwindcss"`，无配置文件。

## 构建

```bash
pnpm build          # 在仓库根执行：vite build && vue-tsc -b（先构建生成 d.ts，再类型检查）
```

## 相关文档

| 文档 | 内容 |
|------|------|
| `docs/contracts/api.md` | 全部接口的请求/响应契约 |
| `docs/contracts/database.md` | 五张表的结构与设计说明 |
| `docs/designs/08-visual-spec.md` | 视觉设计规范（配色 / 字号 / 间距 / 组件样式） |
| `deploy/runbook.md` | 部署与运维手册 |

## 关联项目

`../01-freshman-project-handoff/` —— 赛题本体（题面、原始数据、生成器、评分细则）。
本系统的「参赛材料下载」用的是它的构建产物 `dist/ITLab-Agent-Challenge-02-contestant.zip`，
拷贝到 `server/materials/` 后对学生开放下载。
