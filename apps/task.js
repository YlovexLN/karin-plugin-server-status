/**
 * 定时检测任务
 *
 * 每分钟触发一次，由 `interval` 配置控制实际检测频率。
 * 使用 `skip` 策略，避免上一次检测未完成时重复进入。
 */

import { karin } from 'node-karin'
import { runCheck } from '../src/monitor.js'

export const statusMonitorTask = karin.task(
  '服务器状态监控检测',
  '* * * * *',
  async () => {
    await runCheck()
  },
  {
    name: 'server-status',
    log: false,
    type: 'skip'
  }
)
