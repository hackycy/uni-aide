const base = { fromBase: true }
const key = 'dynamic'

export default {
  // before spread
  ...base,
  // before computed
  [key]: 1,
  // before numeric
  2: 'two',
}
