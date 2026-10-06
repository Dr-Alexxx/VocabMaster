const headers = ['word', 'phonetic', 'definition', 'examples', 'etymology', 'synonyms', 'antonyms', 'frequency', 'roots', 'word_family', 'collocations', 'content_source', 'content_license']

const samples = [
  {
    word: 'abandon', phonetic: '/əˈbændən/', definition: ['v. 放弃；遗弃', 'n. 放任；放纵'],
    examples: ['They had to abandon the car.', 'Never abandon hope.'], etymology: '来自古法语 abandoner',
    synonyms: ['desert', 'forsake'], antonyms: ['keep', 'retain'], frequency: 9500, roots: '', word_family: ['abandoned', 'abandonment'], collocations: ['abandon hope'], content_source: 'VocabMaster 模板示例', content_license: 'MIT'
  },
  {
    word: 'ability', phonetic: '/əˈbɪləti/', definition: ['n. 能力；才能'],
    examples: ['She has the ability to solve the problem.'], etymology: 'able + -ity',
    synonyms: ['capacity', 'capability'], antonyms: ['inability'], frequency: 9000, roots: 'able + -ity', word_family: ['able', 'unable'], collocations: ['the ability to do something'], content_source: 'VocabMaster 模板示例', content_license: 'MIT'
  }
]

const rows = samples.map((item) => [item.word, item.phonetic, item.definition.join('|'), item.examples.join('|'), item.etymology, item.synonyms.join('|'), item.antonyms.join('|'), item.frequency, item.roots, item.word_family.join('|'), item.collocations.join('|'), item.content_source, item.content_license])
const csvCell = (value) => {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function createVocabularyTemplate(format) {
  if (format === 'json') return { extension: 'json', filename: 'vocabmaster-template.json', content: JSON.stringify(samples, null, 2) }
  if (format === 'xlsx') return { extension: 'xlsx', filename: 'vocabmaster-template.xlsx', headers, rows }
  return { extension: 'csv', filename: 'vocabmaster-template.csv', content: `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n` }
}

module.exports = { headers, samples, createVocabularyTemplate }
