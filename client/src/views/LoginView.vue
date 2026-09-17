<script setup lang="ts">
// 登录页（任务 02）：学号 + 姓名 → POST /api/login → 成功后把 token/学生信息交给 App.vue 保存。
import { ref } from 'vue'

type LoginStudent = {
  studentId: string
  name: string
  college: string | null
  class: string | null
}
type LoginSuccess = { ok: true; token: string; student: LoginStudent }
type LoginFailure = { ok: false; msg: string }

const emit = defineEmits<{
  (e: 'logged-in', payload: { token: string; student: LoginStudent }): void
}>()

const studentId = ref('')
const name = ref('')
const error = ref('')
const submitting = ref(false)

async function submit() {
  error.value = ''
  if (!studentId.value.trim() || !name.value.trim()) {
    error.value = '请填写学号和姓名'
    return
  }

  submitting.value = true
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: studentId.value.trim(), name: name.value.trim() }),
    })
    const data: LoginSuccess | LoginFailure = await res.json()

    if (data.ok) {
      emit('logged-in', { token: data.token, student: data.student })
    } else {
      error.value = data.msg || '登录失败'
    }
  } catch (e) {
    error.value = e instanceof Error ? `请求失败：${e.message}` : '请求失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-gradient-to-b from-white to-gray-50 p-6">
    <form
      class="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-8 shadow-sm"
      @submit.prevent="submit"
    >
      <h1 class="text-[28px] font-bold leading-tight text-gray-900">信息素养大赛</h1>
      <p class="mt-2 text-[15px] text-gray-400">请登录以开始答题</p>

      <label class="mt-6 block text-sm font-medium text-gray-700">
        学号
        <input
          v-model="studentId"
          type="text"
          autocomplete="username"
          placeholder="2026000001"
          class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[15px] text-gray-900 outline-none focus:border-[#4F7CFF] focus:ring-2 focus:ring-[#4F7CFF]/20"
        />
      </label>

      <label class="mt-4 block text-sm font-medium text-gray-700">
        姓名
        <input
          v-model="name"
          type="text"
          autocomplete="name"
          placeholder="李明悦"
          class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-[15px] text-gray-900 outline-none focus:border-[#4F7CFF] focus:ring-2 focus:ring-[#4F7CFF]/20"
        />
      </label>

      <p v-if="error" class="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
        {{ error }}
      </p>

      <button
        type="submit"
        :disabled="submitting"
        class="mt-6 w-full rounded-lg bg-[#4F7CFF] px-6 py-2.5 text-[15px] font-medium text-white shadow-sm transition hover:bg-[#3B66E0] hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
      >
        {{ submitting ? '登录中…' : '登录' }}
      </button>
    </form>
  </main>
</template>
