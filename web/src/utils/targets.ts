import type { PushScene, PushTarget } from '../types'

/**
 * 推送目标工具
 *
 * `web/` 不能 import 后端 `src/`，这里的规则与 `src/target.js` 保持一致；
 * 修改其中一侧时同步另一侧。
 */

/** 群号 / QQ 号：4-12 位纯数字 */
export const PEER_PATTERN = /^[0-9]{4,12}$/

/** 号码输入框的占位文案 */
export const PEER_PLACEHOLDER: Record<PushScene, string> = {
  group: '请输入群号，如 123456789',
  friend: '请输入 QQ 号，如 10001'
}

/** 场景说明 */
export const SCENE_HELP: Record<PushScene, string> = {
  group: '群聊：消息发送到群，请填写群号',
  friend: '私聊：消息发送给单个用户，请填写 QQ 号'
}

/** 场景中文名 */
export const sceneLabel = (scene: PushScene): string => (scene === 'group' ? '群聊' : '私聊')

/** 目标去重键（`selfId` 不参与，与后端一致） */
export const targetKey = (target: PushTarget): string => `${target.scene}:${target.peer}`

const SCENE_ALIASES: Record<string, PushScene> = {
  group: 'group',
  群: 'group',
  群聊: 'group',
  friend: 'friend',
  private: 'friend',
  私聊: 'friend',
  好友: 'friend'
}

/** 归一化场景，未知值回退私聊 */
export const normalizeScene = (value: unknown): PushScene =>
  SCENE_ALIASES[String(value ?? '').trim().toLowerCase()] ?? 'friend'

const SCENE_PREFIX = /^(group|friend|private|群|群聊|私聊|好友)[:：](.+)$/i

/**
 * 归一化任意形态的目标
 *
 * 后端可能返回对象；老配置里也可能残留 `group:123456` 字符串写法。
 * @param value 原始值
 * @returns 归一化后的目标，无法解析时返回 null
 */
export const normalizeTarget = (value: unknown): PushTarget | null => {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return null

    const matched = text.match(SCENE_PREFIX)
    if (matched) {
      const peer = matched[2].trim()
      return peer ? { scene: normalizeScene(matched[1]), peer } : null
    }

    return { scene: 'friend', peer: text }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const raw = value as Record<string, unknown>
  const peer = String(raw.peer ?? raw.id ?? raw.groupId ?? raw.userId ?? '').trim()
  if (!peer) return null

  const target: PushTarget = { scene: normalizeScene(raw.scene ?? raw.type), peer }
  const name = String(raw.name ?? '').trim()
  const selfId = String(raw.selfId ?? '').trim()
  if (name) target.name = name
  if (selfId) target.selfId = selfId

  return target
}

/** 归一化目标数组，丢弃非法项并按 `scene:peer` 去重 */
export const normalizeTargets = (list: unknown): PushTarget[] => {
  const result: PushTarget[] = []
  const seen = new Set<string>()

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
 * 校验号码格式
 *
 * 只作用于输入框；后端对此保持宽松（见 `src/target.js`）。
 * @param peer 群号或 QQ 号
 * @param scene 场景
 * @returns 错误文案或 null
 */
export const validatePeer = (peer: string, scene: PushScene): string | null => {
  const text = peer.trim()
  if (!text) return scene === 'group' ? '请输入群号' : '请输入 QQ 号'
  if (!/^[0-9]+$/.test(text)) return '只能填写数字'
  if (!PEER_PATTERN.test(text)) return '号码长度应为 4 - 12 位'
  return null
}

/**
 * 校验列表中的单个推送目标，返回错误文案或 null
 *
 * 结构与后端 `src/target.js` 的校验保持一致（只要求非空号码），
 * 避免一条历史遗留目标导致整份配置无法保存；号码格式由输入框实时提示。
 */
export const validateTarget = (target: PushTarget | null | undefined): string | null => {
  if (!target) return '推送目标无效'
  const normalized = normalizeTarget(target)
  if (!normalized) return '缺少群号或 QQ 号'
  if (normalized.peer.length > 64) return '号码过长'
  return null
}
