/**
 * 状态机测试（不依赖 Karin）
 * 运行：node test/test-engine.mjs
 */

import { evaluate, filterSnapshot } from '../src/engine.js'
import { STATUS } from '../src/client.js'

let passed = 0
let failed = 0

const assert = (condition, message) => {
  if (condition) {
    passed++
  } else {
    failed++
    console.error(`✗ ${message}`)
  }
}

/** 内存状态存储 */
const createStore = () => {
  const map = new Map()
  return {
    map,
    getMonitor: (id) => map.get(id),
    setMonitor: (id, patch) => map.set(id, { ...(map.get(id) || {}), ...patch })
  }
}

/** 构造快照 */
const makeSnapshot = (status, time = Date.now(), name = 'Web 主站') => ({
  fetchedAt: time,
  groups: [{
    id: 1,
    name: '默认分组',
    monitors: [{
      id: '1',
      name,
      type: 'http',
      status,
      latest: { status, time, ping: 12 },
      heartbeats: [{ status, time, ping: 12 }],
      allHeartbeats: [{ status, time, ping: 12 }],
      uptime24: 0.99,
      avgPing: 12,
      group: '默认分组'
    }]
  }],
  monitors: [{
    id: '1',
    name,
    type: 'http',
    status,
    latest: { status, time, ping: 12 },
    heartbeats: [{ status, time, ping: 12 }],
    allHeartbeats: [{ status, time, ping: 12 }],
    uptime24: 0.99,
    avgPing: 12,
    group: '默认分组'
  }],
  summary: { total: 1, up: status === STATUS.UP ? 1 : 0, down: status === STATUS.DOWN ? 1 : 0, pending: 0, maintenance: 0, overall: 'unknown' }
})

const baseCfg = {
  alertOnPending: false,
  notifyOnStart: false,
  notifyRecovery: true,
  repeatInterval: 30,
  onlyMonitors: [],
  ignoreMonitors: []
}

/** 1. 首次只记录基线 */
{
  const store = createStore()
  const t0 = Date.now()
  const result = evaluate(makeSnapshot(STATUS.UP, t0), baseCfg, store, t0)

  assert(result.downItems.length === 0, '首次检测不应告警')
  assert(result.upItems.length === 0, '首次检测不应恢复')
  assert(store.getMonitor('1').status === STATUS.UP, '首次检测应记录状态')
  assert(store.getMonitor('1').since === t0, '首次检测应记录 since')
}

/** 2. 正常 -> 异常 -> 重复提醒 -> 恢复 */
{
  const store = createStore()
  const t0 = Date.now()

  evaluate(makeSnapshot(STATUS.UP, t0), baseCfg, store, t0)

  const t1 = t0 + 60 * 1000
  const down = evaluate(makeSnapshot(STATUS.DOWN, t1), baseCfg, store, t1)
  assert(down.downItems.length === 1, '异常应产生 1 条告警')
  assert(down.downItems[0].label === '故障', '告警标签应为故障')
  assert(store.getMonitor('1').notifyCount === 1, '告警次数应为 1')

  const t2 = t1 + 10 * 60 * 1000
  const still = evaluate(makeSnapshot(STATUS.DOWN, t2), baseCfg, store, t2)
  assert(still.downItems.length === 0, '持续异常不应重复产生告警事件')
  assert(still.repeatItems.length === 0, '未到重复间隔不应提醒')

  const t3 = t1 + 31 * 60 * 1000
  const repeat = evaluate(makeSnapshot(STATUS.DOWN, t3), baseCfg, store, t3)
  assert(repeat.repeatItems.length === 1, '超过重复间隔应产生提醒')
  assert(repeat.repeatItems[0].notifyCount === 2, '重复提醒次数应为 2')

  const t4 = t3 + 60 * 1000
  const up = evaluate(makeSnapshot(STATUS.UP, t4), baseCfg, store, t4)
  assert(up.upItems.length === 1, '恢复应产生 1 条通知')
  assert(up.upItems[0].downSince === t1, '恢复事件应带中断起始时间')
  assert(store.getMonitor('1').notifyCount === 0, '恢复后告警次数应重置')
}

/** 3. notifyOnStart = true 时启动即告警 */
{
  const store = createStore()
  const t0 = Date.now()
  const result = evaluate(makeSnapshot(STATUS.DOWN, t0), { ...baseCfg, notifyOnStart: true }, store, t0)

  assert(result.downItems.length === 1, 'notifyOnStart 应告警')
  assert(result.downItems[0].since === 0, '启动告警不应带持续时长')
}

/** 4. 未告警过的异常不发送恢复通知 */
{
  const store = createStore()
  const t0 = Date.now()
  evaluate(makeSnapshot(STATUS.DOWN, t0), baseCfg, store, t0)

  const up = evaluate(makeSnapshot(STATUS.UP, t0 + 60000), baseCfg, store, t0 + 60000)
  assert(up.upItems.length === 0, '没有告警过就不应发送恢复通知')
}

/** 5. PENDING 默认不告警，转为 DOWN 时告警 */
{
  const store = createStore()
  const t0 = Date.now()
  evaluate(makeSnapshot(STATUS.UP, t0), baseCfg, store, t0)

  const pending = evaluate(makeSnapshot(STATUS.PENDING, t0 + 60000), baseCfg, store, t0 + 60000)
  assert(pending.downItems.length === 0, 'PENDING 默认不告警')
  assert(store.getMonitor('1').status === STATUS.PENDING, '应记录 PENDING 状态')

  const down = evaluate(makeSnapshot(STATUS.DOWN, t0 + 120000), baseCfg, store, t0 + 120000)
  assert(down.downItems.length === 1, 'PENDING 转 DOWN 应告警')
}

/** 6. alertOnPending = true 时 PENDING 告警 */
{
  const store = createStore()
  const t0 = Date.now()
  evaluate(makeSnapshot(STATUS.UP, t0), baseCfg, store, t0)

  const pending = evaluate(
    makeSnapshot(STATUS.PENDING, t0 + 60000),
    { ...baseCfg, alertOnPending: true },
    store,
    t0 + 60000
  )
  assert(pending.downItems.length === 1, 'alertOnPending 应告警')
  assert(pending.downItems[0].label === '待确认', '标签应为待确认')
}

/** 7. 维护状态不告警 */
{
  const store = createStore()
  const t0 = Date.now()
  evaluate(makeSnapshot(STATUS.UP, t0), baseCfg, store, t0)

  const maintenance = evaluate(makeSnapshot(STATUS.MAINTENANCE, t0 + 60000), baseCfg, store, t0 + 60000)
  assert(maintenance.downItems.length === 0, '维护中不应告警')
  assert(maintenance.upItems.length === 0, '维护中不应发送恢复')
}

/** 8. repeatInterval = 0 时不重复提醒 */
{
  const store = createStore()
  const t0 = Date.now()
  evaluate(makeSnapshot(STATUS.UP, t0), baseCfg, store, t0)
  evaluate(makeSnapshot(STATUS.DOWN, t0 + 60000), { ...baseCfg, repeatInterval: 0 }, store, t0 + 60000)

  const repeat = evaluate(
    makeSnapshot(STATUS.DOWN, t0 + 999 * 60000),
    { ...baseCfg, repeatInterval: 0 },
    store,
    t0 + 999 * 60000
  )
  assert(repeat.repeatItems.length === 0, 'repeatInterval 为 0 时不重复提醒')
}

/** 9. 过滤 onlyMonitors / ignoreMonitors */
{
  const snapshot = {
    fetchedAt: Date.now(),
    groups: [
      {
        id: 1,
        name: 'A',
        monitors: [
          { id: '1', name: 'Web 主站', status: STATUS.UP },
          { id: '2', name: '数据库', status: STATUS.DOWN }
        ]
      },
      {
        id: 2,
        name: 'B',
        monitors: [
          { id: '3', name: '备份任务', status: STATUS.MAINTENANCE }
        ]
      }
    ],
    monitors: [
      { id: '1', name: 'Web 主站', status: STATUS.UP },
      { id: '2', name: '数据库', status: STATUS.DOWN },
      { id: '3', name: '备份任务', status: STATUS.MAINTENANCE }
    ],
    summary: { total: 3, up: 1, down: 1, pending: 0, maintenance: 1, overall: 'down' }
  }

  const only = filterSnapshot(snapshot, { ...baseCfg, onlyMonitors: ['数据库'] })
  assert(only.monitors.length === 1, 'onlyMonitors 应只保留匹配项')
  assert(only.summary.down === 1, 'onlyMonitors 应重算汇总')
  assert(only.summary.overall === 'down', 'onlyMonitors 整体状态')

  const ignore = filterSnapshot(snapshot, { ...baseCfg, ignoreMonitors: ['数据库'] })
  assert(ignore.monitors.length === 2, 'ignoreMonitors 应排除匹配项')
  assert(ignore.summary.down === 0, 'ignoreMonitors 应重算汇总')
  assert(ignore.summary.overall === 'up', 'ignoreMonitors 整体状态')

  const byId = filterSnapshot(snapshot, { ...baseCfg, onlyMonitors: ['3'] })
  assert(byId.monitors.length === 1 && byId.monitors[0].name === '备份任务', '应支持按 ID 过滤')
}

console.log('')
console.log(`状态机测试：${passed} 通过，${failed} 失败`)
if (failed > 0) process.exit(1)
