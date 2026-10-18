/**
 * node-karin 桩模块（仅用于本地集成测试，不会随插件发布）
 *
 * 模拟插件实际用到的最小 API 集合，便于在没有 Karin 环境时验证链路。
 */

import fs from 'node:fs'
import path from 'node:path'

/** 捕获所有发送的消息 */
export const __messages = []
/** 捕获注册的指令与任务 */
export const __commands = []
export const __tasks = []

export const karinPathBase = path.join(process.cwd(), '@karinjs')
export const karinPathHtml = path.join(karinPathBase, 'temp', 'html')

export const logger = {
  info: (...args) => console.log('[info]', ...args),
  warn: (...args) => console.warn('[warn]', ...args),
  error: (...args) => console.error('[error]', ...args),
  debug: () => {},
  mark: (...args) => console.log('[mark]', ...args),
  bot: () => {},
  green: (text) => text,
  red: (text) => text,
  yellow: (text) => text
}

export const segment = {
  text: (text) => ({ type: 'text', text }),
  image: (file) => ({ type: 'image', file })
}

const makeFile = (type, name) => ({ type, name, absPath: '', basename: '', dirname: '', method: '' })

export const karin = {
  command: (reg, fnc, options = {}) => {
    const command = {
      type: 'fnc',
      event: 'message',
      fnc,
      reg: typeof reg === 'string' ? new RegExp(reg) : reg,
      permission: options.perm || options.permission || 'all',
      priority: options.rank ?? options.priority ?? 10000,
      file: makeFile('command', options.name || 'command'),
      pkg: {},
      name: options.name
    }
    __commands.push(command)
    return command
  },
  task: (name, cron, fnc, options = {}) => {
    const task = {
      name,
      cron,
      fnc,
      type: options.type || 'default',
      file: makeFile('task', options.name || 'task'),
      pkg: {},
      log: () => {}
    }
    __tasks.push(task)
    return task
  },
  getAllBot: () => [{ selfId: '10000', account: { name: '测试Bot' } }],
  contactGroup: (peer, name) => ({ scene: 'group', peer, name }),
  contactFriend: (peer, name) => ({ scene: 'friend', peer, name }),
  sendMsg: async (selfId, contact, elements, options) => {
    __messages.push({ selfId, contact, elements, options })
    return { messageId: `msg-${__messages.length}`, time: Date.now() }
  }
}

export default karin

export const config = {
  master: () => ['10000'],
  admin: () => []
}

/** 捕获 WebUI 挂载的路由 */
export const __appRoutes = []

/** 模拟 Karin 导出的 express 实例 */
export const app = {
  use: (prefix, ...handlers) => {
    __appRoutes.push({ prefix, handlers })
  }
}

/** 鉴权中间件：桩环境直接放行 */
export const authMiddleware = (_req, _res, next) => (typeof next === 'function' ? next() : undefined)

/** 插件 Web 配置声明 */
export const defineConfig = (value) => value

const sendJson = (res, code, data, message) => {
  if (typeof res.status === 'function') return res.status(code).json({ code, data, message })
  res.statusCode = code
  res.__json = { code, data, message }
  return res
}

export const createSuccessResponse = (res, data, message = '请求成功') => sendJson(res, 200, data, message)
export const createBadRequestResponse = (res, message = '请求参数错误') => sendJson(res, 400, null, message)
export const createServerErrorResponse = (res, message = '服务器错误') => sendJson(res, 500, null, message)

export const render = {
  render: async (options) => {
    /** 记录渲染参数，返回假的 base64 */
    __messages.push({ __render: true, options })
    return 'RkFLRUJBU0U2NA=='
  }
}

export const copyConfigSync = (defaulPath, userPath, suffixs = []) => {
  fs.mkdirSync(userPath, { recursive: true })
  if (!fs.existsSync(defaulPath)) return false

  for (const file of fs.readdirSync(defaulPath)) {
    if (suffixs.length > 0 && !suffixs.some((suffix) => file.endsWith(suffix.replace(/^\./, '')))) continue
    const target = path.join(userPath, file)
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(defaulPath, file), target)
  }
  return true
}

export const requireFileSync = (filePath) => {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}
