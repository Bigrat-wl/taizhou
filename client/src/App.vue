<script setup lang="ts">
// 学生端壳（任务 13）：登录后按 my-progress 落到说明卡片或答题页。
// 状态恢复契约见 docs/contracts/api.md「状态恢复规则」。
import { computed, onMounted, ref } from 'vue'
import { apiFetch, clearAuth, getToken, setAuth } from './api'
import LoginView from './views/LoginView.vue'
import ExamIntroCard from './views/ExamIntroCard.vue'
import QuestionnaireView from './views/QuestionnaireView.vue'
import AdminView from './views/AdminView.vue'
import GradeView from './views/GradeView.vue'

const searchParams = ref(new URLSearchParams(location.search))
const isAdminRoute = computed(() => searchParams.value.has('admin'))
const gradeStudentId = computed(() => searchParams.value.get('grade') || '')
const isGradeRoute = computed(() => isAdminRoute.value && !!gradeStudentId.value)

const AUTH_KEY = 'quiz_admin_key'
const adminKey = computed(() => sessionStorage.getItem(AUTH_KEY) || '')

function navigateTo(path: string) {
  history.pushState(null, '', path)
  searchParams.value = new URLSearchParams(location.search)
}

function goAdmin() {
  navigateTo('/?admin')
}

function goGrade(studentId: string) {
  navigateTo(`/?admin&grade=${studentId}`)
}

// 监听浏览器前进/后退
window.addEventListener('popstate', () => {
  searchParams.value = new URLSearchParams(location.search)
})

type Student = {
  studentId: string
  name: string
  college: string | null
  class: string | null
}

type Screen = 'boot' | 'intro' | 'exam'

const storedStudent = localStorage.getItem('quiz_student')
const student = ref<Student | null>(storedStudent ? JSON.parse(storedStudent) : null)
const token = ref<string | null>(getToken())
const screen = ref<Screen>('boot')
const bootError = ref('')

const isLoggedIn = ref(Boolean(token.value))

async function bootstrap() {
  if (!isLoggedIn.value) {
    screen.value = 'intro'
    return
  }
  screen.value = 'boot'
  bootError.value = ''
  try {
    const res = await apiFetch('/api/my-progress')
    const data = (await res.json()) as {
      ok: boolean
      submitted?: boolean
      answeredCount?: number
      msg?: string
    }
    if (!res.ok || !data.ok) throw new Error(data.msg || `HTTP ${res.status}`)
    // 已交卷或已有答案 → 直接进答题页；否则说明卡片
    if (data.submitted || (data.answeredCount ?? 0) > 0) {
      screen.value = 'exam'
    } else {
      screen.value = 'intro'
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      logout()
      return
    }
    // 网络失败时不挡人：进答题页，由 QuestionnaireView 自己再拉一次
    bootError.value = e instanceof Error ? e.message : '网络异常'
    screen.value = 'exam'
  }
}

function onLoggedIn(payload: { token: string; student: Student }) {
  setAuth(payload.token, payload.student)
  token.value = payload.token
  student.value = payload.student
  isLoggedIn.value = true
  void bootstrap()
}

function logout() {
  clearAuth()
  token.value = null
  student.value = null
  isLoggedIn.value = false
  screen.value = 'intro'
}

onMounted(() => {
  void bootstrap()
})
</script>

<template>
  <GradeView
    v-if="isGradeRoute"
    :student-id="gradeStudentId"
    :admin-key="adminKey"
    @back="goAdmin"
    @grade="goGrade"
  />

  <AdminView
    v-else-if="isAdminRoute"
    @grade="goGrade"
  />

  <LoginView v-else-if="!isLoggedIn" @logged-in="onLoggedIn" />

  <div v-else class="min-h-screen bg-gray-50">
    <header class="border-b border-gray-100 bg-white">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <div>
          <h1 class="text-base font-semibold text-gray-900">信息素养大赛</h1>
          <p class="text-xs text-gray-400">
            {{ student?.name }}（{{ student?.studentId }}）
            <span v-if="student?.college"> · {{ student.college }}</span>
          </p>
        </div>
        <button
          type="button"
          class="text-sm text-gray-400 transition hover:text-[#EF4444]"
          @click="logout"
        >
          退出登录
        </button>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-6 py-8">
      <div
        v-if="screen === 'boot'"
        class="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400"
      >
        正在恢复上次进度…
      </div>
      <ExamIntroCard v-else-if="screen === 'intro'" @start="screen = 'exam'" />
      <QuestionnaireView v-else />
    </main>
  </div>
</template>
