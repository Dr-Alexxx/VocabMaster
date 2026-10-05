const { createAdapter } = require('./db-adapter.cjs')
const { createBackend, hydrateWord, jsonArray } = require('./service.cjs')
const { schema } = require('./schema.cjs')
const { applyBackup } = require('./backup-merge.cjs')
const { parseVocabularyFile } = require('./file-parse.cjs')
const { ensureSeeded } = require('./seed.cjs')
const { createVocabularyTemplate } = require('./vocabulary-template.cjs')

module.exports = { createAdapter, createBackend, schema, applyBackup, parseVocabularyFile, hydrateWord, jsonArray, ensureSeeded, createVocabularyTemplate }
