import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')

function backendCjsToEsm(code) {
  let exportCount = 0
  const out = code
    .replace(/^(\s*)(?:const|let|var)\s+\{\s*([^}]+?)\s*\}\s*=\s*require\(\s*(['"][^'"]+['"])\s*\)\s*;?\s*$/gm, '$1import { $2 } from $3')
    .replace(/^(\s*)(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*(['"][^'"]+['"])\s*\)\s*;?\s*$/gm, '$1import $2 from $3')
    .replace(/^(\s*)module\.exports\s*=\s*\{([^}]*)\}\s*;?\s*$/gm, (_match, indent, names) => {
      exportCount += 1
      const entries = names.split(',').map((entry) => entry.trim()).filter(Boolean)
      const exportList = entries.map((entry) => {
        const [key, value] = entry.split(':').map((part) => part.trim())
        return value ? `${value} as ${key}` : key
      })
      return `${indent}const __cjsExports = { ${entries.join(', ')} }\n${indent}export default __cjsExports\n${indent}export { ${exportList.join(', ')} }`
    })
  if (exportCount !== 1 || /\brequire\s*\(|module\.exports|\bexports\./.test(out)) {
    throw new Error('backend-cjs-dev-transform: unsupported CommonJS pattern in shared backend module')
  }
  return out
}

function backendCjsDevTransform() {
  let active = true
  return {
    name: 'backend-cjs-dev-transform',
    apply: 'serve',
    enforce: 'pre',
    configResolved(config) {
      active = config.mode !== 'test'
    },
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const rawUrl = req.url || ''
        const pathname = rawUrl.split('?')[0].replace(/\\/g, '/')
        const hasImportFlag = new URLSearchParams(rawUrl.split('?')[1] || '').has('import')
        if (active && /(^|\/)src\/backend\/[^/]+\.cjs$/.test(pathname) && !hasImportFlag) {
          req.url = rawUrl + (rawUrl.includes('?') ? '&' : '?') + 'import'
        }
        next()
      })
    },
    transform(code, id) {
      const filename = id.split('?')[0].replace(/\\/g, '/')
      if (!active || !/(^|\/)src\/backend\/[^/]+\.cjs$/.test(filename)) return null
      return { code: backendCjsToEsm(code), map: null }
    }
  }
}

export default defineConfig({
  plugins: [vue(), backendCjsDevTransform()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173, strictPort: false },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1400 }
})
