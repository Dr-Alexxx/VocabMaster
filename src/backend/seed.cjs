const definitions = [
  ['cet4.json', 'CET-4 核心词汇', 'CET4', '大学英语四级核心词汇'],
  ['cet6.json', 'CET-6 核心词汇', 'CET6', '大学英语六级进阶词汇'],
  ['ielts.json', 'IELTS 核心词汇', 'IELTS', '雅思学术与生活场景高频词汇'],
  ['toefl.json', 'TOEFL 核心词汇', 'TOEFL', '托福学术英语高频词汇']
]

async function ensureSeeded(adapter, loadJson) {
  const row = await adapter.get('SELECT COUNT(*) count FROM vocabularies')
  if (Number(row && row.count) > 0) return { seeded: false, words: 0 }
  const packs = []
  for (const [file, name, type, description] of definitions) {
    packs.push({ name, type, description, items: await loadJson(file) })
  }
  let words = 0
  await adapter.withTransaction(async () => {
    for (const [index, pack] of packs.entries()) {
      const vocabulary = await adapter.run(
        'INSERT INTO vocabularies (name, type, description, is_default, is_active) VALUES (?, ?, ?, 1, ?)',
        [pack.name, pack.type, pack.description, index === 0 ? 1 : 0]
      )
      for (const item of pack.items) {
        if (!item.word || !item.definition) continue
        const inserted = await adapter.run(`
          INSERT OR IGNORE INTO words
            (vocabulary_id, word, phonetic, definition, examples, etymology, synonyms, antonyms, frequency)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          vocabulary.lastInsertRowid,
          String(item.word).trim(),
          item.phonetic || null,
          JSON.stringify(Array.isArray(item.definition) ? item.definition : [item.definition]),
          JSON.stringify(item.examples || []),
          item.etymology || null,
          JSON.stringify(item.synonyms || []),
          JSON.stringify(item.antonyms || []),
          item.frequency || null
        ])
        words += inserted.changes
      }
    }
  })
  return { seeded: true, words }
}

module.exports = { ensureSeeded }
