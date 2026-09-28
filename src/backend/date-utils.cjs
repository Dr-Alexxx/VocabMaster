function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addLocalDays(date, amount) {
  const shifted = new Date(date)
  shifted.setDate(shifted.getDate() + amount)
  return localDateKey(shifted)
}

module.exports = { localDateKey, addLocalDays }
