'use strict';

// 任务 04 · 实践题上传（独占文件，03/05 不碰）
// 接口契约：docs/contracts/api.md
//   POST /api/upload      multipart/form-data，字段 file（文件）、type（xlsx | zip）
//                         → { ok:true, file:'uploads/<学号>/<文件名>' }
//   GET  /api/my-uploads  → { ok:true, uploads:[ { type, path, at } ] }
// 落盘/表结构契约：docs/contracts/database.md（uploads 表；file_path 相对 uploads/）
// 模块与并行：本文件 module.exports = express.Router()，由 server.js 挂到 /api 前缀。
//
// 方案（见 docs/tasks/04-上传.md）：multer 收文件 → 存 uploads/<学号>/ → 重命名 <学号>_<type>.<扩展名>
// → 覆盖旧文件并更新 uploads 表（同一人同类型只留一条记录，交最终产物，不做版本管理）。

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { db } = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// 上传根目录：server/uploads/（.gitignore 已忽略；跟启动时的工作目录无关）
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// 大小上限：实践题成果（xlsx/zip），50MB 足够
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// 契约里的两种类型：xlsx 必交、zip（网页）选交
const FILE_TYPES = {
  xlsx: '.xlsx',
  zip: '.zip',
};

/** 上传目录里的子目录名：学号由 token 解析而来，仍做一次文件名净化，避免路径穿越 */
function safeSegment(value) {
  const cleaned = String(value).replace(/[^\w.-]/g, '_');
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? 'unknown' : cleaned;
}

// 磁盘存储：先落到学号目录下的临时名（此时 multipart 的 type 字段未必解析完），
// 校验通过后在 handler 里改成最终名 <学号>_<type><扩展名>；rename 天然覆盖旧文件。
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(UPLOAD_DIR, safeSegment(req.student.student_id));
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `.incoming-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

// 类型限制：以扩展名为硬判据（浏览器/系统给出的 MIME 不稳定），
// 请求头里的 MIME 只作为辅助信号：明确属于别家类型（text/*、image/* 等）直接拒。
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const extOk = Object.values(FILE_TYPES).includes(ext);
  if (!extOk) {
    return cb(new UploadTypeError('只支持 .xlsx 或 .zip 文件'));
  }
  const mime = String(file.mimetype || '').toLowerCase();
  const mimeOk =
    mime === '' ||
    mime === 'application/octet-stream' || // 部分浏览器/系统给的兜底类型
    mime === 'application/zip' ||
    mime === 'application/x-zip-compressed' ||
    mime === 'multipart/x-zip' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel';
  if (!mimeOk) {
    return cb(new UploadTypeError('只支持 .xlsx 或 .zip 文件'));
  }
  cb(null, true);
}

/** 文件类型被拒时用的错误类型（跟 multer 自身的错误区分开） */
class UploadTypeError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'UploadTypeError';
    this.code = 'INVALID_FILE_TYPE';
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 10 },
});

// ---- 数据库：同一学生同一类型只保留一条记录（覆盖式） ----

const findUpload = db.prepare(
  'SELECT id FROM uploads WHERE student_id = ? AND file_type = ? ORDER BY id LIMIT 1'
);
const insertUpload = db.prepare(
  'INSERT INTO uploads (student_id, file_type, file_path, uploaded_at) VALUES (?, ?, ?, ?)'
);
const updateUpload = db.prepare('UPDATE uploads SET file_path = ?, uploaded_at = ? WHERE id = ?');
const deleteOtherUploads = db.prepare(
  'DELETE FROM uploads WHERE student_id = ? AND file_type = ? AND id <> ?'
);
const listUploads = db.prepare(
  'SELECT file_type, file_path, uploaded_at FROM uploads WHERE student_id = ? ORDER BY file_type'
);

// 命中已有记录 → 更新 file_path/uploaded_at；没有 → 插入；顺手清掉历史重复行（保证"只留一条"）
const saveUploadRecord = db.transaction((studentId, fileType, relPath) => {
  const now = new Date().toISOString();
  const existing = findUpload.get(studentId, fileType);
  if (existing) {
    updateUpload.run(relPath, now, existing.id);
    deleteOtherUploads.run(studentId, fileType, existing.id);
    return now;
  }
  insertUpload.run(studentId, fileType, relPath, now);
  return now;
});

/** 删掉本次请求落下的临时文件（失败路径用，删不掉也不影响响应） */
function removeQuietly(filePath) {
  if (!filePath) return;
  fs.promises.unlink(filePath).catch(() => {});
}

// ---- POST /api/upload ----

router.post(
  '/upload',
  requireAuth,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => (err ? next(err) : next()));
  },
  (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ ok: false, msg: '没有收到文件（字段名应为 file）' });
    }

    const declaredType = String(req.body.type || '')
      .trim()
      .toLowerCase();

    if (!Object.prototype.hasOwnProperty.call(FILE_TYPES, declaredType)) {
      removeQuietly(file.path);
      return res.status(400).json({ ok: false, msg: 'type 只能是 xlsx 或 zip' });
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== FILE_TYPES[declaredType]) {
      removeQuietly(file.path);
      return res
        .status(400)
        .json({ ok: false, msg: `type=${declaredType} 与文件扩展名 ${ext || '(无)'} 不一致` });
    }

    const studentId = req.student.student_id;
    const finalName = `${safeSegment(studentId)}_${declaredType}${ext}`;
    const dir = path.join(UPLOAD_DIR, safeSegment(studentId));
    // file_path 存"相对 uploads/"的路径（docs/contracts/database.md）；接口返回时补上 uploads/ 前缀
    const relPath = `${safeSegment(studentId)}/${finalName}`;

    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.renameSync(file.path, path.join(dir, finalName)); // 同名 → 覆盖旧文件
      saveUploadRecord(studentId, declaredType, relPath);
    } catch (err) {
      removeQuietly(file.path);
      console.error('[upload] 保存失败:', err);
      return res.status(500).json({ ok: false, msg: '上传失败，请重试' });
    }

    return res.json({ ok: true, file: `uploads/${relPath}` });
  }
);

// ---- GET /api/my-uploads ----

router.get('/my-uploads', requireAuth, (req, res) => {
  const rows = listUploads.all(req.student.student_id);
  res.json({
    ok: true,
    uploads: rows.map((row) => ({
      type: row.file_type,
      path: `uploads/${row.file_path}`,
      at: row.uploaded_at,
    })),
  });
});

// ---- 错误兜底：multer / 类型校验的失败都按契约返回 JSON ----

router.use((err, req, res, _next) => {
  if (err instanceof UploadTypeError || err.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ ok: false, msg: err.message });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res
        .status(400)
        .json({ ok: false, msg: `文件太大，单个文件不能超过 ${MAX_FILE_SIZE / 1024 / 1024} MB` });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ ok: false, msg: '文件字段名应为 file（一次只能传一个）' });
    }
    return res.status(400).json({ ok: false, msg: '上传的文件不合法' });
  }
  // 其他意外错误（磁盘/权限等）：契约要求接口一律回 JSON，别把 Express 的 HTML 错误页透出去
  console.error('[upload] 未预期的错误:', err);
  return res.status(500).json({ ok: false, msg: '上传失败，请重试' });
});

module.exports = router;
