const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const source = path.join(root, 'resources', 'vocabularies')
const target = path.join(root, 'public', 'vocabularies')
if (!fs.existsSync(source)) {
  console.error('未找到 resources/vocabularies，请检查仓库内容')
  process.exit(1)
}
const files = fs.readdirSync(source).filter((file) => file.endsWith('.json'))
if (files.length === 0) {
  console.error('resources/vocabularies 下没有词库 JSON')
  process.exit(1)
}
fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(target, { recursive: true })
for (const file of files) {
  fs.copyFileSync(path.join(source, file), path.join(target, file))
}
console.log(`已复制 ${files.length} 个词库到 public/vocabularies`)
