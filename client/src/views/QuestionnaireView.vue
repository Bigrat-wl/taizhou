<script setup lang="ts">
// 答题页（任务 13）：小问独立输入/保存、侧栏小问进度+分区分隔、末尾上传、交卷锁定。
// 契约：docs/contracts/api.md（subNo、my-progress、submit、upload）。
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { ComponentPublicInstance, Ref } from 'vue'
import { apiFetch, getToken } from '../api'
import { EXAM_NOTES } from '../examNotes'

type QuestionType = 'checkbox' | 'single' | 'scale' | 'text'
type Sub = { subNo: number; text: string }

type Question = {
  no: number
  part: string
  scored: boolean
  type: QuestionType
  prompt: string
  options?: string[]
  scaleMax?: number
  subs?: Sub[]
}

type QuestionsResponse = { ok: boolean; questions?: Question[]; msg?: string }

type AnswerSlot = { questionNo: number; subNo: number }
type AnswerRow = AnswerSlot & { answerText: string }

type ProgressResponse = {
  ok: boolean
  answered?: AnswerSlot[]
  answeredCount?: number
  total?: number
  submitted?: boolean
  answers?: AnswerRow[]
  msg?: string
}

type SaveState = 'saving' | 'saved' | 'error'
type UploadType = 'xlsx' | 'zip'
type UploadItem = { type: UploadType; path: string; at: string }
type Message = { kind: 'ok' | 'err'; text: string }

const PART_TITLES: Record<string, string> = {
  第一部分: '你平时怎么用电脑',
  第二部分: '你平时怎么用 AI',
  第三部分: '信息操作',
  第四部分: 'AI 素养',
  第五部分: '与 AI 协作的方法论',
}

const SEPARATOR = '，'
const SEPARATOR_RE = /[，,]/
const SAVE_DEBOUNCE_MS = 600
const CACHE_KEY_PREFIX = 'quiz_answers_'

const questions = ref<Question[]>([])
const loading = ref(true)
const loadError = ref('')
const saveError = ref('')
const restoreNotice = ref('')
const submitted = ref(false)
const submitting = ref(false)
const showNotes = ref(false)

const textAnswers = ref<Record<number, string>>({})
const multiAnswers = ref<Record<number, string[]>>({})
const scaleAnswers = ref<Record<number, number | null>>({})
const otherTextAnswers = ref<Record<number, string>>({})
/** 小问答案：key = `${no}:${subNo}` */
const subAnswers = ref<Record<string, string>>({})

const saveState = ref<Record<string, SaveState>>({})
const pending = new Map<string, ReturnType<typeof setTimeout>>()

// ── 上传（从 UploadView 迁入）────────────────────────────────────────
const uploadSlots: {
  type: UploadType
  title: string
  required: boolean
  accept: string
  hint: string
}[] = [
  {
    type: 'xlsx',
    title: '实践成果表（xlsx）',
    required: true,
    accept: '.xlsx',
    hint: '必交：填写完成的 xlsx 成果表。可以点击选择，也可以直接拖进来。',
  },
  {
    type: 'zip',
    title: '网页源码（zip）',
    required: false,
    accept: '.zip',
    hint: '选交：如果做了网页，把源码打成 zip 上传。网页请打包成 zip 再拖进来。',
  },
]
const uploads = ref<UploadItem[]>([])
const uploadFiles = reactive<Record<UploadType, File | null>>({ xlsx: null, zip: null })
const uploadInputEls: Record<UploadType, Ref<HTMLInputElement | null>> = {
  xlsx: ref<HTMLInputElement | null>(null),
  zip: ref<HTMLInputElement | null>(null),
}
const uploadsLoading = ref(false)
const uploading = ref<UploadType | null>(null)
const uploadMessage = ref<Message | null>(null)
const draggingOver = ref<UploadType | null>(null)
const dragCounters: Record<UploadType, number> = { xlsx: 0, zip: 0 }

const uploadedByType = computed<Partial<Record<UploadType, UploadItem>>>(() => {
  const map: Partial<Record<UploadType, UploadItem>> = {}
  for (const item of uploads.value) map[item.type] = item
  return map
})

const sections = computed(() => {
  const order: string[] = []
  const grouped = new Map<string, Question[]>()
  for (const q of questions.value) {
    if (!grouped.has(q.part)) {
      grouped.set(q.part, [])
      order.push(q.part)
    }
    grouped.get(q.part)?.push(q)
  }
  return order.map((part) => {
    const list = grouped.get(part) ?? []
    return {
      part,
      title: PART_TITLES[part] ?? part,
      scored: list.some((q) => q.scored),
      questions: list,
    }
  })
})

function slotKey(no: number, subNo: number): string {
  return `${no}:${subNo}`
}

function subCount(q: Question): number {
  return q.subs && q.subs.length > 0 ? q.subs.length : 1
}

function hasSlotAnswer(no: number, subNo: number): boolean {
  const q = questions.value.find((item) => item.no === no)
  if (!q) return false
  if (q.subs && q.subs.length > 0) {
    return (subAnswers.value[slotKey(no, subNo)] ?? '').trim() !== ''
  }
  if (q.type === 'checkbox') return (multiAnswers.value[no] ?? []).length > 0
  if (q.type === 'scale') return scaleAnswers.value[no] != null
  return (textAnswers.value[no] ?? '').trim() !== ''
}

function questionFilledCount(q: Question): number {
  if (q.subs && q.subs.length > 0) {
    let filled = 0
    for (const sub of q.subs) {
      if (hasSlotAnswer(q.no, sub.subNo)) filled += 1
    }
    return filled
  }
  return hasSlotAnswer(q.no, 0) ? 1 : 0
}

function isQuestionComplete(q: Question): boolean {
  return questionFilledCount(q) >= subCount(q)
}

const total = computed(() =>
  questions.value.reduce((n, q) => n + subCount(q), 0)
)
const answeredCount = computed(() =>
  questions.value.reduce((n, q) => n + questionFilledCount(q), 0)
)
const percent = computed(() =>
  total.value ? Math.round((answeredCount.value / total.value) * 100) : 0
)
const canSubmit = computed(() => !submitted.value && total.value > 0 && answeredCount.value >= total.value)

const activeQuestionNo = ref<number | null>(null)
let scrollLockUntil = 0

function scrollToQuestion(no: number) {
  const element = document.querySelector(`[data-qno="${no}"]`)
  if (!element) return
  activeQuestionNo.value = no
  scrollLockUntil = Date.now() + 1000
  element.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function handleScroll() {
  if (Date.now() < scrollLockUntil) return
  const els = document.querySelectorAll('[data-qno]')
  const threshold = 96
  let currentNo: number | null = null
  for (const el of els) {
    const rect = el.getBoundingClientRect()
    if (rect.top <= threshold) {
      currentNo = parseInt(el.getAttribute('data-qno') || '0', 10)
    } else break
  }
  if (currentNo == null && els.length > 0) {
    if (els[0].getBoundingClientRect().bottom > 0) {
      currentNo = parseInt(els[0].getAttribute('data-qno') || '0', 10)
    }
  }
  if (currentNo != null) activeQuestionNo.value = currentNo
}

function statusText(no: number): string {
  if (submitted.value) return '已交卷'
  const q = questions.value.find((item) => item.no === no)
  const keys: string[] = []
  if (q?.subs?.length) {
    for (const sub of q.subs) keys.push(slotKey(no, sub.subNo))
  } else {
    keys.push(slotKey(no, 0))
  }
  const states = keys.map((k) => saveState.value[k]).filter(Boolean)
  if (states.includes('error')) return '保存失败'
  if (states.includes('saving')) return '保存中…'
  if (states.includes('saved')) return '已保存'
  if (q && isQuestionComplete(q)) return '已填'
  if (q && questionFilledCount(q) > 0) {
    return `${questionFilledCount(q)}/${subCount(q)}`
  }
  return ''
}

function statusClass(no: number): string {
  const q = questions.value.find((item) => item.no === no)
  const keys: string[] = []
  if (q?.subs?.length) {
    for (const sub of q.subs) keys.push(slotKey(no, sub.subNo))
  } else keys.push(slotKey(no, 0))
  if (keys.some((k) => saveState.value[k] === 'error')) return 'text-[#EF4444]'
  if (keys.some((k) => saveState.value[k] === 'saving')) return 'text-[#F59E0B]'
  return 'text-[#22C55E]'
}

function serialize(no: number, subNo: number): string {
  const q = questions.value.find((item) => item.no === no)
  if (!q) return ''
  if (q.subs && q.subs.length > 0) {
    return (subAnswers.value[slotKey(no, subNo)] ?? '').trim()
  }
  if (q.type === 'checkbox') {
    const selected = multiAnswers.value[no] ?? []
    if (selected.includes('其他') && otherTextAnswers.value[no]) {
      const otherText = `其他：${otherTextAnswers.value[no]}`
      return [...selected.filter((item) => item !== '其他'), otherText].join(SEPARATOR)
    }
    return selected.join(SEPARATOR)
  }
  if (q.type === 'single') {
    const value = textAnswers.value[no]
    if (value === '其他' && otherTextAnswers.value[no]) {
      return `其他：${otherTextAnswers.value[no]}`
    }
    return value ?? ''
  }
  if (q.type === 'scale') {
    const value = scaleAnswers.value[no]
    return value == null ? '' : String(value)
  }
  return (textAnswers.value[no] ?? '').trim()
}

function fillAnswer(no: number, subNo: number, answerText: string) {
  const q = questions.value.find((item) => item.no === no)
  if (!q) return
  if (q.subs && q.subs.length > 0) {
    subAnswers.value[slotKey(no, subNo)] = answerText
    return
  }
  if (q.type === 'checkbox') {
    const items = answerText.split(SEPARATOR_RE).map((item) => item.trim()).filter(Boolean)
    const otherItem = items.find((item) => item.startsWith('其他：'))
    if (otherItem) {
      multiAnswers.value[no] = [...items.filter((item) => !item.startsWith('其他：')), '其他']
      otherTextAnswers.value[no] = otherItem.replace('其他：', '')
    } else {
      multiAnswers.value[no] = items
    }
  } else if (q.type === 'single') {
    if (answerText.startsWith('其他：')) {
      textAnswers.value[no] = '其他'
      otherTextAnswers.value[no] = answerText.replace('其他：', '')
    } else {
      textAnswers.value[no] = answerText
    }
  } else if (q.type === 'scale') {
    const value = Number(answerText)
    const max = q.scaleMax ?? 5
    scaleAnswers.value[no] = Number.isFinite(value) && value >= 1 && value <= max ? value : null
  } else {
    textAnswers.value[no] = answerText
  }
}

function cacheKey(): string {
  try {
    const raw = localStorage.getItem('quiz_student')
    const student = raw ? (JSON.parse(raw) as { studentId?: string }) : null
    if (student?.studentId) return CACHE_KEY_PREFIX + student.studentId
  } catch {
    /* ignore */
  }
  return `${CACHE_KEY_PREFIX}anonymous`
}

function writeCache() {
  const snapshot: Record<string, string> = {}
  for (const q of questions.value) {
    if (q.subs && q.subs.length > 0) {
      for (const sub of q.subs) {
        const text = serialize(q.no, sub.subNo)
        if (text) snapshot[slotKey(q.no, sub.subNo)] = text
      }
    } else {
      const text = serialize(q.no, 0)
      if (text) snapshot[slotKey(q.no, 0)] = text
    }
  }
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(snapshot))
  } catch {
    /* ignore */
  }
}

function readCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(cacheKey())
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

async function saveAnswer(no: number, subNo: number) {
  if (submitted.value) return
  const answerText = serialize(no, subNo)
  const key = slotKey(no, subNo)
  saveState.value = { ...saveState.value, [key]: 'saving' }
  saveError.value = ''

  try {
    const res = await apiFetch('/api/answer', {
      method: 'POST',
      body: JSON.stringify({ questionNo: no, subNo, answerText }),
    })
    const data = (await res.json()) as { ok: boolean; msg?: string }
    if (!res.ok || !data.ok) throw new Error(data.msg || `HTTP ${res.status}`)
    saveState.value = { ...saveState.value, [key]: 'saved' }
    writeCache()
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      saveError.value = '登录已失效，请重新登录后再填。'
    } else if (e instanceof Error && e.message.includes('尚未开赛')) {
      saveError.value = '尚未开赛，到点后才能保存答案。'
    } else {
      const label = subNo > 0 ? `第 ${no} 题第 ${subNo} 小问` : `第 ${no} 题`
      saveError.value = `${label}保存失败：${e instanceof Error ? e.message : '网络异常'}`
    }
    saveState.value = { ...saveState.value, [key]: 'error' }
  }
}

function scheduleSave(no: number, subNo = 0) {
  const key = slotKey(no, subNo)
  const timer = pending.get(key)
  if (timer) clearTimeout(timer)
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key)
      void saveAnswer(no, subNo)
    }, SAVE_DEBOUNCE_MS)
  )
}

function saveNow(no: number, subNo = 0) {
  const key = slotKey(no, subNo)
  const timer = pending.get(key)
  if (timer) {
    clearTimeout(timer)
    pending.delete(key)
  }
  void saveAnswer(no, subNo)
}

function flushPending() {
  for (const [key, timer] of pending) {
    clearTimeout(timer)
    const [noStr, subStr] = key.split(':')
    void saveAnswer(Number(noStr), Number(subStr))
  }
  pending.clear()
}

function onVisibilityChange() {
  if (document.visibilityState === 'hidden') flushPending()
}

function pickScale(no: number, value: number) {
  scaleAnswers.value[no] = value
  saveNow(no, 0)
}

function clearScale(no: number) {
  scaleAnswers.value[no] = null
  saveNow(no, 0)
}

function getGridClass(): string {
  return 'grid-cols-1 md:grid-cols-2'
}

function getColSpanClass(index: number, options: string[]): string {
  if (options.length % 2 === 1 && index === options.length - 1) return 'md:col-span-2'
  return ''
}

// ── 上传 ─────────────────────────────────────────────────────────────
function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function setUploadInput(type: UploadType, el: Element | ComponentPublicInstance | null) {
  uploadInputEls[type].value = (el as HTMLInputElement | null) ?? null
}

function fmtTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('zh-CN', { hour12: false })
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function onPickUpload(type: UploadType, event: Event) {
  const input = event.target as HTMLInputElement
  uploadFiles[type] = input.files?.[0] ?? null
  uploadMessage.value = null
}

async function loadUploads() {
  uploadsLoading.value = true
  try {
    const res = await fetch('/api/my-uploads', { headers: authHeaders() })
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean
      uploads?: UploadItem[]
      msg?: string
    } | null
    if (res.status === 401) {
      uploadMessage.value = { kind: 'err', text: '登录已过期，请退出后重新登录' }
      return
    }
    if (!res.ok || !data?.ok) {
      uploadMessage.value = {
        kind: 'err',
        text: data?.msg ?? `读取已传文件失败（HTTP ${res.status}）`,
      }
      return
    }
    uploads.value = data.uploads ?? []
  } catch {
    uploadMessage.value = { kind: 'err', text: '网络异常，读取已传文件失败' }
  } finally {
    uploadsLoading.value = false
  }
}

async function doUpload(type: UploadType) {
  if (submitted.value) return
  const file = uploadFiles[type]
  if (!file) {
    uploadMessage.value = { kind: 'err', text: '请先选择文件' }
    return
  }
  const expectExt = type === 'xlsx' ? '.xlsx' : '.zip'
  if (!file.name.toLowerCase().endsWith(expectExt)) {
    uploadMessage.value = {
      kind: 'err',
      text: `${uploadSlots.find((s) => s.type === type)?.title} 只能传 ${expectExt} 文件`,
    }
    return
  }

  uploading.value = type
  uploadMessage.value = null
  try {
    const form = new FormData()
    form.append('type', type)
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', headers: authHeaders(), body: form })
    const data = (await res.json().catch(() => null)) as { ok?: boolean; file?: string; msg?: string } | null
    if (res.status === 401) {
      uploadMessage.value = { kind: 'err', text: '登录已过期，请退出后重新登录' }
      return
    }
    if (!res.ok || !data?.ok) {
      uploadMessage.value = { kind: 'err', text: data?.msg ?? `上传失败（HTTP ${res.status}）` }
      return
    }
    uploadMessage.value = { kind: 'ok', text: `上传成功：${data.file}` }
    uploadFiles[type] = null
    if (uploadInputEls[type].value) uploadInputEls[type].value.value = ''
    await loadUploads()
  } catch {
    uploadMessage.value = { kind: 'err', text: '网络异常，上传失败' }
  } finally {
    uploading.value = null
  }
}

// ── 拖拽上传 ──────────────────────────────────────────────────────────
function onDragEnter(type: UploadType, e: DragEvent) {
  e.preventDefault()
  dragCounters[type]++
  draggingOver.value = type
}

function onDragLeave(type: UploadType, e: DragEvent) {
  e.preventDefault()
  dragCounters[type]--
  if (dragCounters[type] <= 0) {
    dragCounters[type] = 0
    draggingOver.value = null
  }
}

function onDragOver(_type: UploadType, e: DragEvent) {
  e.preventDefault()
}

function onDrop(type: UploadType, e: DragEvent) {
  e.preventDefault()
  dragCounters[type] = 0
  draggingOver.value = null

  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  if (files.length > 1) {
    uploadMessage.value = { kind: 'err', text: '一次只能传一个文件，网页请打包成 zip' }
    return
  }

  const file = files[0]
  const name = file.name.toLowerCase()
  const expectExt = type === 'xlsx' ? '.xlsx' : '.zip'
  if (!name.endsWith(expectExt)) {
    uploadMessage.value = { kind: 'err', text: '只支持 .xlsx 或 .zip 文件' }
    return
  }

  uploadFiles[type] = file
  uploadMessage.value = null
  void doUpload(type)
}

// ── 交卷 ─────────────────────────────────────────────────────────────
async function submitExam() {
  if (!canSubmit.value || submitting.value) return
  const ok = window.confirm('确认交卷吗？交卷后不能再修改答案。')
  if (!ok) return
  submitting.value = true
  saveError.value = ''
  try {
    flushPending()
    await new Promise((r) => setTimeout(r, 200))
    const res = await apiFetch('/api/submit', { method: 'POST' })
    const data = (await res.json()) as { ok: boolean; msg?: string }
    if (!res.ok || !data.ok) throw new Error(data.msg || `HTTP ${res.status}`)
    submitted.value = true
    writeCache()
  } catch (e) {
    saveError.value = `交卷失败：${e instanceof Error ? e.message : '网络异常'}`
  } finally {
    submitting.value = false
  }
}

// ── 加载 ─────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  loadError.value = ''
  restoreNotice.value = ''
  try {
    const [questionsRes, progressRes] = await Promise.all([
      fetch('/api/questions'),
      apiFetch('/api/my-progress'),
    ])

    const questionsData = (await questionsRes.json()) as QuestionsResponse
    if (!questionsRes.ok || !questionsData.ok || !questionsData.questions) {
      throw new Error(questionsData.msg || '题目加载失败')
    }
    questions.value = questionsData.questions

    const texts: Record<number, string> = {}
    const multis: Record<number, string[]> = {}
    const scales: Record<number, number | null> = {}
    const subs: Record<string, string> = {}
    for (const q of questions.value) {
      if (q.subs && q.subs.length > 0) {
        for (const sub of q.subs) subs[slotKey(q.no, sub.subNo)] = ''
      } else if (q.type === 'checkbox') {
        multis[q.no] = []
      } else if (q.type === 'scale') {
        scales[q.no] = null
      } else {
        texts[q.no] = ''
      }
    }
    textAnswers.value = texts
    multiAnswers.value = multis
    scaleAnswers.value = scales
    subAnswers.value = subs
    otherTextAnswers.value = {}
    saveState.value = {}

    const progress = (await progressRes.json()) as ProgressResponse
    if (!progressRes.ok || !progress.ok) throw new Error(progress.msg || '进度加载失败')

    submitted.value = Boolean(progress.submitted)

    // 服务器 answers 是唯一权威；仅当服务器明确给了 answers 才回显
    const fromServer = new Map<string, string>()
    for (const item of progress.answers ?? []) {
      fromServer.set(slotKey(item.questionNo, item.subNo ?? 0), item.answerText)
    }

    const answeredList: AnswerSlot[] = progress.answered ?? []
    let restored = 0
    let missing = 0
    for (const slot of answeredList) {
      const key = slotKey(slot.questionNo, slot.subNo ?? 0)
      const text = fromServer.get(key)
      if (text === undefined) {
        missing += 1
        continue
      }
      fillAnswer(slot.questionNo, slot.subNo ?? 0, text)
      restored += 1
    }

    // 仅当进度接口失败时才会走到 catch 用缓存；这里服务器成功时不用缓存覆盖空结果
    if (missing > 0) {
      restoreNotice.value = `有 ${missing} 个小问服务器上已保存，但当前设备取不到答案文字，重新填写会覆盖原答案。`
    }
    if (restored === 0 && answeredList.length === 0) writeCache()
  } catch (e) {
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      loadError.value = '登录已失效：请点右上角「退出登录」后重新登录。'
    } else {
      // 请求失败时用本地缓存兜底回显（不覆盖——服务器没成功返回，只能信本地）
      loadError.value = `加载失败：${e instanceof Error ? e.message : '网络异常'}`
      const cache = readCache()
      if (Object.keys(cache).length > 0) {
        restoreNotice.value = '当前无法连接服务器，已尝试用本机缓存回显；联网后请确认答案是否完整。'
      }
    }
  } finally {
    loading.value = false
    void loadUploads()
    void nextTick(() => handleScroll())
  }
}

onMounted(() => {
  void load()
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('scroll', handleScroll, { passive: true })
})

onBeforeUnmount(() => {
  flushPending()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <div class="flex min-h-[calc(100vh-200px)] gap-6">
    <!-- 左侧题号栏 -->
    <aside
      class="sticky top-6 hidden max-h-[calc(100vh-2rem)] w-48 shrink-0 self-start overflow-y-auto rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:block"
    >
      <div class="mb-4">
        <h2 class="text-sm font-semibold text-gray-900">答题卡</h2>
        <div class="mt-2">
          <div class="flex items-baseline justify-between">
            <span class="text-xs text-gray-400">已填</span>
            <span class="text-sm font-semibold text-[#4F7CFF]">{{ answeredCount }}/{{ total }}</span>
          </div>
          <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              class="h-full rounded-full bg-[#4F7CFF] transition-all duration-300"
              :style="{ width: `${percent}%` }"
            />
          </div>
        </div>
      </div>

      <!-- 答题卡：按部分分组，组间 8px 分隔 -->
      <div class="space-y-2">
        <template v-for="section in sections" :key="section.part">
          <div>
            <h3 class="mb-1.5 text-[11px] font-medium tracking-wide text-gray-400">
              {{ section.part }}
            </h3>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="q in section.questions"
                :key="q.no"
                type="button"
                class="relative flex h-8 w-8 items-center justify-center rounded-[6px] text-xs font-semibold transition"
                :class="[
                  activeQuestionNo === q.no
                    ? 'bg-[#4F7CFF] text-white shadow-sm'
                    : isQuestionComplete(q)
                      ? 'bg-[#A5BFFF] text-white hover:opacity-90'
                      : questionFilledCount(q) > 0
                        ? 'bg-[#F59E0B] text-white hover:opacity-90'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
                  submitted ? 'cursor-default opacity-80' : '',
                ]"
                @click="scrollToQuestion(q.no)"
              >
                <span>{{ q.no }}</span>
                <!-- 部分填角标 -->
                <span
                  v-if="questionFilledCount(q) > 0 && !isQuestionComplete(q)"
                  class="absolute -right-1 -top-1 rounded-full bg-white px-0.5 text-[9px] font-bold text-[#F59E0B] shadow-sm ring-1 ring-[#F59E0B]"
                >
                  {{ questionFilledCount(q) }}/{{ subCount(q) }}
                </span>
              </button>
            </div>
            <!-- 第五部分孤号：下方加「终」标记 -->
            <p v-if="section.part === '第五部分'" class="mt-1 text-center text-[11px] text-gray-400">
              终
            </p>
          </div>
        </template>
      </div>

      <div class="mt-4 space-y-2 border-t border-gray-100 pt-3">
        <button
          type="button"
          class="w-full text-xs text-gray-400 transition hover:text-[#4F7CFF]"
          @click="showNotes = true"
        >
          查看注意事项
        </button>

        <p
          v-if="saveError"
          class="rounded-lg bg-red-50 px-2 py-1.5 text-[11px] leading-snug text-red-600"
        >
          {{ saveError }}
        </p>
        <p
          v-if="restoreNotice"
          class="rounded-lg bg-[#FEF3C7] px-2 py-1.5 text-[11px] leading-snug text-amber-700"
        >
          {{ restoreNotice }}
        </p>

        <div v-if="submitted" class="rounded-lg bg-[#DCFCE7] px-3 py-2.5 text-center">
          <p class="text-sm font-medium text-green-800">已交卷</p>
          <p class="mt-0.5 text-[11px] text-green-700">答案已锁定，可查看不可修改</p>
        </div>
        <template v-else>
          <button
            type="button"
            class="w-full rounded-lg bg-[#4F7CFF] px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#3B66E0] hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!canSubmit || submitting"
            @click="submitExam"
          >
            {{ submitting ? '交卷中…' : canSubmit ? '提交答卷' : `还有 ${Math.max(0, total - answeredCount)} 小问未填` }}
          </button>
          <p class="text-center text-[11px] text-gray-400">输入即自动保存 · 填完可交卷</p>
        </template>
      </div>
    </aside>

    <!-- 右侧答题区 -->
    <main class="min-w-0 flex-1 space-y-6 max-w-[720px]">
      <!-- 窄屏进度 -->
      <div class="sticky top-0 z-10 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:hidden">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold text-gray-900">答题卡</h2>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500">已填 <span class="font-semibold text-[#4F7CFF]">{{ answeredCount }}/{{ total }}</span></span>
            <button
              type="button"
              class="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:text-[#4F7CFF]"
              @click="showNotes = true"
            >
              注意事项
            </button>
          </div>
        </div>
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            class="h-full rounded-full bg-[#4F7CFF] transition-all duration-300"
            :style="{ width: `${percent}%` }"
          />
        </div>
      </div>

      <div
        v-if="submitted"
        class="rounded-2xl border border-green-200 bg-[#DCFCE7] px-4 py-3 text-sm text-green-800"
      >
        你已交卷。以下为你的答案回显，不能再修改。
      </div>

      <div
        v-if="loading"
        class="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400"
      >
        题目加载中…
      </div>

      <div
        v-else-if="loadError"
        class="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600"
      >
        <p>{{ loadError }}</p>
        <button
          type="button"
          class="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
          @click="load"
        >
          重新加载
        </button>
      </div>

      <template v-else>
        <section v-for="section in sections" :key="section.part" class="space-y-8">
          <header class="flex flex-wrap items-center gap-2 border-l-3 border-[#4F7CFF] pl-4 pt-2">
            <h3 class="text-xl font-semibold text-gray-900">
              {{ section.part }}｜{{ section.title }}
            </h3>
            <span
              class="rounded-full px-2 py-0.5 text-xs"
              :class="section.scored ? 'bg-[#DCFCE7] text-green-700' : 'bg-gray-100 text-gray-500'"
            >
              {{ section.scored ? '计分' : '不计分 · 画像' }}
            </span>
          </header>

          <article
            v-for="q in section.questions"
            :key="q.no"
            :data-qno="q.no"
            class="scroll-mt-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
            :class="submitted ? 'opacity-90' : ''"
          >
            <div class="flex items-start justify-between gap-3">
              <p class="flex-1 whitespace-pre-line text-base font-medium leading-relaxed text-gray-900">
                <span class="mr-1 font-semibold text-[#4F7CFF]">{{ q.no }}.</span>{{ q.prompt }}
              </p>
              <span class="w-[52px] shrink-0 text-right text-[13px]" :class="statusClass(q.no)">{{ statusText(q.no) }}</span>
            </div>

            <!-- 多选（卡片式） -->
            <div v-if="q.type === 'checkbox'" class="mt-4 grid gap-2.5" :class="getGridClass()">
              <template v-for="(opt, idx) in q.options ?? []" :key="opt">
                <label
                  class="flex cursor-pointer items-start gap-2.5 rounded-lg px-4 py-2.5 text-[15px] leading-relaxed transition"
                  :class="[
                    getColSpanClass(idx, q.options ?? []),
                    (multiAnswers[q.no] ?? []).includes(opt)
                      ? 'border-2 border-[#4F7CFF] bg-[#EEF2FF] text-[#4F7CFF]'
                      : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300',
                    submitted ? 'pointer-events-none' : '',
                  ]"
                >
                  <input
                    v-model="multiAnswers[q.no]"
                    type="checkbox"
                    :value="opt"
                    class="mt-0.5 shrink-0 accent-[#4F7CFF]"
                    :disabled="submitted"
                    @change="saveNow(q.no, 0)"
                  />
                  <span class="min-w-0">{{ opt }}</span>
                </label>
                <div
                  v-if="opt === '其他' && (multiAnswers[q.no] ?? []).includes('其他')"
                  class="mt-1 md:col-span-2"
                >
                  <input
                    v-model="otherTextAnswers[q.no]"
                    type="text"
                    placeholder="请补充说明"
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-[15px] text-gray-900 outline-none focus:border-[#4F7CFF] focus:ring-2 focus:ring-[#4F7CFF]/20 disabled:bg-gray-50"
                    :disabled="submitted"
                    @input="scheduleSave(q.no, 0)"
                    @blur="saveNow(q.no, 0)"
                  />
                </div>
              </template>
            </div>

            <!-- 单选（卡片式） -->
            <div v-else-if="q.type === 'single'" class="mt-4 grid gap-2.5" :class="getGridClass()">
              <template v-for="(opt, idx) in q.options ?? []" :key="opt">
                <label
                  class="flex cursor-pointer items-start gap-2.5 rounded-lg px-4 py-2.5 text-[15px] leading-relaxed transition"
                  :class="[
                    getColSpanClass(idx, q.options ?? []),
                    textAnswers[q.no] === opt
                      ? 'border-2 border-[#4F7CFF] bg-[#EEF2FF] text-[#4F7CFF]'
                      : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300',
                    submitted ? 'pointer-events-none' : '',
                  ]"
                >
                  <input
                    v-model="textAnswers[q.no]"
                    type="radio"
                    :name="`q${q.no}`"
                    :value="opt"
                    class="mt-0.5 shrink-0 accent-[#4F7CFF]"
                    :disabled="submitted"
                    @change="saveNow(q.no, 0)"
                  />
                  <span class="min-w-0">{{ opt }}</span>
                </label>
                <div
                  v-if="opt === '其他' && textAnswers[q.no] === '其他'"
                  class="mt-1 md:col-span-2"
                >
                  <input
                    v-model="otherTextAnswers[q.no]"
                    type="text"
                    placeholder="请补充说明"
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-[15px] text-gray-900 outline-none focus:border-[#4F7CFF] focus:ring-2 focus:ring-[#4F7CFF]/20 disabled:bg-gray-50"
                    :disabled="submitted"
                    @input="scheduleSave(q.no, 0)"
                    @blur="saveNow(q.no, 0)"
                  />
                </div>
              </template>
            </div>

            <!-- 量表（方块横排） -->
            <div v-else-if="q.type === 'scale'" class="mt-4 flex flex-wrap items-center gap-3">
              <span class="text-[13px] text-gray-400">最低</span>
              <div class="flex gap-1.5">
                <button
                  v-for="n in q.scaleMax ?? 5"
                  :key="n"
                  type="button"
                  class="flex h-10 w-12 items-center justify-center rounded-lg border text-sm font-medium transition"
                  :class="
                    scaleAnswers[q.no] === n
                      ? 'border-[#4F7CFF] bg-[#4F7CFF] text-white'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-[#4F7CFF] hover:bg-[#EEF2FF]'
                  "
                  :disabled="submitted"
                  @click="pickScale(q.no, n)"
                >
                  {{ n }}
                </button>
              </div>
              <span class="text-[13px] text-gray-400">最高</span>
              <button
                v-if="scaleAnswers[q.no] != null && !submitted"
                type="button"
                class="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600"
                @click="clearScale(q.no)"
              >
                清除
              </button>
            </div>

            <!-- 小问堆叠（紧凑 + 左侧连接线） -->
            <div
              v-else-if="q.subs && q.subs.length > 0"
              class="mt-4 space-y-3 border-l-2 border-[#EEF2FF] pl-4"
            >
              <div v-for="sub in q.subs" :key="sub.subNo" class="space-y-1.5">
                <label class="block text-[15px] font-medium leading-relaxed text-gray-700">
                  {{ sub.text }}
                </label>
                <textarea
                  v-model="subAnswers[slotKey(q.no, sub.subNo)]"
                  :placeholder="'照实写就好，写「不知道」「没做过」也可以。'"
                  class="h-[120px] w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-[15px] leading-relaxed text-gray-900 outline-none focus:border-[#4F7CFF] focus:ring-2 focus:ring-[#4F7CFF]/20 disabled:bg-gray-50 disabled:text-gray-500"
                  :disabled="submitted"
                  @input="scheduleSave(q.no, sub.subNo)"
                  @blur="saveNow(q.no, sub.subNo)"
                />
              </div>
            </div>

            <!-- 无小问的自由作答 -->
            <textarea
              v-else
              v-model="textAnswers[q.no]"
              rows="4"
              placeholder="照实写就好，写「不知道」「没做过」也可以。"
              class="mt-4 h-[120px] w-full resize-y rounded-lg border border-gray-200 px-3 py-2.5 text-[15px] leading-relaxed text-gray-900 outline-none focus:border-[#4F7CFF] focus:ring-2 focus:ring-[#4F7CFF]/20 disabled:bg-gray-50"
              :disabled="submitted"
              @input="scheduleSave(q.no, 0)"
              @blur="saveNow(q.no, 0)"
            />
          </article>
        </section>

        <!-- 实践题上传（并入试卷末尾） -->
        <section class="space-y-4 pt-2">
          <header class="flex flex-wrap items-center gap-2 border-l-3 border-[#4F7CFF] pl-4">
            <h3 class="text-xl font-semibold text-gray-900">实践题｜成果上传</h3>
            <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              上传与答题分开保存
            </span>
          </header>

          <!-- 实践题概述（任务 17：与赛题《从这里开始》一致） -->
          <div class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h4 class="text-base font-medium text-gray-900">任务说明</h4>
            <div class="mt-3 space-y-2.5 text-[15px] leading-relaxed text-gray-700">
              <p>
                <span class="font-medium text-slate-800">你有什么：</span>
                参赛材料里的「原始数据.xlsx」是一张 220 行的活动报名流水——正式报名、信息更新、取消报名、重复导入、测试数据混在一起，还有缺失字段和前后不一致的写法。
              </p>
              <p>
                <span class="font-medium text-slate-800">要做什么：</span>
                把它整理成现场能直接照着执行的资料：谁最终参加、坐哪桌哪个座位、买多少杯什么饮品、谁提了什么问题。
              </p>
              <p>
                <span class="font-medium text-slate-800">要交什么：</span>
                一个「接待最终安排.xlsx」，含五张表——最终参加名单、分组与座位表、饮品采购表、问题建议表、异常记录表。
              </p>
              <p>
                <span class="font-medium text-slate-800">加分项：</span>
                再做一个能在现场查名单的静态网页，<span class="font-medium text-slate-800">可额外得分</span>——必做部分满分 90 分，网页另加 10 分，总分 100 分。
              </p>
              <p>
                <span class="font-medium text-slate-800">怎么开始：</span>
                先下载下方参赛材料 → 解压 → 用自己的电脑和任意工具处理 → 把成果表上传。
              </p>
              <p>
                <span class="font-medium text-slate-800">可用工具：</span>
                不限制任何软件、AI Agent 和公开资料。
              </p>
            </div>
          </div>

          <!-- 参赛材料：纯链接，公开接口，无需登录态 -->
          <div class="rounded-xl border border-[#EEF2FF] bg-[#F5F7FF] p-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[15px] font-medium text-gray-900">下载参赛材料</p>
                <p class="mt-0.5 text-[15px] leading-relaxed text-gray-500">
                  含题面、原始数据.xlsx、网页模板与提交区说明，做实践题前先下这一份。
                </p>
              </div>
              <a
                href="/api/materials/contestant-package"
                download
                class="shrink-0 rounded-lg bg-[#4F7CFF] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#3B66E0] hover:shadow"
              >
                下载参赛材料
              </a>
            </div>
          </div>

          <div class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <p class="text-[15px] leading-relaxed text-gray-700">
              xlsx 成果表必交，网页源码 zip 选交。同一类型重复上传会
              <span class="font-medium text-slate-800">覆盖</span>
              上一次的文件，最终以最后一次为准。
            </p>
            <p
              v-if="uploadMessage"
              class="mt-3 rounded-lg px-3 py-2 text-sm"
              :class="
                uploadMessage.kind === 'ok'
                  ? 'bg-[#DCFCE7] text-green-700'
                  : 'bg-red-50 text-red-600'
              "
            >
              {{ uploadMessage.text }}
            </p>
          </div>

          <article
            v-for="slot in uploadSlots"
            :key="slot.type"
            class="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h4 class="text-base font-semibold text-gray-900">
                {{ slot.title }}
                <el-tag
                  :type="slot.required ? 'danger' : 'info'"
                  size="small"
                  class="ml-2"
                >
                  {{ slot.required ? '必交' : '选交' }}
                </el-tag>
              </h4>
              <span class="text-xs text-gray-400">
                <template v-if="uploadsLoading">读取中…</template>
                <template v-else-if="submitted && !uploadedByType[slot.type]">未上传</template>
                <template v-else-if="uploadedByType[slot.type]">已上传</template>
                <template v-else>未上传</template>
              </span>
            </div>
            <p class="mt-2 text-[15px] text-gray-500">{{ slot.hint }}</p>

            <div
              v-if="uploadedByType[slot.type]"
              class="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600"
            >
              <p class="break-all">
                <span class="font-medium text-gray-700">已传：</span>
                {{ uploadedByType[slot.type]?.path }}
              </p>
              <p class="mt-1 text-xs text-gray-400">
                上传时间：{{ fmtTime(uploadedByType[slot.type]?.at ?? '') }}
              </p>
            </div>

            <div v-if="!submitted" class="mt-4 space-y-2">
              <div
                class="rounded-xl border-2 border-dashed p-4 transition-colors"
                :class="[
                  draggingOver === slot.type
                    ? 'border-[#4F7CFF] bg-[#EEF2FF]'
                    : 'border-gray-200 hover:border-gray-300',
                ]"
                @dragenter="onDragEnter(slot.type, $event)"
                @dragleave="onDragLeave(slot.type, $event)"
                @dragover="onDragOver(slot.type, $event)"
                @drop="onDrop(slot.type, $event)"
              >
                <div v-if="draggingOver === slot.type" class="py-2 text-center text-sm font-medium text-[#4F7CFF]">
                  松开即可上传
                </div>
                <template v-else>
                  <input
                    :ref="(el) => setUploadInput(slot.type, el)"
                    type="file"
                    :accept="slot.accept"
                    class="block w-full max-w-sm text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
                    @change="onPickUpload(slot.type, $event)"
                  />
                  <p class="mt-2 text-xs text-gray-400">或将文件拖到此处</p>
                </template>
              </div>
              <div class="flex items-center gap-3">
                <button
                  type="button"
                  class="rounded-lg bg-[#4F7CFF] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#3B66E0] hover:shadow disabled:cursor-not-allowed disabled:bg-gray-300"
                  :disabled="uploading !== null || !uploadFiles[slot.type]"
                  @click="doUpload(slot.type)"
                >
                  {{
                    uploading === slot.type
                      ? '上传中…'
                      : uploadedByType[slot.type]
                        ? '重新上传（覆盖）'
                        : '上传'
                  }}
                </button>
              </div>
            </div>
            <p v-if="uploadFiles[slot.type] && !submitted" class="mt-2 text-xs text-gray-400">
              已选择：{{ uploadFiles[slot.type]?.name }}（{{ fmtSize(uploadFiles[slot.type]?.size ?? 0) }}）
            </p>
          </article>
        </section>

        <!-- 底部提交（窄屏） -->
        <div
          v-if="!submitted"
          class="sticky bottom-0 z-10 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:hidden"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="text-xs text-gray-400">
              {{ canSubmit ? '全部填写完成' : `还有 ${Math.max(0, total - answeredCount)} 小问未填` }}
            </span>
            <button
              type="button"
              class="rounded-lg bg-[#4F7CFF] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#3B66E0] hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!canSubmit || submitting"
              @click="submitExam"
            >
              {{ submitting ? '交卷中…' : '提交答卷' }}
            </button>
          </div>
        </div>
      </template>
    </main>

    <!-- 注意事项弹窗 -->
    <div
      v-if="showNotes"
      class="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
      @click.self="showNotes = false"
    >
      <div class="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div class="flex items-start justify-between gap-3">
          <h3 class="text-lg font-semibold text-gray-900">注意事项</h3>
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-sm text-gray-400 hover:bg-gray-100"
            @click="showNotes = false"
          >
            关闭
          </button>
        </div>
        <ul class="mt-4 space-y-4">
          <li v-for="note in EXAM_NOTES" :key="note.title" class="flex gap-3">
            <span
              class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-xs font-semibold text-[#4F7CFF]"
            >
              ✓
            </span>
            <div class="min-w-0">
              <p class="text-[15px] font-medium text-gray-900">{{ note.title }}</p>
              <p class="mt-0.5 text-[15px] leading-relaxed text-gray-700">{{ note.body }}</p>
            </div>
          </li>
        </ul>
        <button
          type="button"
          class="mt-6 w-full rounded-lg bg-[#4F7CFF] px-6 py-2.5 text-[15px] font-medium text-white shadow-sm transition hover:bg-[#3B66E0] hover:shadow"
          @click="showNotes = false"
        >
          知道了
        </button>
      </div>
    </div>
  </div>
</template>
