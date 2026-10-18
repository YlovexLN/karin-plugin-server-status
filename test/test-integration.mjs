/**
 * 集成冒烟测试
 *
 * 使用 node_modules/node-karin 桩模块驱动插件，验证：
 * 插件加载 → 定时任务 → 状态机 → 渲染 → 推送 → 指令 → 配置读写
 *
 * 测试产生的 dev/.tmp-run、node_modules/node-karin 会在结束、异常或中断时自动清理。
 *
 * 运行：node test/test-integration.mjs
 */

import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pluginDir = path.resolve(here, '..')
/** 临时工作目录统一放在本地（不提交）的 dev/ 下 */
const tempDir = path.join(pluginDir, 'dev', '.tmp-run')
const originalCwd = process.cwd()

const stubSource = path.join(here, 'stub', 'node-karin')
const stubTarget = path.join(pluginDir, 'node_modules', 'node-karin')
const nodeModulesDir = path.join(pluginDir, 'node_modules')

let passed = 0
let failed = 0
let server = null
let stubInstalled = false
let cleaned = false

/**
 * 清理测试产生的临时目录、桩模块和空的 node_modules。
 * - 同步执行，既能用于 finally，也能挂到 exit / SIGINT 上
 * - 幂等：重复调用不会报错
 */
const cleanup = () => {
  if (cleaned) return
  cleaned = true

  try { server?.closeAllConnections?.() } catch { /* 忽略 */ }
  try { server?.close() } catch { /* 忽略 */ }
  try { process.chdir(originalCwd) } catch { /* 忽略 */ }

  try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch { /* 忽略 */ }

  if (stubInstalled) {
    try { fs.rmSync(stubTarget, { recursive: true, force: true }) } catch { /* 忽略 */ }
  }

  try {
    if (fs.existsSync(nodeModulesDir) && fs.readdirSync(nodeModulesDir).length === 0) {
      fs.rmdirSync(nodeModulesDir)
    }
  } catch { /* 忽略 */ }
}

process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })
process.on('SIGTERM', () => { cleanup(); process.exit(143) })

const assert = (condition, message) => {
  if (condition) passed++
  else {
    failed++
    console.error(`✗ ${message}`)
  }
}

/** 准备临时目录和 node-karin 桩；失败时也要清理 */
try {
  fs.rmSync(tempDir, { recursive: true, force: true })
  fs.mkdirSync(tempDir, { recursive: true })

  /** 已存在同名模块时，只允许是上一次残留的桩 */
  if (fs.existsSync(stubTarget)) {
    const content = fs.readFileSync(path.join(stubTarget, 'index.js'), 'utf-8')
    if (!content.includes('__messages')) {
      throw new Error('检测到已安装真实的 node-karin，请先移除 node_modules 再运行集成测试')
    }
    fs.rmSync(stubTarget, { recursive: true, force: true })
  }

  fs.mkdirSync(nodeModulesDir, { recursive: true })
  stubInstalled = true
  fs.cpSync(stubSource, stubTarget, { recursive: true })
} catch (error) {
  console.error(`✗ 集成测试准备失败：${error?.message || error}`)
  cleanup()
  process.exit(1)
}

/** 可变的面板状态 */
const state = { status: 1, time: Date.now() }
const isoUtc = (ts) => new Date(ts).toISOString().replace('T', ' ').replace('Z', '')

const pageData = {
  config: { slug: 'default', title: '集成测试状态页', description: '' },
  publicGroupList: [{
    id: 1,
    name: '核心服务',
    monitorList: [{ id: 1, name: 'Web 主站', type: 'http', url: 'https://example.com', tags: [] }]
  }]
}

const heartbeatData = () => ({
  heartbeatList: {
    1: [{ status: state.status, time: isoUtc(state.time), msg: '', ping: 12 }]
  },
  uptimeList: { '1_24': 0.99 }
})

server = http.createServer((req, res) => {
  const url = req.url || ''
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(url.includes('heartbeat') ? heartbeatData() : pageData))
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

/** 切换到临时工作目录，隔离 @karinjs 数据 */
process.chdir(tempDir)

const stub = await import('node-karin')
const { __messages, __commands, __tasks } = stub

try {
  /** 1. 加载插件入口（会自动释放默认配置） */
  await import(`file://${path.join(pluginDir, 'index.js').replace(/\\/g, '/')}`)

  const configFile = path.join(tempDir, '@karinjs', 'karin-plugin-server-status', 'config', 'config.json')
  assert(fs.existsSync(configFile), '入口应生成用户配置')

  /** 2. 写入测试配置 */
  fs.writeFileSync(configFile, JSON.stringify({
    enable: true,
    statusUrl: `http://127.0.0.1:${port}`,
    statusSlug: 'default',
    interval: 30,
    targets: [{ scene: 'group', peer: '123456', name: '运维群' }],
    fallbackToMaster: false,
    enableImage: true,
    timezone: 'Asia/Shanghai',
    repeatInterval: 30
  }, null, 2), 'utf-8')

  /** 3. 加载 apps，确认注册成功 */
  await import(`file://${path.join(pluginDir, 'apps', 'task.js').replace(/\\/g, '/')}`)
  await import(`file://${path.join(pluginDir, 'apps', 'status.js').replace(/\\/g, '/')}`)
  await import(`file://${path.join(pluginDir, 'apps', 'subscribe.js').replace(/\\/g, '/')}`)

  assert(__tasks.length === 1, '应注册 1 个定时任务')
  assert(__tasks[0].cron === '* * * * *', '任务 cron 应为每分钟')
  assert(__tasks[0].type === 'skip', '任务应使用 skip 策略')
  assert(__commands.length === 8, `应注册 8 个指令，实际 ${__commands.length}`)

  const findCommand = (name) => __commands.find((command) => command.name === name)
  assert(Boolean(findCommand('监控状态')), '应注册状态指令')
  assert(Boolean(findCommand('监控订阅')), '应注册订阅指令')

  /** 4. 首次检测：建立基线，不推送 */
  const monitor = await import(`file://${path.join(pluginDir, 'src', 'monitor.js').replace(/\\/g, '/')}`)

  let result = await monitor.runCheck({ force: true })
  assert(result.ok === true, '首次检测应成功')
  assert(result.changes.length === 0, '首次检测不应产生事件')
  assert(__messages.length === 0, '首次检测不应推送消息')

  /** 5. 任务函数可正常执行（受 interval 限制会跳过） */
  await __tasks[0].fnc()
  assert(__messages.length === 0, '间隔内任务应跳过')

  /** 6. 状态变为故障 → 推送告警 + 图片 */
  state.status = 0
  state.time = Date.now()
  result = await monitor.runCheck({ force: true })

  assert(result.changes.length === 1 && result.changes[0].type === 'down', '应产生 1 条故障事件')
  assert(result.notifications?.total === 1 && result.notifications?.success === 1, '告警推送统计应为 1/1')

  const renderCall = __messages.find((item) => item.__render)
  const alert = __messages.find((item) => item.elements)
  assert(Boolean(renderCall), '应调用渲染器生成图片')
  assert(Boolean(alert), '应发送告警消息')
  assert(alert.contact.scene === 'group' && alert.contact.peer === '123456', '应发送到配置的群')
  assert(alert.elements[0].text.includes('监控告警'), '告警文本应包含「监控告警」')
  assert(alert.elements.some((item) => item.type === 'image' && item.file.startsWith('base64://')), '告警应附带图片')
  assert(renderCall.options.setViewport.width === 1056, '视窗宽度应为卡片宽度 + 内边距')

  /** 7. 状态未变化 → 不重复推送 */
  const before = __messages.length
  await monitor.runCheck({ force: true })
  assert(__messages.length === before, '状态未变化不应重复推送')

  /** 8. 状态恢复 → 推送恢复消息 */
  state.status = 1
  state.time = Date.now()
  result = await monitor.runCheck({ force: true })

  assert(result.changes.some((item) => item.type === 'up'), '应产生恢复事件')
  assert(result.notifications?.total === 1 && result.notifications?.success === 1, '恢复推送统计应为 1/1')
  const recovery = __messages.filter((item) => item.elements).at(-1)
  assert(recovery.elements[0].text.includes('监控恢复'), '恢复文本应包含「监控恢复」')
  assert(recovery.elements[0].text.includes('中断时长'), '恢复文本应包含中断时长')

  /** 9. 状态持久化 */
  const stateFile = path.join(tempDir, '@karinjs', 'karin-plugin-server-status', 'data', 'state.json')
  assert(fs.existsSync(stateFile), '应写入状态文件')
  const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
  assert(stateData.monitors['1'].status === 1, '状态文件应记录最新状态')

  /** 10. #监控状态 指令 */
  const statusCommand = findCommand('监控状态')
  const replies = []
  const fakeEvent = {
    msg: '#监控状态',
    matched: null,
    contact: { scene: 'group', peer: '123456', name: '运维群' },
    reply: async (elements) => { replies.push(elements) }
  }

  await statusCommand.fnc(fakeEvent)
  assert(replies.length === 1, '状态指令应回复一次')
  assert(Array.isArray(replies[0]) && replies[0][0].type === 'image', '状态指令应回复图片')

  /** 11. #监控详情 指令（无参数 → 列表） */
  const detailCommand = findCommand('监控详情')
  replies.length = 0
  await detailCommand.fnc({ ...fakeEvent, msg: '#监控详情' })
  assert(replies[0].includes('当前监控项'), '详情指令无参数时应列出监控项')

  replies.length = 0
  await detailCommand.fnc({ ...fakeEvent, msg: '#监控详情 Web' })
  assert(Array.isArray(replies[0]) && replies[0][0].type === 'image', '详情指令应回复详情图')

  replies.length = 0
  await detailCommand.fnc({ ...fakeEvent, msg: '#监控详情 不存在的服务' })
  assert(replies[0].includes('未找到匹配'), '详情指令应提示未找到')

  /** 12. #监控检测 指令（无变化） */
  const checkCommand = findCommand('监控检测')
  replies.length = 0
  await checkCommand.fnc({ ...fakeEvent, msg: '#监控检测' })
  assert(replies[0].includes('检测完成'), '检测指令应返回结果')
  assert(replies[0].includes('状态无变化'), '无变化时应提示状态无变化')

  /** 12.1 #监控检测 产生异常 → 按实际推送结果提示 */
  state.status = 0
  state.time = Date.now()
  replies.length = 0
  await checkCommand.fnc({ ...fakeEvent, msg: '#监控检测' })
  assert(replies[0].includes('异常：Web 主站'), '检测指令应列出异常项')
  assert(replies[0].includes('通知已发送'), '检测指令应提示实际推送结果')
  assert(!replies[0].includes('告警已同步推送'), '检测指令不应再使用乐观文案')

  /** 12.2 没有可用推送目标 → 明确提示未发送 */
  const noTargetConfig = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
  noTargetConfig.targets = []
  noTargetConfig.fallbackToMaster = false
  fs.writeFileSync(configFile, JSON.stringify(noTargetConfig, null, 2), 'utf-8')

  state.status = 1
  state.time = Date.now()
  replies.length = 0
  await checkCommand.fnc({ ...fakeEvent, msg: '#监控检测' })
  assert(replies[0].includes('没有可用的推送目标'), '无目标时应提示未发送通知')

  /** 恢复目标配置；监控状态已在 12.2 中转为正常 */
  noTargetConfig.targets = [{ scene: 'group', peer: '123456', name: '运维群' }]
  fs.writeFileSync(configFile, JSON.stringify(noTargetConfig, null, 2), 'utf-8')

  /** 12.3 notify:false → 仍更新状态，但不发送任何通知 */
  const beforeSilent = __messages.filter((item) => item.elements).length
  state.status = 0
  state.time = Date.now()
  const silentDown = await monitor.runCheck({ force: true, notify: false })
  assert(silentDown.changes.some((item) => item.type === 'down'), '静默检测仍应产生事件')
  assert(silentDown.notified === false, '静默检测应标记 notified=false')
  assert(silentDown.notifications.total === 0, '静默检测不应推送')
  assert(__messages.filter((item) => item.elements).length === beforeSilent, '静默检测不应发送消息')

  state.status = 1
  state.time = Date.now()
  const silentUp = await monitor.runCheck({ force: true, notify: false })
  assert(silentUp.changes.some((item) => item.type === 'up'), '静默检测仍应产生恢复事件')
  assert(__messages.filter((item) => item.elements).length === beforeSilent, '静默恢复不应发送消息')

  /** 13. 订阅 / 退订 */
  const subscribeCommand = findCommand('监控订阅')
  const unsubscribeCommand = findCommand('监控退订')
  const groupEvent = {
    ...fakeEvent,
    contact: { scene: 'group', peer: '654321', name: '测试群' }
  }

  replies.length = 0
  await subscribeCommand.fnc(groupEvent)
  assert(replies[0].includes('订阅成功'), '订阅指令应成功')

  const afterSubscribe = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
  assert(afterSubscribe.targets.some((item) => item.peer === '654321'), '订阅后配置应写入目标')

  replies.length = 0
  await subscribeCommand.fnc(groupEvent)
  assert(replies[0].includes('已在告警推送列表'), '重复订阅应提示')

  replies.length = 0
  await unsubscribeCommand.fnc(groupEvent)
  assert(replies[0].includes('已取消订阅'), '退订指令应成功')

  const afterUnsubscribe = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
  assert(!afterUnsubscribe.targets.some((item) => item.peer === '654321'), '退订后配置应移除目标')
  assert(afterUnsubscribe.targets.some((item) => item.peer === '123456'), '退订不应影响其他目标')

  /** 14. #监控测试推送 */
  const testPushCommand = findCommand('监控测试推送')
  assert(Boolean(testPushCommand), '应注册测试推送指令')

  const beforePush = __messages.filter((item) => item.elements).length
  replies.length = 0
  await testPushCommand.fnc({ ...fakeEvent, msg: '#监控测试推送' })
  assert(replies[0].includes('测试推送完成'), '测试推送应返回结果')
  assert(__messages.filter((item) => item.elements).length === beforePush + 1, '测试推送应发送 1 条消息')

  /** 15. #监控帮助 指令 */
  const helpCommand = findCommand('监控帮助')
  replies.length = 0
  await helpCommand.fnc({ ...fakeEvent, msg: '#监控帮助' })
  assert(replies[0].includes('#监控状态'), '帮助指令应包含指令列表')

  /** 16. 面板不可达告警（连续失败达到阈值） */
  const brokenConfig = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
  brokenConfig.statusUrl = 'http://127.0.0.1:1'
  brokenConfig.sourceDownRetries = 3
  fs.writeFileSync(configFile, JSON.stringify(brokenConfig, null, 2), 'utf-8')

  const beforeDown = __messages.filter((item) => item.elements).length

  await monitor.runCheck({ force: true })
  await monitor.runCheck({ force: true })
  assert(__messages.filter((item) => item.elements).length === beforeDown, '未达阈值不应告警面板不可达')

  const third = await monitor.runCheck({ force: true })
  assert(third.ok === false, '面板不可达时检测应返回失败')
  assert(third.changes.some((item) => item.type === 'source-down'), '应产生面板不可达事件')
  assert(third.notifications?.total === 1 && third.notifications?.success === 1, '面板不可达通知统计应为 1/1')

  const sourceState = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
  assert(sourceState.source.down === true, '面板掉线状态应立即落盘')
  assert(sourceState.source.failing >= 3, '面板连续失败次数应落盘')

  const panelDownMessage = __messages.filter((item) => item.elements).at(-1)
  assert(panelDownMessage.elements[0].text.includes('面板不可达'), '应推送面板不可达消息')

  /** 面板不可达告警只发送一次 */
  const afterDown = __messages.filter((item) => item.elements).length
  await monitor.runCheck({ force: true })
  assert(__messages.filter((item) => item.elements).length === afterDown, '面板持续不可达不应重复告警')

  /** 17. 非法 statusUrl 不应抛出，也不能卡住 running 锁 */
  const invalidConfig = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
  invalidConfig.statusUrl = ''
  fs.writeFileSync(configFile, JSON.stringify(invalidConfig, null, 2), 'utf-8')

  const invalid = await monitor.runCheck({ force: true })
  assert(invalid.ok === false, '非法 statusUrl 应返回失败而不是抛出')
  assert(monitor.getRuntime().running === false, '非法 statusUrl 后应释放 running 锁')

  const retry = await monitor.runCheck({ force: true })
  assert(retry.ok === false, '非法 statusUrl 重试应仍返回失败')

  /** 18. WebUI 挂载与配置 API */
  const webEntry = await import(`file://${path.join(pluginDir, 'src', 'web', 'index.js').replace(/\\/g, '/')}`)
  const webApi = await import(`file://${path.join(pluginDir, 'src', 'web', 'api.js').replace(/\\/g, '/')}`)
  const { validateConfigPatch } = await import(`file://${path.join(pluginDir, 'src', 'web', 'validate.js').replace(/\\/g, '/')}`)

  assert((await webEntry.mountWebUI()) === true, 'WebUI 应挂载成功')
  assert(stub.__appRoutes.some((route) => route.prefix === '/server-status'), 'WebUI 应挂载到 /server-status')
  assert((await webEntry.mountWebUI()) === true, '重复挂载 WebUI 应保持幂等')
  assert(stub.__appRoutes.filter((route) => route.prefix === '/server-status').length === 1, 'WebUI 不应重复挂载')

  const patchOk = validateConfigPatch({ interval: 120, targets: ['group:123456'], enable: false })
  assert(patchOk.ok === true && patchOk.patch.interval === 120, '合法配置片段应通过校验')
  assert(validateConfigPatch({ unknownKey: 1 }).ok === false, '未知配置项应被拒绝')
  assert(validateConfigPatch({ interval: 'abc' }).ok === false, '非数字 interval 应被拒绝')
  assert(validateConfigPatch({ theme: 'blue' }).ok === false, '非法 theme 应被拒绝')
  assert(validateConfigPatch({ width: 100 }).ok === false, '超出范围的 width 应被拒绝')

  const createRes = () => ({
    statusCode: 0,
    body: null,
    status (code) { this.statusCode = code; return this },
    json (body) { this.body = body; return this }
  })

  const getRes = createRes()
  webApi.getConfigHandler({}, getRes)
  assert(getRes.statusCode === 200, 'GET /v1/config 应返回 200')
  assert(getRes.body.data.defaults.interval === 60, 'GET /v1/config 应返回默认配置')
  assert(typeof getRes.body.data.meta.configFile === 'string', 'GET /v1/config 应返回配置文件路径')

  const saveRes = createRes()
  webApi.saveConfigHandler({
    body: {
      config: {
        statusUrl: `http://127.0.0.1:${port}`,
        interval: 120,
        targets: ['group:123456'],
        fallbackToMaster: true
      }
    }
  }, saveRes)
  assert(saveRes.statusCode === 200, 'POST /v1/config 应保存成功')
  assert(saveRes.body.data.config.interval === 120, 'POST /v1/config 应返回归一化后的配置')

  const badRes = createRes()
  webApi.saveConfigHandler({ body: { config: { interval: 'abc' } } }, badRes)
  assert(badRes.statusCode === 400, '非法配置应返回 400')
  assert(String(badRes.body.message).includes('interval'), '非法配置应说明具体字段')

  const pushRes = createRes()
  await webApi.testPushHandler({}, pushRes)
  assert(pushRes.statusCode === 200, 'POST /v1/test-push 应发送成功')
  assert(pushRes.body.data.total >= 1, '测试推送应至少命中一个目标')

  const emptyPushRes = createRes()
  webApi.saveConfigHandler({ body: { config: { targets: [], fallbackToMaster: false } } }, createRes())
  await webApi.testPushHandler({}, emptyPushRes)
  assert(emptyPushRes.statusCode === 400, '没有推送目标时测试推送应返回 400')

  const stateRes = createRes()
  webApi.getStateHandler({}, stateRes)
  assert(stateRes.statusCode === 200, 'GET /v1/state 应返回 200')
  assert(typeof stateRes.body.data.updatedAt === 'number', 'GET /v1/state 应返回更新时间')
} finally {
  cleanup()
}

console.log('')
console.log(`集成测试：${passed} 通过，${failed} 失败`)
if (failed > 0) process.exit(1)
