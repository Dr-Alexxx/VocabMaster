function createSerialQueue() {
  let pending = Promise.resolve()
  return (action) => {
    const result = pending.catch(() => {}).then(action)
    pending = result
    return result
  }
}
module.exports = { createSerialQueue }
