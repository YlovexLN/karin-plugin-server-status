/**
 * 推送目标解析与归一化
 *
 * 纯逻辑模块（不依赖 node-karin），供 config / notify / web 校验共用。
 *
 * 配置里的 `targets` 允许两种写法：
 * - 字符串：`group:123456`、`friend:10001`、`群:123456`、`私聊:10001`；裸字符串按私聊处理
 * - 对象：`{ scene: 'group' | 'friend', peer: '123456', name?: '运维群', selfId?: '10000' }`
 *
 * 读取时统一归一化为对象，去重键为 `scene:peer`（`selfId` 不参与）。
 *
 * 号码格式（4 - 12 位数字）由 WebUI 输入框实时校验，见 `web/src/utils/targets.ts` 的 `PEER_PATTERN`。
 */

/** 场景别名 → scene，未知值回退私聊 */
const SCENE_ALIASES = new Map([
  ['group', 'group'],
  ['群', 'group'],
  ['群聊', 'group'],
  ['friend', 'friend'],
  ['private', 'friend'],
  ['私聊', 'friend'],
  ['好友', 'friend']
])

/** 字符串写法里的场景前缀，如 `group:123456`、`群：123456` */
const SCENE_PREFIX = /^(group|friend|private|群|群聊|私聊|好友)[:：](.+)$/i

/** 场景中文名 */
export const sceneLabel = (scene) => (scene === 'group' ? '群聊' : '私聊')

/**
 * 归一化场景，未知值回退 `friend`
 * @param {any} value scene / type 字段
 * @returns {'group'|'friend'}
 */
export const normalizeScene = (value) => SCENE_ALIASES.get(String(value ?? '').trim().toLowerCase()) || 'friend'

/**
 * 去重键
 * @param {{ scene: 'group'|'friend', peer: string }} target 目标
 * @returns {string}
 */
export const targetKey = (target) => `${target.scene}:${target.peer}`

/**
 * 归一化单个推送目标
 * @param {any} item 字符串或对象
 * @returns {{ scene: 'group'|'friend', peer: string, name?: string, selfId?: string }|null}
 */
export const normalizeTarget = (item) => {
  if (typeof item === 'string') {
    const text = item.trim()
    if (!text) return null

    const matched = text.match(SCENE_PREFIX)
    if (matched) {
      const peer = matched[2].trim()
      return peer ? { scene: normalizeScene(matched[1]), peer } : null
    }

    return { scene: 'friend', peer: text }
  }

  if (!item || typeof item !== 'object' || Array.isArray(item)) return null

  const peer = String(item.peer ?? item.id ?? item.groupId ?? item.userId ?? '').trim()
  if (!peer) return null

  const target = { scene: normalizeScene(item.scene ?? item.type), peer }
  const name = String(item.name ?? '').trim()
  const selfId = String(item.selfId ?? '').trim()
  if (name) target.name = name
  if (selfId) target.selfId = selfId

  return target
}

/**
 * 归一化目标数组：丢弃非法项并按 `scene:peer` 去重
 * @param {any} list 原始配置
 * @returns {Array<{ scene: 'group'|'friend', peer: string, name?: string, selfId?: string }>}
 */
export const normalizeTargets = (list) => {
  const result = []
  const seen = new Set()

  for (const item of Array.isArray(list) ? list : []) {
    const target = normalizeTarget(item)
    if (!target) continue
    const key = targetKey(target)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(target)
  }

  return result
}

/**
 * 目标描述
 * @param {{ scene: 'group'|'friend', peer: string, name?: string }} target 目标
 * @returns {string}
 */
export const describeTarget = (target) => {
  const scene = sceneLabel(target.scene)
  return `${scene} ${target.name ? `${target.name}(${target.peer})` : target.peer}`
}

/** 号码最大长度，仅用于拦截明显异常的脏数据 */
const PEER_MAX_LENGTH = 64

/**
 * 校验写入用的目标数组（WebUI 提交前）
 *
 * 只做结构校验：场景必须是群聊 / 私聊，号码必须是非空字符串。
 * 号码是否为纯数字、长度是否合理，由 WebUI 输入框实时提示；
 * 后端放宽到「非空」是为了不因为一条历史遗留目标就拦住整份配置的保存。
 * @param {any} list 待写入的 targets
 * @returns {string[]} 错误文案，空数组表示通过
 */
export const validateTargetList = (list) => {
  if (!Array.isArray(list)) return ['targets 必须是数组']
  if (list.length > 100) return ['targets 最多 100 个']

  const errors = []

  list.forEach((item, index) => {
    const label = `第 ${index + 1} 个推送目标`
    const target = normalizeTarget(item)

    if (!target) {
      errors.push(typeof item === 'string' ? `${label}不能为空` : `${label}缺少群号或 QQ 号`)
      return
    }

    const scene = item && typeof item === 'object' ? String(item.scene ?? item.type ?? '').trim() : ''
    if (scene && !SCENE_ALIASES.has(scene.toLowerCase())) {
      errors.push(`${label}的场景只能是 group / friend（群聊 / 私聊）`)
      return
    }

    if (target.peer.length > PEER_MAX_LENGTH) {
      errors.push(`${label}的号码过长`)
    }
  })

  return errors
}
