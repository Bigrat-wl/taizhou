---
status: 已确认
tags: [契约, 数据库]
---

# 契约 · 数据库设计

SQLite。建表 SQL 放 `db.js`，首次启动自动执行（`CREATE TABLE IF NOT EXISTS`）。

## ① students —— 名单（导入的报名学生）

| 字段 | 类型 | 说明 |
|------|------|------|
| student_id | TEXT, PK | 学号，唯一 |
| name | TEXT, NOT NULL | 姓名 |
| college | TEXT | 学院 |
| class_name | TEXT | 班级 |
| submitted_at | TEXT | 交卷时间（NULL=未交卷，非空=已交卷） |

登录校验 = 拿 `student_id + name` 去这张表查。

```sql
CREATE TABLE IF NOT EXISTS students (
  student_id TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  college    TEXT,
  class_name TEXT,
  submitted_at TEXT
);
```

## ② sessions —— 登录令牌

| 字段 | 类型 | 说明 |
|------|------|------|
| token | TEXT, PK | 随机令牌（`crypto.randomUUID()`） |
| student_id | TEXT, NOT NULL | 对应学生 |
| created_at | TEXT | 登录时间 |

```sql
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  created_at TEXT
);
```

## ③ answers —— 试题答案（一题一**小问**一行）

| 字段 | 类型 | 说明 |
|------|------|------|
| student_id | TEXT | 学号 |
| question_no | INTEGER | 题号 1–24 |
| sub_no | INTEGER | 小问号；**无小问的题固定为 0**，带小问的题取 1、2、3…（对应 ①②③） |
| answer_text | TEXT | 答案文字（多选存逗号分隔的选项） |
| updated_at | TEXT | 最后保存时间 |

主键 `(student_id, question_no, sub_no)` —— 同一人同一题同一小问只留最新一条，天然支持"自动保存覆盖"。

```sql
CREATE TABLE IF NOT EXISTS answers (
  student_id  TEXT,
  question_no INTEGER,
  sub_no      INTEGER NOT NULL DEFAULT 0,
  answer_text TEXT,
  updated_at  TEXT,
  PRIMARY KEY (student_id, question_no, sub_no)
);
```

**为什么按小问拆行**：12 道计分题（新编号 Q11–22）含 2–5 个小问，共 40 个（末题有 5 个）。拆行后能精确统计"某题填了 3/5 个小问"、后台批卷可按小问给分；合成一个字符串则每次都要解析。

看某学生"填到哪"：`SELECT question_no, sub_no FROM answers WHERE student_id=?`。

## ⑤ settings —— 系统设置（键值对）

| 字段 | 类型 | 说明 |
|------|------|------|
| key | TEXT, PK | 设置项名称 |
| value | TEXT | 设置值 |

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

当前用到的键：

- `exam_start_at`：开赛时间（ISO 字符串）。学生登录后据此显示开赛倒计时；到点后端放行答题。**未设置时视为已开赛**（开发/测试用）。

## ⑥ uploads —— 实践题文件

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER, PK | 自增 |
| student_id | TEXT | 学号 |
| file_type | TEXT | `xlsx` 或 `zip` |
| file_path | TEXT | 磁盘路径（相对 uploads/） |
| uploaded_at | TEXT | 上传时间 |

```sql
CREATE TABLE IF NOT EXISTS uploads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  TEXT,
  file_type   TEXT,
  file_path   TEXT,
  uploaded_at TEXT
);
```

## ⑦ scores —— 批卷分数

| 字段 | 类型 | 说明 |
|------|------|------|
| student_id | TEXT | 学号 |
| question_no | INTEGER | 题号；**只对计分题打分** |
| score | INTEGER | 该题得分（0 到该题满分） |
| updated_at | TEXT | 最后保存时间 |

主键 `(student_id, question_no)` —— 同一学生同一题只留一条，天然支持覆盖写。

```sql
CREATE TABLE IF NOT EXISTS scores (
  student_id  TEXT,
  question_no INTEGER,
  score       INTEGER,
  updated_at  TEXT,
  PRIMARY KEY (student_id, question_no)
);
```

- **只存总计分题，且是整题一个分**（不按小问拆）——批卷规则已确认"整题一个分、单评分者"。
- **满分来自 `questions.js`**：每道计分题的 `points` 字段；全卷合计 100 分。
  - 第三部分 30（Q11–16 各 4、Q17–18 各 3）
  - 第四部分 35（Q19 12、Q20 12、Q21 11）
  - 第五部分 35（Q22）
- 未打分的题**不建行**（区别于"0 分"）；总分 = 已有分数之和。

## 设计说明

- **答案按"一题一小问一行"存**，不存一大坨 JSON：后台要"实时看填到哪"，拆行后用 `COUNT`/`GROUP BY` 即可统计到小问粒度。
- **上传重名处理**：同一学生重复上传同类型文件时，覆盖旧文件 + 更新 `uploaded_at`（交最终产物，不做版本管理）。
- **不设 `questions` 表**：22 道题固定，写在 `questions.js`，不进数据库。**每题分值也写在 `questions.js`**（见 ⑦ 说明）。
