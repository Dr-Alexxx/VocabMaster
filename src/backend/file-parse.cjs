const XLSX = require('xlsx')

function decodeText(bytes) {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  return utf8.includes('\uFFFD') ? new TextDecoder('gb18030').decode(bytes) : utf8
}

function fileExtension(filename) {
  const name = String(filename || '').split(/[\\/]/).pop() || ''
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index).toLowerCase() : ''
}

function parseVocabularyFile(bytes, filename) {
  const extension = fileExtension(filename)
  if (extension === '.json') {
    const parsed = JSON.parse(decodeText(bytes))
    const source = Array.isArray(parsed) ? parsed : parsed.words
    if (!Array.isArray(source)) throw new Error('JSON 文件必须是数组或包含 words 数组')
    const headers = [...new Set(source.flatMap((row) => Object.keys(row || {})))]
    return { headers, rows: source.map((row) => headers.map((header) => row[header] ?? '')) }
  }
  let workbook
  if (['.xlsx', '.xls'].includes(extension)) workbook = XLSX.read(bytes, { type: 'array' })
  else workbook = XLSX.read(decodeText(bytes), { type: 'string', raw: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  let matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
  matrix = matrix.filter((row) => row.some((cell) => String(cell).trim()))
  if (!matrix.length) throw new Error('文件中没有可导入的数据')
  const first = matrix[0].map((cell) => String(cell).trim())
  const headerWords = /word|单词|definition|释义|meaning|音标|phonetic|example|例句/i
  const hasHeader = first.some((cell) => headerWords.test(cell))
  const headers = hasHeader ? first : first.map((_cell, index) => `第 ${index + 1} 列`)
  return { headers, rows: hasHeader ? matrix.slice(1) : matrix }
}

module.exports = { parseVocabularyFile, decodeText }
