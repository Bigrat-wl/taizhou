'use strict';

// 学生 token 校验中间件（共享模块，契约见 docs/contracts/模块与并行.md）
// 03/04/05 的受保护接口统一用它：router.xxx('/path', requireAuth, handler)
//
// 行为：
//   1. 读 req.headers.authorization，取 'Bearer <token>' 里的 token
//   2. 查 sessions 表，命中则挂 req.student = { student_id, name }
//   3. 命中 → next()；缺 token / 查不到 → 401 { ok:false, msg:'未登录' }
//
// 注意：req.student.student_id 是取身份的唯一字段，不许改名。

const { db } = require('../db');

const UNAUTHORIZED = { ok: false, msg: '未登录' };

/** 从 Authorization 头里取 Bearer token，取不到返回 null */
function getBearerToken(header) {
  if (typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

// 预编译一次，避免每个请求都重新 prepare
const findSession = db.prepare(
  `SELECT s.student_id AS student_id, st.name AS name
     FROM sessions s
     JOIN students st ON st.student_id = s.student_id
    WHERE s.token = ?`
);

function requireAuth(req, res, next) {
  const token = getBearerToken(req.headers.authorization);
  if (!token) return res.status(401).json(UNAUTHORIZED);

  const session = findSession.get(token);
  if (!session) return res.status(401).json(UNAUTHORIZED);

  req.student = { student_id: session.student_id, name: session.name };
  next();
}

module.exports = requireAuth;
