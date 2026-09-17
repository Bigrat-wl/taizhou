<script setup lang="ts">
// 说明卡片（任务 13）：开赛倒计时 + 开始答题 + 正向注意事项。
// 倒计时用 exam-status 的 serverNow 算偏差，不依赖客户端时钟。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { apiFetch } from '../api'
import { EXAM_NOTES } from '../examNotes'

const emit = defineEmits<{ start: [] }>()

type ExamStatus = {
  ok: boolean
  examStartAt?: string | null
  started?: boolean
  serverNow?: string
  msg?: string
}

const loading = ref(true)
const loadError = ref('')
const examStartAt = ref<string | null>(null)
const started = ref(true)
// 客户端时钟与服务器的偏差：serverNow - Date.now()
const clockOffsetMs = ref(0)
const nowTick = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

const startedLocal = computed(() => {
  if (started.value) return true
  if (!examStartAt.value) return true
  const startMs = Date.parse(examStartAt.value)
  if (Number.isNaN(startMs)) return true
  return nowTick.value + clockOffsetMs.value >= startMs
})

const remainingMs = computed(() => {
  if (!examStartAt.value || startedLocal.value) return 0
  const startMs = Date.parse(examStartAt.value)
  if (Number.isNaN(startMs)) return 0
  return Math.max(0, startMs - (nowTick.value + clockOffsetMs.value))
})

const countdownText = computed(() => {
  const ms = remainingMs.value
  if (ms <= 0) return ''
  const totalSec = Math.ceil(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
})

const startLabel = computed(() => {
  if (loading.value) return '加载中…'
  if (loadError.value) return '重新加载开赛状态'
  if (!startedLocal.value) return `开赛后可开始（剩余 ${countdownText.value}）`
  return '开始答题'
})

async function loadStatus() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await apiFetch('/api/exam-status')
    const data = (await res.json()) as ExamStatus
    if (!res.ok || !data.ok) throw new Error(data.msg || `HTTP ${res.status}`)
    examStartAt.value = data.examStartAt ?? null
    started.value = Boolean(data.started)
    if (data.serverNow) {
      const serverMs = Date.parse(data.serverNow)
      if (!Number.isNaN(serverMs)) clockOffsetMs.value = serverMs - Date.now()
    }
    nowTick.value = Date.now()
  } catch (e) {
    loadError.value =
      e instanceof Error && e.message === 'UNAUTHORIZED'
        ? '登录已失效，请退出后重新登录。'
        : `开赛状态加载失败：${e instanceof Error ? e.message : '网络异常'}`
  } finally {
    loading.value = false
  }
}

function onStart() {
  if (!startedLocal.value || loading.value) return
  if (loadError.value) {
    void loadStatus()
    return
  }
  emit('start')
}

function fmtStart(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

onMounted(() => {
  void loadStatus()
  timer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="mx-auto max-w-lg">
    <div class="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm md:p-8">
      <p class="text-xs font-medium tracking-wide text-[#4F7CFF]">信息素养大赛</p>
      <h2 class="mt-1 text-xl font-semibold text-gray-900">答题前先看一眼</h2>
      <p class="mt-2 text-[15px] leading-relaxed text-gray-700">
        这是一次认真的摸底，不是突击考试。按自己的真实情况填，比写得漂亮更重要。
      </p>

      <!-- 开赛倒计时 -->
      <div
        v-if="!loading && !loadError && examStartAt"
        class="mt-5 rounded-xl border px-4 py-3"
        :class="startedLocal ? 'border-green-200 bg-[#DCFCE7]' : 'border-amber-200 bg-[#FEF3C7]'"
      >
        <p class="text-sm" :class="startedLocal ? 'text-green-800' : 'text-amber-800'">
          <template v-if="startedLocal">已开赛，可以开始答题。</template>
          <template v-else>
            开赛时间：{{ fmtStart(examStartAt) }}<br />
            距离开赛还有
            <span class="font-mono text-base font-semibold tabular-nums text-[#4F7CFF]">{{ countdownText }}</span>
          </template>
        </p>
      </div>
      <div
        v-else-if="!loading && !loadError"
        class="mt-5 rounded-xl border border-green-200 bg-[#DCFCE7] px-4 py-3 text-sm text-green-800"
      >
        已开赛，可以开始答题。
      </div>

      <!-- 注意事项 -->
      <ul class="mt-6 space-y-4">
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

      <p v-if="loadError" class="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
        {{ loadError }}
      </p>

      <button
        type="button"
        class="mt-6 w-full rounded-lg bg-[#4F7CFF] px-6 py-2.5 text-[15px] font-medium text-white shadow-sm transition hover:bg-[#3B66E0] hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="loading || (!startedLocal && !loadError)"
        @click="onStart"
      >
        {{ startLabel }}
      </button>
      <p v-if="!startedLocal && !loading" class="mt-2 text-center text-xs text-gray-400">
        到点后按钮会自动放开，倒计时按服务器时间计算。
      </p>
    </div>
  </div>
</template>
