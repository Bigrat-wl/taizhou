// 题目元数据（仅 no + subs 数），供 AdminView 渲染 22 格方块用。
// 与 server/questions.js 保持同步；无小问的题 subs = 1（一个输入框算一个 sub）。

export interface QuestionMeta {
  no: number
  part: string
  subs: number
}

export const PARTS = [
  { label: '第一部分', range: [1, 6] as const },
  { label: '第二部分', range: [7, 10] as const },
  { label: '第三部分', range: [11, 18] as const },
  { label: '第四部分', range: [19, 21] as const },
  { label: '第五部分', range: [22, 22] as const },
]

// 每题的总小问数（无小问的题 = 1）
export const QUESTION_SUB_COUNTS: Record<number, number> = {
  1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1,
  7: 1, 8: 1, 9: 1, 10: 1,
  11: 3, 12: 3, 13: 3, 14: 3, 15: 3, 16: 3, 17: 2, 18: 2,
  19: 5, 20: 4, 21: 4,
  22: 5,
}