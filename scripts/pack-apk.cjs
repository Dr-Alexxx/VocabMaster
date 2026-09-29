const fs = require('node:fs')
const path = require('node:path')
const pkg = require('../package.json')

const root = path.join(__dirname, '..')
const source = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
if (!fs.existsSync(source)) {
  console.error('未找到 android/app/build/outputs/apk/release/app-release.apk，请先运行 npm run build:android:release')
  process.exit(1)
}
const target = path.join(root, 'release', `VocabMaster-${pkg.version}-android.apk`)
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.copyFileSync(source, target)
console.log(`已生成 ${path.basename(target)}`)
