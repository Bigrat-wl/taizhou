'use strict';

// ═══════════════════════════════════════════════════════════════════════
//  ⚠️  测试样例数据 — 仅供开发 / 批卷页验收使用
//  ⚠️  生产部署前必须清理这 4 个学号的全部数据（students / answers / scores / sessions / uploads）
// ═══════════════════════════════════════════════════════════════════════
//
// 4 个样例学生覆盖批卷页全部状态：
//   A  2026000001  已交卷 · 未批卷（scores 0 行）  风格：认真
//   B  2026000002  已交卷 · 批了一半（scores 6 行） 风格：一般
//   C  2026000003  已交卷 · 全批完（scores 12 行）  风格：敷衍
//   D  2026000004  未交卷（有画像答案，无 submitted_at）
//
// 用法：node seed-samples.js
// 幂等：可重复执行，先清既有数据再插入，不会产生重复。

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const AdmZip = require('adm-zip');

const dbPath = process.env.DB || path.join(__dirname, 'db.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// 确保表存在（正常启动过 server.js 就已经有表了）
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    student_id TEXT PRIMARY KEY, name TEXT NOT NULL, college TEXT, class_name TEXT, submitted_at TEXT
  );
  CREATE TABLE IF NOT EXISTS answers (
    student_id TEXT, question_no INTEGER, sub_no INTEGER NOT NULL DEFAULT 0,
    answer_text TEXT, updated_at TEXT, PRIMARY KEY (student_id, question_no, sub_no)
  );
  CREATE TABLE IF NOT EXISTS scores (
    student_id TEXT, question_no INTEGER, score INTEGER, updated_at TEXT,
    PRIMARY KEY (student_id, question_no)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, student_id TEXT NOT NULL, created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT, file_type TEXT, file_path TEXT, uploaded_at TEXT
  );
`);

const IDS = ['2026000001', '2026000002', '2026000003', '2026000004'];
const NOW = new Date().toISOString();

// ── 清理（幂等）────────────────────────────────────────────────────────
const delStudent  = db.prepare('DELETE FROM students WHERE student_id = ?');
const delAnswer   = db.prepare('DELETE FROM answers  WHERE student_id = ?');
const delScore    = db.prepare('DELETE FROM scores   WHERE student_id = ?');
const delSession  = db.prepare('DELETE FROM sessions  WHERE student_id = ?');
const delUpload   = db.prepare('DELETE FROM uploads  WHERE student_id = ?');
const cleanAll = db.transaction(() => {
  for (const id of IDS) {
    delScore.run(id);
    delAnswer.run(id);
    delSession.run(id);
    delUpload.run(id);
    delStudent.run(id);
  }
});
cleanAll();

// 清理上传目录（幂等）
const uploadsDir = path.join(__dirname, 'uploads');
for (const id of IDS) {
  const dir = path.join(uploadsDir, id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── 插入学生 ───────────────────────────────────────────────────────────
const insertStudent = db.prepare(
  'INSERT INTO students (student_id, name, college, class_name, submitted_at) VALUES (?,?,?,?,?)'
);
insertStudent.run('2026000001', '李思远', '计算机学院', '计科 2401', NOW);
insertStudent.run('2026000002', '王小明', '信息学院',   '信管 2402', NOW);
insertStudent.run('2026000003', '张三',   '经管学院',   '工商 2403', NOW);
insertStudent.run('2026000004', '赵六',   '外语学院',   '英语 2401', null);

// ── 答案数据 ───────────────────────────────────────────────────────────
// Q1–Q10（不计分画像题，sub_no = 0）：{ [studentId]: { [questionNo]: answerText } }
// Q11–Q22（计分题，按小问）：{ [studentId]: { [questionNo]: { [subNo]: answerText } } }

const surveyAnswers = {
  // ── A 李思远：认真 ──
  '2026000001': {
    1: '上课 / 看网课，写作业 / 做文档，做 PPT 或表格，剪视频 / 做图做设计，学编程，和 AI 一起干活',
    2: '3–6 小时',
    3: 'Visual Studio Code、Chrome 浏览器、WPS Office',
    4: '自己重装过系统，装过开发环境（Python、Node 之类），用过命令行 / 终端，做过带公式或筛选的表格，做过带排版的 PPT，剪过视频 / 修过图，设置过路由器 / 校园网',
    5: '自己搜、自己查着解决',
    6: '3',
    7: 'ChatGPT，Claude，豆包，DeepSeek，Kimi，Copilot',
    8: '查资料 / 答疑，写作业 / 写材料，写代码 / 查报错，翻译，帮我找思路 / 出主意',
    9: '几乎每天',
    10: '基本都会核',
  },
  // ── B 王小明：一般 ──
  '2026000002': {
    1: '上课 / 看网课，写作业 / 做文档，打游戏',
    2: '1–3 小时',
    3: 'Word、Excel、Steam',
    4: '做过带排版的 PPT，设置过路由器 / 校园网',
    5: '找同学 / 学长帮忙',
    6: '2',
    7: 'ChatGPT，豆包，Kimi，手机自带语音助手',
    8: '查资料 / 答疑，写作业 / 写材料，翻译',
    9: '一周几次',
    10: '有时核有时不核',
  },
  // ── C 张三：敷衍 ──
  '2026000003': {
    1: '看视频 / 追剧，打游戏，逛论坛 / 看资讯',
    2: '1–3 小时',
    3: '微信、QQ、浏览器',
    4: '以上都没做过',
    5: '找同学 / 学长帮忙',
    6: '1',
    7: '豆包，DeepSeek，手机自带语音助手',
    8: '聊天解闷，帮我找思路 / 出主意',
    9: '偶尔用',
    10: '基本都直接信',
  },
  // ── D 赵六：未交卷（只填了画像题）──
  '2026000004': {
    1: '上课 / 看网课，写作业 / 做文档',
    2: '1–3 小时',
    3: '浏览器、Word、QQ',
    4: '做过带排版的 PPT',
    5: '找同学 / 学长帮忙',
    6: '2',
    7: '豆包',
    8: '查资料 / 答疑，聊天解闷',
    9: '偶尔用',
    10: '有时核有时不核',
  },
};

// Q11–Q22 计分题答案（subNo 从 1 开始）
const gradedAnswers = {
  // ══════════════════════════════════════════════════════════════
  //  A 李思远 —— 认真、详细、有自己的思考
  // ══════════════════════════════════════════════════════════════
  '2026000001': {
    11: {
      1: '最可能在系统的"下载"文件夹里（Windows 默认路径是 C:\\Users\\用户名\\Downloads）。浏览器下载文件时一般都存到这个目录，除非之前手动改过保存位置。',
      2: '最快的方法是用文件资源管理器右上角的搜索框，输入文件名关键词或 *.pdf 来筛选。也可以按修改日期排序，找最近几天下载的文件。如果记得大概文件名，用 Everything 这类工具搜索更快。',
      3: '养成三个习惯：① 下载时手动选择保存位置，不要一路确定；② 在 D 盘建一个专门的"下载"文件夹并设为浏览器默认下载路径；③ 定期清理下载文件夹，把重要文件移到分类目录里。',
    },
    12: {
      1: 'C 盘只放系统和软件，个人文件全部放 D 盘。因为 C 盘是系统盘，重装系统时可能会格式化，如果个人文件也放在 C 盘，很容易丢失。D 盘作为数据盘，即使重装系统也不受影响。',
      2: 'C 盘空间会被快速占满，导致系统运行变慢、虚拟内存不足、软件无法更新甚至无法安装新软件。严重时系统会卡死或蓝屏，开机时间也会越来越长。',
      3: '我的文件夹结构是：D:\\Documents（文档，下面再按课程名分子文件夹）、D:\\Projects（课程作业和项目）、D:\\Software（下载的安装包）、D:\\Media（照片和视频）、D:\\Backup（重要资料备份）。每个大类下再按具体用途细分。',
    },
    13: {
      1: '先建一级文件夹：课程、作业、社团、个人。课程下面按学期和具体课程名建子文件夹，比如"大二上-数据结构"。作业按课程名分。社团按社团名称分。个人下面放照片、视频等。',
      2: '主要按课程分，因为大学里文件和课程关联最紧密。在每个课程文件夹下再按类型分：课件、笔记、作业、参考资料。这样找东西时先定位课程再定位类型，两步就能找到。',
      3: '每周五花十分钟整理本周新建的文件，把它们移到对应文件夹。下载的资料用完就归档或删除，不积压在桌面或下载文件夹。坚持"用完即归"的原则，不让桌面超过五个文件。',
    },
    14: {
      1: '默认装在 C:\\Program Files 或 C:\\Program Files (x86) 目录下。很多软件安装时不明显提示路径，直接用默认设置就一路装下去了，所以会占用 C 盘空间。',
      2: '在安装界面找到"自定义安装"或"浏览"按钮（通常在路径显示那一行旁边），点击后把盘符 C 改成 D，比如 D:\\Software\\软件名。有些软件藏得比较深，需要仔细找一下安装选项。',
      3: '先看安装路径那一步，确认软件装在哪里。同时注意是否有"自定义安装"和"快速安装"的区别——选自定义安装可以看到更多选项，包括安装路径、是否创建快捷方式、是否开机自启等。',
    },
    15: {
      1: '我会取消"开机自动启动"（除非是杀毒软件或输入法这类确实需要的）、"同意收集使用数据"（保护隐私）。"设为默认浏览器"如果不是我常用的浏览器也会取消。',
      2: '"创建桌面快捷方式"可以保留，方便快速打开软件。如果确定要长期用这个浏览器，"设为默认浏览器"也可以保留。',
      3: '电脑开机变慢（太多软件自启动拖慢速度），浏览器被篡改（不是自己选的浏览器变成了默认），个人使用数据被收集（隐私泄露风险），桌面堆满快捷方式（杂乱无章）。',
    },
    16: {
      1: '卸载程序可能只删了主文件，残留了缓存文件、注册表项、用户数据文件夹。有些软件还会在 AppData 或 Temp 目录下留大量临时文件。开机变慢可能是残留的启动项或服务还在运行。',
      2: '先用系统设置里的"应用"功能查看是否有残留组件。然后用 Geek Uninstaller 或 Revo Uninstaller 这类专业卸载工具扫描残留文件和注册表项，一键清理。最后手动检查 C:\\Users\\用户名\\AppData 下有没有相关文件夹。',
      3: '安装软件时选择自定义安装，指定 D 盘路径，避免软件默认塞满 C 盘。安装前看一下软件大小，定期用磁盘清理工具清理系统垃圾。',
    },
    17: {
      1: 'Ctrl+C（复制）、Ctrl+V（粘贴）、Ctrl+Z（撤销）、Ctrl+S（保存）、Ctrl+F（查找）、Ctrl+A（全选）、Alt+Tab（切换窗口）、Win+D（显示桌面）、Ctrl+Shift+Esc（打开任务管理器）。',
      2: 'Ctrl+C/V：写文档或做 PPT 时复制粘贴文字和图片，几乎每分钟都在用。Ctrl+Z：操作失误时立刻撤销，比如误删文字或格式改乱了。Ctrl+F：在长文档或网页里快速搜索关键词。Ctrl+S：养成随手保存的习惯，防止软件崩溃丢失内容。Alt+Tab：在多个窗口之间快速切换。',
    },
    18: {
      1: '复制：Ctrl+C，粘贴到目标位置：Ctrl+V。查找词语：Ctrl+F，输入关键词回车定位。撤销操作：Ctrl+Z，可以连续撤销多步。切换窗口：Alt+Tab，在弹出的窗口预览中选择目标窗口。',
      2: '复制粘贴要用鼠标选中文字，右键菜单点复制，再到目标位置右键粘贴，来回操作很慢。查找词语只能肉眼逐行扫描，长文档几乎不可能找到。撤销需要去菜单栏找"编辑→撤销"，而且不容易连撤多步。切换窗口要点任务栏上的图标，窗口多了容易点错。',
    },
    19: {
      1: '网页版 AI（豆包、DeepSeek）是通过浏览器访问的通用对话工具，什么都能聊但不能操作本地文件。WorkBuddy、Codex 这类本地 AI 工具能直接读写电脑上的文件、运行代码、调用系统功能，能力更聚焦在实际操作上。',
      2: '更习惯用网页版，因为打开浏览器就能用，不需要安装，换台电脑也能继续用。而且日常查资料、写文案这类需求网页版完全够用。只有需要处理本地文件或写代码时才会用本地工具。',
      3: '本质区别在于"能不能碰本地资源"。网页版运行在浏览器沙盒里，无法访问文件系统、无法运行程序、无法调用系统 API。本地工具运行在自己电脑上，可以直接操作文件、执行命令、安装插件，能做的事情范围广得多。',
      4: '因为浏览器出于安全考虑限制了网页脚本对本地资源的访问。比如要读取一个 Excel 文件的内容，网页版需要你手动上传，而本地工具可以直接打开指定路径的文件。再比如要运行一段 Python 脚本操作文件，本地工具可以直接执行，网页版做不到。',
      5: '选本地工具。因为它能直接访问我电脑里的文件，不需要上传（也避免了隐私风险），处理完可以直接保存到指定文件夹。比如让 AI 帮我整理一份 Excel 表格，本地工具直接读取、处理、覆盖保存，整个流程一步到位。',
    },
    20: {
      1: '查最新资讯、官方文档、具体产品参数这类事实性信息用搜索引擎，因为它能给出原始来源链接。需要分析问题、写文案、翻译、解释概念、写代码这类需要"加工"的需求用 AI，因为它能直接给整理好的答案。',
      2: '搜索引擎给你的是网页链接列表，需要自己点进去筛选、阅读、提取信息，相当于给你原材料让你自己加工。AI 给你的是直接整理好的答案，已经帮你做了信息筛选和整合的步骤。本质区别是：搜索引擎是"找"，AI 是"答"。',
      3: '有。之前写课程论文需要查一个比较新的概念，百度搜了好几页都是重复的营销文章，问 DeepSeek 一下就给出了清晰的定义和例子。也遇到过 AI 说某个 Python 库有某个功能，实际去官方文档查发现并没有，AI 编造了不存在的 API。',
      4: '看信息的类型：事实性信息（数据、日期、引用）去搜索引擎核实，看是否有权威来源佐证。技术性信息（代码、操作步骤）直接试一下或查官方文档。如果 AI 的回答涉及具体数据或引用，一定会去搜索验证，因为 AI 有幻觉问题。',
    },
    21: {
      1: '最常用在三个方面：① 写代码时遇到报错，把错误信息贴给 AI 让它分析原因和解决方案；② 写课程论文或报告时，让 AI 帮忙润色语句、调整结构；③ 学习新概念时让 AI 用通俗的方式解释，比看官方文档容易理解。',
      2: '有的。比如让 AI 帮忙改一段代码，它改完能跑但引入了新的 bug，最后花了更多时间调试。还有一次让 AI 写实验报告的数据分析部分，它写得很流畅但数据引用全是编的，最后还是得自己重写。',
      3: '用 Python 批量处理数据。之前完全不会 Python，但让 AI 一步步教我写脚本，从安装 Python 到处理 Excel 数据，整个过程跟着 AI 的指导走，最后成功写出了自动化处理脚本。之后又学会了用 Python 调 API、爬数据等。',
      4: '有一套。首先把任务背景和需求说清楚，然后问 AI 的整体思路是否可行；确认方向对了再让它分步骤执行；每步做完我会检查结果，有问题及时反馈。最后会要求 AI 总结一下做了什么，方便以后复用。',
    },
    22: {
      1: '我会先花时间自己梳理，把已知信息列出来，想清楚"我到底要解决什么问题""已经知道什么""还不确定什么"，带着这些再去问 AI。直接带着模糊想法问 AI 的风险是：AI 可能会基于你的模糊描述给出一个看似合理但方向完全偏了的答案，你还意识不到。完全自己想清楚再问的风险是：可能陷入自己的思维定式，花太长时间，而且有些角度自己确实想不到。',
      2: '我会在提问时直接说"这个任务我还没完全想清楚，下面是我的初步想法，你先帮我看看思路对不对，有哪些我没想到的地方"。把我的思考过程和零散材料都列出来，让 AI 看到我的思考状态，而不是装作什么都想好了直接要答案。',
      3: '先让它反过来问问题。原因：① 如果我描述有遗漏或模糊，AI 通过提问能帮我发现盲区；② 让 AI 先理解我的需求再给答案，比直接要答案更靠谱；③ 这个问答过程本身也是帮我理清思路的过程。直接要答案容易得到一个"看起来对但不是我想要的"结果。',
      4: '看两点：① AI 的回答是否直接回应了我的问题——如果它答的很全面但不是我问的那个点，说明理解偏了；② 我会追问一个具体细节，如果 AI 能准确回答说明它确实理解了，如果回答含糊或答非所问，可能是我没说清楚。关键是要通过追问来验证。',
      5: '先判断偏在哪里。如果是我没说清楚，我会补充信息，把具体情况、限制条件、期望的输出格式说清楚。如果判断是 AI 理解错了，我会换一种方式重新描述，可能用更具体的例子。验证的办法：让 AI 用自己的话复述一遍它理解的任务，和我的预期对比，确认对了再继续。',
    },
  },

  // ══════════════════════════════════════════════════════════════
  //  B 王小明 —— 一般水平，回答简洁但有点道理
  // ══════════════════════════════════════════════════════════════
  '2026000002': {
    11: {
      1: '应该在"下载"文件夹里吧，浏览器默认都是下到那里的。',
      2: '打开文件管理器，在搜索框里输入文件名或者搜 *.pdf，应该能找到。',
      3: '下载文件的时候注意看一下保存路径，或者专门建一个文件夹用来放下载的东西。',
    },
    12: {
      1: 'D 盘放文档和资料，C 盘放系统和软件。因为重装系统的时候 C 盘可能会被清掉。',
      2: '系统会变慢，C 盘满了之后电脑会很卡，软件也可能装不上。',
      3: '文档、软件、资料、娱乐，大概分这几个文件夹，下面再细分。',
    },
    13: {
      1: '按课程建文件夹，再加一个"社团"和"个人"的文件夹。',
      2: '先按课程分，每个课程里面再按课件、作业分。',
      3: '定期整理，比如每周把新文件归到对应文件夹里。',
    },
    14: {
      1: '默认装在 C 盘的 Program Files 里面。',
      2: '安装的时候找一下路径选择的地方，把 C 改成 D 就行。',
      3: '先看安装路径那一步，别一路下一步。',
    },
    15: {
      1: '开机自启会取消，其他的不太注意。',
      2: '桌面快捷方式可以保留，方便打开。',
      3: '电脑变慢，开机时间变长，后台程序占用资源。',
    },
    16: {
      1: '可能注册表和缓存没清干净，还有残留文件。',
      2: '用系统自带的磁盘清理工具，或者下个清理软件。',
      3: '装软件的时候注意安装路径，别什么都往 C 盘装。',
    },
    17: {
      1: 'Ctrl+C、Ctrl+V、Ctrl+Z、Ctrl+S、Print Screen、Alt+Tab',
      2: '写文档的时候复制粘贴用 Ctrl+C/V，撤销用 Ctrl+Z，保存用 Ctrl+S，截图用 Print Screen，切换窗口用 Alt+Tab。',
    },
    18: {
      1: '复制粘贴用 Ctrl+C/V，查找用 Ctrl+F，撤销用 Ctrl+Z，切换窗口 Alt+Tab。',
      2: '就用鼠标呗，右键菜单复制粘贴，查找在菜单里找，窗口在任务栏点。',
    },
    19: {
      1: '网页版就是聊天式的，本地工具更像是个辅助软件。',
      2: '更习惯用网页版，因为更方便不用装。',
      3: '网页版只能对话，本地工具能直接操作文件之类的。',
      4: '网页版有安全限制，不能随便访问本地文件。',
      5: '用本地工具，因为它能直接读写文件。',
    },
    20: {
      1: '查具体的最新信息用搜索引擎，需要理解和总结的用 AI。',
      2: '搜索引擎给网页链接，AI 给直接答案。',
      3: '有。搜一个技术问题搜不到，问 AI 一下就知道了。不过有时候 AI 给的答案也不太准。',
      4: '搜一下看看和 AI 说的对不对得上。',
    },
    21: {
      1: '写作业和查资料用得最多，比如一道题不会做就问 AI。',
      2: '写作文吧，AI 写的太模板化了，老师一眼就看出来。',
      3: '写代码的时候，以前完全不会，让 AI 教着写的。',
      4: '先把任务告诉它，然后一步步问怎么做。',
    },
    22: {
      1: '先自己想一遍再去问，大概知道要做什么就不会浪费时间。',
      2: '直接说"这个我不太清楚怎么做，你先帮我理一理"。',
      3: '先让它问问题，这样我能把需求想清楚。',
      4: '看它回答的是不是我想问的那个问题。',
      5: '补充一些具体信息，或者换个说法重新问一遍。',
    },
  },

  // ══════════════════════════════════════════════════════════════
  //  C 张三 —— 敷衍，能短就短，不走心
  // ══════════════════════════════════════════════════════════════
  '2026000003': {
    11: {
      1: '下载文件夹。',
      2: '搜索文件名。',
      3: '下载的时候注意路径。',
    },
    12: {
      1: 'C 盘，因为默认都在那。',
      2: '会变慢。',
      3: '随便分一下就行。',
    },
    13: {
      1: '按课程建几个文件夹。',
      2: '按课程分的。',
      3: '定期整理一下。',
    },
    14: {
      1: 'C 盘吧。',
      2: '改安装路径到 D 盘。',
      3: '先看看路径。',
    },
    15: {
      1: '没注意过。',
      2: '都可以。',
      3: '电脑变慢。',
    },
    16: {
      1: '没卸干净。',
      2: '用清理工具。',
      3: '以后注意点。',
    },
    17: {
      1: 'Ctrl+C、Ctrl+V、Ctrl+Z、Ctrl+S、Alt+Tab',
      2: '复制粘贴撤销保存切窗口。',
    },
    18: {
      1: 'Ctrl+C、V、F、Z、Alt+Tab。',
      2: '用鼠标点。',
    },
    19: {
      1: '网页版方便，本地的功能多。',
      2: '网页版，不用装。',
      3: '网页版只能聊天，本地的能操作文件。',
      4: '网页版有安全限制。',
      5: '网页版就够了。',
    },
    20: {
      1: '有时候用搜索有时候问 AI。',
      2: '差不多吧，搜索引擎结果多，AI 直接给答案。',
      3: '都有过。',
      4: '搜一下对比看看。',
    },
    21: {
      1: '问问题和写东西。',
      2: '好像没有。',
      3: '写代码问过 AI。',
      4: '直接问，有问题再说。',
    },
    22: {
      1: '先自己想一遍再去问。',
      2: '直接说不太清楚。',
      3: '有时让它直接给，有时让它先问。',
      4: '看回答对不对路。',
      5: '重新说一遍。',
    },
  },
};

// ── 插入答案 ───────────────────────────────────────────────────────────
const insertAnswer = db.prepare(`
  INSERT OR REPLACE INTO answers (student_id, question_no, sub_no, answer_text, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);

const insertAnswers = db.transaction(() => {
  for (const studentId of IDS) {
    const survey = surveyAnswers[studentId] || {};
    const graded = gradedAnswers[studentId] || {};

    // Q1–Q10（sub_no = 0）
    for (let q = 1; q <= 10; q++) {
      const text = survey[q];
      if (text) insertAnswer.run(studentId, q, 0, text, NOW);
    }

    // Q11–Q22（sub_no = 1, 2, 3...）
    for (let q = 11; q <= 22; q++) {
      const subs = graded[q];
      if (!subs) continue;
      for (const [subNo, text] of Object.entries(subs)) {
        insertAnswer.run(studentId, q, Number(subNo), text, NOW);
      }
    }
  }
});
insertAnswers();

// ── 插入分数（只给 B 和 C）─────────────────────────────────────────────
const insertScore = db.prepare(`
  INSERT OR REPLACE INTO scores (student_id, question_no, score, updated_at)
  VALUES (?, ?, ?, ?)
`);

const insertScores = db.transaction(() => {
  // B 王小明：批了 Q11–Q16（6 题），总分 20
  const bScores = { 11: 2, 12: 3, 13: 4, 14: 3, 15: 5, 16: 3 };
  for (const [q, s] of Object.entries(bScores)) {
    insertScore.run('2026000002', Number(q), s, NOW);
  }

  // C 张三：全批完 12 题，总分 75
  const cScores = { 11: 2, 12: 3, 13: 3, 14: 2, 15: 4, 16: 3, 17: 8, 18: 7, 19: 10, 20: 11, 21: 9, 22: 13 };
  for (const [q, s] of Object.entries(cScores)) {
    insertScore.run('2026000003', Number(q), s, NOW);
  }
});
insertScores();

// ── 上传文件（xlsx + zip）──────────────────────────────────────────────
const REFERENCE_XLSX = '/home/rat/IT-Lab/01-freshman-project-handoff/organizer/reference/接待最终安排.xlsx';
const insertUpload = db.prepare(
  'INSERT INTO uploads (student_id, file_type, file_path, uploaded_at) VALUES (?, ?, ?, ?)'
);

const createUploads = db.transaction(() => {
  // A 2026000001: xlsx + zip
  // B 2026000002: xlsx only
  // C 2026000003: xlsx + zip
  // D 2026000004: none

  for (const id of ['2026000001', '2026000002', '2026000003']) {
    const dir = path.join(uploadsDir, id);
    fs.mkdirSync(dir, { recursive: true });

    // 复制 xlsx
    const xlsxName = `${id}_xlsx.xlsx`;
    const xlsxRel = `${id}/${xlsxName}`;
    fs.copyFileSync(REFERENCE_XLSX, path.join(dir, xlsxName));
    insertUpload.run(id, 'xlsx', xlsxRel, NOW);
  }

  // 生成 zip（A 和 C）
  for (const id of ['2026000001', '2026000003']) {
    const dir = path.join(uploadsDir, id);
    const zipName = `${id}_zip.zip`;
    const zipRel = `${id}/${zipName}`;

    const zip = new AdmZip();
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>新生接待安排 - ${id}</title>
<link rel="stylesheet" href="style.css"></head>
<body>
  <h1>新生接待活动安排</h1>
  <div id="app"></div>
  <script src="data.js"></script>
  <script src="app.js"></script>
</body>
</html>`;
    const css = `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; padding: 2rem; background: #f5f5f5; }
h1 { color: #1a73e8; margin-bottom: 1rem; }
table { border-collapse: collapse; width: 100%; background: #fff; }
th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
th { background: #1a73e8; color: #fff; }`;
    const data = `const schedule = [
  { time: '08:00', event: '签到入场', location: '体育馆入口' },
  { time: '09:00', event: '开幕式', location: '主会场' },
  { time: '10:30', event: '校园参观', location: '各学院楼' },
  { time: '12:00', event: '午餐', location: '第一食堂' },
  { time: '14:00', event: '专业介绍', location: '各学院会议室' },
  { time: '16:00', event: '社团招新', location: '学生活动中心' },
];`;
    const app = `document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('app');
  const table = document.createElement('table');
  table.innerHTML = '<tr><th>时间</th><th>活动</th><th>地点</th></tr>';
  schedule.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = '<td>' + item.time + '</td><td>' + item.event + '</td><td>' + item.location + '</td>';
    table.appendChild(row);
  });
  container.appendChild(table);
});`;

    zip.addFile('index.html', Buffer.from(html, 'utf-8'));
    zip.addFile('style.css', Buffer.from(css, 'utf-8'));
    zip.addFile('data.js', Buffer.from(data, 'utf-8'));
    zip.addFile('app.js', Buffer.from(app, 'utf-8'));
    zip.writeZip(path.join(dir, zipName));

    insertUpload.run(id, 'zip', zipRel, NOW);
  }
});
createUploads();

// ── 验证 ───────────────────────────────────────────────────────────────
console.log('=== seed-samples.js 执行完毕 ===\n');

const students = db.prepare('SELECT student_id, name, submitted_at FROM students WHERE student_id IN (?,?,?,?) ORDER BY student_id').all(...IDS);
for (const s of students) {
  const ansCount = db.prepare('SELECT COUNT(*) AS c FROM answers WHERE student_id = ?').get(s.student_id).c;
  const scoreRows = db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(score),0) AS total FROM scores WHERE student_id = ?').get(s.student_id);
  const status = s.submitted_at ? '已交卷' : '未交卷';
  console.log(`${s.student_id} ${s.name}  ${status}  answers=${ansCount}  scores=${scoreRows.c}行  total=${scoreRows.total}`);
}

// 验证 A/B/C 的 answers 覆盖 50 个答案项（Q1–Q10 共 10 条 + Q11–Q22 共 40 个小问）
for (const id of ['2026000001', '2026000002', '2026000003']) {
  const total = db.prepare('SELECT COUNT(*) AS c FROM answers WHERE student_id = ?').get(id).c;
  const graded = db.prepare(
    'SELECT COUNT(*) AS c FROM answers WHERE student_id = ? AND question_no >= 11'
  ).get(id).c;
  const ok = (total === 50 && graded === 40) ? '✓' : `✗ (total=${total}, graded=${graded})`;
  console.log(`  ${id} 答案覆盖: ${ok}`);
}

// 验证 C 的分数和
const cTotal = db.prepare('SELECT COALESCE(SUM(score),0) AS t FROM scores WHERE student_id = ?').get('2026000003').t;
console.log(`  C 总分: ${cTotal} (≤100: ${cTotal <= 100 ? '✓' : '✗'})`);

// 验证幂等：再跑一次 insert，确认数据量不变
console.log('\n幂等测试：重新执行...');
const beforeAns = db.prepare('SELECT COUNT(*) AS c FROM answers').get().c;
const beforeScore = db.prepare('SELECT COUNT(*) AS c FROM scores').get().c;
insertAnswers();
insertScores();
const afterAns = db.prepare('SELECT COUNT(*) AS c FROM answers').get().c;
const afterScore = db.prepare('SELECT COUNT(*) AS c FROM scores').get().c;
console.log(`  answers: ${beforeAns} → ${afterAns} (不变: ${beforeAns === afterAns ? '✓' : '✗'})`);
console.log(`  scores:  ${beforeScore} → ${afterScore} (不变: ${beforeScore === afterScore ? '✓' : '✗'})`);

console.log('\n完成。可执行 GET /api/admin/students 查看四人的 submitted / scoredCount / score。');

// 验证上传文件
console.log('\n--- 上传文件验证 ---');
const uploadCheck = db.prepare(
  'SELECT student_id, file_type, file_path FROM uploads WHERE student_id IN (?,?,?,?) ORDER BY student_id, file_type'
).all(...IDS);
for (const row of uploadCheck) {
  const absPath = path.join(uploadsDir, row.file_path);
  const exists = fs.existsSync(absPath);
  console.log(`  ${row.student_id} ${row.file_type}  ${row.file_path}  存在=${exists ? '✓' : '✗'}`);
}
// 检查 A/C 有 xlsx+zip，B 只有 xlsx，D 无
const uploadCounts = {};
for (const row of uploadCheck) {
  uploadCounts[row.student_id] = (uploadCounts[row.student_id] || 0) + 1;
}
const checkUpload = (id, expect, label) => {
  const got = uploadCounts[id] || 0;
  console.log(`  ${label} ${id} 上传数: ${got} (期望 ${expect}: ${got === expect ? '✓' : '✗'})`);
};
checkUpload('2026000001', 2, 'A');
checkUpload('2026000002', 1, 'B');
checkUpload('2026000003', 2, 'C');
checkUpload('2026000004', 0, 'D');

// 幂等测试：重新执行上传逻辑
console.log('\n上传幂等测试：重新执行...');
const beforeUploads = db.prepare('SELECT COUNT(*) AS c FROM uploads').get().c;
cleanAll();
// 重新插入学生 + 答案 + 分数 + 上传
insertStudent.run('2026000001', '李思远', '计算机学院', '计科 2401', NOW);
insertStudent.run('2026000002', '王小明', '信息学院',   '信管 2402', NOW);
insertStudent.run('2026000003', '张三',   '经管学院',   '工商 2403', NOW);
insertStudent.run('2026000004', '赵六',   '外语学院',   '英语 2401', null);
insertAnswers();
insertScores();
createUploads();
const afterUploads = db.prepare('SELECT COUNT(*) AS c FROM uploads').get().c;
console.log(`  uploads: ${beforeUploads} → ${afterUploads} (不变: ${beforeUploads === afterUploads ? '✓' : '✗'})`);

db.close();
