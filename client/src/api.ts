// 前端与后端打交道的公共小工具：token 存取 + 带 Authorization 的 fetch。
// 骨架阶段不引入状态管理库，登录态就存在 localStorage。

const TOKEN_KEY = 'quiz_token'
const STUDENT_KEY = 'quiz_student'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAuth(token: string, student: unknown): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(STUDENT_KEY, JSON.stringify(student))
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(STUDENT_KEY)
}

/** 带 token 的 fetch；401 时抛 UNAUTHORIZED，调用方可据此退出登录 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  // 只对字符串 body 加 JSON Content-Type，FormData 让浏览器自动带 multipart 边界
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(input, { ...init, headers })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  return res
}
