'use strict';

// 22 道题的结构化数据（任务 03；任务 11 补 subs；任务 15 删原 Q11/Q12 并重编号 1–22）。
// 数据来源：《信息素养摸底试卷（整合稿）.md》
// 字段契约见 docs/contracts/api.md「题目数据结构」：
//   { no, part, scored, type, prompt, options?, scaleMax?, subs? }
//
// 字段约定：
//   - no     ：1–22，与 answers.question_no 一一对应
//   - part   ：第一部分 … 第五部分（共 5 段，题数 6/4/8/3/1）
//   - scored ：第一、二部分画像不计分；第三、四、五部分计分（共 10 道）
//   - type   ：checkbox（多选，存「，」分隔的选项文字）| single（单选）
//              | scale（1–scaleMax 自评）| text（自由作答）
//   - prompt ：题面（情境描述部分，不含 ①②③ 小问行），保留换行，前端按 whitespace-pre-line 渲染
//   - subs   ：小问数组（任务 11），带小问的题一律是 type: 'text'。
//              新编号 Q11–22 每题 2–5 个（共 50 个小问），subNo 从 1 连续编号，
//              text 与题面里的 ①②③… 行逐字一致；无小问的题不写这个字段，
//              存库时 answers.sub_no 固定为 0（见 docs/contracts/database.md）。
//
// 注意：checkbox 的选项文字里不能出现「，」（半角逗号也不允许），
//       因为多选答案是把选中的选项用「，」拼成一个字符串存进 answers.answer_text
//       （见 docs/contracts/database.md）。带「，」的选项只能出现在 single 题里。
// 改题时请同步检查：no 连续 1–22、part 只有 5 种、Q1–10 不计分 / Q11–22 计分、
//       subs 的条数与题面里的 ①②③ 行一致（改题面务必同步改 subs，subNo 保持连续）。

const questions = [
  // ── 第一部分｜你平时怎么用电脑（不计分 · 画像）────────────────────────
  {
    no: 1,
    part: '第一部分',
    scored: false,
    points: 0,
    type: 'checkbox',
    prompt: '你平时用电脑主要在干什么？（可多选）',
    options: [
      '上课 / 看网课',
      '写作业 / 做文档',
      '做 PPT 或表格',
      '打游戏',
      '看视频 / 追剧',
      '剪视频 / 做图做设计',
      '逛论坛 / 看资讯',
      '学编程',
      '和 AI 一起干活',
      '其他',
    ],
  },
  {
    no: 2,
    part: '第一部分',
    scored: false,
    points: 0,
    type: 'single',
    prompt: '平均每天用电脑的时间：',
    options: ['基本不用', '1 小时以内', '1–3 小时', '3–6 小时', '6 小时以上'],
  },
  {
    no: 3,
    part: '第一部分',
    scored: false,
    points: 0,
    type: 'text',
    prompt: '你最常用的 3 个电脑软件 / 工具（三个，用「、」隔开）',
  },
  {
    no: 4,
    part: '第一部分',
    scored: false,
    points: 0,
    type: 'checkbox',
    prompt: '下面这些“折腾电脑”的事，你亲自做过哪些？（可多选）',
    options: [
      '自己重装过系统',
      '拆过机 / 清灰 / 加内存硬盘',
      '装过开发环境（Python、Node 之类）',
      '用过命令行 / 终端',
      '做过带公式或筛选的表格',
      '做过带排版的 PPT',
      '剪过视频 / 修过图',
      '设置过路由器 / 校园网',
      '以上都没做过',
    ],
  },
  {
    no: 5,
    part: '第一部分',
    scored: false,
    points: 0,
    type: 'single',
    prompt: '电脑突然连不上网、或者软件怎么都装不上，你一般会怎么办？（选最接近的一项）',
    options: ['找同学 / 学长帮忙', '自己搜、自己查着解决', '重启、重装，不行就算了', '直接问 AI', '其他'],
  },
  {
    no: 6,
    part: '第一部分',
    scored: false,
    points: 0,
    type: 'scale',
    prompt: '自评：对计算机“里面大概是怎么运作的”，你的了解程度',
    scaleMax: 5,
  },

  // ── 第二部分｜你平时怎么用 AI（不计分 · 画像）────────────────────────
  {
    no: 7,
    part: '第二部分',
    scored: false,
    points: 0,
    type: 'checkbox',
    prompt: '你用过哪些 AI 工具？（可多选）',
    options: [
      'ChatGPT',
      'Claude',
      '豆包',
      'DeepSeek',
      '文心一言',
      'Kimi',
      '通义千问',
      '腾讯元宝',
      'Copilot',
      '手机自带语音助手',
      '用过一点但说不上名字',
      '基本没用过',
      '其他',
    ],
  },
  {
    no: 8,
    part: '第二部分',
    scored: false,
    points: 0,
    type: 'checkbox',
    prompt: '你主要拿 AI 干什么？（可多选）',
    options: [
      '查资料 / 答疑',
      '写作业 / 写材料',
      '写文案 / 起标题',
      '写代码 / 查报错',
      '翻译',
      '做 PPT 或表格',
      '聊天解闷',
      '帮我找思路 / 出主意',
      '其他',
    ],
  },
  {
    no: 9,
    part: '第二部分',
    scored: false,
    points: 0,
    type: 'single',
    prompt: '用 AI 的频率：',
    options: ['几乎每天', '一周几次', '偶尔用', '基本不用'],
  },
  {
    no: 10,
    part: '第二部分',
    scored: false,
    points: 0,
    type: 'single',
    prompt: 'AI 给出来的答案，你会再自己去核实吗？',
    options: ['基本都直接信', '重要的会核', '有时核有时不核', '基本都会核'],
  },
  // ── 第三部分｜信息操作（计分 · 共 30 分）────────────────────────────
  {
    no: 11,
    part: '第三部分',
    scored: true,
    points: 4,
    type: 'text',
    prompt: `目录管理 · 文件去哪了（4 分）

你从浏览器下载了一个 PDF，双击打开后关了，过两天想再找它，怎么都找不到。`,
    subs: [
      { subNo: 1, text: '① 它最可能在哪？' },
      { subNo: 2, text: '② 你怎么能快速找到它？' },
      { subNo: 3, text: '③ 以后怎么避免再找不到？' },
    ],
  },
  {
    no: 12,
    part: '第三部分',
    scored: true,
    points: 4,
    type: 'text',
    prompt: `目录管理 · 磁盘分工（4 分）

你电脑有 C 盘和 D 盘（或只有一个 C 盘）。`,
    subs: [
      { subNo: 1, text: '① 你平时把文件放在哪个盘？为什么？' },
      { subNo: 2, text: '② 如果所有东西都堆在 C 盘，会有什么问题？' },
      { subNo: 3, text: '③ 你会怎么安排你的文件夹结构？' },
    ],
  },
  {
    no: 13,
    part: '第三部分',
    scored: true,
    points: 4,
    type: 'text',
    prompt: `目录管理 · 开学整理（4 分）

新学期开始，你有课程 PPT、作业、社团文件、照片、下载的资料要放。`,
    subs: [
      { subNo: 1, text: '① 你会怎么建文件夹？' },
      { subNo: 2, text: '② 你的分类逻辑是什么（按类型？按课程？按时间？）？' },
      { subNo: 3, text: '③ 过了一个月，你怎么保证它不又乱掉？' },
    ],
  },
  {
    no: 14,
    part: '第三部分',
    scored: true,
    points: 4,
    type: 'text',
    prompt: `软件安装 · 装到哪了（4 分）

你安装一个软件，一路点“下一步”，装完发现 C 盘少了好几个 G。`,
    subs: [
      { subNo: 1, text: '① 它默认装哪了？' },
      { subNo: 2, text: '② 你怎么改安装位置？' },
      { subNo: 3, text: '③ 以后装软件，你会先看哪一步？' },
    ],
  },
  {
    no: 15,
    part: '第三部分',
    scored: true,
    points: 4,
    type: 'text',
    prompt: `软件安装 · 勾选项（4 分）

安装界面出现几个默认勾选的选项：“开机自动启动”“设为默认浏览器”“创建桌面快捷方式”“同意收集使用数据”。`,
    subs: [
      { subNo: 1, text: '① 哪些你会取消？为什么？' },
      { subNo: 2, text: '② 哪些可以保留？' },
      { subNo: 3, text: '③ 如果你没注意，全默认装了，会有什么后果？' },
    ],
  },
  {
    no: 16,
    part: '第三部分',
    scored: true,
    points: 4,
    type: 'text',
    prompt: `软件安装 · 卸载与残留（4 分）

你卸载了一个不用的软件，但发现 C 盘空间没怎么回来，甚至开机还是变慢。`,
    subs: [
      { subNo: 1, text: '① 可能是什么原因？' },
      { subNo: 2, text: '② 你会怎么清理？' },
      { subNo: 3, text: '③ 以后装软件时怎么避免？' },
    ],
  },
  {
    no: 17,
    part: '第三部分',
    scored: true,
    points: 3,
    type: 'text',
    prompt: `快捷键 · 你平时用哪些（3 分）`,
    subs: [
      { subNo: 1, text: '① 写出你常用的至少 5 个快捷键；' },
      { subNo: 2, text: '② 分别是什么场景下用？' },
    ],
  },
  {
    no: 18,
    part: '第三部分',
    scored: true,
    points: 3,
    type: 'text',
    prompt: `快捷键 · 场景题（3 分）

你正在写文档，需要：
- 复制一段文字到另一个地方；
- 找到文档里某个词；
- 撤销刚才的操作；
- 切换到自己刚打开的另一个窗口。`,
    subs: [
      { subNo: 1, text: '① 分别用什么快捷键？' },
      { subNo: 2, text: '② 如果不用快捷键，你会怎么做？' },
    ],
  },

  // ── 第四部分｜AI 素养（计分 · 共 35 分）────────────────────────────
  {
    no: 19,
    part: '第四部分',
    scored: true,
    points: 12,
    type: 'text',
    prompt: `不同形态的 AI（12 分）

你用过豆包、DeepSeek 网页版这类 AI 吗？用过 WorkBuddy、Codex 这类装在电脑上的 AI 工具吗？`,
    subs: [
      { subNo: 1, text: '① 你觉得它们有什么不一样？' },
      { subNo: 2, text: '② 你平时更习惯用哪种？为什么？' },
      { subNo: 3, text: '③ 网页版 AI 和装在电脑上的 AI 工具，能做的事有什么本质区别？' },
      { subNo: 4, text: '④ 为什么有些事网页版做不了，得用本地工具？' },
      { subNo: 5, text: '⑤ 如果你要处理一份自己电脑里的文件，你会选哪种？为什么？' },
    ],
  },
  {
    no: 20,
    part: '第四部分',
    scored: true,
    points: 12,
    type: 'text',
    prompt: `搜索引擎 vs AI（12 分）`,
    subs: [
      { subNo: 1, text: '① 你平时查东西，什么时候用搜索引擎（百度、必应、Google），什么时候用 AI？' },
      { subNo: 2, text: '② 搜索引擎给你的是什么，AI 给你的是什么？两者的本质区别在哪？' },
      { subNo: 3, text: '③ 有没有过这样的经历：搜了半天没找到、问 AI 一下就清楚了；或者 AI 说得头头是道、一搜才发现不对？举个例子。' },
      { subNo: 4, text: '④ 面对搜索结果或 AI 的答案，你通常会怎么进一步核实？' },
    ],
  },
  {
    no: 21,
    part: '第四部分',
    scored: true,
    points: 11,
    type: 'text',
    prompt: `个人使用经历（11 分）`,
    subs: [
      { subNo: 1, text: '① 你平时用 AI 做什么？最常用在哪个场景？举两三个具体例子。' },
      { subNo: 2, text: '② 有没有什么事，你一开始用 AI 做，后来发现还不如自己做的？' },
      { subNo: 3, text: '③ 有没有什么事，你以前不会做、因为有了 AI 才做成的？' },
      { subNo: 4, text: '④ 你用 AI 有没有自己的一套“套路”（比如先问什么、后问什么）？' },
    ],
  },

  // ── 第五部分｜与 AI 协作的方法论（计分 · 共 35 分）──────────────────
  {
    no: 22,
    part: '第五部分',
    scored: true,
    points: 35,
    type: 'text',
    prompt: `交流断层（35 分）

你接到一个任务，情况复杂，你自己也没完全想明白，手上只有一些零散材料。`,
    subs: [
      { subNo: 1, text: '① 拿到一个自己也没想透的任务，你会先自己捋一遍，还是直接带着模糊想法就去问 AI？这两种做法各有什么风险？' },
      { subNo: 2, text: '② 你会怎么让 AI 知道你“还没想清楚”？' },
      { subNo: 3, text: '③ 你会让 AI 直接给答案，还是先让它反过来问你问题？为什么？' },
      { subNo: 4, text: '④ 你怎么判断它是“理解偏了”，还是“你自己没说清”？' },
      { subNo: 5, text: '⑤ 发现偏了，你一般怎么纠（重说一遍，还是补信息）？你有没有一套“验证它到底理解对没有”的办法？' },
    ],
  },
];

module.exports = questions;
