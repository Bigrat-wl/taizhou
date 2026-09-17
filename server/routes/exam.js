'use strict';

// 开赛状态（任务 11 新增）
//   GET /api/exam-status —— 学生端查开赛时间/是否已开赛
// 契约见 docs/contracts/api.md；settings 表见 docs/contracts/database.md。
// 挂载在 server.js：app.use('/api', require('./routes/exam'))
//
// 另外把 getExamStatus / isExamStarted 挂在 router 导出上，供 routes/questions.js 的
// 403 闸门复用（同一份「未设置视为已开赛」的判断，不重复实现；若以后判断变复杂，
// 再抽独立模块也不迟）。

const express = require('express');
const { db } = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// settings 表里存开赛时间的键名（契约固定为 exam_start_at）
const EXAM_START_KEY = 'exam_start_at';

const selectSetting = db.prepare('SELECT value FROM settings WHERE key = ?');

/**
 * 开赛状态。
 *   - 未设置（或空值）→ started: true（契约：开发/测试时视为已开赛）
 *   - 值不是合法时间 → 也按已开赛处理，并在服务端日志里告警
 *     （写入侧 routes/admin.js 会校验格式，这里只是兜住手改库的情况）
 */
function getExamStatus() {
  const row = selectSetting.get(EXAM_START_KEY);
  const examStartAt = row && row.value ? String(row.value) : null;
  const serverNow = new Date().toISOString();

  if (!examStartAt) {
    return { examStartAt: null, started: true, serverNow };
  }

  const startMs = Date.parse(examStartAt);
  if (Number.isNaN(startMs)) {
    console.warn(`[exam] settings.${EXAM_START_KEY} 不是合法时间：${examStartAt}，按「已开赛」处理`);
    return { examStartAt, started: true, serverNow };
  }

  return { examStartAt, started: Date.now() >= startMs, serverNow };
}

/** 闸门：到点（或未设置）才放行答题、交卷 */
function isExamStarted() {
  return getExamStatus().started;
}

// GET /api/exam-status —— 学生端看开赛状态（serverNow 用于前端算倒计时偏差）
router.get('/exam-status', requireAuth, (req, res) => {
  res.json({ ok: true, ...getExamStatus() });
});

module.exports = router;
module.exports.getExamStatus = getExamStatus;
module.exports.isExamStarted = isExamStarted;
