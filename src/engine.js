/**
 * 监控状态机（纯逻辑，便于测试）
 *
 * 输入：当前快照 + 上一次状态 + 配置
 * 输出：本次需要推送的异常 / 恢复 / 重复提醒事件
 */

import { STATUS } from './client.js'
import { STATUS_META } from './template.js'

/**
 * 是否属于需要告警的异常状态
 * @param {number} status 状态码
 * @param {any} cfg 配置
 */
export const isBadStatus = (status, cfg) => {
  if (status === STATUS.DOWN) return true
  if (status === STATUS.PENDING && cfg.alertOnPending) return true
  return false
}

/**
 * 判断监控项是否命中名称/ID 列表
 * @param {any} monitor 监控项
 * @param {string[]} list 列表
 */
const matchMonitor = (monitor, list) => {
  const name = String(monitor.name || '').toLowerCase()
  const id = String(monitor.id || '')

  return list.some((item) => {
    const key = String(item).trim().toLowerCase()
    if (!key) return false
    return key === id || name.includes(key)
  })
}

/**
 * 按配置过滤监控项，并重算汇总
 * @param {any} snapshot 快照
 * @param {any} cfg 配置
 */
export const filterSnapshot = (snapshot, cfg) => {
  const only = Array.isArray(cfg.onlyMonitors) ? cfg.onlyMonitors.filter(Boolean) : []
  const ignore = Array.isArray(cfg.ignoreMonitors) ? cfg.ignoreMonitors.filter(Boolean) : []

  if (only.length === 0 && ignore.length === 0) return snapshot

  const groups = snapshot.groups
    .map((group) => ({
      ...group,
      monitors: group.monitors.filter((monitor) => {
        if (only.length > 0 && !matchMonitor(monitor, only)) return false
        if (ignore.length > 0 && matchMonitor(monitor, ignore)) return false
        return true
      })
    }))
    .filter((group) => group.monitors.length > 0)

  const monitors = groups.flatMap((group) => group.monitors)
  const count = (status) => monitors.filter((monitor) => monitor.status === status).length
  const up = count(STATUS.UP)
  const down = count(STATUS.DOWN)
  const pending = count(STATUS.PENDING)
  const maintenance = count(STATUS.MAINTENANCE)

  let overall = 'unknown'
  if (monitors.length > 0) {
    if (down > 0) overall = 'down'
    else if (pending > 0) overall = 'pending'
    else if (up > 0) overall = 'up'
    else if (maintenance > 0) overall = 'maintenance'
  }

  return {
    ...snapshot,
    groups,
    monitors,
    summary: { total: monitors.length, up, down, pending, maintenance, overall }
  }
}

/**
 * 对比状态并产生事件
 * @param {any} snapshot 快照
 * @param {any} cfg 配置
 * @param {{ getMonitor: (id: string) => any, setMonitor: (id: string, patch: any) => void }} state 状态存储
 * @param {number} [now] 当前时间
 * @returns {{ downItems: any[], upItems: any[], repeatItems: any[] }}
 */
export const evaluate = (snapshot, cfg, state, now = Date.now()) => {
  const downItems = []
  const upItems = []
  const repeatItems = []

  for (const monitor of snapshot.monitors) {
    const nextStatus = monitor.status
    if (nextStatus === null || nextStatus === undefined) continue

    const previous = state.getMonitor(monitor.id)
    const previousStatus = previous?.status ?? null
    const beatTime = monitor.latest?.time || now
    const meta = STATUS_META[nextStatus] || { label: '未知' }

    /** 首次见到该监控项：只记录基线，不告警 */
    if (previousStatus === null) {
      const patch = {
        status: nextStatus,
        since: beatTime,
        name: monitor.name,
        lastNotifyAt: 0,
        notifyCount: 0
      }

      if (cfg.notifyOnStart && isBadStatus(nextStatus, cfg)) {
        patch.lastNotifyAt = now
        patch.notifyCount = 1
        downItems.push({ monitor, label: meta.label, since: 0 })
      }

      state.setMonitor(monitor.id, patch)
      continue
    }

    /** 状态未变化 */
    if (previousStatus === nextStatus) {
      if (previous.name !== monitor.name) state.setMonitor(monitor.id, { name: monitor.name })

      if (isBadStatus(nextStatus, cfg) && cfg.repeatInterval > 0) {
        const lastNotifyAt = Number(previous.lastNotifyAt) || 0

        if (!lastNotifyAt) {
          /** 从未告警过（例如插件启动时已经异常），从现在开始计时 */
          state.setMonitor(monitor.id, { lastNotifyAt: now, notifyCount: Number(previous.notifyCount) || 0 })
        } else if (now - lastNotifyAt >= cfg.repeatInterval * 60000) {
          const notifyCount = (Number(previous.notifyCount) || 0) + 1
          state.setMonitor(monitor.id, { lastNotifyAt: now, notifyCount })
          repeatItems.push({ monitor, downSince: previous.since || beatTime, notifyCount })
        }
      }

      continue
    }

    /** 状态发生变化 */
    const patch = {
      status: nextStatus,
      since: beatTime,
      name: monitor.name,
      lastNotifyAt: 0,
      notifyCount: 0
    }

    if (isBadStatus(nextStatus, cfg)) {
      patch.lastNotifyAt = now
      patch.notifyCount = 1
      downItems.push({ monitor, label: meta.label, since: beatTime })
    } else if (nextStatus === STATUS.UP) {
      const hadAlert = Number(previous.notifyCount) > 0
      if (cfg.notifyRecovery && hadAlert) {
        upItems.push({ monitor, downSince: previous.since || 0 })
      }
    }

    state.setMonitor(monitor.id, patch)
  }

  return { downItems, upItems, repeatItems }
}
