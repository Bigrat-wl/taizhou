'use strict';

// 后台路由（任务 11 只做「开赛时间」两个接口；任务 05 补 名单导入 / 状态看板 / 单学生 / 导出）
// 契约见 docs/contracts/api.md（后台接口需带 X-Admin-Key）；settings 表见 docs/contracts/database.md。
// 挂载在 server.js：app.use('/api', require('./routes/admin'))

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');
const { db } = require('../db');
const questions = require('../questions');

const router = express.Router();

// ---- 工具函数 ----

const EXAM_START_KEY = 'exam_start_at';

const selectSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const upsertSetting = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const deleteSetting = db.prepare('DELETE FROM settings WHERE key = ?');

/** 定长比较，避免按字符提前返回 */
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 后台鉴权：请求头 X-Admin-Key 必须等于环境变量 ADMIN_KEY。
 * 没配 ADMIN_KEY 时一律拒绝。
 */
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) {
    console.warn('[admin] 未设置环境变量 ADMIN_KEY，后台接口全部拒绝');
    return res.status(503).json({ ok: false, msg: '后台未配置 ADMIN_KEY' });
  }
  const got = req.headers['x-admin-key'];
  if (typeof got !== 'string' || got === '' || !safeEqual(got, expected)) {
    return res.status(401).json({ ok: false, msg: '后台口令不对' });
  }
  next();
}

/** 读 settings.exam_start_at（未设置为 null） */
function readExamStartAt() {
  const row = selectSetting.get(EXAM_START_KEY);
  return row && row.value ? String(row.value) : null;
}

// ---- 题目元数据（用于 CSV 导出列头）----

const questionNos = questions.map((q) => q.no); // [1,2,...,22]

// ---- 实践题五维度常量 ----

const PRACTICAL_DIMENSIONS = [
  { key: 'cleaning', label: '数据判断与清洗', max: 30 },
  { key: 'roster_seating', label: '最终名单与座位', max: 30 },
  { key: 'procurement_questions', label: '采购与问题建议', max: 15 },
  { key: 'cross_check', label: '跨表核验与异常记录', max: 15 },
  { key: 'webpage', label: '网页接入', max: 10 },
];
const PRACTICAL_MAX = PRACTICAL_DIMENSIONS.reduce((s, d) => s + d.max, 0); // 100
const DIMENSION_MAP = new Map(PRACTICAL_DIMENSIONS.map((d) => [d.key, d.max]));

// ---- 已有接口：开赛时间 ----

// POST /api/admin/exam-start —— 设置开赛时间
router.post('/admin/exam-start', requireAdmin, (req, res) => {
  const raw = (req.body || {}).examStartAt;

  if (raw === null || raw === undefined || raw === '') {
    deleteSetting.run(EXAM_START_KEY);
    return res.json({ ok: true, examStartAt: null });
  }
  if (typeof raw !== 'string') {
    return res.status(400).json({ ok: false, msg: 'examStartAt 要是时间字符串' });
  }

  const examStartAt = raw.trim();
  if (Number.isNaN(Date.parse(examStartAt))) {
    return res
      .status(400)
      .json({ ok: false, msg: 'examStartAt 不是合法时间（建议 ISO 格式，如 2026-09-16T09:00:00）' });
  }

  upsertSetting.run(EXAM_START_KEY, examStartAt);
  res.json({ ok: true, examStartAt });
});

// GET /api/admin/exam-start —— 读取开赛时间
router.get('/admin/exam-start', requireAdmin, (req, res) => {
  res.json({ ok: true, examStartAt: readExamStartAt() });
});

// ---- 新接口 ①：GET /api/admin/overview —— 当前数据量（导入前确认用）----

router.get('/admin/overview', requireAdmin, (req, res, next) => {
  try {
    const studentCount = db.prepare('SELECT COUNT(*) AS c FROM students').get().c;
    const answerCount = db.prepare('SELECT COUNT(*) AS c FROM answers').get().c;
    const uploadCount = db.prepare('SELECT COUNT(*) AS c FROM uploads').get().c;
    const submittedCount = db.prepare('SELECT COUNT(*) AS c FROM students WHERE submitted_at IS NOT NULL').get().c;
    res.json({ ok: true, studentCount, answerCount, uploadCount, submittedCount });
  } catch (e) {
    next(e);
  }
});

// ---- 新接口 ②：POST /api/admin/import —— 导入名单 ----

// multer 内存存储（名单文件小，不落盘）
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const ext = (file.originalname || '').toLowerCase().split('.').pop();
    if (ext !== 'xlsx' && ext !== 'xls' && ext !== 'csv') {
      return cb(new Error('只支持 .xlsx / .xls / .csv 文件'));
    }
    cb(null, true);
  },
});

/** 解析上传文件，返回 [{studentId, name, college, className}] */
function parseRosterFile(buffer, filename) {
  const ext = (filename || '').toLowerCase().split('.').pop();
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length < 2) return [];

  // 表头归一化：去空格、去 BOM、转小写
  const header = rows[0].map((h) =>
    String(h)
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
  );

  // 列名映射（支持常见变体）
  const colMap = {
    studentId: ['学号', 'studentid', 'student_id', 'id', '编号'],
    name: ['姓名', 'name', '名字'],
    college: ['学院', 'college', '院系'],
    className: ['班级', 'class', 'class_name', 'classroom'],
  };

  function findCol(aliases) {
    for (const alias of aliases) {
      const idx = header.indexOf(alias);
      if (idx >= 0) return idx;
    }
    return -1;
  }

  const si = findCol(colMap.studentId);
  const ni = findCol(colMap.name);
  if (si < 0 || ni < 0) return [];

  const ci = findCol(colMap.college);
  const cli = findCol(colMap.className);

  const students = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const studentId = String(row[si] || '').trim();
    const name = String(row[ni] || '').trim();
    if (!studentId || !name) continue;
    students.push({
      studentId,
      name,
      college: ci >= 0 ? String(row[ci] || '').trim() : '',
      className: cli >= 0 ? String(row[cli] || '').trim() : '',
    });
  }
  return students;
}

router.post('/admin/import', requireAdmin, (req, res, next) => {
  importUpload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.message || '文件上传失败';
      return res.status(400).json({ ok: false, msg });
    }
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ ok: false, msg: '没有收到文件（字段名应为 file）' });
      }

      const roster = parseRosterFile(file.buffer, file.originalname);
      if (roster.length === 0) {
        return res.status(400).json({ ok: false, msg: '名单为空或缺少「学号」「姓名」列' });
      }

      // 事务：清空全部旧数据 → 插入新名单
      const importTx = db.transaction(() => {
        // 清空全部学生及相关数据（比赛场景：名单一次性导入）
        db.prepare('DELETE FROM answers').run();
        db.prepare('DELETE FROM uploads').run();
        db.prepare('DELETE FROM sessions').run();
        db.prepare('DELETE FROM scores').run();
        db.prepare('DELETE FROM practical_scores').run();
        db.prepare('DELETE FROM students').run();

        const insert = db.prepare(
          'INSERT INTO students (student_id, name, college, class_name) VALUES (?, ?, ?, ?)'
        );
        let count = 0;
        for (const s of roster) {
          insert.run(s.studentId, s.name, s.college, s.className);
          count++;
        }
        return count;
      });

      const imported = importTx();
      res.json({ ok: true, imported });
    } catch (e) {
      next(e);
    }
  });
});

// ---- 新接口 ③：GET /api/admin/students —— 状态看板 ----

// 计分题号 → 满分（从 questions.js 提取，避免每次遍历）
const SCORED_POINTS = new Map(questions.filter((q) => q.scored).map((q) => [q.no, q.points]));
const MAX_SCORE = [...SCORED_POINTS.values()].reduce((a, b) => a + b, 0); // 100

router.get('/admin/students', requireAdmin, (req, res, next) => {
  try {
    // 批量查学生（避免 N+1）
    const allStudents = db.prepare(
      'SELECT student_id, name, college, class_name, submitted_at FROM students ORDER BY student_id'
    ).all();

    // 批量查全部答案（只取 question_no + sub_no，不取 answer_text）
    const allAnswers = db.prepare(
      'SELECT student_id, question_no, sub_no FROM answers'
    ).all();

    // 批量查全部上传
    const allUploads = db.prepare(
      'SELECT student_id, file_type FROM uploads'
    ).all();

    // 批量查 sessions（loggedIn 判断）
    const allSessions = db.prepare(
      'SELECT student_id FROM sessions'
    ).all();

    // 批量查 scores
    const allScores = db.prepare(
      'SELECT student_id, question_no, score FROM scores'
    ).all();

    // 批量查 practical_scores
    const allPracticalScores = db.prepare(
      'SELECT student_id, dimension, score FROM practical_scores'
    ).all();

    // 构建索引
    const answerMap = new Map(); // studentId → Set of "qn:sn"
    for (const a of allAnswers) {
      const key = `${a.question_no}:${a.sub_no}`;
      if (!answerMap.has(a.student_id)) answerMap.set(a.student_id, new Set());
      answerMap.get(a.student_id).add(key);
    }

    const uploadMap = new Map(); // studentId → Set of file_type
    for (const u of allUploads) {
      if (!uploadMap.has(u.student_id)) uploadMap.set(u.student_id, new Set());
      uploadMap.get(u.student_id).add(u.file_type);
    }

    const loggedInSet = new Set(allSessions.map((s) => s.student_id));

    // studentId → { scoredCount, totalScore }
    const scoreMap = new Map();
    for (const s of allScores) {
      if (!scoreMap.has(s.student_id)) scoreMap.set(s.student_id, { scoredCount: 0, totalScore: 0 });
      const entry = scoreMap.get(s.student_id);
      entry.scoredCount++;
      entry.totalScore += s.score;
    }

    // studentId → practicalTotalScore（未评时 undefined）
    const practicalMap = new Map();
    for (const ps of allPracticalScores) {
      if (!practicalMap.has(ps.student_id)) practicalMap.set(ps.student_id, 0);
      practicalMap.set(ps.student_id, practicalMap.get(ps.student_id) + ps.score);
    }

    const students = allStudents.map((s) => {
      const ansSet = answerMap.get(s.student_id) || new Set();
      const upSet = uploadMap.get(s.student_id) || new Set();
      const sc = scoreMap.get(s.student_id);

      // answeredQuestions: 已填写的题号（去重）
      const answeredQuestionsSet = new Set();
      for (const k of ansSet) {
        answeredQuestionsSet.add(Number(k.split(':')[0]));
      }

      // answered: 小问粒度 [{questionNo, subNo}]
      const answered = [];
      for (const k of ansSet) {
        const [qn, sn] = k.split(':').map(Number);
        answered.push({ questionNo: qn, subNo: sn });
      }

      return {
        studentId: s.student_id,
        name: s.name,
        college: s.college,
        className: s.class_name,
        answered,
        total: ansSet.size,
        submitted: !!s.submitted_at,
        loggedIn: loggedInSet.has(s.student_id),
        scoredCount: sc ? sc.scoredCount : 0,
        score: sc ? sc.totalScore : null,
        maxScore: MAX_SCORE,
        practicalScore: practicalMap.has(s.student_id) ? practicalMap.get(s.student_id) : null,
        practicalMax: PRACTICAL_MAX,
        answeredQuestions: [...answeredQuestionsSet].sort((a, b) => a - b),
        xlsx: upSet.has('xlsx'),
        zip: upSet.has('zip'),
      };
    });

    res.json({ ok: true, students });
  } catch (e) {
    next(e);
  }
});

// ---- 新接口 ④：GET /api/admin/student/:id —— 单学生详细答卷（批卷页用）----

router.get('/admin/student/:id', requireAdmin, (req, res, next) => {
  try {
    const studentId = req.params.id;
    const student = db.prepare(
      'SELECT student_id, name, college, class_name, submitted_at FROM students WHERE student_id = ?'
    ).get(studentId);

    if (!student) {
      return res.status(404).json({ ok: false, msg: '学生不存在' });
    }

    if (!student.submitted_at) {
      return res.status(400).json({ ok: false, msg: '该学生尚未交卷，无法查看答卷' });
    }

    // loggedIn：sessions 表里是否有该学生的记录
    const session = db.prepare(
      'SELECT 1 FROM sessions WHERE student_id = ? LIMIT 1'
    ).get(studentId);
    const loggedIn = !!session;

    const answers = db.prepare(
      'SELECT question_no, sub_no, answer_text, updated_at FROM answers WHERE student_id = ? ORDER BY question_no, sub_no'
    ).all(studentId);

    const scores = db.prepare(
      'SELECT question_no, score FROM scores WHERE student_id = ?'
    ).all(studentId);

    const practicalScores = db.prepare(
      'SELECT dimension, score FROM practical_scores WHERE student_id = ?'
    ).all(studentId);

    const uploads = db.prepare(
      'SELECT id, file_type, file_path, uploaded_at FROM uploads WHERE student_id = ?'
    ).all(studentId);

    res.json({
      ok: true,
      student: {
        studentId: student.student_id,
        name: student.name,
        college: student.college,
        className: student.class_name,
        submittedAt: student.submitted_at,
        loggedIn,
      },
      answers: answers.map((a) => ({
        questionNo: a.question_no,
        subNo: a.sub_no,
        answerText: a.answer_text,
        updatedAt: a.updated_at,
      })),
      scores: scores.map((s) => ({
        questionNo: s.question_no,
        score: s.score,
      })),
      practicalScores: practicalScores.map((ps) => ({
        dimension: ps.dimension,
        score: ps.score,
      })),
      uploads: uploads.map((u) => ({
        id: u.id,
        type: u.file_type,
        path: u.file_path,
        at: u.uploaded_at,
      })),
    });
  } catch (e) {
    next(e);
  }
});

// ---- 新接口 ⑤：POST /api/admin/student —— 添加单个学生 ----

router.post('/admin/student', requireAdmin, (req, res, next) => {
  try {
    const { studentId, name, college, class: className } = req.body || {};
    if (!studentId || !name) {
      return res.status(400).json({ ok: false, msg: '学号和姓名必填' });
    }
    const existing = db.prepare('SELECT 1 FROM students WHERE student_id = ?').get(studentId);
    if (existing) {
      return res.status(400).json({ ok: false, msg: '该学号已存在' });
    }
    db.prepare('INSERT INTO students (student_id, name, college, class_name) VALUES (?, ?, ?, ?)').run(studentId, name, college || null, className || null);
    res.json({ ok: true, student: { studentId, name, college: college || null, class: className || null } });
  } catch (e) {
    next(e);
  }
});

// ---- 新接口 ⑥：GET /api/admin/practical-dimensions —— 实践题评分维度定义 ----

router.get('/admin/practical-dimensions', requireAdmin, (req, res) => {
  res.json({ ok: true, dimensions: PRACTICAL_DIMENSIONS });
});

// ---- 新接口 ⑦：POST /api/admin/practical-score —— 保存实践题某维度得分 ----

const upsertPracticalScore = db.prepare(`
  INSERT INTO practical_scores (student_id, dimension, score, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(student_id, dimension) DO UPDATE SET
    score = excluded.score,
    updated_at = excluded.updated_at
`);

router.post('/admin/practical-score', requireAdmin, (req, res, next) => {
  try {
    const { studentId, dimension, score } = req.body || {};

    if (!studentId || !dimension) {
      return res.status(400).json({ ok: false, msg: '缺少 studentId 或 dimension' });
    }

    const maxPoints = DIMENSION_MAP.get(dimension);
    if (maxPoints === undefined) {
      return res.status(400).json({ ok: false, msg: `非法维度: ${dimension}` });
    }

    if (!Number.isInteger(score) || score < 0 || score > maxPoints) {
      return res.status(400).json({ ok: false, msg: `score 必须为 0–${maxPoints} 的整数` });
    }

    const student = db.prepare('SELECT 1 FROM students WHERE student_id = ?').get(studentId);
    if (!student) {
      return res.status(400).json({ ok: false, msg: '学生不存在' });
    }

    upsertPracticalScore.run(studentId, dimension, score, new Date().toISOString());

    const row = db.prepare('SELECT SUM(score) AS total FROM practical_scores WHERE student_id = ?').get(studentId);
    const practicalTotal = row.total || 0;

    res.json({ ok: true, dimension, score, practicalTotal, practicalMax: PRACTICAL_MAX });
  } catch (e) {
    next(e);
  }
});

// ---- 新接口 ⑧：POST /api/admin/score —— 保存某学生某题得分 ----

const upsertScore = db.prepare(`
  INSERT INTO scores (student_id, question_no, score, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(student_id, question_no) DO UPDATE SET
    score = excluded.score,
    updated_at = excluded.updated_at
`);

router.post('/admin/score', requireAdmin, (req, res, next) => {
  try {
    const { studentId, questionNo, score } = req.body || {};

    if (!studentId || !Number.isInteger(questionNo)) {
      return res.status(400).json({ ok: false, msg: '缺少 studentId 或 questionNo' });
    }

    // 题目必须存在且计分
    const maxPoints = SCORED_POINTS.get(questionNo);
    if (maxPoints === undefined) {
      return res.status(400).json({ ok: false, msg: `第 ${questionNo} 题不存在或不计分` });
    }

    // score 必须是 0…满分 的整数
    if (!Number.isInteger(score) || score < 0 || score > maxPoints) {
      return res.status(400).json({ ok: false, msg: `score 必须为 0–${maxPoints} 的整数` });
    }

    // 学生必须存在
    const student = db.prepare('SELECT 1 FROM students WHERE student_id = ?').get(studentId);
    if (!student) {
      return res.status(400).json({ ok: false, msg: '学生不存在' });
    }

    upsertScore.run(studentId, questionNo, score, new Date().toISOString());

    // 返回该学生最新总分
    const row = db.prepare('SELECT SUM(score) AS total FROM scores WHERE student_id = ?').get(studentId);
    const total = row.total || 0;

    res.json({ ok: true, questionNo, score, total, maxScore: MAX_SCORE });
  } catch (e) {
    next(e);
  }
});

// ---- 新接口 ⑥：GET /api/admin/export —— 导出 CSV ----

function csvEscape(field) {
  const s = String(field == null ? '' : field);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    // 在 CSV 引号字段内，换行保留但需确保被引号包裹；
    // Excel 要求 \r\n，这里统一为 \r\n
    const escaped = s.replace(/"/g, '""').replace(/\r?\n/g, '\r\n');
    return '"' + escaped + '"';
  }
  return s;
}

router.get('/admin/export', requireAdmin, (req, res, next) => {
  try {
    const allStudents = db.prepare(
      'SELECT student_id, name, college, class_name, submitted_at FROM students ORDER BY student_id'
    ).all();

    // 批量查全部答案
    const allAnswers = db.prepare(
      'SELECT student_id, question_no, sub_no, answer_text FROM answers ORDER BY student_id, question_no, sub_no'
    ).all();

    // 批量查全部上传
    const allUploads = db.prepare(
      'SELECT student_id, file_type FROM uploads'
    ).all();

    // 批量查全部分数
    const allScores = db.prepare(
      'SELECT student_id, question_no, score FROM scores'
    ).all();

    // 批量查全部实践题分数
    const allPracticalScores = db.prepare(
      'SELECT student_id, dimension, score FROM practical_scores'
    ).all();

    // 构建答案索引：studentId → questionNo → [answerText per subNo]
    const answerMap = new Map();
    for (const a of allAnswers) {
      if (!answerMap.has(a.student_id)) answerMap.set(a.student_id, new Map());
      const qMap = answerMap.get(a.student_id);
      if (!qMap.has(a.question_no)) qMap.set(a.question_no, []);
      qMap.get(a.question_no).push(a.answer_text || '');
    }

    // 构建上传索引
    const uploadMap = new Map();
    for (const u of allUploads) {
      if (!uploadMap.has(u.student_id)) uploadMap.set(u.student_id, new Set());
      uploadMap.get(u.student_id).add(u.file_type);
    }

    // 构建分数索引：studentId → questionNo → score
    const scoreMap = new Map();
    for (const s of allScores) {
      if (!scoreMap.has(s.student_id)) scoreMap.set(s.student_id, new Map());
      scoreMap.get(s.student_id).set(s.question_no, s.score);
    }

    // 构建实践题分数索引：studentId → dimension → score
    const practicalMap = new Map();
    for (const ps of allPracticalScores) {
      if (!practicalMap.has(ps.student_id)) practicalMap.set(ps.student_id, new Map());
      practicalMap.get(ps.student_id).set(ps.dimension, ps.score);
    }

    // CSV 表头：元信息列 + 各题答案列 + 各计分题得分列 + 总分 + 上传状态
    const header = ['学号', '姓名', '学院', '班级', '是否交卷'];
    for (const q of questions) {
      header.push(`Q${q.no}`);
    }
    // 各计分题得分列（列数固定，不计分题不加列）
    const scoredQuestions = questions.filter((q) => q.scored);
    for (const q of scoredQuestions) {
      header.push(`Q${q.no}得分`);
    }
    header.push('总分');
    // 实践题五维度得分列 + 实践题总分
    for (const d of PRACTICAL_DIMENSIONS) {
      header.push(d.label);
    }
    header.push('实践题总分');
    header.push('上传状态');

    const lines = [header.map(csvEscape).join(',')];

    for (const s of allStudents) {
      const qMap = answerMap.get(s.student_id) || new Map();
      const upSet = uploadMap.get(s.student_id) || new Set();
      const scMap = scoreMap.get(s.student_id) || new Map();

      const row = [
        s.student_id,
        s.name,
        s.college || '',
        s.class_name || '',
        s.submitted_at ? '是' : '否',
      ];

      // 每题一列：带小问的题把各小问用 ①②③ 前缀拼在一格，换行分隔
      for (const q of questions) {
        const subAnswers = qMap.get(q.no);
        if (!subAnswers || subAnswers.length === 0) {
          row.push('');
          continue;
        }
        if (subAnswers.length === 1 && (!q.subs || q.subs.length === 0)) {
          // 无小问的题，直接输出答案
          row.push(subAnswers[0]);
        } else {
          // 带小问的题：①xxx\n②xxx\n③xxx
          const markers = ['①', '②', '③', '④', '⑤'];
          const parts = subAnswers.map((txt, i) => `${markers[i] || (i + 1) + '.'}${txt}`);
          row.push(parts.join('\n'));
        }
      }

      // 各计分题得分列
      let totalScore = 0;
      let hasAnyScore = false;
      for (const q of scoredQuestions) {
        const sc = scMap.get(q.no);
        if (sc !== undefined) {
          row.push(String(sc));
          totalScore += sc;
          hasAnyScore = true;
        } else {
          row.push('');
        }
      }
      // 总分：未评任何题时为空
      row.push(hasAnyScore ? String(totalScore) : '');

      // 实践题五维度得分列
      const psMap = practicalMap.get(s.student_id) || new Map();
      let practicalTotal = 0;
      let hasAnyPractical = false;
      for (const d of PRACTICAL_DIMENSIONS) {
        const ps = psMap.get(d.key);
        if (ps !== undefined) {
          row.push(String(ps));
          practicalTotal += ps;
          hasAnyPractical = true;
        } else {
          row.push('');
        }
      }
      row.push(hasAnyPractical ? String(practicalTotal) : '');

      // 上传状态
      const uploadStatus = [];
      if (upSet.has('xlsx')) uploadStatus.push('xlsx');
      if (upSet.has('zip')) uploadStatus.push('zip');
      row.push(uploadStatus.join('+') || '无');

      lines.push(row.map(csvEscape).join(','));
    }

    const csv = lines.join('\r\n');
    const bom = '\uFEFF'; // Excel 打开中文不乱码
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="quiz-export.csv"');
    res.send(bom + csv);
  } catch (e) {
    next(e);
  }
});

// ---- 新接口 ⑦：GET /api/admin/upload/:uploadId/preview —— 预览学生上传文件 ----

const uploadsDir = path.join(__dirname, '..', 'uploads');
const MAX_ROWS = 1000;

// 预编译：按 upload id 查记录
const selectUploadById = db.prepare('SELECT id, student_id, file_type, file_path FROM uploads WHERE id = ?');

router.get('/admin/upload/:uploadId/preview', requireAdmin, (req, res, next) => {
  try {
    const uploadId = Number(req.params.uploadId);
    if (!Number.isInteger(uploadId) || uploadId <= 0) {
      return res.status(400).json({ ok: false, msg: 'uploadId 不合法' });
    }

    const upload = selectUploadById.get(uploadId);
    if (!upload) {
      return res.status(404).json({ ok: false, msg: '上传记录不存在' });
    }

    // 拼绝对路径并校验不越界
    const absPath = path.resolve(uploadsDir, upload.file_path);
    if (!absPath.startsWith(uploadsDir + path.sep) && absPath !== uploadsDir) {
      return res.status(400).json({ ok: false, msg: '文件路径越界' });
    }

    // 文件必须存在
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ ok: false, msg: '文件不存在' });
    }

    const fileType = upload.file_type;

    if (fileType === 'xlsx') {
      try {
        // 检查 xlsx 魔术字节（xlsx 是 ZIP 格式，必须以 PK 开头）
        const fd = fs.openSync(absPath, 'r');
        const magic = Buffer.alloc(2);
        fs.readSync(fd, magic, 0, 2, 0);
        fs.closeSync(fd);
        if (magic[0] !== 0x50 || magic[1] !== 0x4b) {
          return res.status(400).json({ ok: false, msg: '无法解析该文件' });
        }

        const wb = XLSX.readFile(absPath, { type: 'file' });
        if (wb.SheetNames.length === 0) {
          return res.status(400).json({ ok: false, msg: '无法解析该文件' });
        }
        const sheets = wb.SheetNames.map((name) => {
          const sheet = wb.Sheets[name];
          const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          const totalRows = allRows.length;
          const truncated = totalRows > MAX_ROWS;
          const rows = truncated ? allRows.slice(0, MAX_ROWS) : allRows;
          // totalCols = 最大列数
          let totalCols = 0;
          for (const row of rows) {
            if (row.length > totalCols) totalCols = row.length;
          }
          return { name, rows, totalRows, totalCols, truncated };
        });
        return res.json({ ok: true, type: 'xlsx', fileName: path.basename(absPath), sheets });
      } catch (e) {
        return res.status(400).json({ ok: false, msg: '无法解析该文件' });
      }
    }

    if (fileType === 'zip') {
      try {
        const zip = new AdmZip(absPath);
        const entries = zip.getEntries();
        const files = entries.map((entry) => ({
          name: entry.entryName,
          size: entry.header.size,
        }));
        return res.json({ ok: true, type: 'zip', fileName: path.basename(absPath), files });
      } catch (e) {
        return res.status(400).json({ ok: false, msg: '无法解析该文件' });
      }
    }

    return res.status(400).json({ ok: false, msg: '不支持的文件类型' });
  } catch (e) {
    next(e);
  }
});

// ---- 错误兜底 ----

router.use((err, req, res, _next) => {
  console.error('[admin] 未预期的错误:', err);
  res.status(500).json({ ok: false, msg: '服务器内部错误' });
});

module.exports = router;