# AGENTS.md

本文件面向在本仓库中工作的 AI Agent 与人类贡献者，说明项目定位、硬性约束、代码结构、运行链路、常用命令和容易踩的坑。

> 本文件描述**当前实现的事实**，不是待办清单。修改代码后请同步更新对应章节；当文档与代码冲突时，以代码和测试为准，并修正文档。

## 1. 项目定位

`karin-plugin-server-status` 是一个 Karin 机器人框架插件：

- 定时轮询**公开状态页 API**（兼容 Uptime Kuma 1.x / 2.x 的 `/api/status-page/*`）；
- 监控项异常 / 恢复时主动推送 QQ 消息；
- 附带一张仿状态页的监控截图（HTML → Karin 渲染器截图）。

### 非目标

- 不实现登录、写入、删除、暂停监控等会改动面板的操作，只读公开接口。
- 不代替面板自带的通知系统，不配置 Webhook，不保存面板账号密码。
- 不做多面板聚合、告警升级、值班表等额外功能；保持单面板、单进程、轻量。

## 2. 技术约束（硬性）

- **纯 ESM**（`"type": "module"`）。插件运行时 Node.js >= 18；构建 WebUI 需要 Node.js >= 20.19（Vite 8 要求）。
- **运行时不引入第三方依赖**：只允许 `node:*` 内置模块与 `node-karin`（含 `node-karin/express`）。
  `devDependencies` 仅用于构建 WebUI，禁止把 React / Vite / HeroUI 等移入 `dependencies`。
- Karin 版本要求 `>=1.8.0`（见 `package.json` 的 `engines.karin`）；`karin.web` 的 `page` 内嵌页需要 Karin `>=1.16.1`，
  旧版本会忽略该字段，插件仍可运行，配置页可在浏览器独立打开。
- 包管理器为 **pnpm**（`packageManager: pnpm@11.9.0`）；提交 `pnpm-lock.yaml`，不要混用 npm / yarn 生成锁文件。
- 前端源码在 `web/`（React 19 + Vite 8 + Tailwind 4 + HeroUI v3），构建产物 `web-dist/` 不提交。
- 后端仍是纯 JavaScript，不使用 TypeScript；`tsc` 只对 `web/` 做类型检查（`pnpm typecheck:web`）。
- 面向用户的文案统一使用简体中文；日志前缀统一为 `[server-status]`。
- 对外命名保持中性：包名、指令、配置键、截图品牌都不出现上游产品名。
  上游产品名只允许出现在 `src/client.js` 的注释、README 的「兼容性」「数据源准备」章节，以及本文件。
- 仓库没有 ESLint / Prettier / CI；验证靠 `pnpm check`（`node --check` + `tsc`）、`pnpm build:web` 与 `test/` 下的脚本。
- **`test/` 与 `dev/` 都是本地目录（`test/` 放测试脚本，`dev/` 放生成产物），整个被 git 忽略，不随仓库或 npm 包发布**：临时内容统一用 `dev/.tmp-*/`，验证结束立即删除；
  禁止写到系统临时目录、用户目录或项目外路径，也不要把调试脚本留在 C 盘 / `%TEMP%`。
- 不要使用高于 Node 18 的运行时 API（如 `Object.groupBy`、`Promise.withResolvers`、`Array.prototype.toSorted`）；
  本机测试版本可能更高，但插件要能在 18 上跑；前端构建脚本不受此限制。
- 许可证为 **GPL-3.0-only**；修改协议时同步 `LICENSE`、`package.json` 的 `license` 和 README 的 License 章节。

## 3. 目录结构

```
index.js            插件入口（初始化配置目录、挂载 WebUI，导出 KARIN_PLUGIN_INIT）
package.json        Karin 插件声明（files / karin.files / karin.web / engines）
web.config.js       Karin WebUI 声明：info + page（iframe 地址）
web/                WebUI 前端源码（React + Vite）
  index.html
  vite.config.mjs   base=/server-status/assets/，产物输出到 web-dist
  tsconfig.json     仅用于 pnpm typecheck:web
  src/              React 源码（页面、组件、API 客户端、主题、校验）
web-dist/           WebUI 构建产物（git 忽略，发布前由 prepublishOnly 构建）
apps/               Karin 自动加载的插件应用（每个文件导出 karin.command / karin.task）
  task.js           每分钟触发的检测任务（type: skip）
  status.js         #监控状态 / #监控详情 / #监控检测
  subscribe.js      #监控订阅 / #监控退订 / #监控目标 / #监控测试推送 / #监控帮助
src/
  config.js         配置读写与归一化（@karinjs/<插件目录名>/config/config.json）
  client.js         状态页 API 客户端（fetch + 超时 + 数据归一化）
  engine.js         状态机与过滤（纯逻辑，不依赖 node-karin）
  state.js          状态持久化（data/state.json）
  template.js       状态图 HTML 与文本报告（纯函数，不依赖 node-karin）
  render.js         调用 Karin 渲染器截图
  notify.js         推送目标解析、消息构造与发送
  monitor.js        检测编排（拉取 → 对比 → 渲染 → 推送）
  web/              WebUI 后端（挂载到 Karin app）
    paths.js        路径常量（web-dist、挂载前缀、页面地址）
    validate.js     配置写入校验（类型 / 范围 / 未知字段）
    api.js          /v1/config、/v1/state、/v1/test-push
    static.js       静态资源 + SPA fallback
    router.js       路由组装（/v1 走 authMiddleware）
    index.js        mountWebUI（幂等挂载）
config/config.json  默认配置，首次启动复制到 @karinjs 下
docs/               README 预览图（preview*.png）；会随 npm 包发布，不要放草稿
.agents/            本地 Agent 资料（不随插件发布）
  rules/            行为规则、架构约定、禁止事项
  agents/           子代理角色
  commands/         可复用命令 / 任务模板
  workflows/        多步骤工作流
  skills/           可复用技能、脚本、操作说明
  memory/           项目背景、决策记录、术语表
  prompts/          Prompt 模板
  tools/            工具 / MCP / 权限配置
test/               本地测试脚本与 node-karin 桩（整个被 git 忽略，不随插件发布）
  preview.mjs       本地预览 HTML 生成脚本（产物写到 dev/）
  test-*.mjs        状态机 / API / 集成冒烟测试
  stub/node-karin/  集成测试用的极简 node-karin 桩（含 express.js 子路径桩）
dev/                本地预览 HTML、截图、浏览器配置、临时工作目录（整个被 git 忽略）
  .tmp-*/           临时测试脚本 / 浏览器配置 / 截图（用完即删）
```

> `docs/` 只放 README 预览图；`.agents/` 是本地 Agent 资料目录，不随 npm 包发布。`rules/` 放行为规则，`prompts/` 放提示词模板；其中的提示词仅作资料保存，与 `AGENTS.md` 冲突时以 `AGENTS.md` 为准。

## 4. 运行链路与分层

### 一次检测的数据流

```
apps/task.js（每分钟）
  └─ runCheck()
       1. getConfig()                     热读配置
       2. enable / running / interval     跳过判断
       3. new StatusClient(cfg)           解析面板地址
       4. getSnapshot()                   并行请求状态页 + 心跳
       5. buildSnapshot()                 合并为统一快照
       6. 失败 → handleSourceFailure()     面板掉线告警，返回 ok:false
       7. 成功 → handleSourceRecover()     面板恢复通知
       8. filterSnapshot() → evaluate()   过滤 + 状态机，写 StateStore
       9. 有事件 → renderStatusImage() → build*Text() → pushMessage()
      10. state.flush()                   立即落盘
```

指令走另一条路径：`#监控状态` / `#监控详情` 直接拉取快照并渲染；`#监控检测` 调用 `runCheck({ force: true, manual: true })`。

### 状态页接口

| 接口 | 用途 | 解析位置 |
| --- | --- | --- |
| `GET /api/status-page/:slug` | 状态页标题、分组、监控项列表 | `client.getStatusPage()` |
| `GET /api/status-page/heartbeat/:slug` | 最近 100 次心跳、24 小时可用率 | `client.getHeartbeats()` |

两个请求用 `Promise.all` 并发；任一失败都会让本次检测按“面板不可达”处理。接口无需登录，但要求状态页已发布、分组已公开。

### 模块依赖边界

| 模块 | 可 import `node-karin` | 说明 |
| --- | --- | --- |
| `index.js` | 是 | 只用 `logger` |
| `apps/*.js` | 是 | 注册指令 / 任务 |
| `src/config.js` | 是 | `karinPathBase`、`copyConfigSync`、`requireFileSync`、`logger` |
| `src/client.js` | 否 | 纯 `fetch` + 解析 |
| `src/engine.js` | 否 | 纯状态机 |
| `src/state.js` | 否 | 只用 `node:fs` / `node:path` |
| `src/template.js` | 否 | 纯 HTML / 文本 |
| `src/render.js` | 是 | `render`、`logger`、`karinPathHtml` |
| `src/notify.js` | 是 | `karin`、`segment`、`logger`、`config` |
| `src/monitor.js` | 是 | 编排，只用 `logger` |
| `src/web/index.js` | 是 | `app`、`logger`；路由模块动态导入 |
| `src/web/router.js` / `api.js` / `static.js` | 是 | `authMiddleware`、`node-karin/express`、响应助手 |
| `src/web/paths.js` / `validate.js` | 否 | 纯路径 / 纯校验 |
| `web/**` | 否 | 浏览器代码，只能 import 前端依赖与相对模块 |
| `test/*.mjs` | 否 | 通过 `test/stub` 模拟 |

**规则**：`client.js` / `engine.js` / `template.js` / `state.js` 不得 import `node-karin`，
以保证可以脱离 Karin 环境单测；需要 Karin 能力的代码只能放在 `render.js`、`notify.js`、`monitor.js`、`config.js`、`src/web/`、`apps/`、`index.js`。
`web/` 是浏览器运行时代码，禁止 import `node:*`、`node-karin` 或后端 `src/` 模块。

## 5. 入口与初始化

- `index.js` 在模块加载时立即执行 `ensureConfig()`，并导出 `KARIN_PLUGIN_INIT` 钩子供 Karin 二次调用。
- 入口还会调用 `mountWebUI()` 把 WebUI 路由挂到 Karin 的 `app` 上；挂载失败只 warn，不影响监控主流程。
- 入口只做「建目录 + 复制默认配置 + 挂载 WebUI + 打印一次加载信息」；不得在此发起网络请求、启动定时器或注册指令。
- `KARIN_PLUGIN_INIT` 必须保持幂等：重复执行不能重复注册任务、不能重复刷日志。
- 配置一律通过 `getConfig()` 获取，不要在模块顶层缓存配置对象（`monitor.js` 每次检测都重新读取，以支持热加载）。
- `ensureConfig()` 用 `copyConfigSync` 补缺失的默认配置文件，**不覆盖**用户已有配置；同时创建 `data/` 目录。

### 路径

| 用途 | 路径 |
| --- | --- |
| 默认配置 | `<插件目录>/config/config.json` |
| 用户配置 | `@karinjs/<插件目录名>/config/config.json` |
| 状态文件 | `@karinjs/<插件目录名>/data/state.json` |
| 临时 HTML | `karinPathHtml/server-status-*.html` |

- `dir.pluginName` 是插件**目录名**，不是包名；重命名插件目录会换配置/数据路径。
- `dir.configDir` / `dir.dataDir` 是依赖 `this` 的 getter；不要解构后调用。

## 6. 常用命令

```bash
# 安装依赖（含前端构建工具）
pnpm install

# 前端开发服务器（默认 http://localhost:5176，API 需 Karin 提供）
pnpm dev:web

# 前端类型检查 / 构建
pnpm typecheck:web
pnpm build:web

# 后端语法检查 + 前端类型检查
pnpm check

# 全部测试（串行）
pnpm test

# 单独运行
node test/test-engine.mjs
node test/test-api.mjs
node test/test-integration.mjs

# 生成预览 HTML（模拟数据；产物写到本地 dev/ 目录，不提交）
node test/preview.mjs
```

- `pnpm check` = 所有后端 `*.js` 的 `node --check` + `tsc -p web/tsconfig.json`；`pnpm test` 串行跑三个测试。
- 当前基线：`test-engine` 32 通过、`test-api` 25 通过、`test-integration` 85 通过（含 WebUI 挂载与配置 API 断言）。
- 前端构建需要 Node.js `>=20.19`；插件运行时仍要求 `>=18`。
- 集成测试会把 `test/stub/node-karin` 临时装到 `node_modules/node-karin`，并在结束、异常、`SIGINT` / `SIGTERM` 时自动清理 `dev/.tmp-run` 与桩模块；测试结束后只删除桩模块，`node_modules` 若为空会一并移除，不会动其他依赖。如果检测到真实的 `node-karin` 会中止测试，不会删除它。
- `test-integration` 会占用 `node_modules`、`dev/.tmp-run` 并执行 `process.chdir`；`test-api` 会启动本地 HTTP 服务。**不要并行运行这些测试**；`test-engine` 是纯内存测试，可以单独跑。
- `test/preview.mjs` 不是测试，但内部有断言，失败会抛异常；它把 `dev/preview-*.html` / `.txt` 写到本地目录，不用提交。

## 7. 编码约定

### 风格

- 2 空格缩进、单引号、无分号。
- standard 风格：类方法 / getter 的括号前留空格（`constructor (file)`、`get configDir ()`）；箭头函数赋值正常写 `const fn = (x) => {}`。
- 文件头写块注释说明用途；导出函数写 JSDoc（`@param` / `@returns`），复杂分支写行内注释。
- 注释用中文；标识符用英文；避免留下没有上下文的 TODO。

### 命名

- 文件名小写；类用 PascalCase（`StatusClient`、`StateStore`）；函数 / 变量 camelCase。
- 配置键 camelCase；状态字段沿用 `state.json` 现有命名（`lastNotifyAt`、`notifyCount`、`everUp`）。
- 指令名用中文（`监控状态`），正则里同时提供英文别名。

### 状态码与时间

- 状态码统一用 `STATUS`（`DOWN=0 / UP=1 / PENDING=2 / MAINTENANCE=3`），不要写字面量。
- 状态页心跳时间是**无时区的 UTC 字符串**（`YYYY-MM-DD HH:mm:ss.SSS`），必须用
  `parseStatusTime()` 解析，禁止直接 `new Date(str)`。
- 展示用 `formatTime()` / `formatClock()` / `formatDuration()`，并传入 `timezone`；
  `formatUptime()` 的输入是 0–1 的小数，不是百分数。
- 状态里的 `since` / `lastNotifyAt` / `downSince` 都是毫秒时间戳。

### HTML 与用户数据

- `template.js` 里所有来自面板 / 配置的动态文本必须经过 `escapeHtml()`，包括 title、description、分组名、监控名、URL、`title` 属性。
- 颜色、宽度等数值来自配置时先确认已收敛；不要直接把用户字符串拼进 `<style>`。
- 文本报告（`buildTextReport`）不需要 HTML 转义，但也不要拼 HTML。

### 日志

- 统一前缀 `[server-status]`。
- `info`：加载完成、产生告警 / 恢复等低频关键节点。
- `debug`：请求失败、渲染失败、详情图失败等高频细节。
- `warn`：配置解析失败、无可用推送目标、渲染器缺失（同类只提示一次）。
- `error`：未预期异常，带 `error.stack`；推送单目标失败也记 error。
- 不要在循环里对每个监控项打 info；不要在正常路径打 error。

### 错误处理

- `runCheck()` 是最外层兜底：`StateStore` / `StatusClient` 的构造都在 `try` 内，异常只记录并返回 `{ ok: false }`；
  `finally` 中执行 `state.flush()` 并释放 `running` 锁，不能让 `karin.task` 抛出。
- 渲染失败返回 `null`，由调用方降级为文本；推送按目标逐个 `try/catch`，单个目标失败不影响其他目标。
- `StateStore.write()` / `load()` 的异常被吞掉，属于有意的“持久化失败不影响主流程”；不要在这两处抛错。
- 指令回调应自行 `try/catch` 并 `e.reply` 错误，不要把异常抛给 Karin。

## 8. 数据结构

### 快照（snapshot）

```js
{
  fetchedAt: 1710000000000,
  title: '监控状态页',
  description: '',
  slug: 'default',
  groups: [{ id: 1, name: '核心服务', monitors: [/* Monitor */] }],
  monitors: [/* Monitor */],
  summary: { total: 2, up: 1, down: 1, pending: 0, maintenance: 0, overall: 'down' }
}
```

`overall` 取值：`up` / `down` / `pending` / `maintenance` / `unknown`，优先级 `down > pending > up > maintenance > unknown`。

### 监控项（Monitor）

```js
{
  id: '1',                 // 字符串
  name: 'Web 主站',
  type: 'http',
  url: 'https://example.com',
  tags: [],
  group: '核心服务',
  heartbeats: [/* 最近 maxHeartbeats 条 */],
  allHeartbeats: [/* 接口返回的全部，最多 100 条 */],
  latest: { status: 0, time: 1710000000000, ping: 42 } | null,
  status: 0 | 1 | 2 | 3 | null,
  uptime24: 0.99 | null,   // 0–1
  avgPing: 42 | null
}
```

- `latest` 取 `allHeartbeats` 的**最后一条**，代码假定接口按时间升序返回；若上游改为倒序，状态会错位。
- 没有心跳的监控项 `status = null`，`evaluate()` 会跳过，不会告警。
- `heartbeats` 只用于截图状态条；`allHeartbeats` 用于详情图统计。

### 状态文件（state.json）

```js
{
  version: 1,
  monitors: {
    '1': { status: 0, since: 1710000000000, lastNotifyAt: 1710000000000, notifyCount: 1, name: 'Web 主站' }
  },
  source: {
    failing: 0, down: false, downSince: 0, lastNotifyAt: 0, lastError: '', everUp: true
  }
}
```

- `version` 目前只写入不校验；结构变更时升版本并在 `load()` 做迁移。
- 已从面板删除的监控项不会从 `monitors` 中清理，状态文件会缓慢增长。
- `source.everUp` 是面板掉线告警的前置标记。

### 推送目标

```js
{ selfId?: '10000', scene: 'group' | 'friend', peer: '123456', name?: '运维群' }
```

- 字符串写法：`group:123456`、`friend:10001`、`private:10001`、`群:123456`、`私聊:10001`；裸字符串按私聊处理。
- 去重键是 `scene:peer`，`selfId` 不参与去重。
- `selfId` 为空时用 `karin.getAllBot()[0]` 发送；没有在线 Bot 会 warn 并跳过。
- `fallbackToMaster` 只在解析后的 targets 为空时生效；主人字符串支持 `selfId@userId`。

### 事件（changes）

`runCheck()` 返回的 `changes` 元素：

```js
{ type: 'down', monitor: 'Web 主站', label: '故障' }
{ type: 'repeat', monitor: 'Web 主站' }
{ type: 'up', monitor: 'Web 主站' }
{ type: 'source-down', text: '...' }
{ type: 'source-up', text: '...' }
```

完整返回值：`{ ok, skipped, changes, notifications, notified, snapshot?, error? }`。
`notifications` 是本次检测累计的 `{ total, success }`（按消息条数统计），`notified` 表示本次是否允许推送。

## 9. 状态机规则

### 监控项（engine.js）

1. **首次见到**（状态里没有该 id）：只写基线（`status` / `since` / `name`，`lastNotifyAt=0`，`notifyCount=0`）。
   仅当 `notifyOnStart && isBadStatus()` 时产生 down 事件，且 `since: 0`（不显示持续时长）。
2. **状态未变**：
   - 名称变化时同步 `name`，不影响计时。
   - 异常状态且 `repeatInterval > 0`：
     - `lastNotifyAt === 0` → 设为 `now`，本次不提醒（启动时已经异常，先开始计时）。
     - `now - lastNotifyAt >= repeatInterval * 60000` → 产生 repeat 事件，`notifyCount + 1`。
3. **状态变化**：写入新状态并重置 `lastNotifyAt=0`、`notifyCount=0`，然后：
   - 新状态异常（`DOWN`，或 `PENDING` 且 `alertOnPending`）→ down 事件，`lastNotifyAt=now`、`notifyCount=1`。
   - 新状态 `UP` 且 `notifyRecovery` 且 `previous.notifyCount > 0` → up 事件，`downSince=previous.since`。
   - 其他（`MAINTENANCE`、未开启告警的 `PENDING`）→ 只更新状态，不通知；**不会**发送恢复消息。
4. `notifyCount` 表示“产生过告警事件”，与推送是否成功无关；没有 targets 或发送失败时，恢复消息仍可能发出。
5. `isBadStatus()` 只看 `DOWN` 和（开启时的）`PENDING`；`MAINTENANCE` 永远不告警。

### 过滤（filterSnapshot）

- `onlyMonitors` 非空时只保留匹配项；`ignoreMonitors` 命中则排除，**ignore 优先**。
- 匹配规则：字符串 `trim().toLowerCase()`；与 `id` 全等，或 `name` 包含该字符串。
- 过滤后重算 `summary`，并移除空分组。
- 被过滤掉的监控项不会进入 `evaluate()`，其 state 保持旧值；以后重新纳入时可能按旧状态产生一次告警 / 恢复。

### 面板健康（monitor.js）

- 请求失败：`failing++`，记录 `lastError`；`notifySourceDown=false` 时到此为止。
- 从未成功连接过（`everUp=false`）时不告警，避免默认配置反复刷「面板不可达」。
- 首次掉线：`!down && failing >= sourceDownRetries` → 置 `down=true`、`downSince=now`、`lastNotifyAt=now`，推送。
- 持续掉线：`down && repeatInterval > 0 && lastNotifyAt > 0 && 超过间隔` → 再次推送，`downSince` 保持。
- 恢复：设置 `everUp=true`；若此前 `down` → 清空状态并推送恢复；否则清零 `failing` / `lastError`。
  恢复推送本身不检查 `notifySourceDown` / `notifyRecovery`：如果掉线时已经置位 `down`，之后关闭开关仍会收到恢复消息（`notify:false` 除外）。
- 恢复处理在 `evaluate()` 之前，`changes` 里 `source-up` 会排在本次监控事件之前。

## 10. 配置

### 读取与写入

- 默认配置：`config/config.json`；用户配置：`@karinjs/<插件目录名>/config/config.json`。
- `getConfig()` 每次 `requireFileSync(..., { force: true })` 读盘，改 `config.json` 无需重启。
- `defaultConfig` 只对**缺失字段**生效；用户已写入的值不会被默认值覆盖。
- `mergeConfig()` 深合并普通对象，数组整体替换，`undefined` 跳过。
- `saveConfig(patch)` 是合并写入：读用户文件 → 合并 patch → 整体写回；不做归一化，**原子写**（临时文件 + `renameSync`）。
- WebUI 写入前会先经过 `src/web/validate.js` 的 `validateConfigPatch()`；命令行 / 其他代码调用 `saveConfig()` 仍不做校验。
- 配置解析失败只 warn 一次，随后使用默认配置；`ensureConfig()` 每次 `getConfig()` 都会尝试补缺失的默认配置文件。
- **不要**在模块顶层缓存 `getConfig()` 的结果；`monitor.js` 每次检测都重新读取。

### 归一化（只在 getConfig 做）

| 字段 | 规则 |
| --- | --- |
| `interval` | `max(30, Number(v) || 60)` |
| `timeout` | `max(1000, Number(v) || 10000)` |
| `sourceDownRetries` | `max(1, Number(v) || 3)` |
| `maxHeartbeats` | clamp(10, 100)，默认 50 |
| `width` | clamp(600, 1600)，默认 1000 |
| `deviceScaleFactor` | clamp(1, 4)，默认 2 |
| `theme` | 仅 `light` 保留，其他一律 `dark` |
| `targets` / `onlyMonitors` / `ignoreMonitors` | 非数组 → `[]` |

- 布尔字段不做类型转换：JSON 里写 `"false"`（字符串）会被当成真值，必须写 `false`。
- `repeatInterval` 不做下限收敛，`0` 或负数都表示关闭重复提醒。
- `statusUrl` / `statusSlug` / `timezone` 不做校验，错误在运行时暴露。
- 业务代码不要重复 clamp；需要新约束时加在 `getConfig()` 并同步本表。

### 关键字段

- `statusUrl`：可填根地址、`/status/:slug` 或 `/status-page/:slug` 完整地址、反向代理子路径；无协议时自动补 `http://`。
- `statusSlug`：`statusUrl` 为根地址时使用；留空回退 `default`。`statusUrl` 含 `/status/:slug` 或 `/status-page/:slug` 时，URL 中的 slug 优先。
- `targets`：见「推送目标」。
- `enableImage`：`false` 时 `render*` 直接返回 `null`，走文本降级。
- `timezone`：同时影响截图和文本消息的时间展示；非法值会静默回退到系统时区。

## 11. 推送与渲染

### 推送（notify.js）

- `pushMessage(cfg, text, image)`：
  - 解析 targets；为空时回退主人（`fallbackToMaster !== false`）。
  - 每个目标单独构建 `elements`（`segment.text` + `segment.image('base64://...')`），避免适配器修改共享数组。
  - `karin.sendMsg(selfId, contact, elements, { retryCount: 2 })`，单目标失败只记 error。
  - 返回 `{ total, success }`；没有目标返回 `{ total: 0, success: 0 }` 并 warn。
- `runCheck()` 把每次 `pushMessage()` 的 `{ total, success }` 累加到 `notifications`，`#监控检测` 用它展示实际结果。
- `notify: false` 会跳过所有推送（包括面板掉线 / 恢复），但仍更新状态并返回 `changes`；此时 `notified` 为 `false`、`notifications` 为 0。
- 消息构造函数：`buildDownText` / `buildUpText` / `buildRepeatText` / `buildSourceDownText` / `buildSourceUpText`。
  改文案时同步 README 的「消息示例」和集成测试断言。
- 告警 / 恢复 / 重复提醒共用同一张状态图；面板掉线 / 恢复不带图。

### 渲染（render.js）

- 调用 `render.render({ file, name: 'server-status', type: 'png', encoding: 'base64', fullPage: true, setViewport: { width, height: 900, deviceScaleFactor }, pageGotoParams: { waitUntil: 'networkidle2', timeout: 20000 } })`。
- **视窗宽度 = `cfg.width + 56`**：模板 `body` 左右各 28px 内边距，少加会裁掉右侧。
- 返回值可能是数组，取 `[0]`；统一转成不含 `data:` 前缀的 base64。
- HTML 临时文件写在 `karinPathHtml` 下，文件名带 pid / 时间戳 / 随机串，`finally` 删除；不要写到插件目录。
- 失败时：状态图 `warn` 一次（含安装渲染器提示）后返回 `null`；详情图只 `debug` 后返回 `null`。
- 渲染器可选；未安装 `@karinjs/plugin-puppeteer` 时不能中断检测，必须降级为文本。

## 12. 新增功能指南

### 新增指令

1. 在 `apps/status.js` 或 `apps/subscribe.js` 中新增 `export const xxx = karin.command(...)`。
2. 正则统一格式：`/^#?(?:监控|server-status)\s*(?:动作1|动作2)$/i`；需要参数时用 `(.*)$` 并做兼容提取（参考 `extractKeyword`）。
3. 配置对象至少包含 `name`、`perm`（`all` 或 `master`）、`log: true`。
4. 同步更新：文件头注释、`#监控帮助` 文案、README 指令表、`test/test-integration.mjs` 的
   `findCommand('...')` 断言与 `__commands.length` 计数（当前 8）。
5. 指令回调自己 `try/catch` 并 `e.reply` 错误；不要抛出。
6. 若用到新的 `node-karin` API，先补 `test/stub/node-karin/index.js`。

### 新增定时任务

1. 在 `apps/` 下用 `karin.task(显示名, cron, 回调, { name, log: false, type: 'skip' })` 导出。
2. 监控任务固定 `* * * * *`，实际频率交给 `interval`；**其他任务按自身语义写 cron**，不要复用 `interval`。
3. `type: 'skip'` 已防止上一次未结束时重入，回调内部不要再自行加锁。
4. 回调只做编排，异常必须在被调用模块内部消化，不能让任务抛出。
5. 同步更新集成测试的 `__tasks.length` 断言（当前 1）。

### 新增配置项

1. `src/config.js` 的 `defaultConfig` 增加字段与注释；必要时在 `getConfig()` 做类型 / 范围收敛。
2. `config/config.json` 增加默认值（两处都要改：前者是兜底，后者是首次复制给用户的模板）。
3. README「配置说明」表格增加一行；若新增收敛规则，同步本文件「归一化」表。
4. 若涉及状态机行为，补 `test/test-engine.mjs` 用例；若涉及完整链路，补集成测试。
5. 若配置项影响渲染，补 `test/preview.mjs` 的模拟数据或参数。

### 新增状态字段

1. `src/state.js` 构造函数的初始 `data` 加字段。
2. `load()` 为新字段提供默认值，否则旧状态文件会得到 `undefined`。
3. 更新 `MonitorState` / `source` 的 JSDoc。
4. 结构不兼容时升 `VERSION` 并写迁移逻辑；不要假设旧文件一定有新字段。

### 新增 node-karin API

1. 先确认 Karin `>=1.8.0` 提供该 API。
2. 在 `test/stub/node-karin/index.js` 补最小实现，保证集成测试可跑。
3. 不要让桩的行为比真实 API 更宽松；测试通过不代表真实环境通过。

### 修改截图模板

1. 改 `src/template.js` 的纯函数；不要在这里 import `node-karin`。
2. 跑 `node test/preview.mjs` 检查排版、长名称、100 条心跳、浅色 / 深色主题。
3. 视觉改动后重新生成 README 用的 `docs/preview.png` / `docs/preview-detail.png`（本地生成的 `dev/preview-*` 不要提交）。
4. 注意 `body` 的 28px 内边距与 `.page` 宽度；改内边距必须同步 `src/render.js` 的 `+ 56` 和集成测试的 `1056` 断言。
5. 心跳条尺寸固定为 10×30、间距 8，每行槽位数由 `beatSlots(width, 内边距之和)` 算出；改这些常量要同步 `LIST_INNER_PADDING`
   （监控列表卡片 10px + 监控项 15px 的左右内边距），否则心跳条会溢出卡片或右侧留白。
6. 视觉参数逐项抄自 Uptime Kuma 状态页，改动前先核对上游源码，不要凭手感调：
   - 配色：深色底 `#090c10`、卡片 `#0d1117`、正文 `#b1b8c0`；浅色为纯白底 + `#212529`；
     状态色 `#5cdd8b` / `#dc3545` / `#f8a306` / `#1747f5`，无数据用 secondary `#6c757d`。
   - 卡片与列表：`.shadow-box` 投影固定 `0 15px 70px rgba(0, 0, 0, 0.1)`（深色也不加深），圆角 10px、内边距 10px；
     监控项内边距 13px 15px 10px、圆角 10px，列表卡片 `min-height: 46px`。
   - 标题层级：`h1` 30px / 500，分组标题 26px / 500，整体状态 25px / 700，均为 Bootstrap 的 500 字重。
   - 胶囊徽章：`min-width: 62px`、`padding: .35em .65em`、`font-size: .75em`、字重 700、`line-height: 1`、圆角 999px；
     文字色只有「深色主题 + 正常」用 `#020b05`，其余一律白字。
   - 心跳条空槽位用 `#848484`（深色）/ `#f0f8ff`（浅色），不要改成半透明灰。
   - 排版顺序：标题 → 整体状态卡 → 描述 → 分组；页脚居中、14px，`.refresh-info` 用 `opacity: .7`。
   - 字体栈与正文基准沿用 `#app` 的一套（16px / line-height 1.5），中文回退插在 `sans-serif` 之前。
   改配色或尺寸时同步 README 预览图。
7. 单监控项详情图（`buildMonitorHtml`）刻意比状态图紧凑，只保留四段：标题 → 状态卡 → 心跳条 → 一行页脚：
   - 状态卡一行放「状态图标 + 状态文字 + `平均响应 … · 异常 N 次` + 可用率徽章」，字号 25px / 700、内边距 16px 20px；
     右侧指标用 14px 的 secondary 色，靠 `margin-left: auto` 顶到徽章左边。
   - 不要再加回四宫格统计卡：可用率已经在徽章、异常次数已经在状态卡右侧，加回去就是重复；`最近响应` 信息量低也一并去掉。
   - 标题 26px / 500、副标题 13px、页脚 13px，各段间距统一 16px，整图高度约为状态图的四分之一。

### 修改告警文案

1. 改 `src/notify.js` 的 `build*Text`。
2. 同步 README「消息示例」。
3. 同步集成测试里的文本断言（`监控告警`、`监控恢复`、`中断时长`、`面板不可达`）。
4. 保持 emoji + 中文的风格，不要引入上游产品名。

## 13. 常见改动定位

| 需求 | 主要文件 | 同步 |
| --- | --- | --- |
| 改状态判断 / 重复提醒 / 恢复条件 | `src/engine.js` | `test/test-engine.mjs`、README 工作原理 |
| 改接口解析 / 超时 / 地址规范化 | `src/client.js` | `test/test-api.mjs`、README 配置说明 |
| 改状态持久化 | `src/state.js` | 集成测试的状态断言、本文件数据结构 |
| 改截图样式 / 文案排版 | `src/template.js` | `test/preview.mjs`、`docs/preview*.png` |
| 改渲染参数 | `src/render.js` | 集成测试的 `setViewport` 断言 |
| 改推送目标 / 消息构造 | `src/notify.js` | README 推送目标格式、集成测试 |
| 改检测流程 | `src/monitor.js` | 集成测试、README 工作原理 |
| 改配置项 | `src/config.js`、`config/config.json` | README 配置表、本文件归一化表 |
| 改指令 | `apps/*.js` | README 指令表、`#监控帮助`、集成测试计数 |
| 改定时任务 | `apps/task.js` | 集成测试 `__tasks` 断言 |
| 改 WebUI 配置字段 | `src/web/validate.js`、`web/src/types.ts`、`web/src/components/ConfigPanel.tsx` | README 配置表、`src/web/api.js` |
| 改 WebUI 样式 / 布局 | `web/src/**` | `pnpm typecheck:web`、`pnpm build:web` |
| 改 WebUI 路由 / 挂载 | `src/web/*`、`web/vite.config.mjs`、`web.config.js` | base / `WEB_PREFIX` / `page.url` 三处同步 |

## 14. 已知坑

### 时间与状态

- **截图宽度**：`body` 左右各 28px，视窗必须是 `width + 56`，否则右侧被裁。
- **检测频率**：cron 每分钟触发，`interval` 实际粒度是 60 秒的整数倍向上取整；`interval=90` 实际约 120 秒。`interval < 60` 仍是 60 秒。
- **节流基于开始时间**：`lastCheckAt` 在请求前设置，请求失败也会占用一个间隔；手动检测用 `force: true` 绕过。
- **skipped 也是 ok**：`runCheck()` 在 `enable=false`、并发、未到间隔时返回 `{ ok: true, skipped: true }`；调用方要判断 `skipped`，不要只看 `ok`。
- **并发锁**：`runCheck()` 内部有 `running` 锁，`karin.task` 的 `type: 'skip'` 又有一层；不要加第三层。
- **面板掉线告警**：必须 `everUp`（曾成功连接过）才告警；默认配置指向 `127.0.0.1:3001` 时不会刷屏。
- **恢复通知**：只有此前真的产生过告警（`notifyCount > 0`）才发送；`notifyCount` 与推送成功与否无关。
- **维护 / 待确认**：`DOWN → MAINTENANCE` 或 `DOWN → PENDING`（未开启 `alertOnPending`）不会发送恢复消息，且会重置 `notifyCount`。
- **过滤后的旧状态**：被 `onlyMonitors` / `ignoreMonitors` 排除的监控项不更新 state，重新纳入时可能按旧状态误报。
- **删除的监控项**：`state.json` 不会自动清理已删除的 id。

### 配置与路径

- **状态文件位置**：`@karinjs/<插件目录名>/data/state.json`，由 `karinPathBase`（通常基于 `process.cwd()`）决定，不是插件目录。
- **目录名敏感**：`dir.pluginName` 取插件文件夹名；重命名目录会换配置 / 数据路径。
- **getter 不要解构**：`dir.configDir` / `dir.dataDir` 依赖 `this`，解构后调用会丢 `this`。
- **配置即时生效**：改 `config.json` 不用重启；改 `defaultConfig` 只对缺失字段生效。
- **saveConfig 不做归一化**：写入原样，`getConfig()` 读取时才 clamp；WebUI 会先走 `validateConfigPatch()`，其他调用方仍需自行校验。
- **配置写盘是原子的**：`saveConfig()` 先写临时文件再 `renameSync`；失败会清理临时文件，但仍不要让多个进程同时写同一份配置。
- **删除用户配置**：下次 `getConfig()` 时 `ensureConfig()` 会用默认配置重新生成，原配置丢失。
- **布尔值陷阱**：JSON 中 `"false"` 是字符串真值；布尔配置必须写 `false`。
- **URL slug 优先**：`statusUrl` 含状态页路径时，URL 中的 slug 优先于 `statusSlug`；根地址才使用配置，最后回退 `default`。

### 推送

- **没有 targets**：`fallbackToMaster=false` 且 targets 为空时，`pushMessage` 只 warn 并返回 0；检测仍会继续。
- **多 Bot**：target 没写 `selfId` 时永远用第一个 Bot；多 Bot 场景要显式配置。
- **去重**：只按 `scene:peer` 去重，同一会话配置两个不同 `selfId` 会被视为重复。
- **推送失败不影响状态**：`pushMessage` 单目标失败只记 error；`notifyCount` 已增加，恢复消息仍会发。
- **`#监控检测` 的推送结果**：现在按 `runCheck().notifications` 提示“通知已发送 / 部分失败 / 无目标”；改推送逻辑时要继续累计统计，不要退回固定文案。

### 渲染

- **渲染器可选**：未安装 `@karinjs/plugin-puppeteer` 时返回 `null`，走文本；不能抛异常中断检测。
- **临时文件**：写在 `karinPathHtml`，`finally` 删除；不要写到插件目录，否则会被打包。
- **warn 只一次**：`render.js` 的 `warned` 是模块级；同进程内后续失败只记 debug。
- **详情图失败更安静**：`renderMonitorImage` 只记 debug，不 warn。
- **中文字体**：Linux 渲染器环境缺字体时中文变方块，装 `fonts-noto-cjk`（见 README FAQ）。
- **时区格式化开销**：`buildBeats` 在设置 `timezone` 时对每根心跳条调用 `Intl.DateTimeFormat`；100 条时明显变慢，必要时缓存 formatter。

### WebUI

- **iframe 没有 `allow-modals`**：Karin 的插件页 iframe 未授权 `alert` / `confirm` / `prompt`，一律用 HeroUI 的 `toast`。
- **`page` 需要 Karin `>=1.16.1`**：低版本会忽略 `karin.web`，插件仍可运行；配置页可用 `/server-status/assets/config` 独立打开。
- **`web-dist/` 不提交**：源码安装必须先 `pnpm install && pnpm build:web`，否则静态路由返回 503 提示；npm 包由 `prepublishOnly` 构建。
- **路由是动态导入的**：`src/web/index.js` 用 `await import('./router.js')` 加载路由，旧版 Karin 缺少 `node-karin/express` 时只 warn，不会让插件加载失败；不要改回静态 import。
- **base 路径是硬编码的**：`web/vite.config.mjs` 的 `base`、`src/web/paths.js` 的 `WEB_PREFIX`、`web.config.js` 的 `page.url` 必须一致；改前缀要三处同步。
- **SPA fallback 顺序**：`/v1` API 必须在静态路由之前；fallback 只处理 GET / HEAD，不能吞掉 POST。
- **静态资源不鉴权、API 鉴权**：`/assets` 公开，`/v1` 统一走 `authMiddleware`；不要把配置或密钥写进前端静态文件。
- **登录态复用**：读写 Karin 主 Web 的 `userId` / `accessToken` / `refreshToken`；401 / 419 先刷新，失败后清空并回到登录页。
- **HTTP 下没有 `crypto.subtle`**：局域网 HTTP 访问时 Web Crypto 不可用，`web/src/auth/crypto.ts` 内置纯 JS SHA-256 回退，不要删除。
- **主题同步**：`localStorage.theme` 与 Karin 共用；iframe 内忽略 `storage` 事件，改由父页面 `postMessage({ type: 'karin-theme-change' })` 驱动，避免循环。
- **Select 用 RAC 语义**：`selectedKey` / `onSelectionChange`（不是 `value` / `onChange`）；`Tabs` 同理用 `selectedKey`。
- **测试推送可能 400**：`targets` 为空且 `fallbackToMaster=false` 时没有目标，后端返回 400，前端提示先配置目标。

### 测试

- **测试文件位置**：测试脚本放 `test/`（本地，不提交）；mock 服务、浏览器配置、截图、临时工作目录等放本地 `dev/.tmp-*/`（`test/` 与 `dev/` 都已被 git 忽略）。禁止写到 `%TEMP%`、用户目录或 C 盘其他位置，验证结束立即删除临时目录。
- **集成测试与真实 node-karin 冲突**：检测到 `node_modules/node-karin` 不是桩会中止测试；先移除或换干净目录。
- **不要并行**：测试共享 `node_modules`、`dev/.tmp-run` 和 `process.chdir`。
- **chdir 顺序**：集成测试先 `process.chdir(tempDir)` 再 import 插件；`karinPath` 在模块加载时计算，顺序错了会写错目录。
- **计数断言**：新增指令 / 任务要改 `__commands.length` / `__tasks.length`；当前 8 / 1。
- **视窗断言**：改模板内边距要改 `1056`。
- **文本断言**：改告警文案要改集成测试里的字符串。
- **覆盖缺口**：集成测试未覆盖面板恢复、重复提醒、PENDING / 维护、only / ignore、浅色主题、单目标推送失败；改这些逻辑时补单测或手工验证。

### 其它

- **runCheck 的清理**：`StateStore` / `StatusClient` 构造在 `try` 内，`finally` 统一 `state.flush()` 并释放 `running`；
  新增早退分支时不要绕过这套清理。
- **非法 statusUrl**：会在 `new StatusClient()` 抛错，由 `runCheck` 捕获并返回 `{ ok: false }`，不会卡锁；集成测试已覆盖。
- **user-agent 版本号**：`src/client.js` 里硬编码 `karin-plugin-server-status/1.0.0`；升版本时顺手改。
- **docs 会发布**：`package.json` 的 `files` 包含 `docs`，不要把草稿 / 无关文档放进去；`.agents/` 不在 `files` 中，不会随包发布。
- **data 目录**：`karin.files` 声明了 `data`，但仓库里没有该目录，运行时由 `ensureConfig()` 创建。

## 15. 测试约定

- 三个测试都用内置 `assert` 函数统计通过 / 失败，失败时 `process.exit(1)`；没有测试框架。
- `test/test-engine.mjs`：状态迁移、重复提醒、PENDING / 维护、过滤、恢复条件、`notifyOnStart`；不依赖 Karin。
- `test/test-api.mjs`：接口解析、404 / 非 JSON / 超时、URL 规范化与 slug 优先级、子路径、空数据容错、UTC 时间解析；内置 mock HTTP 服务。
- `test/test-integration.mjs`：用 `test/stub/node-karin` 桩驱动「加载 → 检测 → 告警 → 恢复 → 指令 → 订阅写盘 → 面板掉线 → 无目标推送 → 静默检测 → 非法 statusUrl → WebUI 挂载 / 配置 API」全链路；结束 / 异常 / 中断时自动删除 `dev/.tmp-run`、临时 `node_modules/node-karin`，并移除空 `node_modules`。
- WebUI 后端（`src/web/validate.js`、`src/web/api.js`）的测试在集成测试末尾，直接调用 handler 并注入假的 `req` / `res`；没有引入 HTTP 测试框架。
- 修改代码后至少跑 `pnpm check` + 对应测试；涉及多模块时 `pnpm test` 全跑。
- 修改前端后必须跑 `pnpm typecheck:web`；只跑 Vite build 不会发现类型错误。
- 无头浏览器 / CDP 验收脚本与 Chrome 用户目录必须放在 `dev/.tmp-browser/`，截图也写在这里；验收结束删除该目录，不要写到系统临时目录。
- 新增测试用例时保持现有风格：一个 `{ ... }` 块一个场景，`assert(condition, '中文描述')`，失败信息能定位问题。
- 测试里不要依赖真实网络 / 真实面板；用 `http.createServer` 或桩。

## 16. 发布与打包

- `package.json` 的 `files` 决定发布内容：`index.js`、`apps`、`src`、`config`、`docs`、`web-dist`、`web.config.js`、`README.md`、`LICENSE`；新增顶层目录 / 文件要同步。
- `karin.files` 声明复制到 `@karinjs` 的目录（当前 `config`、`data`）；`data` 由运行时创建。
- `karin.web` 指向 `./web.config.js`；`page.url` 是 `/server-status/assets/karin-config`，开发模式下指向 Vite dev server。
- `karin.apps` 为 `["apps"]`，Karin 自动加载；不要在 `index.js` 手动注册指令 / 任务。
- `prepublishOnly` 会执行 `pnpm build:web`，因此 `web-dist/` 虽然被 git 忽略，仍会进入 npm 包；发布前先 `pnpm build:web` 并检查产物。
- 直接 `git clone` 的源码安装没有 `web-dist/`，需要用户自行构建；README 已说明。
- README 引用的截图放 `docs/`，命名 `preview*.png`；本地生成的 `dev/preview-*` 不提交（`dev/` 整个目录都在 `.gitignore` 里）。
- 发布前确认 `main`、`type: "module"`、`engines.node >= 18`、`engines.karin >= 1.8.0` 未变，并跑完 `pnpm check`、`pnpm build:web`、`pnpm test`。
- 版本号遵循 SemVer：破坏性改动升 major，新增功能升 minor，修复升 patch；破坏性改动（改名、改配置键）必须在 README 标注迁移方式。
- `files` 里没有 `test/` 和 `dev/`，两者都不会进 npm 包；不要在发布物里包含 `node_modules/`、`@karinjs/`。

## 17. 提交约定

- 不提交：`node_modules/`、`@karinjs/`、`*.log`、`.DS_Store`、`test/`（本地测试脚本与 node-karin 桩）、`dev/`（整个本地目录，含 `.tmp-*` / `preview-*` / 截图 / 浏览器配置）、`web-dist/`（见 `.gitignore`）。
- `.gitattributes` 固定 `* text=auto eol=lf`：入库与工作区都用 LF，图片等二进制资源标记为 `binary`；
  开发机是 Windows（`core.autocrlf=true`）也不要改回 CRLF，否则会产生无意义的换行 diff。
- `pnpm-lock.yaml` 要提交；不要手改锁文件，用 `pnpm install` 更新。
- README 必须与实现保持一致：指令表、配置表、默认值、消息示例、WebUI 入口与构建命令。
- 改了本文件描述的约定（目录、命令、分层、计数）时，同步更新 AGENTS.md。
- 提交信息用简洁的祈使句说明“改了什么 + 为什么”，不要只写“update”。
- 不提交与本次改动无关的格式化 / 重排，保持 diff 可读。

## 18. 交付前检查清单

- [ ] `pnpm check` 通过（后端 `node --check` + 前端 `tsc`）。
- [ ] `pnpm build:web` 通过，`web-dist/index.html` 与 assets 已生成。
- [ ] `pnpm test` 全部通过（engine 32 / api 25 / integration 85）。
- [ ] 新增 / 修改的配置项已同步 `defaultConfig`、`config/config.json`、README、本文件、`src/web/validate.js` 与 `web/src/types.ts`。
- [ ] 新增 / 修改的指令已同步帮助文案、README、集成测试计数。
- [ ] 新增 / 修改的状态字段已同步 `state.js` 初始值、`load()` 默认值、JSDoc。
- [ ] 纯逻辑模块没有 import `node-karin`；`web/` 没有 import `node:*` / `node-karin`。
- [ ] 没有新增运行时依赖；前端依赖都在 `devDependencies`。
- [ ] 没有把临时 HTML / 截图写到插件目录。
- [ ] 没有在项目外（C 盘、`%TEMP%`、用户目录）创建测试脚本、截图或浏览器配置；项目内临时产物都在 `dev/.tmp-*/` 且已删除。
- [ ] 日志有 `[server-status]` 前缀，级别使用正确。
- [ ] 用户可见文案是简体中文，没有上游产品名（允许位置除外）。
- [ ] `runCheck()` 的 `notifications` 与实际推送一致，`#监控检测` 文案已同步。
- [ ] 新增 `node-karin` API 已补 `test/stub`。
- [ ] 发布相关文件（`files` / `karin.files` / `karin.web`）已检查，`web-dist/` 已构建。
- [ ] WebUI 在独立页和 iframe 内都验证过：无控制台报错、无横向滚动、保存 / 测试推送可用。
- [ ] 独立页侧边栏与「关于」保留 kkk 参考项目和 Uptime Kuma 的参考链接。

## 19. WebUI（React 配置页）

### 架构

- Karin `>=1.16.1` 读取 `package.json` 的 `karin.web` → `web.config.js`，在插件配置页用 iframe 打开 `page.url`。
- `index.js` 调用 `mountWebUI()`，把 `src/web/router.js` 挂到 Karin 导出的 `app` 上，前缀 `/server-status`。
  `mountWebUI()` 是异步且幂等的，路由模块动态导入，挂载失败只 warn。
- 路由顺序：
  1. `/v1` → `authMiddleware` → `apiRouter`（配置读写、状态、测试推送）；
  2. `/assets` → `express.static(webDistDir)` + SPA fallback（`index.html`）；
  3. `/` → 302 到 `/server-status/assets/config`。
- 同一份前端支持两个入口：
  - `/server-status/assets/config`：独立页，带侧边栏 / 移动端抽屉与「关于」页；
  - `/server-status/assets/karin-config`：iframe 内嵌页，只渲染配置面板。
- 前端使用 `BrowserRouter`；静态 fallback 只处理 GET / HEAD，且必须在 `/v1` 之后。

### API

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/v1/config` | 是 | 返回 `{ config, defaults, meta }` |
| `POST` | `/v1/config` | 是 | 校验后合并写入，返回最新配置 |
| `GET` | `/v1/state` | 是 | 返回 `{ state, updatedAt }`；state.json 缺失时返回空状态 |
| `POST` | `/v1/test-push` | 是 | 发送测试消息，返回 `{ total, success }` |

- 鉴权由 Karin 的 `authMiddleware` 完成，前端带 `Authorization: Bearer <accessToken>` 与 `x-user-id`。
- 响应统一为 `{ code, data, message }`；前端 `unwrap()` 只接受 `code === 200`。
- `POST /v1/config` 先过 `validateConfigPatch()`：未知字段、类型错误、越界值都返回 400，绝不信任前端。
- 测试推送在没有目标且 `fallbackToMaster=false` 时返回 400；前端提示先配置推送目标。

### 前端结构

```
web/src/
  main.tsx              入口
  App.tsx               路由、登录门禁、Toast、设备判断
  index.css             Tailwind + HeroUI 主题 + 自定义 token
  types.ts              Config / API / State / PushResult 类型
  api/client.ts         axios 实例、token 注入、401/419 刷新
  api/config.ts         配置 / 状态 / 测试推送请求
  auth/token.ts         复用 Karin localStorage 登录态
  auth/crypto.ts        SHA-256（Web Crypto + 纯 JS 回退）
  references.ts         参考项目外链（kkk / Uptime Kuma），多处共用
  hooks/useTheme.tsx    system / inverse 主题，监听父页面 postMessage
  layouts/              DesktopLayout / MobileLayout
  components/           LoginPanel、StatusCard、ConfigPanel、AboutPanel、fields
  utils/                设备判断、格式化、前端校验
```

- 登录：优先复用 `userId` / `accessToken` / `refreshToken`；没有令牌时输入 Karin 的 HTTP 鉴权密钥，
  `sha256` 后调用与主 Web 相同的登录接口，成功后写回同一组 localStorage 键。
- 主题：`theme` 为 `system` / `inverse`，落到 `html` 的 `light` / `dark` class；
  iframe 内忽略 `storage` 事件，只接受父页面的 `karin-theme-change` 消息。
- 保存：前端先做 `validateConfig`，与 `defaults` 深度比较判断 dirty；保存成功后用响应回填并清 dirty。
- 交互：不使用 `alert` / `confirm` / `prompt`（iframe 没有 `allow-modals`），统一 `toast`。
- 参考与鸣谢：独立页侧边栏底部与「关于」都必须保留 kkk 参考项目链接（`https://github.com/ikenxuan/karin-plugin-kkk`）与 Uptime Kuma 接口链接；
  kkk 仅作为独立 WebUI 的实现参考，**不是本项目上游仓库**；外链统一放 `web/src/references.ts`，不要散落硬编码，也不要删除或改成不可点击的文本。

### 构建与调试

```bash
pnpm dev:web        # http://localhost:5176/server-status/assets/config
pnpm build:web      # 产物 web-dist/
pnpm preview:web    # 预览构建产物
```

- `web/vite.config.mjs` 的 `base` 固定 `/server-status/assets/`，开发代理 `/server-status/v1` 与 `/api/v1`
  到 `KARIN_API`（默认 `http://localhost:7777`）。
- `web-dist/` 被 git 忽略；npm 发布由 `prepublishOnly` 构建，源码安装需手动构建。
- 构建产物较大（JS 约 700 kB）是 HeroUI + GSAP 的现状；没有拆包需求时不要为此引入额外配置。
