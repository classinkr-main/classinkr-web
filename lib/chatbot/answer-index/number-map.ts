/**
 * 숫자 열쇠 표(답 색인 컴파일·사전 트라이가 쓴다).
 */

/**
 * 정수 열쇠(1 이상 2^53 미만) → int32 값. 열린 주소 해시(열쇠 0 = 빈 칸).
 * n-gram 열쇠는 2^31 을 넘는 실수라 JS Map 에 넣으면 느리고 크다(열쇠마다 HeapNumber).
 * 같은 순서로 넣으면 같은 칸 배치가 된다(색인 해시가 결정적).
 */
export class NumberMap {
  private keys: Float64Array
  private values: Int32Array
  private mask: number
  size = 0

  constructor(capacity = 1024) {
    let slots = 16
    while (slots < capacity * 2) slots *= 2
    this.keys = new Float64Array(slots)
    this.values = new Int32Array(slots)
    this.mask = slots - 1
  }

  private slot(key: number) {
    const lo = key >>> 0
    const hi = Math.floor(key / 4294967296) | 0
    let h = Math.imul(lo ^ Math.imul(hi, 0x9e3779b1), 0x85ebca6b)
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35)
    h ^= h >>> 16
    return h & this.mask
  }

  get(key: number): number | undefined {
    let i = this.slot(key)
    for (;;) {
      const at = this.keys[i]
      if (at === 0) return undefined
      if (at === key) return this.values[i]
      i = (i + 1) & this.mask
    }
  }

  has(key: number) {
    return this.get(key) !== undefined
  }

  set(key: number, value: number) {
    if ((this.size + 1) * 2 > this.keys.length) this.grow()
    let i = this.slot(key)
    for (;;) {
      const at = this.keys[i]
      if (at === 0) {
        this.keys[i] = key
        this.values[i] = value
        this.size += 1
        return
      }
      if (at === key) {
        this.values[i] = value
        return
      }
      i = (i + 1) & this.mask
    }
  }

  private grow() {
    const { keys, values } = this
    this.keys = new Float64Array(keys.length * 2)
    this.values = new Int32Array(keys.length * 2)
    this.mask = this.keys.length - 1
    this.size = 0
    for (let i = 0; i < keys.length; i += 1) if (keys[i] !== 0) this.set(keys[i], values[i])
  }

  /** 값이 value 인 열쇠 수. */
  count(value: number) {
    let n = 0
    for (let i = 0; i < this.keys.length; i += 1) if (this.keys[i] !== 0 && this.values[i] === value) n += 1
    return n
  }

  /** 색인 해시용: 칸 배열 그대로. */
  buffers() {
    return { keys: this.keys, values: this.values }
  }
}
