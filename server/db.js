'use strict';

// SQLite 连接 + 建表（契约见 docs/contracts/database.md，五张表）
// 不引入 ORM，直接用 better-sqlite3 写 SQL。

const path = require('path');
const Database = require('better-sqlite3');

// 数据库文件：DB 环境变量优先（临时验证用），否则固定放 server/ 目录下
const dbPath = process.env.DB || path.join(__dirname, 'db.sqlite');

const db = new Database(dbPath);

// 外键约束 + WAL：多进程/多请求下更稳
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 建表 SQL：首次启动自动执行，重复启动不报错
const SCHEMA = `
-- ① students —— 名单（导入的报名学生）；submitted_at 非空 = 已交卷（批卷闸门）
CREATE TABLE IF NOT EXISTS students (
  student_id   TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  college      TEXT,
  class_name   TEXT,
  submitted_at TEXT
);

-- ② sessions —— 登录令牌
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  created_at TEXT
);

-- ③ answers —— 试题答案（一题一「小问」一行；无小问的题 sub_no 固定为 0）
CREATE TABLE IF NOT EXISTS answers (
  student_id  TEXT,
  question_no INTEGER,
  sub_no      INTEGER NOT NULL DEFAULT 0,
  answer_text TEXT,
  updated_at  TEXT,
  PRIMARY KEY (student_id, question_no, sub_no)
);

-- ④ settings —— 系统设置（键值对；当前用 exam_start_at，未设置视为已开赛）
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ⑤ uploads —— 实践题文件
CREATE TABLE IF NOT EXISTS uploads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  TEXT,
  file_type   TEXT,
  file_path   TEXT,
  uploaded_at TEXT
);

-- ⑥ scores —— 批卷分数（整题一个分，主键 student_id + question_no）
CREATE TABLE IF NOT EXISTS scores (
  student_id  TEXT,
  question_no INTEGER,
  score       INTEGER,
  updated_at  TEXT,
  PRIMARY KEY (student_id, question_no)
);
`;

/** 建表（表已存在时为空操作） */
function initSchema() {
  db.exec(SCHEMA);
}

/**
 * 结构自检：老库（任务 11 之前建的）没有 sub_no / submitted_at。
 * CREATE TABLE IF NOT EXISTS 会补上缺失的**表**（settings 就是这样补的），
 * 但不会给已存在的表加**列**，所以这里只查列，并给一条能照着做的报错，
 * 而不是让接口在运行时报 "no such column"。
 */
function assertSchema() {
  const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const problems = [];

  if (!columns('answers').includes('sub_no')) {
    problems.push('answers 缺 sub_no（主键应为 student_id + question_no + sub_no）');
  }
  if (!columns('students').includes('submitted_at')) {
    problems.push('students 缺 submitted_at');
  }

  if (problems.length > 0) {
    throw new Error(
      `[db] 数据库结构不是当前契约（docs/contracts/database.md）：${problems.join('；')}。\n` +
        `[db] 本次是「小问拆分」的表结构变更，没有写迁移：请删除 ${dbPath}（连同 -wal/-shm）后重启，` +
        `有正式数据时先备份/导出。`
    );
  }
}

/** 当前库里的业务表名，供启动日志/自检用 */
function listTables() {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all()
    .map((row) => row.name);
}

initSchema();
assertSchema();

module.exports = { db, dbPath, initSchema, listTables };
