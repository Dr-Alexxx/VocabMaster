const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const pkg = require('../package.json')

const root = path.join(__dirname, '..')
const source = path.join(root, 'release', 'win-unpacked')
if (!fs.existsSync(source)) {
  console.error('未找到 release/win-unpacked，请先运行 npm run build:win')
  process.exit(1)
}
const target = path.join(root, 'release', `VocabMaster-${pkg.version}-win-x64.zip`)
execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${source}\\*' -DestinationPath '${target}' -Force`], { stdio: 'inherit' })
console.log(`已生成 ${path.basename(target)}`)
