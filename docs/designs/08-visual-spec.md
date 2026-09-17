# 视觉设计规范 v1

> 本文件是 `docs/tasks/08-视觉优化.md` 的设计产出，可直接转译为 CSS 变量 + Tailwind class。

---

## 一、配色方案

### 主色

| 角色 | HEX | Tailwind 用法 | 说明 |
|------|-----|---------------|------|
| Primary | `#4F7CFF` | `bg-[#4F7CFF]` / `text-[#4F7CFF]` | 活力蓝，比 Element Plus 默认蓝更暖、更轻盈 |
| Primary Hover | `#3B66E0` | hover 态 | 深一档，保证点击反馈 |
| Primary Light | `#EEF2FF` | `bg-[#EEF2FF]` | 极浅蓝底，用于选中态背景、侧栏当前题高亮 |
| Primary Lighter | `#F5F7FF` | `bg-[#F5F7FF]` | 比 primary light 更浅，用于卡片 hover 底 |

### 中性灰阶（暖灰，带微量蓝底，不发黄）

| Token | HEX | 用途 |
|-------|-----|------|
| `gray-50` | `#F9FAFB` | 页面底色 |
| `gray-100` | `#F3F4F6` | 卡片底色、分割线背景 |
| `gray-200` | `#E5E7EB` | 边框、分隔线 |
| `gray-300` | `#D1D5DB` | placeholder 文字、禁用态 |
| `gray-400` | `#9CA3AF` | 辅助文字 |
| `gray-500` | `#6B7280` | 次要文字 |
| `gray-700` | `#374151` | 正文文字 |
| `gray-900` | `#111827` | 标题文字 |

### 语义色

| 角色 | HEX | Element Plus 变量覆盖 | 用途 |
|------|-----|-----------------------|------|
| Success | `#22C55E` | `--el-color-success: #22C55E` | 全填、已交卷、已保存 |
| Success Light | `#DCFCE7` | `--el-color-success-light-9: #DCFCE7` | 成功标签底色 |
| Warning | `#F59E0B` | `--el-color-warning: #F59E0B` | 部分填、保存中 |
| Warning Light | `#FEF3C7` | `--el-color-warning-light-9: #FEF3C7` | 警告标签底色 |
| Danger | `#EF4444` | `--el-color-danger: #EF4444` | 错误、必交标记 |
| Danger Light | `#FEE2E2` | `--el-color-danger-light-9: #FEE2E2` | 错误标签底色 |

### 配色落地（Element Plus 主题覆盖）

```css
:root {
  --el-color-primary: #4F7CFF;
  --el-color-primary-light-3: #7A9FFF;
  --el-color-primary-light-5: #A5BFFF;
  --el-color-primary-light-7: #D0DFFF;
  --el-color-primary-light-8: #E5ECFF;
  --el-color-primary-light-9: #EEF2FF;
  --el-color-primary-dark-2: #3B66E0;

  --el-color-success: #22C55E;
  --el-color-success-light-9: #DCFCE7;
  --el-color-warning: #F59E0B;
  --el-color-warning-light-9: #FEF3C7;
  --el-color-danger: #EF4444;
  --el-color-danger-light-9: #FEE2E2;

  --el-bg-color-page: #F9FAFB;
  --el-border-color: #E5E7EB;
  --el-border-color-light: #F3F4F6;
  --el-text-color-primary: #111827;
  --el-text-color-regular: #374151;
  --el-text-color-secondary: #6B7280;
  --el-text-color-placeholder: #9CA3AF;

  --el-font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
  --el-border-radius-base: 8px;
  --el-border-radius-small: 6px;
}
```

---

## 二、字体层级

| 角色 | 字号 | 字重 | 行高 | Tailwind class |
|------|------|------|------|----------------|
| 页面标题 | 28px | 700 | 1.3 | `text-[28px] font-bold leading-tight` |
| 分区标题（第一部分…） | 20px | 600 | 1.4 | `text-xl font-semibold leading-snug` |
| 题面（prompt） | 16px | 500 | 1.7 | `text-base font-medium leading-relaxed` |
| 正文 / 选项文字 | 15px | 400 | 1.7 | `text-[15px] font-normal leading-relaxed` |
| 输入框文字 | 15px | 400 | 1.6 | Element Plus 默认 |
| 辅助文字（保存状态、hint） | 13px | 400 | 1.5 | `text-[13px] text-gray-400` |
| 题号方块数字 | 12px | 600 | 1 | `text-xs font-semibold` |
| 标签（已交/未交） | 12px | 500 | 1 | Element Plus `el-tag` small |

**说明**：中文正文不小于 15px（长时间阅读的最低舒适线），题面用 16px + font-medium 保证可扫读性。

---

## 三、间距规范

### 全局

| 规则 | 值 | Tailwind |
|------|-----|----------|
| 页面最大宽度（学生端内容区） | 720px | `max-w-[720px]` |
| 页面最大宽度（后台） | 1200px | `max-w-7xl` |
| 页面水平内边距 | 24px | `px-6` |

### 答题页（呼吸感重点）

| 区域 | 间距 | Tailwind |
|------|------|----------|
| 分区间距（第一部分 → 第二部分） | 48px | `space-y-12` 或 `mt-12` |
| 题与题之间 | 32px | `space-y-8` |
| 题面与第一个选项/输入框 | 16px | `mt-4` |
| 小问与小问之间 | 12px | `space-y-3` |
| 选项行之间（checkbox/radio） | 10px | `gap-y-2.5` |
| 卡片内边距 | 24px | `p-6` |
| 输入框高度 | 40px（单行）/ 120px（textarea） | Element Plus 默认 |

### 后台

| 区域 | 间距 | Tailwind |
|------|------|----------|
| 操作栏与表格之间 | 24px | `space-y-6` |
| 表格内边距 | 12px | Element Plus 默认 |
| 展开行内边距 | 24px 16px | `px-6 py-4` |
| 状态方块间距 | 6px | `gap-1.5` |

---

## 四、关键组件样式

### 4.1 按钮

**主按钮**（登录、开始答题、提交、导入名单）：
```
bg-[#4F7CFF] hover:bg-[#3B66E0] text-white
rounded-lg px-6 py-2.5 font-medium text-[15px]
transition-colors duration-150
shadow-sm hover:shadow
```

**次按钮**（返回、刷新）：
```
border border-gray-200 text-gray-700 hover:border-[#4F7CFF] hover:text-[#4F7CFF]
rounded-lg px-5 py-2.5 text-[15px]
bg-white
```

**危险按钮**（退出登录）：
```
text-gray-400 hover:text-[#EF4444] text-sm
```

**禁用态**：opacity-50 + cursor-not-allowed，Element Plus 自带。

### 4.2 输入框

Element Plus `el-input` 覆盖：
```css
--el-input-border-color: #E5E7EB;
--el-input-hover-border-color: #4F7CFF;
--el-input-focus-border-color: #4F7CFF;
--el-input-border-radius: 8px;
```

Tailwind 补充：
```
输入框获得焦点时：ring-2 ring-[#4F7CFF]/20（外围柔光）
```

### 4.3 多选控件（checkbox）

改为卡片式，选中时底色高亮：
```
未选中：border border-gray-200 rounded-lg px-4 py-2.5 bg-white hover:border-gray-300
选中：  border-2 border-[#4F7CFF] rounded-lg px-4 py-2.5 bg-[#EEF2FF] text-[#4F7CFF]
勾选标记：✓ 用 primary 色，行内左侧
```

每行放 2 个选项（桌面），窄屏折行。

### 4.4 单选控件（radio）

同 checkbox 卡片式，选中态相同。一行 3–4 个选项（文字短的）或 2 个（文字长的）。

### 4.5 量表控件（scale 1–5）

横排 5 个圆角方块：
```
未选中：w-12 h-10 rounded-lg border border-gray-200 text-gray-500
选中：  w-12 h-10 rounded-lg bg-[#4F7CFF] text-white font-medium
hover： border-[#4F7CFF] bg-[#EEF2FF]
```

数字 1–5 居中显示。左端标注「最低」、右端标注「最高」（13px 灰色文字）。

### 4.6 侧边题号栏（学生端答题页 · 三态）

固定在左侧，宽 48px（22 格 + 分组标签纵向排列）。

每格 32×32px，圆角 6px：
| 状态 | 样式 | 角标 |
|------|------|------|
| 当前题 | `bg-[#4F7CFF] text-white shadow-sm` + 左侧 3px 白色竖线指示器 | 无 |
| 全填 | `bg-[#22C55E] text-white` | 无 |
| 部分填 | `bg-[#F59E0B] text-white` | 右上角小圆 `filled/total`（9px，白底 amber 字） |
| 未填 | `bg-gray-100 text-gray-400` | 无 |

**分组间隔**：每组之间 8px 间距。第一部分（6 格）、第二部分（4 格）、第三部分（8 格）、第四部分（3 格）、第五部分（1 格）。

**第五部分孤号处理**：在孤号下方加一行小字「终」（11px，gray-400），暗示"最后一题"而非断行。分组标签「第五部分」正常显示在组上方。

栏底固定按钮「查看注意事项」：`text-xs text-gray-400 hover:text-[#4F7CFF]`。

### 4.7 后台状态方块（三态）

与学生端侧栏同色系，但尺寸 32×32px，圆角 4px（后台偏数据密集，方块更紧凑）：
| 状态 | 样式 |
|------|------|
| 全填 | `bg-[#22C55E] text-white` |
| 部分填 | `bg-[#F59E0B] text-white` + 右上角角标 |
| 未填 | `bg-gray-200 text-gray-400` |

分组间隔同学生端（8px），每组上方有小字标签。

### 4.8 状态标签

| 标签 | 样式 |
|------|------|
| 必交（xlsx） | `el-tag type="danger" size="small"` — 红底白字 |
| 加分项（zip） | `el-tag type="info" size="small"` — 灰底 |
| 已交卷 | `el-tag type="success" size="small"` — 绿底白字 |
| 未交卷 | `el-tag type="info" size="small"` — 灰底 |
| 已保存 | `text-[13px] text-[#22C55E]` — 绿字 |
| 保存中… | `text-[13px] text-[#F59E0B]` — 黄字 + spinner |
| 保存失败 | `text-[13px] text-[#EF4444]` — 红字，可点击重试 |

---

## 五、页面布局示意

### 页面 1：登录页

```
┌─────────────────────────────────────────────┐
│              bg-gray-50 全屏居中              │
│                                             │
│         ┌───────────────────────┐           │
│         │  信息素养大赛          │           │
│         │  28px bold, gray-900  │           │
│         │                       │           │
│         │  请登录以开始答题      │           │
│         │  15px, gray-400       │           │
│         │                       │           │
│         │  ┌─────────────────┐  │           │
│         │  │ 学号            │  │           │
│         │  └─────────────────┘  │           │
│         │                       │           │
│         │  ┌─────────────────┐  │           │
│         │  │ 姓名            │  │           │
│         │  └─────────────────┘  │           │
│         │                       │           │
│         │  ┌─────────────────┐  │           │
│         │  │    登  录       │  │           │
│         │  │  primary 按钮   │  │           │
│         │  └─────────────────┘  │           │
│         │                       │           │
│         │  错误提示（红字）      │           │
│         └───────────────────────┘           │
│           max-w-sm, 白色圆角卡片, shadow-sm  │
└─────────────────────────────────────────────┘
```

- 卡片宽 max-w-sm (384px)，`rounded-2xl shadow-sm border border-gray-100`
- 背景 `bg-gray-50`，可选加一层浅色渐变底（`bg-gradient-to-b from-white to-gray-50`）增添层次
- 登录按钮全宽，`mt-2` 与输入框间距

### 页面 2：说明卡片

```
┌─────────────────────────────────────────────┐
│  header: 信息素养大赛 · 学生名（学号）  退出  │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  max-w-lg, 白色卡片, rounded-2xl     │    │
│  │                                     │    │
│  │  🎯 欢迎参加信息素养大赛             │    │
│  │  20px semibold                      │    │
│  │                                     │    │
│  │  ┌─ 倒计时 ─────────────────────┐   │    │
│  │  │  距开赛还有 02:15:30         │   │    │
│  │  │  数字用 primary 色大号字      │   │    │
│  │  └──────────────────────────────┘   │    │
│  │                                     │    │
│  │  📋 注意事项                        │    │
│  │  · 可以使用 AI 辅助                 │    │
│  │  · 如实作答即可                     │    │
│  │  · 写"不知道"也欢迎                 │    │
│  │  15px gray-700, 条目间 mt-2         │    │
│  │                                     │    │
│  │  ┌─────────────────────────┐        │    │
│  │  │    开始答题 →            │        │    │
│  │  │  primary 按钮, 居中      │        │    │
│  │  └─────────────────────────┘        │    │
│  │  未到时间时：disabled + 提示文字      │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### 页面 3：答题页（核心）

```
┌────┬──────────────────────────────────────────────┐
│    │  header: 信息素养大赛 · 学生名  退出          │
│ 侧 ├──────────────────────────────────────────────┤
│ 边 │                                              │
│ 题 │  内容区 max-w-[720px] mx-auto                │
│ 号 │                                              │
│ 栏 │  ── 第一部分 · 你平时怎么用电脑 ──           │
│    │  20px semibold, gray-900, 左侧竖线装饰       │
│ w  │                                              │
│ 48 │  ① Q1: 你平时用电脑主要在干什么？             │
│ px │     16px medium, gray-900                    │
│    │     [ ] 上课/看网课  [ ] 写作业               │
│ ┌┐ │     [ ] 做PPT       [ ] 打游戏               │
│ │1│ │     卡片式 checkbox, 2列 grid                │
│ │ │ │                                              │
│ │2│ │  ② Q2: 平均每天用电脑的时间                  │
│ │ │ │     [ ] 基本不用  [ ] 1h以内  [ ] 1-3h      │
│ │3│ │     卡片式 radio, 3-4列                       │
│ │⋮│ │                                              │
│ │ │ │  ··· Q3 Q4 Q5 Q6 ···                        │
│ └┘ │                                              │
│    │  ── 第二部分 · 你平时怎么用AI ──              │
│ ┌┐ │  mt-12 (48px 分区间距)                        │
│ │7│ │                                              │
│ │⋮│ │  ⑦ Q7 ~ ⑩ Q10                              │
│ └┘ │                                              │
│    │  ── 第三部分 · 信息操作 ──                    │
│ ┌┐ │                                              │
│ │11│  ⑪ Q11: 目录管理·文件去哪了                   │
│ │⋮│ │  16px medium 题面                            │
│ │ │ │  ┌─ ① 它最可能在哪？ ─────────────┐         │
│ └┘ │  │  textarea, 120px高               │         │
│    │  └──────────────────────────────────┘         │
│ ┌┐ │  ┌─ ② 你怎么能快速找到它？ ─────────┐        │
│ │19│  │  textarea, 120px高               │         │
│ │⋮│ │  └──────────────────────────────────┘        │
│ │ │ │  ┌─ ③ 以后怎么避免再找不到？ ───────┐       │
│ └┘ │  │  textarea, 120px高               │         │
│    │  └──────────────────────────────────┘         │
│ ┌┐ │  左侧竖线连接3个小问（2px primary-light）     │
│ │22│ │                                              │
│ │⑤│  ··· Q12-Q21 同理 ···                         │
│    │                                              │
│ 终 │  ── 第五部分 · 与AI协作的方法论 ──            │
│    │                                              │
│ 查 │  ⑫ Q22: 交流断层（35分）                     │
│ 看 │  5个小问 textarea                             │
│ 注 │                                              │
│ 意 │  ── 实践题提交 ──                             │
│ 事 │                                              │
│ 项 │  [下载参赛材料]                               │
│    │                                              │
│    │  上传 Excel  [选择文件]  ★必交                │
│    │  上传 zip    [选择文件]  加分项                │
│    │                                              │
│    │  ┌─────────────────────────┐                  │
│    │  │    提交答卷              │                  │
│    │  └─────────────────────────┘                  │
│    │                                              │
└────┴──────────────────────────────────────────────┘
```

**三个设计难点的解法**：

**难点 1：第五部分孤号**

侧栏分组布局（纵向）：
```
第一部分    ← 组标签，11px gray-400
┌──┬──┬──┬──┬──┬──┐
│ 1│ 2│ 3│ 4│ 5│ 6│
└──┴──┴──┴──┴──┴──┘
        ↓ 8px 间隔
第二部分
┌──┬──┬──┬──┐
│ 7│ 8│ 9│10│
└──┴──┴──┴──┘
        ↓ 8px 间隔
第三部分
┌──┬──┬──┬──┬──┬──┬──┬──┐
│11│12│13│14│15│16│17│18│
└──┴──┴──┴──┴──┴──┴──┴──┘
        ↓ 8px 间隔
第四部分
┌──┬──┬──┐
│19│20│21│
└──┴──┴──┘
        ↓ 8px 间隔
第五部分
┌──┐
│22│
└──┘
 终  ← 11px gray-400 小字，暗示"终点"
```

「终」字解决了两个问题：① 不像断行/渲染错误；② 给用户心理暗示"快填完了"。

**难点 2：22 题长表单的节奏感**

五层手段叠加，让人"愿意一直填下去"：

1. **分区标题**：每个部分之间 48px 间距 + 左侧 3px primary 竖线装饰 + 部分标题20px semibold。视觉上像翻页。
2. **题型交替**：checkbox → radio → text → checkbox → radio → scale → text...题型变化本身就是节奏。连续 text 题（第三部分开始）靠小问编号 ①②③ 提供结构感。
3. **进度反馈**：header 右侧 sticky 显示 `已填 12/22`，侧栏实时变绿，给"往前推进"的正反馈。
4. **卡片分割**：每题用 `bg-white rounded-xl border border-gray-100 p-6` 包裹，题与题之间有 32px 间距 + 浅灰底的呼吸空间。
5. **保存状态**：每题右下角显示 `✓ 已保存` / `⟳ 保存中…`，给安全感。

**难点 3：50 个输入框不显空白**

小问区采用"紧凑堆叠 + 左侧连接线"布局：
```
① 它最可能在哪？
┌──────────────────────────────────┐
│                                  │  ← textarea 120px高
│                                  │
└──────────────────────────────────┘
        ↓ 12px 间距
② 你怎么能快速找到它？
┌──────────────────────────────────┐
│                                  │
└──────────────────────────────────┘
        ↓ 12px 间距
③ 以后怎么避免再找不到？
┌──────────────────────────────────┐
│                                  │
└──────────────────────────────────┘
```

- 小问标签 ①②③ 用 `text-[15px] font-medium text-gray-700`，前缀圆圈用 primary 色
- textarea 固定高度 120px（3–4 行），`resize: vertical` 允许用户拉高
- 三个小问整体左侧加 2px `border-l-2 border-[#EEF2FF]` 竖线，视觉上归属同一题
- 每题的"题面描述"（情境部分）用 `text-base font-medium text-gray-900`，明显比小问标签大

### 页面 4：后台

```
┌──────────────────────────────────────────────────┐
│  后台管理  150名学生 · 12人已交卷    [退出] [学生端] │
├──────────────────────────────────────────────────┤
│                                                  │
│  [导入名单]  [导出CSV]  [刷新]                    │
│                                                  │
│  ┌────┬──────┬────┬──────┬──────┬─────┬────┬───┐ │
│  │展开│ 学号 │姓名│ 学院 │已填  │交卷 │xlsx│zip│ │
│  ├────┼──────┼────┼──────┼──────┼─────┼────┼───┤ │
│  │ >  │2026..│李明│计算机│12/50│已交 │ ✓  │ — │ │
│  ├────┴──────┴────┴──────┴──────┴─────┴────┴───┤ │
│  │  展开行：                                     │ │
│  │  第一部分                                     │ │
│  │  [1][2][3][4][5][6]                           │ │
│  │  第二部分                                     │ │
│  │  [7][8][9][10]                                │ │
│  │  第三部分                                     │ │
│  │  [11][12][13][14][15][16][17][18]             │ │
│  │  第四部分                                     │ │
│  │  [19][20][21]                                 │ │
│  │  第五部分                                     │ │
│  │  [22]                                         │ │
│  │                                               │ │
│  │  ■ 全填  ■ 部分填  ■ 未填                     │ │
│  ├────┬──────┬────┬──────┬──────┬─────┬────┬───┤ │
│  │ >  │TEST01│王五│信工  │ 0/50│未交 │ —  │ — │ │
│  └────┴──────┴────┴──────┴──────┴─────┴────┴───┘ │
│                                                  │
│  注：后台表格用全宽（max-w-7xl），比学生端更紧凑   │
└──────────────────────────────────────────────────┘
```

- 表格：`el-table stripe border`，Element Plus 默认 + 主题变量覆盖
- 展开行方块：32×32px，`gap-1.5`，分组间 8px 间隔，组标签 12px gray-400
- 后台整体底色 `bg-gray-50`，操作栏白色卡片 `p-4 rounded-lg shadow-sm`

---

## 六、暗色 / 切换

**不做**。任务书已确认只做浅色。不在设计中预留暗色变量。

---

## 七、转译清单（设计稿 → 执行任务）

设计确认后，按以下粒度落地：

| 设计产出 | 落地位置 | 改法 |
|----------|----------|------|
| 配色 HEX | `client/src/style.css` | `:root` CSS 变量覆盖（见§一） |
| 字号阶梯 | 各 view 的 Tailwind class | 文本元素逐个调 class |
| 间距规范 | 各 view 的 Tailwind class | 容器/子元素间距调整 |
| 侧栏题号样式 | `QuestionnaireView.vue` | 侧栏组件 class 重写 |
| 后台方块样式 | `AdminView.vue` | 方块 class 重写 |
| checkbox/radio 卡片式 | `QuestionnaireView.vue` | 选项渲染改为卡片式 div |
| 量表样式 | `QuestionnaireView.vue` | 方块横排 |
| 登录页样式 | `LoginView.vue` | 卡片 class 调整 |
| 说明卡片样式 | `ExamIntroCard.vue` | class 调整 |
| 后台整体样式 | `AdminView.vue` | class 调整 |

**不动**：组件树结构、接口调用、交互逻辑、状态管理。
