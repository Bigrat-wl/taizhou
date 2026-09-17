import { createApp } from 'vue'
// Element Plus 样式（组件/函数式 API 的按需 import 由 vite.config.ts 的
// unplugin-vue-components + unplugin-auto-import 负责，这里只统一引入样式）。
// 放在 ./style.css 之前：同优先级下本地样式（含任务 08 的主题变量覆盖）才能盖住默认值。
import 'element-plus/dist/index.css'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')
