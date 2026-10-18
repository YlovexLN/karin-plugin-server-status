/**
 * 计算 SHA-256 十六进制摘要，用于 Karin HTTP_AUTH_KEY 登录。
 *
 * `crypto.subtle` 只在安全上下文（HTTPS / localhost）可用；Karin WebUI 常通过
 * 局域网 HTTP 访问，因此保留纯 JS 实现作为回退。
 */

const sha256Constants = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
  0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
  0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]

const encodeUtf8 = (value: string) => new TextEncoder().encode(value)

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const rightRotate = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits))

/** 纯 JS SHA-256，兼容没有 crypto.subtle 的 HTTP 环境 */
const sha256Bytes = (input: Uint8Array) => {
  const bitLength = input.length * 8
  const paddedLength = ((input.length + 9 + 63) >> 6) << 6
  const padded = new Uint8Array(paddedLength)
  const words = new Array<number>(64)
  let hash0 = 0x6a09e667
  let hash1 = 0xbb67ae85
  let hash2 = 0x3c6ef372
  let hash3 = 0xa54ff53a
  let hash4 = 0x510e527f
  let hash5 = 0x9b05688c
  let hash6 = 0x1f83d9ab
  let hash7 = 0x5be0cd19

  padded.set(input)
  padded[input.length] = 0x80
  for (let index = 0; index < 8; index++) {
    padded[paddedLength - 1 - index] = Math.floor(bitLength / 2 ** (index * 8)) & 0xff
  }

  for (let chunkOffset = 0; chunkOffset < padded.length; chunkOffset += 64) {
    for (let index = 0; index < 16; index++) {
      const offset = chunkOffset + index * 4
      words[index] = ((padded[offset] << 24) | (padded[offset + 1] << 16) | (padded[offset + 2] << 8) | padded[offset + 3]) >>> 0
    }

    for (let index = 16; index < 64; index++) {
      const sigma0 = rightRotate(words[index - 15], 7) ^ rightRotate(words[index - 15], 18) ^ (words[index - 15] >>> 3)
      const sigma1 = rightRotate(words[index - 2], 17) ^ rightRotate(words[index - 2], 19) ^ (words[index - 2] >>> 10)
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0
    }

    let a = hash0
    let b = hash1
    let c = hash2
    let d = hash3
    let e = hash4
    let f = hash5
    let g = hash6
    let h = hash7

    for (let index = 0; index < 64; index++) {
      const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temp1 = (h + sigma1 + choice + sha256Constants[index] + words[index]) >>> 0
      const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sigma0 + majority) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    hash0 = (hash0 + a) >>> 0
    hash1 = (hash1 + b) >>> 0
    hash2 = (hash2 + c) >>> 0
    hash3 = (hash3 + d) >>> 0
    hash4 = (hash4 + e) >>> 0
    hash5 = (hash5 + f) >>> 0
    hash6 = (hash6 + g) >>> 0
    hash7 = (hash7 + h) >>> 0
  }

  const output = new Uint8Array(32)
  const hashes = [hash0, hash1, hash2, hash3, hash4, hash5, hash6, hash7]

  hashes.forEach((hash, index) => {
    output[index * 4] = (hash >>> 24) & 0xff
    output[index * 4 + 1] = (hash >>> 16) & 0xff
    output[index * 4 + 2] = (hash >>> 8) & 0xff
    output[index * 4 + 3] = hash & 0xff
  })

  return output
}

/** 计算 SHA-256 十六进制摘要 */
export const sha256 = async (value: string): Promise<string> => {
  const data = encodeUtf8(value)
  const subtle = globalThis.crypto?.subtle

  if (subtle && typeof subtle.digest === 'function') {
    const hashBuffer = await subtle.digest('SHA-256', data)
    return bytesToHex(new Uint8Array(hashBuffer))
  }

  return bytesToHex(sha256Bytes(data))
}
