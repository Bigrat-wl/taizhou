'use strict';

// 参赛材料下载（任务 16）：
//   GET /api/materials/contestant-package —— 公开、固定文件、无路径参数
// 契约见 docs/contracts/api.md。文件由主办方手动拷入 server/materials/。
// 挂载在 server.js：app.use('/api', require('./routes/materials'))

const path = require('path');
const fs = require('fs');
const express = require('express');

const router = express.Router();

// 固定文件：不接受任何路径参数，杜绝穿越
const PACKAGE_PATH = path.join(__dirname, '..', 'materials', 'ITLab-参与包.zip');
// 下载时展示给学生的友好文件名
const DOWNLOAD_NAME = 'ITLab-参赛包.zip';

router.get('/materials/contestant-package', (req, res) => {
  if (!fs.existsSync(PACKAGE_PATH)) {
    return res.status(404).json({
      ok: false,
      msg: '参赛材料暂不可用，请联系组织方（服务器上未找到材料文件）',
    });
  }
  // dotfiles:'allow' —— send 默认拒绝路径中带「.」的目录（部署在隐藏目录下会 404）；
  // 本接口只服务上述固定文件，无穿越风险。
  res.download(PACKAGE_PATH, DOWNLOAD_NAME, { dotfiles: 'allow' }, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ ok: false, msg: '参赛材料下载失败' });
    }
  });
});

module.exports = router;
