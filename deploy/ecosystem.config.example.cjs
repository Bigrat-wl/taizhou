// ============================================================
// PM2 配置示例
//
// 使用方法：
//   1. 复制为 ecosystem.config.cjs（注意去掉 .example）
//   2. 把 '<在这里填>' 替换为你的真实 ADMIN_KEY
//   3. ecosystem.config.cjs 包含密钥，已加入 .gitignore，不入库
// ============================================================

module.exports = {
  apps: [
    {
      name: 'quiz-server',
      script: 'server/server.js',
      cwd: __dirname + '/..',
      env: {
        ADMIN_KEY: '<在这里填>',
        PORT: 3000,
      },
    },
  ],
};