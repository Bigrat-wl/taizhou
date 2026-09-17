<script setup lang="ts">
// 后台管理页面（任务 5b）：导入名单、状态看板、填写方块、导出 CSV。
// 入口：App.vue 检测 ?admin 参数后渲染本组件。
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { PARTS, QUESTION_SUB_COUNTS } from '../questions-meta'

// ---- 类型 ----

interface Student {
  studentId: string
  name: string
  college: string
  answered: { questionNo: number; subNo: number }[]
  total: number
  submitted: boolean
  loggedIn: boolean
  scoredCount: number
  score: number | null
  maxScore: number
  answeredQuestions: number[]
  xlsx: boolean
  zip: boolean
}

// ---- 状态 ----

const AUTH_KEY = 'quiz_admin_key'
const adminKey = ref(sessionStorage.getItem(AUTH_KEY) || '')
const isAuthed = ref(!!adminKey.value)
const authError = ref('')
const keyInput = ref(adminKey.value)

const students = ref<Student[]>([])
const loading = ref(false)
const importing = ref(false)

// ---- 鉴权 ----

function saveKey() {
  const k = keyInput.value.trim()
  if (!k) {
    authError.value = '请输入 admin key'
    return
  }
  adminKey.value = k
  sessionStorage.setItem(AUTH_KEY, k)
  isAuthed.value = true
  authError.value = ''
  void fetchStudents()
}

function clearKey() {
  sessionStorage.removeItem(AUTH_KEY)
  adminKey.value = ''
  isAuthed.value = false
  keyInput.value = ''
  students.value = []
}

// ---- 上传 ----

const noopRequest = () => new Promise<void>((resolve) => resolve())

// ---- API 工具 ----

async function adminFetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('X-Admin-Key', adminKey.value)
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401 || res.status === 403) {
    clearKey()
    ElMessage.error('admin key 无效或已过期，请重新输入')
    throw new Error('AUTH_FAILED')
  }
  return res
}

// ---- 学生列表 ----

async function fetchStudents() {
  loading.value = true
  try {
    const res = await adminFetch('/api/admin/students')
    const data = await res.json()
    if (!data.ok) throw new Error(data.msg || '加载失败')
    students.value = data.students
  } catch (e) {
    if ((e as Error).message !== 'AUTH_FAILED') {
      ElMessage.error((e as Error).message || '加载学生列表失败')
    }
  } finally {
    loading.value = false
  }
}

// ---- 导入名单 ----

async function handleImport(uploadFile: unknown) {
  const file = (uploadFile as { file: File }).file
  importing.value = true
  try {
    // 先查当前数据量
    const overviewRes = await adminFetch('/api/admin/overview')
    const overview = await overviewRes.json()
    if (!overview.ok) throw new Error(overview.msg || '查询数据量失败')

    const { studentCount, answerCount, uploadCount } = overview
    if (studentCount > 0 || answerCount > 0 || uploadCount > 0) {
      await ElMessageBox.confirm(
        `当前已有 ${studentCount} 名学生、${answerCount} 条答案、${uploadCount} 个上传文件。导入新名单将清空全部数据，确定继续？`,
        '⚠️ 破坏性操作',
        { confirmButtonText: '确认导入', cancelButtonText: '取消', type: 'warning' },
      )
    }

    // 执行导入
    const form = new FormData()
    form.append('file', file)
    const res = await adminFetch('/api/admin/import', { method: 'POST', body: form })
    const data = await res.json()
    if (!data.ok) throw new Error(data.msg || '导入失败')
    ElMessage.success(`成功导入 ${data.imported} 名学生`)
    await fetchStudents()
  } catch (e) {
    if ((e as Error).message === 'AUTH_FAILED') return
    if ((e as string) === 'cancel') return // 用户取消确认框
    ElMessage.error((e as Error).message || '导入失败')
  } finally {
    importing.value = false
  }
}

// ---- 导出 CSV ----

async function handleExport() {
  try {
    const res = await adminFetch('/api/admin/export')
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error((data as { msg?: string }).msg || `HTTP ${res.status}`)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'quiz-export.csv'
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (e) {
    if ((e as Error).message === 'AUTH_FAILED') return
    ElMessage.error((e as Error).message || '导出失败')
  }
}

// ---- 方块渲染 ----

type CellState = 'full' | 'partial' | 'empty'

/** el-table expand 插槽的 row 类型是 DefaultRow，这里做安全转换 */
function asStudent(row: unknown): Student {
  return row as Student
}

function getQuestionState(student: Student, qNo: number): { state: CellState; filled: number; total: number } {
  const total = QUESTION_SUB_COUNTS[qNo] || 1
  // answered 里 subNo=0 的题算 1 个 sub
  const filled = student.answered.filter((a) => a.questionNo === qNo).length
  if (filled === 0) return { state: 'empty', filled: 0, total }
  if (filled >= total) return { state: 'full', filled, total }
  return { state: 'partial', filled, total }
}

// ---- 统计 ----

const submittedCount = computed(() => students.value.filter((s) => s.submitted).length)

// ---- 批卷导航 ----

const emit = defineEmits<{ (e: 'grade', studentId: string): void }>()

function openGrade(studentId: string) {
  emit('grade', studentId)
}

// ---- 初始化 ----

onMounted(() => {
  if (isAuthed.value) void fetchStudents()
})
</script>

<template>
  <!-- 鉴权门 -->
  <div v-if="!isAuthed" class="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <div class="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 class="mb-1 text-lg font-semibold text-slate-900">后台管理</h1>
      <p class="mb-6 text-sm text-slate-500">请输入 admin key 以继续</p>
      <el-input
        v-model="keyInput"
        type="password"
        show-password
        placeholder="Admin Key"
        size="large"
        @keyup.enter="saveKey"
      />
      <p v-if="authError" class="mt-2 text-sm text-red-500">{{ authError }}</p>
      <el-button type="primary" size="large" class="mt-4 w-full" @click="saveKey">
        进入后台
      </el-button>
    </div>
  </div>

  <!-- 主界面 -->
  <div v-else class="min-h-screen bg-gray-50">
    <!-- 顶栏 -->
    <header class="border-b border-gray-100 bg-white">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div>
          <h1 class="text-base font-semibold text-gray-900">后台管理</h1>
          <p class="text-xs text-gray-400">
            {{ students.length }} 名学生 · {{ submittedCount }} 人已交卷
          </p>
        </div>
        <div class="flex items-center gap-3">
          <el-button @click="clearKey" size="small">退出后台</el-button>
          <a href="/" class="text-sm text-gray-400 transition hover:text-[#4F7CFF]">
            返回学生端
          </a>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <!-- 操作栏 -->
      <div class="flex flex-wrap items-center gap-4">
        <el-upload
          :show-file-list="false"
          :http-request="(noopRequest as any)"
          :before-upload="() => false"
          accept=".xlsx,.xls,.csv"
          :disabled="importing"
          @change="handleImport as any"
        >
          <el-button type="primary" :loading="importing">导入名单</el-button>
        </el-upload>
        <el-button @click="handleExport" :disabled="students.length === 0">导出 CSV</el-button>
        <el-button @click="fetchStudents" :loading="loading" plain>刷新</el-button>
      </div>

      <!-- 学生列表 -->
      <el-table
        :data="students"
        v-loading="loading"
        stripe
        border
        size="default"
        row-key="studentId"
        class="w-full"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="px-6 py-4">
              <div v-for="part in PARTS" :key="part.label" class="mb-3 last:mb-0">
                <p class="mb-1.5 text-[11px] font-medium text-gray-400">{{ part.label }}</p>
                <div class="flex flex-wrap gap-1.5">
                  <div
                    v-for="qNo in part.range[1] - part.range[0] + 1"
                    :key="qNo"
                    :title="`Q${part.range[0] + qNo - 1}`"
                    class="relative flex h-8 w-8 items-center justify-center rounded-[4px] text-xs font-semibold select-none"
                    :class="{
                      'bg-[#A5BFFF] text-white': getQuestionState(asStudent(row), part.range[0] + qNo - 1).state === 'full',
                      'bg-[#F59E0B] text-white': getQuestionState(asStudent(row), part.range[0] + qNo - 1).state === 'partial',
                      'bg-gray-200 text-gray-400': getQuestionState(asStudent(row), part.range[0] + qNo - 1).state === 'empty',
                    }"
                  >
                    <span>{{ part.range[0] + qNo - 1 }}</span>
                    <!-- 部分填角标 -->
                    <span
                      v-if="getQuestionState(asStudent(row), part.range[0] + qNo - 1).state === 'partial'"
                      class="absolute -right-1 -top-1 rounded-full bg-white px-1 text-[9px] font-bold text-[#F59E0B] shadow-sm ring-1 ring-[#F59E0B]"
                    >
                      {{ getQuestionState(asStudent(row), part.range[0] + qNo - 1).filled }}/{{ getQuestionState(asStudent(row), part.range[0] + qNo - 1).total }}
                    </span>
                  </div>
                </div>
              </div>
              <div class="mt-3 flex gap-4 text-xs text-gray-400">
                <span class="flex items-center gap-1">
                  <span class="inline-block h-3 w-3 rounded bg-[#A5BFFF]"></span> 全填
                </span>
                <span class="flex items-center gap-1">
                  <span class="inline-block h-3 w-3 rounded bg-[#F59E0B]"></span> 部分填
                </span>
                <span class="flex items-center gap-1">
                  <span class="inline-block h-3 w-3 rounded bg-gray-200"></span> 未填
                </span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="studentId" label="学号" width="130" sortable />
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="college" label="学院" min-width="120" show-overflow-tooltip />
        <el-table-column label="已填进度" width="110" sortable :sort-method="(a: Student, b: Student) => a.total - b.total">
          <template #default="{ row }">
            <span class="font-medium text-[#4F7CFF]">{{ row.total }}</span>
            <span class="text-gray-400"> / 50</span>
          </template>
        </el-table-column>
        <el-table-column label="交卷" width="70" align="center">
          <template #default="{ row }">
            <el-tag :type="row.submitted ? 'success' : 'info'" size="small">
              {{ row.submitted ? '已交' : '未交' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="登录状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.loggedIn ? 'success' : 'info'" size="small">
              {{ row.loggedIn ? '已登录' : '未登录' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="得分" width="90" align="center">
          <template #default="{ row }">
            <span v-if="row.score !== null" class="font-medium text-[#4F7CFF]">{{ row.score }}<span class="text-gray-400">/{{ row.maxScore }}</span></span>
            <span v-else class="text-gray-400">未评</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              type="primary"
              :disabled="!row.submitted"
              @click="openGrade(row.studentId)"
            >
              批卷
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="xlsx" width="70" align="center">
          <template #default="{ row }">
            <span :class="row.xlsx ? 'text-[#22C55E]' : 'text-gray-300'">
              {{ row.xlsx ? '✓' : '—' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="zip" width="70" align="center">
          <template #default="{ row }">
            <span :class="row.zip ? 'text-[#22C55E]' : 'text-gray-300'">
              {{ row.zip ? '✓' : '—' }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </main>
  </div>
</template>