import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // Element Plus 按需引入（见 AGENTS.md 技术约定 / docs/tasks/09-接入对齐.md）：
    //   - Components：模板里的 <el-xxx> 用到才 import，不做 app.use(ElementPlus) 全量注册；
    //   - AutoImport：ElMessage / ElMessageBox / ElLoading 这类函数式 API 用到才 import；
    //   - importStyle: false：样式不由插件按组件注入，统一在 src/main.ts 引入整包 CSS。
    //     这样样式加载顺序是确定的（Element Plus 在前、本地 style.css 在后），
    //     任务 08 用 CSS 变量做主题覆盖时不会被后注入的组件样式盖掉。
    AutoImport({
      resolvers: [ElementPlusResolver({ importStyle: false })],
      // 生成的类型声明放 src/ 下，tsconfig.app.json 的 include 直接覆盖（不改 tsconfig）
      dts: 'src/types/auto-imports.d.ts',
    }),
    Components({
      resolvers: [ElementPlusResolver({ importStyle: false })],
      dts: 'src/types/components.d.ts',
    }),
  ],
  server: {
    // 联调约定：开发端口固定 5174（5173 被系统 portproxy 占用，故改用 5174）
    // 如果 5174 被占用，尝试 5175
    port: 5174,
    strictPort: false,
    // 前端只写相对路径 /api/...，由 Vite 代理到本机 3000 端口的 Express
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
