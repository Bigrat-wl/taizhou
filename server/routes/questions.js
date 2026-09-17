'use strict';

// 问卷路由（任务 03；任务 11 改为「按小问存」+ 开赛闸门）：
//   GET  /api/questions   拉题（含 subs 小问结构）
//   POST /api/answer      保存一个小问（自动保存，覆盖写；未开赛 403）
//   GET  /api/my-progress 我的填写进度（小问粒度）
// 契约见 docs/contracts/api.md；题目数据见 ../questions.js；answers 表见 docs/contracts/database.md。
// 挂载在 server.js：app.use('/api', require('./routes/questions'))

const express = require('express');
const { db } = require('../db');
const requireAuth = require('../middleware/auth');
const questions = require('../questions');
// 开赛状态与闸门放在 routes/exam.js 里，避免两处各写一份判断（「未设置视为已开赛」）
const { isExamStarted } = require('./exam');

const router = express.Router();

// 题号 → 小问数组（无小问的题记为空数组），用来校验 subNo
const SUBS_BY_NO = new Map(questions.map((q) => [q.no, q.subs || []]));
const QUESTION_NOS = new Set(SUBS_BY_NO.keys());

// 全卷小问总数：无小问的题算 1（契约：my-progress 的 total）
const TOTAL_SUBS = questions.reduce((n, q) => n + (q.subs && q.subs.length ? q.subs.length : 1), 0);

// 单条答案长度上限：正常作答（最长的是第 24 题）远小于此，只防手滑贴一整篇进来
const MAX_ANSWER_LENGTH = 20000;

const INVALID_NO = { ok: false, msg: '题号不存在' };
const NOT_STARTED = { ok: false, msg: '尚未开赛' };

// 交卷：幂等，重复提交只更新时间
const updateSubmittedAt = db.prepare(
  'UPDATE students SET submitted_at = ? WHERE student_id = ?'
);

// ── 预编译 SQL ────────────────────────────────────────────────────────
// 同一人同一题同一小问只留最新一条，由 answers 主键 (student_id, question_no, sub_no) 保证
const upsertAnswer = db.prepare(`
  INSERT INTO answers (student_id, question_no, sub_no, answer_text, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(student_id, question_no, sub_no) DO UPDATE SET
    answer_text = excluded.answer_text,
    updated_at  = excluded.updated_at
`);
const deleteAnswer = db.prepare(
  'DELETE FROM answers WHERE student_id = ? AND question_no = ? AND sub_no = ?'
);
const selectAnswered = db.prepare(
  'SELECT question_no, sub_no, answer_text FROM answers WHERE student_id = ? ORDER BY question_no, sub_no'
);
const selectSubmittedAt = db.prepare('SELECT submitted_at FROM students WHERE student_id = ?');

/**
 * 校验并归一化 subNo：
 *   - 无小问的题：只接受 0（不传也按 0）
 *   - 有小问的题：必须落在 1…subs.length（不传不给默认值，免得把答案悄悄写进第 1 个小问）
 * 返回 { subNo } 或 { error }
 */
function normalizeSubNo(questionNo, rawSubNo) {
  const subs = SUBS_BY_NO.get(questionNo) || [];
  if (rawSubNo === undefined || rawSubNo === null || rawSubNo === '') {
    if (subs.length > 0) {
      return { error: `第 ${questionNo} 题有 ${subs.length} 个小问，请带 subNo（1–${subs.length}）` };
    }
    return { subNo: 0 };
  }

  const subNo = Number(rawSubNo);
  if (!Number.isInteger(subNo) || subNo < 0) {
    return { error: '小问号不对' };
  }
  if (subs.length === 0) {
    return subNo === 0 ? { subNo: 0 } : { error: `第 ${questionNo} 题没有小问，subNo 应为 0` };
  }
  if (subNo < 1 || subNo > subs.length) {
    return { error: `第 ${questionNo} 题只有 ${subs.length} 个小问，subNo 应为 1–${subs.length}` };
  }
  return { subNo };
}

// GET /api/questions —— 拉取 24 题
// 公开接口（题面不是敏感信息，任务书也只要求 answer / my-progress 走 requireAuth）
router.get('/questions', (req, res) => {
  res.json({ ok: true, questions });
});

// POST /api/answer —— 保存一个小问（自动保存，覆盖写）
router.post('/answer', requireAuth, (req, res) => {
  // 闸门先判：未开赛一律 403，不进入参数校验
  if (!isExamStarted()) return res.status(403).json(NOT_STARTED);

  const body = req.body || {};
  const questionNo = Number(body.questionNo);
  const raw = body.answerText;

  if (!Number.isInteger(questionNo) || !QUESTION_NOS.has(questionNo)) {
    return res.status(400).json(INVALID_NO);
  }
  if (raw !== undefined && raw !== null && typeof raw !== 'string') {
    return res.status(400).json({ ok: false, msg: '答案格式不对' });
  }

  const { subNo, error } = normalizeSubNo(questionNo, body.subNo);
  if (error) return res.status(400).json({ ok: false, msg: error });

  const answerText = typeof raw === 'string' ? raw.trim() : '';
  if (answerText.length > MAX_ANSWER_LENGTH) {
    return res.status(400).json({ ok: false, msg: `答案过长（上限 ${MAX_ANSWER_LENGTH} 字）` });
  }

  const studentId = req.student.student_id;

  if (answerText === '') {
    // 清空答案 = 这个小问没填：删掉这行，进度才不会把空答案算成「已填」
    deleteAnswer.run(studentId, questionNo, subNo);
    return res.json({ ok: true, saved: true });
  }

  upsertAnswer.run(studentId, questionNo, subNo, answerText, new Date().toISOString());
  res.json({ ok: true, saved: true });
});

// POST /api/submit —— 交卷（幂等，受保护，开赛闸门）
router.post('/submit', requireAuth, (req, res) => {
  if (!isExamStarted()) return res.status(403).json(NOT_STARTED);

  const submittedAt = new Date().toISOString();
  updateSubmittedAt.run(submittedAt, req.student.student_id);

  res.json({ ok: true, submittedAt });
});

// GET /api/my-progress —— 我的填写进度（小问粒度）
router.get('/my-progress', requireAuth, (req, res) => {
  const rows = selectAnswered.all(req.student.student_id);
  const answered = rows.map((row) => ({ questionNo: row.question_no, subNo: row.sub_no }));
  const submittedAt = selectSubmittedAt.get(req.student.student_id)?.submitted_at ?? null;

  res.json({
    ok: true,
    answered,
    answeredCount: answered.length,
    total: TOTAL_SUBS,
    submitted: Boolean(submittedAt),
    // answers 供前端刷新后回显（否则输入框为空）
    answers: rows.map((row) => ({
      questionNo: row.question_no,
      subNo: row.sub_no,
      answerText: row.answer_text,
    })),
  });
});

module.exports = router;
