<script setup lang="ts">
// 批卷页面（任务 19b）：三栏布局——左栏题号索引、中栏批卷主区、右栏学生列表。
// 入口：AdminView 点击「批卷」按钮后通过 ?admin&grade=<学号> 进入。
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { PARTS } from '../questions-meta'

// ---- Props & Emits ----

const props = defineProps<{ studentId: string; adminKey: string }>()
const emit = defineEmits<{ (e: 'back'): void; (e: 'grade', studentId: string): void }>()

// ---- 类型 ----

interface Question {
  no: number
  part: string
  scored: boolean
  points: number
  type: string
  prompt: string
  options?: string[]
  scaleMax?: number
  subs?: { subNo: number; text: string }[]
}

interface StudentAnswer {
  questionNo: number
  subNo: number
  answerText: string
  updatedAt: string
}

interface ScoreEntry {
  questionNo: number
  score: number
}

interface StudentDetail {
  student: {
    studentId: string
    name: string
    college: string
    class: string
    submittedAt: string
    loggedIn: boolean
  }
  answers: StudentAnswer[]
  scores: ScoreEntry[]
  practicalScores: { dimension: string; score: number }[]
  uploads: { id: number; type: string; path: string; at: string }[]
}

interface StudentListItem {
  studentId: string
  name: string
  college: string
  submitted: boolean
  scoredCount: number
  score: number | null
  maxScore: number
  practicalScore: number | null
  practicalMax: number
}

// ---- 状态 ----

const questions = ref<Question[]>([])
const studentDetail = ref<StudentDetail | null>(null)
const studentList = ref<StudentListItem[]>([])
const scoresMap = ref<Record<number, number>>({})
const loading = ref(true)
const savingMap = ref<Record<number, 'saving' | 'saved' | 'error'>>({})
const currentQuestionNo = ref<number | null>(null)
const questionRefs = ref<Record<number, HTMLElement | null>>({})
const sidebarCollapsed = ref(window.innerWidth < 1024)
const studentListCollapsed = ref(window.innerWidth < 1024)

// ---- 产物预览 ----

interface SheetPreview {
  name: string
  rows: (string | number | boolean | null)[][]
  totalRows: number
  totalCols: number
  truncated: boolean
}

interface ZipFileEntry {
  name: string
  size: number
}

const previewVisible = ref(false)
const previewLoading = ref(false)
const previewType = ref<'xlsx' | 'zip'>('xlsx')
const previewFileName = ref('')
const previewSheets = ref<SheetPreview[]>([])
const previewZipFiles = ref<ZipFileEntry[]>([])
const activeSheetIndex = ref(0)
const sheetPage = ref(1)
const SHEET_PAGE_SIZE = 50

// ---- 实践题打分 ----

interface PracticalDimension {
  key: string
  label: string
  max: number
}

const practicalDimensions = ref<PracticalDimension[]>([])
const practicalScoresMap = ref<Record<string, number>>({})
const practicalSavingMap = ref<Record<string, 'saving' | 'saved' | 'error'>>({})

const practicalTotal = computed(() => {
  let sum = 0
  for (const d of practicalDimensions.value) {
    const s = practicalScoresMap.value[d.key]
    if (s !== undefined) sum += s
  }
  return sum
})

const practicalScoredCount = computed(() => {
  return practicalDimensions.value.filter((d) => practicalScoresMap.value[d.key] !== undefined).length
})

// ---- 计分题 ----

const scoredQuestions = computed(() => questions.value.filter((q) => q.scored))
const scoredQuestionNos = computed(() => scoredQuestions.value.map((q) => q.no))

// 按五部分分组（全部 22 题）
const allGroups = computed(() => {
  const groups: { label: string; questions: Question[] }[] = []
  for (const part of PARTS) {
    const qs = questions.value.filter(
      (q) => q.no >= part.range[0] && q.no <= part.range[1]
    )
    if (qs.length > 0) groups.push({ label: part.label, questions: qs })
  }
  return groups
})

// ---- 总分计算 ----

const totalScore = computed(() => {
  let sum = 0
  for (const q of scoredQuestions.value) {
    const s = scoresMap.value[q.no]
    if (s !== undefined) sum += s
  }
  return sum
})

const scoredCount = computed(() => {
  return scoredQuestions.value.filter((q) => scoresMap.value[q.no] !== undefined).length
})

// ---- API 工具 ----

async function adminFetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('X-Admin-Key', props.adminKey)
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401 || res.status === 403) {
    ElMessage.error('admin key 无效或已过期')
    emit('back')
    throw new Error('AUTH_FAILED')
  }
  return res
}

// ---- 加载题目 ----

async function loadQuestions() {
  const res = await fetch('/api/questions')
  const data = await res.json()
  if (data.ok) questions.value = data.questions
}

// ---- 加载学生列表 ----

async function loadStudentList() {
  try {
    const res = await adminFetch('/api/admin/students')
    const data = await res.json()
    if (data.ok) studentList.value = data.students
  } catch {
    // 已由 adminFetch 处理鉴权失败
  }
}

// ---- 加载学生详情 ----

async function loadStudentDetail(studentId: string) {
  loading.value = true
  try {
    const res = await adminFetch(`/api/admin/student/${studentId}`)
    const data = await res.json()
    if (!data.ok) throw new Error(data.msg || '加载失败')
    studentDetail.value = data

    // 初始化分数映射
    const map: Record<number, number> = {}
    for (const s of data.scores) {
      map[s.questionNo] = s.score
    }
    scoresMap.value = map

    // 初始化实践题分数映射
    const pMap: Record<string, number> = {}
    for (const ps of data.practicalScores || []) {
      pMap[ps.dimension] = ps.score
    }
    practicalScoresMap.value = pMap

    // 滚动到第一题
    await nextTick()
    scrollToQuestion(scoredQuestionNos.value[0] || 11)
  } catch (e) {
    if ((e as Error).message !== 'AUTH_FAILED') {
      ElMessage.error((e as Error).message || '加载学生详情失败')
    }
  } finally {
    loading.value = false
  }
}

// ---- 加载实践题维度定义 ----

async function loadPracticalDimensions() {
  try {
    const res = await adminFetch('/api/admin/practical-dimensions')
    const data = await res.json()
    if (data.ok) practicalDimensions.value = data.dimensions
  } catch {
    // 已由 adminFetch 处理鉴权失败
  }
}

// ---- 保存实践题分数 ----

async function savePracticalScore(dimension: string, score: number) {
  practicalSavingMap.value[dimension] = 'saving'
  try {
    const res = await adminFetch('/api/admin/practical-score', {
      method: 'POST',
      body: JSON.stringify({
        studentId: props.studentId,
        dimension,
        score,
      }),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.msg || '保存失败')
    practicalScoresMap.value[dimension] = score
    practicalSavingMap.value[dimension] = 'saved'
    setTimeout(() => {
      if (practicalSavingMap.value[dimension] === 'saved') {
        delete practicalSavingMap.value[dimension]
      }
    }, 2000)
  } catch (e) {
    practicalSavingMap.value[dimension] = 'error'
    ElMessage.error((e as Error).message || '保存失败')
  }
}

function onPracticalScoreChange(dimension: string, value: number | undefined) {
  if (value === undefined) return
  void savePracticalScore(dimension, value)
}

function getPracticalSaveStatus(key: string): string {
  const s = practicalSavingMap.value[key]
  if (s === 'saving') return '保存中…'
  if (s === 'saved') return '已保存'
  if (s === 'error') return '保存失败'
  return ''
}

function getPracticalSaveStatusClass(key: string): string {
  const s = practicalSavingMap.value[key]
  if (s === 'saving') return 'text-[#F59E0B]'
  if (s === 'saved') return 'text-[#22C55E]'
  if (s === 'error') return 'text-[#EF4444]'
  return ''
}

// ---- 保存分数 ----

async function saveScore(questionNo: number, score: number) {
  savingMap.value[questionNo] = 'saving'
  try {
    const res = await adminFetch('/api/admin/score', {
      method: 'POST',
      body: JSON.stringify({
        studentId: props.studentId,
        questionNo,
        score,
      }),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.msg || '保存失败')
    scoresMap.value[questionNo] = score
    savingMap.value[questionNo] = 'saved'
    // 2 秒后清除 saved 状态
    setTimeout(() => {
      if (savingMap.value[questionNo] === 'saved') {
        delete savingMap.value[questionNo]
      }
    }, 2000)
  } catch (e) {
    savingMap.value[questionNo] = 'error'
    ElMessage.error((e as Error).message || '保存失败')
  }
}

function onScoreChange(questionNo: number, value: number | undefined) {
  if (value === undefined) return
  void saveScore(questionNo, value)
}

// ---- 获取某题某小问的答案 ----

function getAnswer(questionNo: number, subNo: number): string {
  if (!studentDetail.value) return ''
  const ans = studentDetail.value.answers.find(
    (a) => a.questionNo === questionNo && a.subNo === subNo
  )
  return ans?.answerText || ''
}

// ---- 导航 ----

const submittedStudents = computed(() =>
  studentList.value.filter((s) => s.submitted)
)

const currentStudentIndex = computed(() =>
  submittedStudents.value.findIndex((s) => s.studentId === props.studentId)
)

const canGoPrev = computed(() => currentStudentIndex.value > 0)
const canGoNext = computed(() => currentStudentIndex.value < submittedStudents.value.length - 1)

function goPrev() {
  if (!canGoPrev.value) return
  const s = submittedStudents.value[currentStudentIndex.value - 1]
  navigateToStudent(s.studentId)
}

function goNext() {
  if (!canGoNext.value) return
  const s = submittedStudents.value[currentStudentIndex.value + 1]
  navigateToStudent(s.studentId)
}

function navigateToStudent(studentId: string) {
  emit('grade', studentId)
}

// ---- 题号跳转 ----

function scrollToQuestion(no: number) {
  currentQuestionNo.value = no
  const el = questionRefs.value[no]
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

// ---- 响应式：切换学生时重新加载 ----

watch(
  () => props.studentId,
  (newId) => {
    if (newId) void loadStudentDetail(newId)
  }
)

// ---- 窄屏检测 ----

const isNarrow = ref(window.innerWidth < 1024)
function onResize() {
  isNarrow.value = window.innerWidth < 1024
}

// ---- 保存状态文案 ----

function getSaveStatus(no: number): string {
  const s = savingMap.value[no]
  if (s === 'saving') return '保存中…'
  if (s === 'saved') return '已保存'
  if (s === 'error') return '保存失败'
  return ''
}

function getSaveStatusClass(no: number): string {
  const s = savingMap.value[no]
  if (s === 'saving') return 'text-[#F59E0B]'
  if (s === 'saved') return 'text-[#22C55E]'
  if (s === 'error') return 'text-[#EF4444]'
  return ''
}

// ---- 右侧列表中每个学生的状态文案 ----

function getStudentStatus(s: StudentListItem): { text: string; class: string } {
  if (!s.submitted) return { text: '未交卷', class: 'text-gray-400' }
  if (s.scoredCount >= 12) return { text: '已批完', class: 'text-[#22C55E]' }
  return { text: `已评 ${s.scoredCount}/12`, class: 'text-[#F59E0B]' }
}

// ---- 产物预览 ----

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

async function openPreview(uploadId: number, type: string) {
  previewType.value = type as 'xlsx' | 'zip'
  previewLoading.value = true
  previewVisible.value = true
  previewSheets.value = []
  previewZipFiles.value = []
  activeSheetIndex.value = 0
  sheetPage.value = 1
  previewFileName.value = ''

  try {
    const res = await adminFetch(`/api/admin/upload/${uploadId}/preview`)
    const data = await res.json()
    if (!data.ok) throw new Error(data.msg || '预览失败')
    previewFileName.value = data.fileName || ''
    if (data.type === 'xlsx') {
      previewSheets.value = data.sheets
    } else if (data.type === 'zip') {
      previewZipFiles.value = data.files
    }
  } catch (e) {
    if ((e as Error).message !== 'AUTH_FAILED') {
      ElMessage.error((e as Error).message || '预览加载失败')
    }
    previewVisible.value = false
  } finally {
    previewLoading.value = false
  }
}

const activeSheet = computed(() => previewSheets.value[activeSheetIndex.value] || null)

/** 提取首行作为列头；首行为空或不存在时退回序号 */
const sheetHeaders = computed(() => {
  if (!activeSheet.value || activeSheet.value.rows.length === 0) return []
  const firstRow = activeSheet.value.rows[0]
  // 首行全为空则退回序号
  const hasHeader = firstRow.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
  if (!hasHeader) {
    return firstRow.map((_, ci) => String(ci + 1))
  }
  return firstRow.map((cell) => String(cell ?? ''))
})

/** 数据行（跳过首行表头） */
const sheetDataRows = computed(() => {
  if (!activeSheet.value) return []
  // 有表头时跳过首行，无表头时保留全部
  const hasHeader = activeSheet.value.rows.length > 0 &&
    activeSheet.value.rows[0].some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
  return hasHeader ? activeSheet.value.rows.slice(1) : activeSheet.value.rows
})

const sheetTotalPages = computed(() => Math.ceil(sheetDataRows.value.length / SHEET_PAGE_SIZE) || 1)
const sheetPageRows = computed(() => {
  const start = (sheetPage.value - 1) * SHEET_PAGE_SIZE
  return sheetDataRows.value.slice(start, start + SHEET_PAGE_SIZE)
})

function switchSheet(index: number) {
  activeSheetIndex.value = index
  sheetPage.value = 1
}

// ---- 初始化 ----

onMounted(() => {
  window.addEventListener('resize', onResize)
  void Promise.all([loadQuestions(), loadStudentList(), loadPracticalDimensions()]).then(() => {
    void loadStudentDetail(props.studentId)
  })
})
</script>

<template>
  <div class="flex h-screen flex-col bg-gray-50">
    <!-- 顶栏 -->
    <header class="flex-shrink-0 border-b border-gray-100 bg-white">
      <div class="flex items-center justify-between px-4 py-3 lg:px-6">
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="text-sm text-gray-400 transition hover:text-[#4F7CFF]"
            @click="emit('back')"
          >
            ← 返回列表
          </button>
          <span v-if="studentDetail" class="text-sm font-medium text-gray-700">
            {{ studentDetail.student.name }}（{{ studentDetail.student.studentId }}）
            <span v-if="studentDetail.student.college" class="text-gray-400">· {{ studentDetail.student.college }}</span>
          </span>
        </div>
        <div v-if="studentDetail" class="flex items-center gap-4">
          <div class="flex items-center gap-1">
            <span class="text-sm text-gray-500">基础题</span>
            <span class="text-lg font-bold text-[#4F7CFF]">{{ totalScore }}</span>
            <span class="text-sm text-gray-400">/ 100</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="text-sm text-gray-500">实践题</span>
            <span class="text-lg font-bold text-[#22C55E]">{{ practicalTotal }}</span>
            <span class="text-sm text-gray-400">/ 100</span>
          </div>
        </div>
      </div>
    </header>

    <!-- 主体三栏 -->
    <div class="flex min-h-0 flex-1">
      <!-- 左栏·题号索引 -->
      <aside
        v-show="!isNarrow || !sidebarCollapsed"
        class="flex-shrink-0 overflow-y-auto border-r border-gray-100 bg-white py-4"
        :class="isNarrow ? 'absolute inset-y-0 left-0 z-20 w-48 shadow-lg' : 'w-48'"
      >
        <div class="px-3">
          <p class="mb-3 text-xs font-medium text-gray-500">
            已评 <span class="text-[#4F7CFF]">{{ scoredCount }}</span>/12 题
          </p>
          <div v-for="group in allGroups" :key="group.label" class="mb-4 last:mb-0">
            <p class="mb-1.5 text-[11px] font-medium text-gray-400">{{ group.label }}</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="q in group.questions"
                :key="q.no"
                type="button"
                class="flex h-8 w-8 items-center justify-center rounded-[4px] text-xs font-semibold transition select-none"
                :class="
                  !q.scored
                    ? currentQuestionNo === q.no
                      ? 'bg-gray-300 text-white shadow-sm'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                    : currentQuestionNo === q.no
                      ? 'bg-[#4F7CFF] text-white shadow-sm'
                      : scoresMap[q.no] !== undefined
                        ? 'bg-[#22C55E] text-white'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                "
                @click="scrollToQuestion(q.no)"
              >
                {{ q.no }}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <!-- 窄屏遮罩 -->
      <div
        v-if="isNarrow && !sidebarCollapsed"
        class="fixed inset-0 z-10 bg-black/20"
        @click="sidebarCollapsed = true"
      />

      <!-- 中栏·批卷主区 -->
      <main class="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <!-- 窄屏工具栏 -->
        <div v-if="isNarrow" class="flex items-center gap-2 border-b border-gray-100 bg-white px-4 py-2">
          <button
            type="button"
            class="text-xs text-gray-500 hover:text-[#4F7CFF]"
            @click="sidebarCollapsed = !sidebarCollapsed"
          >
            {{ sidebarCollapsed ? '展开题号' : '收起题号' }}
          </button>
          <span class="text-gray-300">|</span>
          <button
            type="button"
            class="text-xs text-gray-500 hover:text-[#4F7CFF]"
            @click="studentListCollapsed = !studentListCollapsed"
          >
            {{ studentListCollapsed ? '展开学生列表' : '收起学生列表' }}
          </button>
        </div>

        <!-- 题目列表 -->
        <div class="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <div v-if="loading" class="flex items-center justify-center py-20">
            <span class="text-sm text-gray-400">加载中…</span>
          </div>
          <div v-else-if="!studentDetail" class="flex items-center justify-center py-20">
            <span class="text-sm text-gray-400">未找到学生数据</span>
          </div>
          <div v-else class="mx-auto max-w-3xl space-y-8">
            <section
              v-for="q in questions"
              :key="q.no"
              :ref="(el) => { if (el) questionRefs[q.no] = el as HTMLElement }"
              class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
            >
              <!-- 题面 -->
              <div class="mb-4">
                <div class="mb-2 flex items-center gap-2">
                  <span
                    class="inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs font-semibold"
                    :class="q.scored ? 'bg-[#EEF2FF] text-[#4F7CFF]' : 'bg-gray-100 text-gray-400'"
                  >
                    Q{{ q.no }}
                  </span>
                  <span v-if="q.scored" class="text-[13px] text-gray-400">{{ q.points }} 分</span>
                  <span v-else class="text-[13px] text-gray-300">不计分·画像</span>
                </div>
                <p class="whitespace-pre-line text-base font-medium leading-relaxed text-gray-900">
                  {{ q.prompt }}
                </p>
              </div>

              <!-- 各小问答案 -->
              <div v-if="q.subs && q.subs.length > 0" class="mb-6 space-y-3 border-l-2 border-[#EEF2FF] pl-4">
                <div v-for="sub in q.subs" :key="sub.subNo">
                  <p class="mb-1 text-[15px] font-medium text-gray-700">{{ sub.text }}</p>
                  <div
                    class="whitespace-pre-line rounded-lg bg-gray-50 px-4 py-3 text-[15px] leading-relaxed text-gray-700"
                  >
                    {{ getAnswer(q.no, sub.subNo) || '（未作答）' }}
                  </div>
                </div>
              </div>
              <!-- 无小问的题直接显示答案 -->
              <div v-else class="mb-6">
                <div
                  class="whitespace-pre-line rounded-lg bg-gray-50 px-4 py-3 text-[15px] leading-relaxed text-gray-700"
                >
                  {{ getAnswer(q.no, 0) || '（未作答）' }}
                </div>
              </div>

              <!-- 打分框（仅计分题） -->
              <div v-if="q.scored" class="flex items-center gap-3 border-t border-gray-100 pt-4">
                <span class="text-sm text-gray-500">得分</span>
                <el-input-number
                  :model-value="scoresMap[q.no]"
                  :min="0"
                  :max="q.points"
                  :step="1"
                  controls-position="right"
                  size="default"
                  @change="(val: number | undefined) => onScoreChange(q.no, val)"
                />
                <span class="text-sm text-gray-400">/ {{ q.points }}</span>
                <span
                  v-if="getSaveStatus(q.no)"
                  class="ml-auto text-[13px]"
                  :class="getSaveStatusClass(q.no)"
                >
                  {{ getSaveStatus(q.no) }}
                </span>
              </div>
            </section>

            <!-- 实践题成果 -->
            <section class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <div class="mb-4 flex items-center gap-2">
                <span class="inline-flex h-6 min-w-6 items-center justify-center rounded bg-[#EEF2FF] px-1.5 text-xs font-semibold text-[#4F7CFF]">
                  实践题
                </span>
                <span class="text-[13px] text-gray-400">学生上传文件</span>
              </div>
              <div v-if="studentDetail.uploads.length === 0" class="text-sm text-gray-400">
                未上传任何文件
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="u in studentDetail.uploads"
                  :key="u.id"
                  class="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3"
                >
                  <div class="min-w-0 flex-1">
                    <span class="text-sm font-medium text-gray-700">{{ u.path.split('/').pop() }}</span>
                    <span class="ml-2 text-xs text-gray-400">({{ u.type.toUpperCase() }})</span>
                  </div>
                  <el-button size="small" type="primary" plain @click="openPreview(u.id, u.type)">
                    预览
                  </el-button>
                </div>
              </div>

              <!-- 实践题打分 -->
              <div v-if="practicalDimensions.length > 0" class="mt-6 border-t border-gray-100 pt-4">
                <p class="mb-3 text-sm font-medium text-gray-700">实践题评分</p>
                <div class="space-y-3">
                  <div
                    v-for="d in practicalDimensions"
                    :key="d.key"
                    class="flex items-center gap-3"
                  >
                    <span class="min-w-[140px] text-sm text-gray-600">{{ d.label }}</span>
                    <el-input-number
                      :model-value="practicalScoresMap[d.key]"
                      :min="0"
                      :max="d.max"
                      :step="1"
                      controls-position="right"
                      size="default"
                      @change="(val: number | undefined) => onPracticalScoreChange(d.key, val)"
                    />
                    <span class="text-sm text-gray-400">/ {{ d.max }}</span>
                    <span
                      v-if="getPracticalSaveStatus(d.key)"
                      class="ml-auto text-[13px]"
                      :class="getPracticalSaveStatusClass(d.key)"
                    >
                      {{ getPracticalSaveStatus(d.key) }}
                    </span>
                  </div>
                </div>
                <p class="mt-3 text-sm text-gray-500">
                  实践题总分：<span class="font-medium text-[#22C55E]">{{ practicalTotal }}</span> / 100
                  <span v-if="practicalScoredCount < practicalDimensions.length" class="ml-2 text-gray-400">
                    （已评 {{ practicalScoredCount }}/{{ practicalDimensions.length }}）
                  </span>
                </p>
              </div>
            </section>
          </div>
        </div>

        <!-- 底部状态栏（sticky） -->
        <div
          class="flex flex-shrink-0 items-center justify-between border-t border-gray-100 bg-white px-4 py-2 lg:px-8"
        >
          <div class="flex items-center gap-4">
            <span class="text-[13px] text-gray-500">
              已评 <span class="font-medium text-[#4F7CFF]">{{ scoredCount }}</span>/12
            </span>
            <span class="text-[13px] text-gray-500">
              基础 <span class="font-medium text-[#4F7CFF]">{{ totalScore }}</span>/100
            </span>
            <span class="text-[13px] text-gray-500">
              实践 <span class="font-medium text-[#22C55E]">{{ practicalTotal }}</span>/100
            </span>
          </div>
          <div>
            <span
              v-if="Object.values(savingMap).includes('saving')"
              class="text-[13px] text-[#F59E0B]"
            >
              保存中…
            </span>
            <span
              v-else-if="Object.values(savingMap).includes('error')"
              class="text-[13px] text-[#EF4444]"
            >
              有保存失败
            </span>
          </div>
        </div>
      </main>

      <!-- 右栏·学生列表 -->
      <aside
        v-show="!isNarrow || !studentListCollapsed"
        class="flex-shrink-0 overflow-y-auto border-l border-gray-100 bg-white"
        :class="isNarrow ? 'absolute inset-y-0 right-0 z-20 w-64 shadow-lg' : 'w-64'"
      >
        <!-- 顶部导航 -->
        <div class="sticky top-0 z-10 border-b border-gray-100 bg-white px-3 py-3">
          <div class="flex items-center justify-between">
            <el-button size="small" :disabled="!canGoPrev" @click="goPrev">
              ← 上一份
            </el-button>
            <el-button size="small" :disabled="!canGoNext" @click="goNext">
              下一份 →
            </el-button>
          </div>
          <p v-if="studentDetail" class="mt-2 text-center text-xs text-gray-400">
            已评 {{ scoredCount }}/12 · 基础 {{ totalScore }} · 实践 {{ practicalTotal }}
          </p>
        </div>

        <!-- 学生列表 -->
        <div class="px-2 py-2">
          <button
            v-for="s in studentList"
            :key="s.studentId"
            type="button"
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition"
            :class="[
              s.studentId === props.studentId
                ? 'bg-[#EEF2FF] text-[#4F7CFF] font-medium'
                : s.submitted
                  ? 'text-gray-700 hover:bg-gray-50 cursor-pointer'
                  : 'text-gray-400 cursor-not-allowed',
            ]"
            :disabled="!s.submitted"
            @click="s.submitted && navigateToStudent(s.studentId)"
          >
            <div class="min-w-0 flex-1 truncate">
              <span>{{ s.name }}</span>
              <span class="ml-1 text-xs text-gray-400">{{ s.studentId }}</span>
            </div>
            <span
              class="ml-2 flex-shrink-0 text-xs"
              :class="getStudentStatus(s).class"
            >
              {{ getStudentStatus(s).text }}
            </span>
          </button>
        </div>
      </aside>

      <!-- 窄屏右栏遮罩 -->
      <div
        v-if="isNarrow && !studentListCollapsed"
        class="fixed inset-0 z-10 bg-black/20"
        @click="studentListCollapsed = true"
      />
    </div>

    <!-- 产物预览弹窗 -->
    <el-dialog
      v-model="previewVisible"
      :title="previewFileName ? `预览 · ${previewFileName}` : '预览'"
      width="90%"
      top="5vh"
      destroy-on-close
      class="preview-dialog"
    >
      <div v-if="previewLoading" class="flex items-center justify-center py-12">
        <span class="text-sm text-gray-400">加载中…</span>
      </div>

      <!-- xlsx 预览 -->
      <div v-else-if="previewType === 'xlsx' && previewSheets.length > 0">
        <!-- Sheet 切换标签 -->
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <button
            v-for="(sheet, idx) in previewSheets"
            :key="sheet.name"
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-medium transition"
            :class="
              idx === activeSheetIndex
                ? 'bg-[#4F7CFF] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            "
            @click="switchSheet(idx)"
          >
            {{ sheet.name }}
          </button>
        </div>

        <!-- 当前 Sheet 信息 -->
        <div v-if="activeSheet" class="mb-3 flex items-center gap-4 text-sm text-gray-500">
          <span>共 <strong>{{ sheetDataRows.length }}</strong> 行数据</span>
          <span>共 <strong>{{ activeSheet.totalCols }}</strong> 列</span>
          <span v-if="activeSheet.truncated" class="text-[#F59E0B]">
            仅显示前 1000 行，完整内容请下载原文件
          </span>
        </div>

        <!-- 分页表格 -->
        <div v-if="activeSheet" class="overflow-x-auto rounded-lg border border-gray-200">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr class="bg-gray-50">
                <th
                  v-for="(header, ci) in sheetHeaders"
                  :key="ci"
                  class="whitespace-nowrap border-b border-r border-gray-200 px-3 py-2 text-left font-medium text-gray-600"
                >
                  {{ header || ci + 1 }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ri) in sheetPageRows" :key="ri" class="border-b border-gray-100 last:border-0">
                <td
                  v-for="(cell, ci) in row"
                  :key="ci"
                  class="whitespace-nowrap border-r border-gray-100 px-3 py-1.5 text-gray-700 last:border-r-0"
                >
                  {{ cell }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 分页控制 -->
        <div v-if="sheetTotalPages > 1" class="mt-3 flex items-center justify-between">
          <span class="text-xs text-gray-400">每页 {{ SHEET_PAGE_SIZE }} 行</span>
          <el-pagination
            v-model:current-page="sheetPage"
            :page-size="SHEET_PAGE_SIZE"
            :total="sheetDataRows.length"
            layout="prev, pager, next"
            small
          />
        </div>
      </div>

      <!-- zip 预览 -->
      <div v-else-if="previewType === 'zip'">
        <p class="mb-3 text-sm text-gray-500">
          文件清单（不渲染内容，防止 XSS）
        </p>
        <div class="overflow-hidden rounded-lg border border-gray-200">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-gray-50">
                <th class="border-b border-r border-gray-200 px-4 py-2 text-left font-medium text-gray-600">文件名</th>
                <th class="border-b border-gray-200 px-4 py-2 text-right font-medium text-gray-600">大小</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in previewZipFiles" :key="f.name" class="border-b border-gray-100 last:border-0">
                <td class="border-r border-gray-100 px-4 py-2 text-gray-700">{{ f.name }}</td>
                <td class="px-4 py-2 text-right text-gray-500">{{ formatFileSize(f.size) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 无法解析 -->
      <div v-else class="py-8 text-center text-sm text-gray-400">
        无法加载预览
      </div>
    </el-dialog>
  </div>
</template>
