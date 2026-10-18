/**
 * WebUI 挂载入口
 *
 * 把插件自己的 express 路由挂到 Karin 的 app 上：
 * - 页面地址与 Karin 同源，可直接在浏览器打开，也能被 WebUI iframe 嵌入；
 * - 挂载失败只告警，不影响监控主流程。
 */

import { app as karinApp, logger } from 'node-karin'
import { CONFIG_PAGE_PATH, WEB_PREFIX } from './paths.js'

let mounted = false
let mounting = null

/**
 * 挂载 WebUI（幂等）
 *
 * 路由模块动态导入：旧版 Karin 没有 `node-karin/express` 子路径时，
 * 只有 WebUI 挂载失败，不会让整个插件在加载阶段崩溃。
 *
 * @returns {Promise<boolean>} 是否已挂载
 */
export const mountWebUI = async () => {
  if (mounted) return true
  if (mounting) return mounting

  if (!karinApp || typeof karinApp.use !== 'function') {
    logger.warn('[server-status] 当前环境没有 Karin app，跳过 WebUI 挂载')
    return false
  }

  mounting = (async () => {
    try {
      const { createWebRouter } = await import('./router.js')
      karinApp.use(WEB_PREFIX, createWebRouter())
      mounted = true
      logger.debug(`[server-status] WebUI 已挂载：${CONFIG_PAGE_PATH}`)
      return true
    } catch (error) {
      logger.warn(`[server-status] WebUI 挂载失败：${error?.message || error}`)
      return false
    } finally {
      mounting = null
    }
  })()

  return mounting
}

export { CONFIG_PAGE_PATH, APP_PAGE_PATH, WEB_PREFIX } from './paths.js'
