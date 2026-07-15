const missingApi = new Proxy({}, {
  get: (_target, name) => async () => {
    throw new Error(`桌面接口 ${String(name)} 不可用，请从 Electron 启动应用`)
  }
})

export const api = window.vocabApi || missingApi
