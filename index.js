/**
 * 插件入口
 *
 * Karin 加载插件包时会先执行 main 入口，再加载 karin.apps 中配置的目录。
 * 这里负责初始化配置目录，并打印一次加载信息。
 */

import { logger } from 'node-karin'
import { dir, ensureConfig, getConfig } from './src/config.js'
import { mountWebUI } from './src/web/index.js'

/** 初始化配置（复制默认配置到 @karinjs/<插件名>/config） */
const init = () => {
  ensureConfig()

  try {
    const cfg = getConfig()
    logger.info(`[server-status] 插件已加载 · 面板 ${cfg.statusUrl} · 状态页 ${cfg.statusSlug} · 自动告警 ${cfg.enable ? '开启' : '关闭'}`)
    logger.debug(`[server-status] 配置文件：${dir.configFile}`)
  } catch (error) {
    logger.error(`[server-status] 配置初始化失败：${error?.message || error}`)
  }

  /** WebUI 挂载失败不影响监控主流程 */
  void mountWebUI()
}

init()

/**
 * Karin 插件初始化钩子
 * - 入口已经执行过一次，这里只确保目录存在，避免重复打印日志
 */
export const KARIN_PLUGIN_INIT = async () => {
  ensureConfig()
  await mountWebUI()
}
