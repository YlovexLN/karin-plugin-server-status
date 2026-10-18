/**
 * 监控状态持久化
 *
 * 用于在 Karin 重启后恢复「上一次已知状态」，避免重启后把所有监控重新告警一遍。
 */

import fs from 'node:fs'
import path from 'node:path'

/** 状态文件结构版本 */
const VERSION = 1

/**
 * @typedef {Object} MonitorState
 * @property {number|null} status 上一次已知状态码
 * @property {number} since 状态变更时间（毫秒时间戳）
 * @property {number} lastNotifyAt 上次告警时间
 * @property {number} notifyCount 本次异常已告警次数
 * @property {string} name 监控项名称
 */

export class StateStore {
  /**
   * @param {string} file 状态文件路径
   */
  constructor (file) {
    this.file = file
    this.timer = null
    /** @type {{ version: number, monitors: Record<string, MonitorState>, source: { failing: number, down: boolean, downSince: number, lastNotifyAt: number, lastError: string } }} */
    this.data = {
      version: VERSION,
      monitors: {},
      source: { failing: 0, down: false, downSince: 0, lastNotifyAt: 0, lastError: '', everUp: false }
    }
    this.load()
  }

  /** 从磁盘读取状态 */
  load () {
    try {
      const content = fs.readFileSync(this.file, 'utf-8')
      const parsed = JSON.parse(content)
      if (parsed && typeof parsed === 'object') {
        this.data = {
          version: VERSION,
          monitors: parsed.monitors && typeof parsed.monitors === 'object' ? parsed.monitors : {},
          source: {
            failing: Number(parsed.source?.failing) || 0,
            down: Boolean(parsed.source?.down),
            downSince: Number(parsed.source?.downSince) || 0,
            lastNotifyAt: Number(parsed.source?.lastNotifyAt) || 0,
            lastError: typeof parsed.source?.lastError === 'string' ? parsed.source.lastError : '',
            everUp: Boolean(parsed.source?.everUp)
          }
        }
      }
    } catch {
      /* 文件不存在或损坏时使用初始状态 */
    }
  }

  /**
   * 读取单个监控项状态
   * @param {string} id 监控项 ID
   * @returns {MonitorState|undefined}
   */
  getMonitor (id) {
    return this.data.monitors[id]
  }

  /**
   * 更新单个监控项状态
   * @param {string} id 监控项 ID
   * @param {Partial<MonitorState>} patch 变更字段
   */
  setMonitor (id, patch) {
    this.data.monitors[id] = { ...(this.data.monitors[id] || {}), ...patch }
    this.save()
  }

  /** 面板健康状态 */
  get source () {
    return this.data.source
  }

  /**
   * 更新面板健康状态
   * @param {Partial<{ failing: number, down: boolean, downSince: number, lastNotifyAt: number, lastError: string }>} patch
   */
  setSource (patch) {
    this.data.source = { ...this.data.source, ...patch }
    this.save()
  }

  /** 立即落盘 */
  flush () {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.write()
  }

  /** 延迟落盘（合并高频写入） */
  save () {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.write()
    }, 300)
    /** 不阻止进程退出 */
    this.timer.unref?.()
  }

  /** 写入磁盘 */
  write () {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch {
      /* 写入失败不影响主流程 */
    }
  }
}
