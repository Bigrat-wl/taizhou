'use strict';

// Express 入口（纯 JS）：只做接线（app.use 各路由）+ listen，不写业务逻辑。
// 业务接口按 docs/contracts/api.md，模块归属见 docs/contracts/模块与并行.md。

const express = require('express');
const { db, dbPath, listTables } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// 骨架自检接口：返回 JSON（契约格式 { ok: true, ... }），内容为「你好」
app.get('/api/hello', (req, res) => {
  res.json({ ok: true, msg: '你好' });
});

// 业务路由（统一 /api 前缀）
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/upload'));
app.use('/api', require('./routes/questions'));
app.use('/api', require('./routes/exam'));
app.use('/api', require('./routes/admin'));
app.use('/api', require('./routes/materials'));

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] db: ${dbPath}`);
  console.log(`[server] tables: ${listTables().join(', ')}`);
});

// 进程退出时关掉数据库连接
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
