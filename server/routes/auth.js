'use strict';

// 登录路由（任务 02）。契约见 docs/contracts/api.md 的 POST /api/login。

const crypto = require('crypto');
const express = require('express');
const { db } = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// 学号 + 姓名 命中名单
const findStudent = db.prepare(
  'SELECT student_id, name, college, class_name FROM students WHERE student_id = ? AND name = ?'
);
const insertSession = db.prepare(
  'INSERT INTO sessions (token, student_id, created_at) VALUES (?, ?, ?)'
);

const BAD_CREDENTIALS = { ok: false, msg: '学号或姓名不对' };

// POST /api/login —— 登录
router.post('/login', (req, res) => {
  const body = req.body || {};
  const studentId = typeof body.studentId === 'string' ? body.studentId.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!studentId || !name) return res.status(400).json(BAD_CREDENTIALS);

  const student = findStudent.get(studentId, name);
  if (!student) return res.status(401).json(BAD_CREDENTIALS);

  const token = crypto.randomUUID();
  insertSession.run(token, student.student_id, new Date().toISOString());

  res.json({
    ok: true,
    token,
    student: {
      studentId: student.student_id,
      name: student.name,
      college: student.college,
      class: student.class_name,
    },
  });
});

// GET /api/me —— 用 token 换当前学生信息（受保护）
// 不是 api.md 里的业务接口，作用是：给前端刷新页面后校验 token、也给本任务验收「带 token → 通过」用。
router.get('/me', requireAuth, (req, res) => {
  const student = db
    .prepare('SELECT student_id, name, college, class_name, submitted_at FROM students WHERE student_id = ?')
    .get(req.student.student_id);

  res.json({
    ok: true,
    student: student
      ? {
          studentId: student.student_id,
          name: student.name,
          college: student.college,
          class: student.class_name,
          submittedAt: student.submitted_at ?? null,
        }
      : { studentId: req.student.student_id, name: req.student.name, college: null, class: null, submittedAt: null },
  });
});

module.exports = router;
