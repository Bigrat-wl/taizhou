# 部署手册

> **阅读说明**：本手册是给用户看的——后续部署由 agent 通过 SSH 在服务器上执行命令，你对照这份手册就能看懂 agent 每一步在干什么。
>
> 占位符约定：
> - `<ADMIN_KEY>` — 你选的后台管理密码，部署前告诉 agent
> - `<域名>` — 你的域名，如 `quiz.example.com`
> - `<项目目录>` — 服务器上放代码的路径，如 `/home/ubuntu/quiz-system`

---

## 0 · 前置检查

**做什么**：确认服务器环境满足运行要求。

**检查项与通过标志**：

| 检查项 | 通过标志 | 不通过怎么办 |
|--------|---------|-------------|
| Node >= 22 | `node -v` 显示 v22.x | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo bash - && sudo apt install -y nodejs` |
| pnpm 可用 | `pnpm -v` 有版本号 | `corepack enable && corepack prepare pnpm@latest --activate` |
| 编译工具 | `python3 --version`、`make --version`、`g++ --version` 都有输出 | `sudo apt install -y python3 make g++` |
| 磁盘 >= 2GB | `df -h /` Available 列 >= 2G | 清理不用的文件或扩容 |

**为什么**：better-sqlite3 是原生 C++ 模块，缺少 python3/make/g++ 会在 `pnpm install` 时报编译失败。

---

## 1 · 拉代码

**做什么**：
```bash
cd <项目目录的上层>
git clone <仓库地址> <项目目录>
cd <项目目录>
```

**为什么**：把代码放到服务器上，后续所有操作都在这个目录里进行。

**怎么算成功**：`ls` 能看到 `server/`、`client/`、`pnpm-workspace.yaml`。

**出问题怎么办**：
- `git clone` 失败 → 检查仓库地址是否正确、服务器能否访问 Git 平台（GitHub/Gitee）。
- 权限不够 → 用 HTTPS + token 方式 clone，或配好 SSH key。

---

## 2 · 装依赖

**做什么**：
```bash
pnpm install
```

**为什么**：安装 server 和 client 两个子项目的依赖，包括 better-sqlite3 的原生编译。

**怎么算成功**：命令正常退出，`server/node_modules/better-sqlite3/build/Release/better_sqlite3.node` 文件存在。

**出问题怎么办**：
- 报 `gyp ERR!` 编译错误 → 回到步骤 0 确认 python3/make/g++ 是否装好。
- 报 `EACCES` 权限错误 → 不要用 sudo 装 npm 依赖，检查目录 owner。
- 报网络超时 → `pnpm install --registry https://registry.npmmirror.com`（切国内源）。

---

## 3 · 配密钥

**做什么**：
```bash
cp deploy/ecosystem.config.example.cjs deploy/ecosystem.config.cjs
# 然后编辑 ecosystem.config.cjs，把 '<在这里填>' 替换为你选的 ADMIN_KEY
```

**为什么**：`ADMIN_KEY` 是后台登录密码，通过 PM2 的环境变量注入，不需要改代码。

**怎么算成功**：`cat deploy/ecosystem.config.cjs` 能看到你填的值，且不是占位符。

**出问题怎么办**：
- 忘记配 → 后台接口会返回 401，学生端不受影响。

---

## 4 · 构建前端

**做什么**：
```bash
pnpm build
```

**为什么**：把 Vue 源码编译成浏览器可执行的静态文件，输出到 `client/dist/`。

**怎么算成功**：`ls client/dist/` 能看到 `index.html` 和 `assets/` 目录。

**出问题怎么办**：
- TypeScript 类型报错 → 检查 `pnpm build` 输出的具体错误行号，通常是类型不匹配。
- 内存不足 → 小服务器（1GB 内存）可能 OOM，可先 `export NODE_OPTIONS="--max-old-space-size=512"` 再试。

---

## 5 · 起服务

**做什么**：
```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup
```

**为什么**：
- 第一条用 PM2 启动后端，配置从 `ecosystem.config.cjs` 读取。
- `pm2 save` 保存当前进程列表。
- `pm2 startup` 生成开机自启脚本（会输出一条 `sudo ...` 命令，需要照跑）。

**怎么算成功**：`pm2 status` 显示 `quiz-server` 状态为 `online`，`curl http://localhost:3000/api/overview` 返回 JSON。

**出问题怎么办**：
- 端口被占用 → `lsof -i :3000` 找出是谁占的，停掉后再启动。
- 启动后立即 crash → `pm2 logs quiz-server` 看报错，常见原因是数据库文件权限或路径问题。

---

## 6 · 配 Nginx

**做什么**：
```bash
sudo apt install -y nginx
sudo cp deploy/nginx.example.conf /etc/nginx/sites-available/quiz
# 编辑：把 <域名> 替换为你的实际域名，把 <项目目录> 替换为绝对路径
sudo ln -sf /etc/nginx/sites-available/quiz /etc/nginx/sites-enabled/quiz
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

**为什么**：Nginx 负责把 80 端口的请求分流——`/api` 转发给 Node 后端，其余返回前端静态文件。

**怎么算成功**：
- `sudo nginx -t` 输出 `syntax is ok` / `test is successful`。
- 浏览器访问 `http://<域名>` 能看到登录页。

**出问题怎么办**：
- `nginx -t` 报错 → 检查配置文件里的路径是否正确、分号是否遗漏。
- 502 Bad Gateway → 后端没起来，回到步骤 5 检查 PM2。
- 403 Forbidden → 检查 `client/dist/` 目录权限，`chmod -R 755 client/dist`。

---

## 7 · 申请 HTTPS

**做什么**：
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <域名>
```

**为什么**：Let's Encrypt 免费证书，certbot 会自动修改 Nginx 配置加入 SSL。

**怎么算成功**：
- certbot 输出 `Congratulations!` 提示成功。
- 浏览器访问 `https://<域名>` 显示安全锁标志。

**出问题怎么办**：
- 域名未解析到本机 → certbot 会报 `Could not determine the server's IP address`，先去 DNS 管理加 A 记录。
- 80 端口不通 → 检查腾讯云安全组是否放行了 80 和 443。
- 证书过期 → certbot 默认会自动续期，可用 `sudo certbot renew --dry-run` 测试续期是否正常。

---

## 8 · 验证

**做什么**：用浏览器做一轮完整的端到端测试。

| 步骤 | 操作 | 预期结果 |
|------|------|---------|
| 学生登录 | 访问 `https://<域名>`，输入学号姓名登录 | 进入问卷页 |
| 做题 | 选几道题作答 | 答案自动保存 |
| 后台入口 | 访问 `https://<域名>/?admin`，输入 ADMIN_KEY | 进入后台看板 |
| 导入名单 | 在后台上传学生名单 xlsx | 提示导入成功，看板显示学生数 |
| 设开赛时间 | 后台设置开赛时间 | 学生端到时间后才能看到题目 |
| 材料下载 | 学生端点击「下载参赛材料」 | zip 正常下载 |

**出问题怎么办**：
- 学生登录后看不到题目 → 检查开赛时间是否已到，或检查 `GET /api/questions` 返回内容。
- 后台 401 → ADMIN_KEY 配错了，回到步骤 3。
- HTTPS 证书警告 → 可能用了自签名证书或证书未生效，等几分钟再试。

---

## 9 · 回滚

出问题时的紧急处理：

| 场景 | 操作 | 说明 |
|------|------|------|
| 后端 crash | `pm2 restart quiz-server` | 看日志定位原因 |
| 需要停服维护 | `pm2 stop quiz-server` | 学生会看到 502 |
| 恢复服务 | `pm2 start quiz-server` | 恢复到上次 `pm2 save` 的状态 |
| 代码需要回退 | `git log --on -10` 找到上一个好的 commit，`git checkout <commit>` 后重新走步骤 4-5 | 数据库不受影响 |
| Nginx 配置搞坏 | `sudo cp /etc/nginx/sites-available/quiz.bak /etc/nginx/sites-available/quiz && sudo systemctl reload nginx` | 建议改配置前先备份 |
| 证书出问题 | `sudo certbot certificates` 查看状态，`sudo certbot renew` 手动续期 | 不影响数据 |

**数据库安全**：`db.sqlite` 在项目目录里，只要不删项目目录就不会丢数据。建议定期 `cp db.sqlite db.sqlite.bak`。