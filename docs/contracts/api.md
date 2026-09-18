---
status: 已确认
tags: [契约, API]
---

# 契约 · API 规范

基础约定：

- 所有接口返回 JSON：成功 `{ "ok": true, ... }`，失败 `{ "ok": false, "msg": "..." }`；
- 学生端接口（除 login）需带 `Authorization: Bearer <token>`；
- 后台接口需带 `X-Admin-Key: <密码>`，密码取环境变量 **`ADMIN_KEY`**（不写进代码；未配置时后台接口一律 503 拒绝）；
- 接口前缀 `/api`。

## 题目数据结构（`questions.js`）

22 题是混合题型，`questions.js` 导出数组，每项：

```js
{
  no: 11,                   // 题号 1–22
  part: "第三部分",          // 所属部分（5 部分）
  scored: true,             // 是否计分（第一部分 1–6、第二部分 7–10 不计分；第三、四、五部分 11–22 计分）
  points: 4,                // 该题满分；不计分题为 0。全卷计分题合计 100
  type: "text",             // checkbox | single | scale | text
  prompt: "题面（情境描述部分，不含 ①②③ 小问行）",
  options: ["选项A", "选项B"],  // checkbox/single 才有
  scaleMax: 5,              // scale 才有
  subs: [                   // 小问；无小问的题省略此字段或给空数组
    { subNo: 1, text: "① 它最可能在哪？" },
    { subNo: 2, text: "② 你怎么能快速找到它？" },
    { subNo: 3, text: "③ 以后怎么避免再找不到？" }
  ]
}
```

**分值**：`points` 是批卷的满分来源（后台不另存分值表）。当前分布——第三部分 30（Q11–16 各 4、Q17–18 各 3）、第四部分 35（Q19 12、Q20 12、Q21 11）、第五部分 35（Q22），**合计 100**。

**小问规则**：
- 带小问的题一律为 `type: "text"`；前端**每个小问渲染一个独立输入框**，保存时带 `subNo`。无小问的题 `subNo` 固定为 `0`。
- **`prompt` 不含小问行**：小问文字只放 `subs`，否则前端渲染时 ①②③ 会出现两遍。

## 学生端

### POST /api/login —— 登录
请求：`{ "studentId": "2026000001", "name": "李明悦" }`
成功：`{ "ok": true, "token": "xxx", "student": { "studentId", "name", "college", "class" } }`
失败：`{ "ok": false, "msg": "学号或姓名不对" }`

### GET /api/me —— 当前登录学生信息（受保护）
请求头：`Authorization: Bearer <token>`
成功：`{ "ok": true, "student": { "studentId", "name", "college", "class", "submittedAt" } }`
失败：`{ "ok": false, "msg": "未登录" }`（401）

### GET /api/questions —— 拉取题目
响应：`{ "ok": true, "questions": [ <题目结构如上> ] }`

### POST /api/answer —— 保存一个小问的答案（自动保存，覆盖写）
请求：`{ "questionNo": 13, "subNo": 2, "answerText": "..." }`
说明：无小问的题 `subNo` 传 `0`；`answerText` 为空字符串时删除该行。
响应：`{ "ok": true, "saved": true }`

### GET /api/my-progress —— 我的填写进度（受保护）
请求头：`Authorization: Bearer <token>`
响应：`{ "ok": true, "answered": [ { "questionNo": 13, "subNo": 2 } ], "answeredCount": 5, "total": <小问总数>, "submitted": false, "answers": [ { "questionNo": 13, "subNo": 2, "answerText": "..." } ] }`
说明：`answers` 供前端刷新后回显（否则输入框为空）。`total` 是全卷小问总数（无小问的题算 1）。

**状态恢复规则**（中途退出后重新打开，必须回到上次状态）：
- 前端在进入已登录界面时先调本接口，据此决定落到哪一屏：
  - `submitted: true` → 答题页「已交卷」锁定态，回显全部答案；
  - `submitted: false` 且 `answeredCount > 0` → 视为已开始，**直接进入答题页**并回显答案，**不再显示说明卡片**；
  - 否则 → 显示说明卡片（ExamIntroCard）。
- **`answers` 是回显的唯一权威来源**：localStorage 仅作**请求失败时的兜底**，**不得**用本地缓存覆盖服务器返回的空结果（否则会出现"服务器没存上、界面却有答案"的假象）。
- 说明卡片随时可从侧边栏「查看注意事项」重新打开，因此跳过卡片不会让学生丢失信息。

### GET /api/exam-status —— 开赛状态（受保护）
请求头：`Authorization: Bearer <token>`
响应：`{ "ok": true, "examStartAt": "2026-09-16T09:00:00" | null, "started": true, "serverNow": "2026-09-16T08:58:00" }`
说明：`started=false` 时前端显示开赛倒计时、禁用「开始答题」；`examStartAt` 为 null 视为已开赛。`serverNow` 用于计算倒计时偏差（避免依赖客户端时钟）。**到点后 `POST /api/answer` / `/api/submit` 才放行**，未开赛时返回 403 `{ok:false,msg:"尚未开赛"}`。

### POST /api/submit —— 交卷（受保护，幂等）
请求头：`Authorization: Bearer <token>`
行为：把当前学生 `students.submitted_at` 设为当前时间（重复提交只更新时间）。交卷是批卷的闸门。
成功：`{ "ok": true, "submittedAt": "2026-09-15T10:30:00" }`

### POST /api/upload —— 上传实践题文件
请求：multipart/form-data，字段 `file`（文件）、`type`（`xlsx` | `zip`）
响应：`{ "ok": true, "file": "uploads/<学号>/<文件名>" }`

### GET /api/my-uploads —— 我已上传的文件
响应：`{ "ok": true, "uploads": [ { "type": "xlsx", "path": "...", "at": "..." } ] }`

### GET /api/materials/contestant-package —— 下载参赛材料（**公开，不鉴权**）
响应：文件流（`ITLab-参赛包.zip`，含题面 + 原始数据.xlsx + 网页模板 + 提交区）
说明：
- **不鉴权**：参赛包是全员分发的材料、不含答案，故公开提供；前端一行 `<a href>` 即可。
- **服务固定文件**：接口**不接受任何路径参数**，只返回 `server/materials/` 下的固定文件——避免路径穿越。新增材料须改代码，不接受动态路径。
- 文件由主办方手动放入 `server/materials/`，见任务 16。

## 后台

### POST /api/admin/import —— 导入名单
请求：multipart/form-data，字段 `file`（xlsx/csv，含 学号/姓名/学院/班级 列）
响应：`{ "ok": true, "imported": 150 }`

**⚠️ 破坏性操作**：导入 = **清空全部** `students`/`answers`/`uploads`/`sessions` 后重新插入。仅应在**开赛前**执行。
- 学生登录后若再次导入，**所有人的答案、上传、登录态都会丢失**。
- 前端**必须**先调 `GET /api/admin/overview` 拿到当前数据量，弹出二次确认（写明将清空多少学生、多少条答案），确认后才发本请求。

### GET /api/admin/overview —— 当前数据量（导入前确认用）
响应：`{ "ok": true, "studentCount": 150, "answerCount": 1200, "uploadCount": 30, "submittedCount": 12 }`
说明：供前端在导入前提示「将清空 N 名学生、M 条答案」，防止误操作。

### GET /api/admin/students —— 学生状态列表（状态看板用，不含答案内容）
响应：`{ "ok": true, "students": [ { "studentId", "name", "college", "answered", "total", "submitted", "loggedIn", "scoredCount", "answeredQuestions": [1,2,5], "xlsx", "zip", "score", "maxScore", "practicalScore", "practicalMax" } ] }`
说明：
- `submitted` 布尔（是否交卷，批卷的闸门）；`answeredQuestions` 是已填题号数组。
- **`loggedIn`** 布尔：该学生当前是否有有效登录（`sessions` 表里有他的 token）。
- **`scoredCount`**：已评题数（0–12），用于判断"批完了没有"。
- **`score` / `maxScore`**：**基础题**已评总分 / 满分（100）。未评分时 `score` 为 `null`（不是 0）。
- **`practicalScore` / `practicalMax`**：**实践题**已评总分 / 满分（100）。未评分时 `null`。**两部分分开统计、分开显示。**

### GET /api/admin/student/:id —— 某个学生的详细答卷（批卷页用）
响应：
```js
{
  "ok": true,
  "student": { "studentId", "name", "college", "class", "submittedAt", "loggedIn" },
  "answers": [ { "questionNo", "subNo", "answerText", "updatedAt" } ],
  "scores":  [ { "questionNo", "score" } ],        // 基础题已打的分（未打分的题不出现）
  "practicalScores": [ { "dimension", "score" } ], // 实践题各维度得分（未打分的不出现）
  "uploads": [ { "id", "type", "path", "at" } ]    // id 供预览接口引用
}
```
说明：`answers` 含小问粒度；**题目原文与分值由前端用 `GET /api/questions`（含 `points`）拼装**，本接口不重复返回题目。只对**已交卷**学生返回。

### GET /api/admin/upload/:uploadId/preview —— 预览学生上传的文件（批卷页嵌用）
响应（xlsx）：
```js
{
  "ok": true, "type": "xlsx", "fileName": "2026000001_xlsx.xlsx",
  "sheets": [
    { "name": "最终参加名单", "rows": [[...], ...], "totalRows": 121, "totalCols": 16, "truncated": false }
  ]
}
```
响应（zip）：
```js
{ "ok": true, "type": "zip", "fileName": "...", "files": [ { "name": "index.html", "size": 1234 } ] }
```
说明：
- **xlsx**：解析全部工作表，返回单元格二维数组；前端**分页渲染**（每页 50 行）。单表超过 **1000 行**时只返回前 1000 行并置 `truncated: true`（提示可下载原文件）。
- **zip**：**只列文件清单，不解析也不渲染内容**——学生提交的 HTML 可能含恶意脚本，渲染有 XSS 风险。
- 文件类型由 `uploads.file_type` 判定；无法解析 → `{ ok: false, msg: "无法解析该文件" }`。

### POST /api/admin/preview-token/:uploadId —— 生成 zip 预览临时码
鉴权：`requireAdmin`（X-Admin-Key 请求头）。
校验 uploadId 存在且是 zip 类型 → 生成32位hex临时码（`crypto.randomBytes(16).toString('hex')`），存内存 Map，30分钟有效。
同时查找入口文件（优先 `index.html`，否则根目录第一个 `.html`）。
响应：`{ "ok": true, "token": "a1b2c3...", "entry": "index.html" }`

### GET /api/admin/preview/:token/:filePath —— 带码读取 zip 内单个文件
- 不用 `requireAdmin`，改为验码（查内存 Map）。
- token 不存在或已过期 → 401。
- `filePath` 校验：拒绝含 `..`、以 `/` 开头、空字符串 → 400。
- `filePath` 在 zip 条目里精确匹配（`adm-zip` 的 `getEntry`），天然无穿越。
- `Content-Type` 按扩展名推断（`.html`→`text/html`、`.js`→`text/javascript`、`.css`→`text/css`、`.json`→`application/json`、`.svg`→`image/svg+xml`、图片→对应类型、其他→`text/plain`）。
- **不设** `Content-Disposition: attachment`（iframe 需要内联渲染）。
- 惰性清理：每次验码时顺带清掉过期条目。
- 失败：文件不存在 → 404；路径不合法 → 400。

### POST /api/admin/score —— 保存某学生某题的得分
请求：`{ "studentId": "2026000001", "questionNo": 11, "score": 3 }`
行为：写 `scores` 表（`(studentId, questionNo)` 覆盖写）；`score` 必须为 0…该题满分的整数。
响应：`{ "ok": true, "questionNo": 11, "score": 3, "total": 57, "maxScore": 100 }`（返回该学生最新总分，省一次请求）

### POST /api/admin/practical-score —— 保存实践题某维度得分
请求：`{ "studentId": "2026000001", "dimension": "cleaning", "score": 24 }`
行为：写 `practical_scores` 表（`(studentId, dimension)` 覆盖写）；`score` 为 0…该维度满分的整数。
- 合法 `dimension`：`cleaning`(30) / `roster_seating`(30) / `procurement_questions`(15) / `cross_check`(15) / `webpage`(10)
- 非法 dimension 或超范围 → 400
响应：`{ "ok": true, "dimension": "cleaning", "score": 24, "practicalTotal": 68, "practicalMax": 100 }`

### GET /api/admin/practical-dimensions —— 实践题评分维度定义
响应：`{ "ok": true, "dimensions": [ { "key": "cleaning", "label": "数据判断与清洗", "max": 30 }, ... ] }`
说明：维度**固定五个**（来自赛题 `SCORING.md`），前端据此渲染打分表单，不硬编码在页面里。

### POST /api/admin/exam-start —— 设置开赛时间
请求：`{ "examStartAt": "2026-09-16T09:00:00" }`（写 `settings.exam_start_at`）
响应：`{ "ok": true, "examStartAt": "..." }`

### GET /api/admin/exam-start —— 读取开赛时间
响应：`{ "ok": true, "examStartAt": "..." | null }`

### GET /api/admin/export —— 导出全部答案
响应：文件流（CSV，**带 UTF-8 BOM**，便于 Excel 直接打开）
说明：一行一学生。列含 学号/姓名/学院/班级/是否交卷 等元信息列 + **各题答案**（当前 22 题，共约 28 列）。带小问的题，各小问用 ①②③ 前缀拼在同一格内（`\r\n` 分隔、整格加引号），保证列数固定。

### GET /api/admin/file/:uploadId —— 下载某学生上传的文件（用于预览）
响应：文件流。
