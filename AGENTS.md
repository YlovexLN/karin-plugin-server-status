# AGENTS.md

本文件面向在本仓库中工作的 AI Agent 与人类贡献者，说明项目定位、硬性约束、代码结构、运行链路、常用命令和容易踩的坑。

> 本文件描述**当前实现的事实**，不是待办清单。修改代码后请同步更新对应章节；当文档与代码冲突时，以代码和测试为准，并修正文档。

## 目录

1. 项目定位与边界
2. 硬性约束
3. 目录结构
4. 运行链路与分层
5. 初始化、配置与路径
6. 命令与测试
7. 编码约定
8. 数据结构
9. 状态机
10. 推送与渲染
11. WebUI
12. 变更指南
13. 已知坑
14. 发布与检查清单

## 1. 项目定位与边界

`karin-plugin-server-status` 是一个 Karin 机器人框架插件：

- 定时轮询**公开状态页 API**（兼容 Uptime Kuma 1.x / 2.x 的 `/api/status-page/*`）；
- 监控项异常 / 恢复时主动推送 QQ 消息；
- 附带一张仿状态页的监控截图（HTML → Karin 渲染器截图）。

**非目标**：不实现登录、写入、删除、暂停监控等会改动面板的操作；不代替面板通知系统、不配置 Webhook、不保存面板账号；
不做多面板聚合、告警升级、值班表。保持单面板、单进程、轻量。

## 2. 硬性约束

- **运行时**：纯 ESM（`"type": "module"`）；插件要求 Node.js >= 18，构建 WebUI 需要 Node.js >= 20.19（Vite 8）。
- **依赖**：运行时只允许 `node:*` 与 `node-karin`（含 `node-karin/express`）；`package.json` 不新增 `dependencies`。
  前端依赖全部放 `devDependencies`，禁止把 React / Vite / HeroUI 等移入运行时依赖。
- **Karin 版本**：`engines.karin >= 1.8.0`；`karin.web` 的 `page` 内嵌页需要 Karin `>= 1.16.1`，旧版本会忽略该字段，
  插件仍可运行，配置页可在浏览器独立打开。
- **包管理**：pnpm（`packageManager: pnpm@11.9.0`），提交 `pnpm-lock.yaml`，不要混用 npm / yarn。
  `pnpm-workspace.yaml` 只用于放行 `lucide-react@1.59.0` 的发布年龄限制，不要删除。
- **前后端**：后端纯 JavaScript，不使用 TypeScript；`tsc` 只检查 `web/`（`pnpm typecheck:web`）。
- **本地目录**：`test/` 与 `dev/` 已被 `.gitignore` 整体忽略，不进入版本库与 npm 包。
  测试脚本放 `test/`；临时脚本、mock、截图、浏览器配置一律放 `dev/.tmp-*/`，验证结束立即删除。
  **禁止**写到 `%TEMP%`、用户目录、C 盘其他位置或项目外任何路径。
- **Node 18 兼容**：不要使用高于 Node 18 的运行时 API（如 `Object.groupBy`、`Promise.withResolvers`、`Array.prototype.toSorted`）；
  `web/` 的构建脚本不受此限制。
- **验证方式**：仓库没有 ESLint / Prettier / CI；验证靠 `pnpm check`（`node --check` + `tsc`）、`pnpm build:web` 与 `test/` 下的脚本。
- **文案与命名**：用户文案用简体中文；日志前缀 `[server-status]`；包名、指令、配置键、截图品牌都不出现上游产品名。
  上游产品名只允许出现在 `src/client.js` 注释、README 的「兼容性」「数据源准备」章节、WebUI「关于」参考链接
  （`web/src/references.ts` / `AboutPanel.tsx`）以及本文件。
- **许可**：GPL-3.0-only；修改协议时同步 `LICENSE`、`package.json` 的 `license` 与 README 的 License 章节。
- **作者与仓库**：作者 `YlovexLN`，GitHub 主页 <https://github.com/YlovexLN/>，
  插件仓库 <https://github.com/YlovexLN/karin-plugin-server-status>（`git remote` 已是该地址）。
  两处保持一致：`web.config.js` 的 `info.author`、`package.json` 的 `author` / `homepage` / `repository` / `bugs`；
  改一处要同步其余。署名统一写 `YlovexLN`。
  **README 不再重复声明作者与仓库**：README 就渲染在 GitHub 仓库页上，头部再写一遍属冗余；
  只有「安装」章节的 `git clone` 地址需要跟着仓库走。
  WebUI 侧另有一份镜像：`web/src/references.ts` 的 `AUTHOR_NAME` / `AUTHOR_HOME` / `PLUGIN_REPO`
  （`AboutPanel.tsx` 页脚与两个 layout 页脚使用），改地址时一并同步，并跑 `pnpm build:web` 后 `web-dist/` 才生效。

## 3. 目录结构

```
.
├─ index.js / web.config.js / package.json / pnpm-workspace.yaml
├─ apps/            task.js（每分钟任务）· status.js（状态/详情/检测）· subscribe.js（订阅/目标/测试/帮助）
├─ config/          默认 config.json，首次启动复制到 @karinjs
├─ src/             config · target · client · engine · state · template · render · notify · monitor
│  └─ web/          paths · validate · api · static · router · index（mountWebUI）
├─ web/             index.html · vite.config.mjs · tsconfig.json · src/（页面/组件/API/主题/校验）
├─ docs/            README 预览图 preview*.png（随 npm 包发布，不放草稿）
├─ .agents/         本地 Agent 资料（rules / prompts 等，不随插件发布）
├─ test/            本地测试脚本与 node-karin 桩（git 忽略）
├─ dev/             本地预览、截图、浏览器配置、临时目录（git 忽略）
└─ web-dist/        WebUI 构建产物（git 忽略，发布时由 prepublishOnly 构建）
```

> `docs/` 只放 README 预览图。`.agents/` 中的提示词仅作资料保存，与 `AGENTS.md` 冲突时以 `AGENTS.md` 为准。

## 4. 运行链路与分层

### 一次检测

```
apps/task.js（* * * * *）
  └─ runCheck()
       1. getConfig()                     热读配置
       2. enable / running / interval     跳过判断
       3. new StatusClient(cfg)           解析面板地址
       4. getSnapshot()                   并行请求状态页 + 心跳
       5. 失败 → handleSourceFailure()     记录失败，必要时告警并返回 ok:false
       6. 成功 → handleSourceRecover()     必要时推送恢复
       7. filterSnapshot() → evaluate()   过滤 + 状态机，写 StateStore
       8. 有事件 → renderStatusImage() → build*Text() → pushMessage()
       9. finally → state.flush()         落盘并释放 running
```

`#监控状态` / `#监控详情` 直接拉取快照并渲染；`#监控检测` 调用 `runCheck({ force: true, manual: true })`。

### 状态页接口

| 接口 | 用途 | 解析位置 |
| --- | --- | --- |
| `GET /api/status-page/:slug` | 状态页标题、分组、监控项列表 | `client.getStatusPage()` |
| `GET /api/status-page/heartbeat/:slug` | 最近 100 次心跳、24 小时可用率 | `client.getHeartbeats()` |

两个请求用 `Promise.all` 并发；任一失败都按「面板不可达」处理。接口无需登录，但要求状态页已发布、分组已公开。

### 模块依赖边界

| 模块 | 可 import `node-karin` | 说明 |
| --- | --- | --- |
| `index.js` / `apps/*.js` | 是 | 入口日志；注册指令 / 任务 |
| `src/config.js` | 是 | `karinPathBase`、`copyConfigSync`、`requireFileSync`、`logger` |
| `src/client.js` / `target.js` / `engine.js` / `template.js` / `state.js` | 否 | 纯解析 / 目标解析 / 状态机 / HTML / 持久化，可脱离 Karin 单测 |
| `src/render.js` | 是 | `render`、`logger`、`karinPathHtml` |
| `src/notify.js` | 是 | `karin`、`segment`、`logger`、`config` |
| `src/monitor.js` | 是 | 编排，只用 `logger` |
| `src/web/index.js` | 是 | `app`、`logger`；路由模块动态导入 |
| `src/web/router.js` / `api.js` / `static.js` | 是 | `authMiddleware`、`node-karin/express`、响应助手 |
| `src/web/paths.js` / `validate.js` | 否 | 纯路径 / 纯校验 |
| `web/**` / `test/*.mjs` | 否 | 浏览器代码；测试通过 `test/stub` 模拟 |

- `src/client.js` / `target.js` / `engine.js` / `template.js` / `state.js` 不得 import `node-karin`。
  需要 Karin 能力的代码只能放在 `render.js`、`notify.js`、`monitor.js`、`config.js`、`src/web/`、`apps/`、`index.js`。
- `notify.js` 只做发送，目标解析规则集中在 `src/target.js`；`notify.js` 转出 `describeTarget` / `normalizeTarget` 等以保持既有引用路径。
- `web/` 禁止 import `node:*`、`node-karin` 或后端 `src/` 模块，因此 `web/src/utils/targets.ts` 是 `src/target.js` 的镜像，
  改一侧必须同步另一侧。

## 5. 初始化、配置与路径

### 入口

- `index.js` 模块加载时执行 `ensureConfig()`，导出 `KARIN_PLUGIN_INIT` 钩子，并调用 `mountWebUI()` 挂载 WebUI；
  挂载失败只 warn，不影响监控主流程。
- 入口只做「建目录 + 复制默认配置 + 挂载 WebUI + 打印一次加载信息」；不得发起网络请求、启动定时器或注册指令。
- `KARIN_PLUGIN_INIT` 必须幂等：重复执行不能重复注册任务、不能重复刷日志。
- `ensureConfig()` 用 `copyConfigSync` 补缺失的默认配置文件，**不覆盖**用户已有配置；同时创建 `data/` 目录。

### 路径

| 用途 | 路径 |
| --- | --- |
| 默认配置 | `<插件目录>/config/config.json` |
| 用户配置 | `@karinjs/<插件目录名>/config/config.json` |
| 状态文件 | `@karinjs/<插件目录名>/data/state.json` |
| 临时 HTML | `karinPathHtml/server-status-*.html` |

- `dir.pluginName` 是插件**目录名**，不是包名；重命名插件目录会换配置 / 数据路径。
- `dir.configDir` / `dir.dataDir` / `dir.stateFile` 是依赖 `this` 的 getter，不要解构后调用。
- `karinPathBase` 通常基于 `process.cwd()`，所以状态文件不在插件目录。

### 读取与写入

- `getConfig()` 每次先 `ensureConfig()`，再 `requireFileSync(..., { force: true })` 读盘；改 `config.json` 无需重启。
- `defaultConfig` 只对**缺失字段**生效；`mergeConfig()` 深合并普通对象，数组整体替换，`undefined` 跳过。
- `saveConfig(patch)` 是合并写入：读用户文件 → 合并 patch → 整体写回；不做归一化，**原子写**（临时文件 + `renameSync`）。
- WebUI 写入前先过 `validateConfigPatch()`；命令行 / 其他代码调用 `saveConfig()` 仍不做校验。
- 配置解析失败只 warn 一次，随后使用默认配置。不要在模块顶层缓存 `getConfig()` 的结果。

### 归一化（只在 getConfig 做）

| 字段 | 规则 |
| --- | --- |
| `interval` | `max(30, Number(v) \|\| 60)` |
| `timeout` | `max(1000, Number(v) \|\| 10000)` |
| `sourceDownRetries` | `max(1, Number(v) \|\| 3)` |
| `maxHeartbeats` | clamp(10, 100)，默认 50 |
| `width` | clamp(600, 1600)，默认 700 |
| `deviceScaleFactor` | clamp(1, 4)，默认 2 |
| `theme` | 仅 `light` 保留，其他一律 `dark` |
| `targets` | 归一化为 `{ scene, peer, name?, selfId? }` 数组，字符串写法在此转换，非法项丢弃 |
| `onlyMonitors` / `ignoreMonitors` | 非数组 → `[]` |

- 布尔字段不做类型转换：JSON 里的 `"false"` 是字符串真值，必须写 `false`。
- `repeatInterval` 不做下限收敛，`0` 或负数都表示关闭重复提醒。
- `statusUrl` / `statusSlug` / `timezone` 不做校验，错误在运行时暴露。
- 业务代码不要重复 clamp；需要新约束时加在 `getConfig()` 并同步本表。

### 关键字段

- `statusUrl`：可填根地址、`/status/:slug` 或 `/status-page/:slug` 完整地址、反向代理子路径；无协议时补 `http://`。
- `statusSlug`：`statusUrl` 为根地址时使用，留空回退 `default`；URL 含状态页路径时，URL 中的 slug 优先。
- `targets`：见第 8 节「推送目标」。
- `enableImage`：`false` 时 `render*` 返回 `null`，走文本降级。
- `timezone`：同时影响截图和文本时间；非法值静默回退到系统时区。

## 6. 命令与测试

```bash
pnpm install
pnpm dev:web        # http://localhost:5176，API 需 Karin 提供
pnpm typecheck:web
pnpm build:web
pnpm preview:web
pnpm check          # 后端 node --check + 前端 tsc
pnpm test           # 串行跑三个测试
node test/test-engine.mjs
node test/test-api.mjs
node test/test-integration.mjs
node test/preview.mjs   # 生成 dev/preview-*，不是测试
```

- `pnpm check` 的 `node --check` 文件列表是**显式枚举**的；新增后端 `.js` 必须同步 `package.json` 的 `check` 脚本。
- 当前基线：`test-engine` 32 通过、`test-api` 25 通过、`test-integration` 102 通过（含 WebUI 挂载、配置 API 与推送目标校验断言）。
- 三个测试都用内置 `assert` 统计通过 / 失败，失败时 `process.exit(1)`；没有测试框架。
  - `test-engine`：状态迁移、重复提醒、PENDING / 维护、过滤、恢复条件、`notifyOnStart`；不依赖 Karin。
  - `test-api`：接口解析、404 / 非 JSON / 超时、URL 规范化与 slug 优先级、子路径、空数据、UTC 时间解析；内置 mock HTTP 服务。
  - `test-integration`：用 `test/stub/node-karin` 桩驱动「加载 → 检测 → 告警 → 监控恢复 → 指令 → 订阅写盘 → 面板掉线 → 无目标推送 →
    静默检测 → 非法 statusUrl → WebUI 挂载 / 配置 API」全链路；结束 / 异常 / 中断时清理 `dev/.tmp-run`、桩模块与空 `node_modules`。
- WebUI 后端（`src/web/validate.js`、`src/web/api.js`）的测试在集成测试末尾，直接调用 handler 并注入假 `req` / `res`。
- 集成测试会把 `test/stub/node-karin` 临时装到 `node_modules/node-karin`；检测到真实 `node-karin` 会中止测试，不会删除它。
- `test-integration` 会占用 `node_modules`、`dev/.tmp-run` 并执行 `process.chdir`；`test-api` 会启动本地 HTTP 服务。
  **不要并行运行这些测试**；`test-engine` 是纯内存测试，可以单独跑。
- 修改代码后至少跑 `pnpm check` + 对应测试；涉及多模块时 `pnpm test` 全跑。修改前端后必须跑 `pnpm typecheck:web`，
  只跑 Vite build 不会发现类型错误。
- 无头浏览器 / CDP 脚本、Chrome 用户目录与截图必须放 `dev/.tmp-browser/`，验收结束删除。
- 新增用例保持现有风格：一个 `{ ... }` 块一个场景，`assert(condition, '中文描述')`；不要依赖真实网络 / 面板。

## 7. 编码约定

### 风格与命名

- 2 空格缩进、单引号、无分号；类方法 / getter 的括号前留空格（`constructor (file)`、`get configDir ()`）。
- 文件头写块注释；导出函数写 JSDoc（`@param` / `@returns`）；复杂分支写行内注释；注释中文、标识符英文。
- 文件名小写；类 PascalCase（`StatusClient`、`StateStore`）；函数 / 变量 camelCase。
- 配置键 camelCase；状态字段沿用 `state.json` 现有命名（`lastNotifyAt`、`notifyCount`、`everUp`）。
- 指令名用中文（`监控状态`），正则里同时提供英文别名。

### 状态码与时间

- 状态码统一用 `STATUS`（`DOWN=0 / UP=1 / PENDING=2 / MAINTENANCE=3`），不要写字面量。
- 心跳时间是**无时区的 UTC 字符串**（`YYYY-MM-DD HH:mm:ss.SSS`），必须用 `parseStatusTime()`，禁止直接 `new Date(str)`。
- 展示用 `formatTime()` / `formatClock()` / `formatDuration()` 并传入 `timezone`；`formatUptime()` 的输入是 0–1 的小数。
- 状态里的 `since` / `lastNotifyAt` / `downSince` 都是毫秒时间戳。

### HTML、日志与错误

- `template.js` 中所有动态文本必须经过 `escapeHtml()`，包括 title、description、分组名、监控名、URL 与 `title` 属性；
  不要把用户字符串拼进 `<style>`。文本报告不需要 HTML 转义，但也不要拼 HTML。
- 日志前缀 `[server-status]`：`info` 用于加载 / 告警 / 恢复等低频节点，`debug` 用于请求 / 渲染等高频细节，
  `warn` 用于配置解析失败 / 无目标 / 渲染器缺失（同类只一次），`error` 用于未预期异常与单目标推送失败。
  不要在循环里对每个监控项打 info，也不要在正常路径打 error。
- `runCheck()` 是最外层兜底：`StateStore` / `StatusClient` 构造在 `try` 内，异常只记录并返回 `{ ok: false }`；
  `finally` 执行 `state.flush()` 并释放 `running`，不能让 `karin.task` 抛出。
- 渲染失败返回 `null` 并降级为文本；推送按目标逐个 `try/catch`；`StateStore.write()` / `load()` 的异常被有意吞掉。
- 指令回调自行 `try/catch` 并 `e.reply` 错误，不要把异常抛给 Karin。

## 8. 数据结构

### 快照与监控项

```js
{
  fetchedAt: 1710000000000, title: '监控状态页', description: '', slug: 'default',
  groups: [{ id: 1, name: '核心服务', monitors: [/* Monitor */] }],
  monitors: [/* Monitor */],
  summary: { total: 2, up: 1, down: 1, pending: 0, maintenance: 0, overall: 'down' }
}
```

```js
{
  id: '1', name: 'Web 主站', type: 'http', url: 'https://example.com', tags: [], group: '核心服务',
  heartbeats: [/* 最近 maxHeartbeats 条 */], allHeartbeats: [/* 最多 100 条 */],
  latest: { status: 0, time: 1710000000000, ping: 42 } | null,
  status: 0 | 1 | 2 | 3 | null, uptime24: 0.99 | null, avgPing: 42 | null
}
```

- `overall` 优先级：`down > pending > up > maintenance > unknown`。
- `latest` 取 `allHeartbeats` 的**最后一条**，代码假定接口按时间升序；上游改为倒序会错位。
- 没有心跳的监控项 `status = null`，`evaluate()` 会跳过，不会告警。
- `heartbeats` 只用于截图状态条；`allHeartbeats` 用于详情图统计。

### 状态文件（state.json）

```js
{
  version: 1,
  monitors: {
    '1': { status: 0, since: 1710000000000, lastNotifyAt: 1710000000000, notifyCount: 1, name: 'Web 主站' }
  },
  source: { failing: 0, down: false, downSince: 0, lastNotifyAt: 0, lastError: '', everUp: true }
}
```

- `version` 目前只写入不校验；结构变更时升版本并在 `load()` 做迁移。
- `save()` 延迟 300ms 合并写入，`flush()` 立即落盘；`runCheck()` 的 `finally` 会 `flush()`。
- 已从面板删除的监控项不会从 `monitors` 清理；`source.everUp` 是面板掉线告警的前置标记。

### 推送目标与事件

```js
{ selfId?: '10000', scene: 'group' | 'friend', peer: '123456', name?: '运维群' }
```

- `peer` 在群聊下是群号，在私聊下是 QQ 号；WebUI 里先选群聊 / 私聊，再填号码。
- 对象写法里缺 `scene` / `type` 或值不认识时回退 `friend`；`peer` 依次取 `peer` / `id` / `groupId` / `userId`。
- 字符串写法（兼容旧配置）：`group:123456`、`friend:10001`、`private:10001`、`群:123456`、`私聊:10001`；裸字符串按私聊。
  `getConfig()` 会把字符串统一转成对象，写回配置后即为对象形态。
- 号码格式（4 - 12 位数字）只在 WebUI 输入框校验；后端 `validateTargetList()` 只查结构（非空号码、场景合法、最多 100 个），
  避免一条历史遗留目标拦住整份配置的保存。
- 去重键是 `scene:peer`，`selfId` 不参与；`selfId` 为空时用 `karin.getAllBot()[0]`，没有在线 Bot 会 warn 并跳过。
- `fallbackToMaster` 只在解析后的 targets 为空时生效；主人字符串支持 `selfId@userId`。

`runCheck()` 的 `changes` 元素：

```js
{ type: 'down', monitor: 'Web 主站', label: '故障' }
{ type: 'repeat', monitor: 'Web 主站' }
{ type: 'up', monitor: 'Web 主站' }
{ type: 'source-down', text: '...' }
{ type: 'source-up', text: '...' }
```

完整返回值：`{ ok, skipped, changes, notifications, notified, snapshot?, error? }`。
`notifications` 是本次累计的 `{ total, success }`（按消息条数），`notified` 表示本次是否允许推送。

## 9. 状态机

### 监控项（engine.js）

1. **首次见到**：写入基线 `status` / `since` / `name`，`lastNotifyAt=0`、`notifyCount=0`。
   仅当 `notifyOnStart && isBadStatus()` 时产生 down 事件，`since: 0`，同时 `lastNotifyAt=now`、`notifyCount=1`。
2. **状态未变**：名称变化时同步 `name`，不影响计时。异常状态且 `repeatInterval > 0` 时：
   `lastNotifyAt === 0` → 设为 `now`，本次不提醒；`now - lastNotifyAt >= repeatInterval * 60000` → 产生 repeat 事件，`notifyCount + 1`。
3. **状态变化**：写入新状态并重置 `lastNotifyAt=0`、`notifyCount=0`，然后：
   - 新状态异常（`DOWN`，或 `PENDING` 且 `alertOnPending`）→ down 事件，`lastNotifyAt=now`、`notifyCount=1`；
   - 新状态 `UP` 且 `notifyRecovery` 且 `previous.notifyCount > 0` → up 事件，`downSince=previous.since`；
   - 其他（`MAINTENANCE`、未开启告警的 `PENDING`）→ 只更新状态，不通知，**不会**发送恢复消息。
4. `notifyCount` 表示「产生过告警事件」，与推送是否成功无关；没有 targets 或发送失败时，恢复消息仍可能发出。
5. `isBadStatus()` 只看 `DOWN` 和（开启时的）`PENDING`；`MAINTENANCE` 永远不告警。

### 过滤（filterSnapshot）

- `onlyMonitors` 非空时只保留匹配项；`ignoreMonitors` 命中则排除，**ignore 优先**。
- 匹配规则：字符串 `trim().toLowerCase()`；与 `id` 全等，或 `name` 包含该字符串。
- 过滤后重算 `summary` 并移除空分组。被过滤项不进入 `evaluate()`，state 保持旧值；重新纳入时可能按旧状态误报一次。

### 面板健康（monitor.js）

- 请求失败：`failing++`，记录 `lastError`；`notifySourceDown=false` 时到此为止。
- 从未成功连接过（`everUp=false`）时不告警，避免默认配置反复刷「面板不可达」。
- 首次掉线：`!down && failing >= sourceDownRetries` → `down=true`、`downSince=now`、`lastNotifyAt=now`，推送。
- 持续掉线：`down && repeatInterval > 0 && lastNotifyAt > 0 && 超过间隔` → 再次推送，`downSince` 保持。
- 恢复：设置 `everUp=true`；若此前 `down` → 清空状态并推送恢复；否则清零 `failing` / `lastError`。
  恢复推送本身不检查 `notifySourceDown` / `notifyRecovery`；掉线置位后关闭开关仍会收到恢复消息（`notify:false` 除外）。
- 恢复处理在 `evaluate()` 之前，`changes` 里 `source-up` 会排在本次监控事件之前。

## 10. 推送与渲染

### 推送（notify.js）

- `pushMessage(cfg, text, image)`：解析 targets，为空时回退主人（`fallbackToMaster !== false`）。
- 每个目标单独构建 `elements`（`segment.text` + `segment.image('base64://...')`），避免适配器修改共享数组。
- `karin.sendMsg(selfId, contact, elements, { retryCount: 2 })`；单目标失败只记 error。
- 返回 `{ total, success }`；没有目标返回 `{ total: 0, success: 0 }` 并 warn。
- `runCheck()` 把每次 `pushMessage()` 的结果累加到 `notifications`，`#监控检测` 用它展示实际结果。
- `notify: false` 跳过所有推送（含面板掉线 / 恢复），但仍更新状态并返回 `changes`；此时 `notified=false`、`notifications` 为 0。
- 消息构造函数：`buildDownText` / `buildUpText` / `buildRepeatText` / `buildSourceDownText` / `buildSourceUpText`；
  改文案时同步 README「消息示例」和集成测试断言。
- 告警 / 恢复 / 重复提醒共用同一张状态图；面板掉线 / 恢复不带图。

### 渲染（render.js）

- 调用 `render.render({ file, name: 'server-status', type: 'png', encoding: 'base64', fullPage: true, setViewport: { width, height: 900, deviceScaleFactor }, pageGotoParams: { waitUntil: 'networkidle2', timeout: 20000 } })`。
- **视窗宽度 = `cfg.width + 56`**：模板 `body` 左右各 28px，少加会裁掉右侧。
- 返回值可能是数组，取 `[0]`；统一转成不含 `data:` 前缀的 base64。
- HTML 临时文件写在 `karinPathHtml` 下，文件名带 pid / 时间戳 / 随机串，`finally` 删除；不要写到插件目录。
- 失败时状态图 `warn` 一次（含安装渲染器提示）后返回 `null`；详情图只 `debug` 后返回 `null`。
- 渲染器可选；未安装 `@karinjs/plugin-puppeteer` 时不能中断检测，必须降级为文本。

## 11. WebUI

### 架构

- Karin `>=1.16.1` 读取 `package.json` 的 `karin.web` → `web.config.js`，在插件配置页用 iframe 打开 `page.url`。
- `index.js` 调用 `mountWebUI()`，把 `src/web/router.js` 挂到 Karin 的 `app` 上，前缀 `/server-status`。
  `mountWebUI()` 异步且幂等，路由模块动态导入，挂载失败只 warn。
- 路由顺序：`/v1` → `authMiddleware` → `apiRouter`；`/assets` → `express.static(webDistDir)` + SPA fallback；
  `/` → 302 到 `/server-status/assets/config`。
- 同一份前端支持以下入口：
  - `/server-status/assets/config`：独立页，带侧边栏 / 移动端抽屉与「关于」页；
  - `/server-status/assets/karin-config`：iframe 内嵌页，只渲染配置面板；
  - `/server-status/assets/about`：仅独立页使用的「关于」路由。
- 前端使用 `BrowserRouter`；静态 fallback 只处理 GET / HEAD，且必须在 `/v1` 之后。
- `web.config.js` 在 `NODE_ENV=development` 时把 `page.url` 指向 Vite dev server，其余情况使用相对路径。
- `page.title` / `page.description` 是 Karin 插件配置页上标题与副标题的文案，`info.*` 只影响插件列表卡片；
  改文案时同步 README 的 WebUI 入口说明。`page.description` 末尾的「本插件管理页面参考自 kkk 插件自带的配置管理页面」
  是**注明出处**（对应 kkk 的 `page.description`：`使用 kkk 插件自带的配置管理页面`），与第 2 节「上游产品名」的例外情形一致，
  不要删掉这半句。
- `info.author` 按 Karin 的 `Author` 类型写（见 <https://karinjs.com/guide/api/types/interfaces/Author.html>）：
  `{ name?, home?, avatar? }`，可以是单个对象或数组。当前填 `YlovexLN`，
  `home` 指向插件仓库、`avatar` 用 `https://github.com/YlovexLN.png`。
  `info.id` / `info.version` / `info.description` 都取自 `package.json`，改版本只需改 `package.json`。

### API

以下路径均省略 `/server-status` 前缀：

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
  main.tsx / App.tsx / index.css / types.ts
  api/client.ts（axios、token、401/419 刷新）· api/config.ts（配置/状态/测试推送）
  auth/token.ts（复用 Karin 登录态）· auth/crypto.ts（SHA-256 + 纯 JS 回退）
  references.ts（kkk / Uptime Kuma 外链 · 作者与仓库地址）
  hooks/useTheme.tsx · layouts/（Desktop/Mobile）· components/（Login/Status/Config/About/fields）· utils/
```

- 登录：优先复用 `userId` / `accessToken` / `refreshToken`；没有令牌时输入 Karin 的 HTTP 鉴权密钥，
  `sha256` 后调用与主 Web 相同的登录接口，成功后写回同一组 localStorage 键。
- 主题：`theme` 为 `system` / `inverse`，落到 `html` 的 `light` / `dark` class；iframe 内忽略 `storage` 事件，
  只接受父页面的 `karin-theme-change` 消息。
- 保存：前端先 `validateConfig`，与 `defaults` 深度比较判断 dirty；保存成功后用响应回填并清 dirty。
- 交互：不使用 `alert` / `confirm` / `prompt`（iframe 没有 `allow-modals`），统一 `toast`。
- 参考与鸣谢：独立页侧边栏底部与「关于」必须保留 kkk（`https://github.com/ikenxuan/karin-plugin-kkk`）与 Uptime Kuma 链接；
  kkk 仅作为独立 WebUI 的实现参考，**不是本项目上游仓库**。外链统一放 `web/src/references.ts`，不要删除或改成不可点击的文本。
- 作者署名：独立页侧边栏底部与「关于」页脚展示作者与插件仓库（`AUTHOR_NAME` / `AUTHOR_HOME` / `PLUGIN_REPO`），
  不再使用 `contributors` 这类占位署名；地址与第 2 节「作者与仓库」保持一致。

### 构建与调试

```bash
pnpm dev:web        # http://localhost:5176/server-status/assets/config
pnpm build:web      # 产物 web-dist/
pnpm preview:web    # 预览构建产物
```

- `web/vite.config.mjs` 的 `base` 固定 `/server-status/assets/`，开发代理 `/server-status/v1` 与 `/api/v1`
  到 `KARIN_API`（默认 `http://localhost:7777`）。
- `web-dist/` 被 git 忽略；npm 发布由 `prepublishOnly` 构建，源码安装需手动构建。
- 构建产物较大（JS 约 700 kB）是 HeroUI + GSAP 的现状；没有拆包需求时不要引入额外配置。

## 12. 变更指南

### 定位表

| 需求 | 主要文件 | 同步 |
| --- | --- | --- |
| 状态判断 / 重复提醒 / 恢复条件 | `src/engine.js` | `test/test-engine.mjs`、README 工作原理 |
| 接口解析 / 超时 / 地址规范化 | `src/client.js` | `test/test-api.mjs`、README 配置说明 |
| 状态持久化 | `src/state.js` | 集成测试状态断言、本文件数据结构 |
| 截图样式 / 文案排版 | `src/template.js` | `test/preview.mjs`、`docs/preview*.png` |
| 渲染参数 | `src/render.js` | 集成测试 `setViewport` 断言 |
| 推送目标 / 消息构造 | `src/target.js`、`src/notify.js` | `web/src/utils/targets.ts`、`web/src/components/TargetField.tsx`、README 推送目标格式、集成测试 |
| 检测流程 | `src/monitor.js` | 集成测试、README 工作原理 |
| 配置项 | `src/config.js`、`config/config.json` | README 配置表、本文件归一化表 |
| 指令 | `apps/*.js` | README 指令表、`#监控帮助`、集成测试计数 |
| 定时任务 | `apps/task.js` | 集成测试 `__tasks` 断言 |
| WebUI 配置字段 | `src/web/validate.js`、`web/src/types.ts`、`web/src/components/ConfigPanel.tsx` | README 配置表、`src/web/api.js` |
| WebUI 样式 / 布局 | `web/src/**` | `pnpm typecheck:web`、`pnpm build:web` |
| WebUI 路由 / 挂载 | `src/web/*`、`web/vite.config.mjs`、`web.config.js` | base / `WEB_PREFIX` / `page.url` 三处同步 |
| 作者 / 仓库地址 | `web.config.js` 的 `info.author`、`package.json`、`web/src/references.ts` | README「安装」的 `git clone`、`pnpm typecheck:web` + `pnpm build:web`、`npm test` 不受影响 |

### 新增指令 / 任务

- 指令：在 `apps/status.js` 或 `apps/subscribe.js` 新增 `karin.command(...)`；正则用
  `/^#?(?:监控|server-status)\s*(?:动作1|动作2)$/i`，需要参数时用 `(.*)$` 并参考 `extractKeyword`。
  配置至少含 `name`、`perm`（`all` / `master`）、`log: true`；回调自行 `try/catch` 并 `e.reply`。
  同步文件头注释、`#监控帮助`、README 指令表、`test/test-integration.mjs` 的 `findCommand` 与 `__commands.length`（当前 8）。
- 任务：用 `karin.task(显示名, cron, 回调, { name, log: false, type: 'skip' })`。监控任务固定 `* * * * *`，
  其他任务按自身语义写 cron；`type: 'skip'` 已防重入，回调不要再加锁，异常必须在模块内部消化。
  同步集成测试 `__tasks.length`（当前 1）。

### 新增配置 / 状态字段 / node-karin API

- 配置项：`defaultConfig` 与 `config/config.json` 两处都加；`getConfig()` 做收敛；同步 README 配置表、本文件归一化表；
  涉及状态机补 `test-engine`，涉及整链路补集成测试，影响渲染补 `test/preview.mjs`。
- 状态字段：`state.js` 初始 `data` 加字段，`load()` 给默认值，更新 `MonitorState` / `source` 的 JSDoc；
  结构不兼容时升 `VERSION` 并写迁移，不要假设旧文件一定有新字段。
- `node-karin` API：先确认 Karin `>=1.8.0` 提供；在 `test/stub/node-karin/index.js` 补最小实现；
  不要让桩比真实 API 更宽松。

### 修改截图模板

1. 改 `src/template.js` 的纯函数；不要在这里 import `node-karin`。
2. 跑 `node test/preview.mjs` 检查排版、长名称、100 条心跳、浅色 / 深色主题；视觉改动后重新生成
   `docs/preview.png` / `docs/preview-detail.png`（`dev/preview-*` 不提交）。
3. 尺寸基线：`BODY_PADDING=28`，截图视窗 `width + 56`（默认 `700` → `756`，集成测试有断言）；
   心跳条 10×30、间距 8，`LIST_INNER_PADDING=50`（列表卡片 10×2 + 监控项 15×2）；
   `beatSlots(width, 50)` 决定根数，`.beats` 用 `justify-content: space-between`，不要改成 `flex-start` / `flex-end`。
   容器有富余时实际间距会从 8px 轻微变大（约 9px），这是预期。
4. 视觉基线逐项抄自 Uptime Kuma 状态页，改前核对上游源码：
   - 配色：深色底 `#090c10`、卡片 `#0d1117`、正文 `#b1b8c0`；浅色纯白底 + `#212529`；
     状态色 `#5cdd8b` / `#dc3545` / `#f8a306` / `#1747f5`，无数据 `#6c757d`。
   - 卡片：投影 `0 15px 70px rgba(0,0,0,.1)`（深色不加深）、圆角 10px、内边距 10px；
     监控项内边距 `13px 15px 10px`、圆角 10px，列表 `min-height: 46px`。
   - 字号：`h1` 30px / 500，分组标题 26px / 500，整体状态 25px / 700（标题与分组用 Bootstrap 的 500 字重）。
   - 徽章：`min-width: 62px`、`padding: .35em .65em`、`font-size: .75em`、700、`line-height: 1`、圆角 999px；
     仅「深色 + 正常」用 `#020b05` 文字，其余白字；空槽位 `#848484`（深）/ `#f0f8ff`（浅）。
   - 顺序：标题 → 整体状态 → 描述 → 分组；页脚居中 14px，`.refresh-info` 用 `opacity: .7`；
     正文 16px / 1.5，中文回退插在 `sans-serif` 之前。
5. 详情图（`buildMonitorHtml`）只有三段：标题 → 一张卡片 → 页脚。
   卡片上半行是「状态图标 + 状态文字 + `平均响应 … · 异常 N 次` + 可用率徽章」，25px / 700；
   右侧指标 14px secondary 色、`margin-left: auto`；下半行心跳条 `margin-top: 14px`，与状态行共用内边距。
   文字与心跳必须在同一张卡片里；不要加回四宫格统计卡或「最近响应」。
   标题 26px / 500、副标题 13px、卡片内边距 `16px 20px`、页脚 13px；
   页脚两行（插件名 `karin-plugin-server-status` + `.refresh-info` 的「最后检测 …」）居中，`.detail-ft p { margin-bottom: 4px }`。

### 修改告警文案

改 `src/notify.js` 的 `build*Text`，同步 README「消息示例」与集成测试文本断言（`监控告警`、`监控恢复`、`中断时长`、`面板不可达`）；
保持 emoji + 中文，不要引入上游产品名。

## 13. 已知坑

### 时间与状态

- **截图宽度**：`body` 左右各 28px，视窗必须 `width + 56`，否则右侧被裁。
- **检测频率**：cron 每分钟触发，`interval` 实际是 60 秒的整数倍向上取整；`interval=90` 约 120 秒，`<60` 仍是 60 秒。
- **节流基于开始时间**：`lastCheckAt` 在请求前设置，请求失败也占用一个间隔；手动检测用 `force: true` 绕过。
- **skipped 也是 ok**：`enable=false`、并发、未到间隔都会返回 `{ ok: true, skipped: true }`，调用方要判断 `skipped`。
- **并发锁**：`runCheck()` 的 `running` 锁与 `karin.task` 的 `type: 'skip'` 已两层，不要加第三层。
- **面板掉线告警**：必须 `everUp`（曾成功连接过）才告警；默认 `127.0.0.1:3001` 不会刷屏。
- **恢复通知**：只有此前真的产生过告警（`notifyCount > 0`）才发送；`notifyCount` 与推送成功与否无关。
- **维护 / 待确认**：`DOWN → MAINTENANCE` 或 `DOWN → PENDING`（未开 `alertOnPending`）不发恢复消息，且会重置 `notifyCount`。
- **过滤后的旧状态**：被 `onlyMonitors` / `ignoreMonitors` 排除的监控项不更新 state，重新纳入时可能误报。
- **删除的监控项**：`state.json` 不会自动清理已删除的 id。

### 配置与路径

- **状态文件位置**：`@karinjs/<插件目录名>/data/state.json`，由 `karinPathBase`（通常基于 `process.cwd()`）决定，不是插件目录。
- **目录名敏感**：`dir.pluginName` 取插件文件夹名；重命名目录会换配置 / 数据路径。
- **getter 不要解构**：`dir.configDir` / `dir.dataDir` / `dir.stateFile` 依赖 `this`。
- **配置即时生效**：改 `config.json` 不用重启；改 `defaultConfig` 只对缺失字段生效。
- **saveConfig 不做归一化**：写入原样，`getConfig()` 读取时才 clamp；其他调用方仍需自行校验。
- **配置写盘是原子的**：`saveConfig()` 先写临时文件再 `renameSync`；失败会清理临时文件，但不要让多个进程同时写。
- **删除用户配置**：下次 `getConfig()` 时 `ensureConfig()` 会用默认配置重新生成，原配置丢失。
- **布尔值陷阱**：JSON 中 `"false"` 是字符串真值；布尔配置必须写 `false`。
- **URL slug 优先**：`statusUrl` 含状态页路径时，URL 中的 slug 优先于 `statusSlug`；根地址才使用配置，最后回退 `default`。

### 推送与渲染

- **没有 targets**：`fallbackToMaster=false` 且 targets 为空时只 warn 并返回 0，检测继续。
- **多 Bot**：target 没写 `selfId` 时永远用第一个 Bot；多 Bot 场景要显式配置。
- **去重**：只按 `scene:peer` 去重，同一会话两个不同 `selfId` 会被视为重复。
- **推送失败不影响状态**：单目标失败只记 error；`notifyCount` 已增加，恢复消息仍会发。
- **`#监控检测` 结果**：按 `runCheck().notifications` 提示「通知已发送 / 部分失败 / 无目标」，不要退回固定文案。
- **渲染器可选**：未安装 `@karinjs/plugin-puppeteer` 时返回 `null` 走文本，不能抛异常中断检测。
- **临时文件**：写在 `karinPathHtml`，`finally` 删除；不要写到插件目录。
- **warn 只一次**：`render.js` 的 `warned` 是模块级；详情图失败只记 debug，不 warn。
- **中文字体**：Linux 渲染器缺字体时中文变方块，装 `fonts-noto-cjk`（见 README FAQ）。
- **时区格式化开销**：`buildBeats` 在设置 `timezone` 时对每根心跳条调用 `Intl.DateTimeFormat`；100 条时明显变慢。

### WebUI

- **iframe 没有 `allow-modals`**：`alert` / `confirm` / `prompt` 不可用，统一 `toast`。
- **`page` 需要 Karin `>=1.16.1`**：低版本忽略 `karin.web`，插件仍可运行；独立页 `/server-status/assets/config` 可直接打开。
- **`web-dist/` 不提交**：源码安装必须先 `pnpm install && pnpm build:web`，否则静态路由返回 503；npm 包由 `prepublishOnly` 构建。
- **路由是动态导入的**：`src/web/index.js` 用 `await import('./router.js')`，旧版 Karin 缺少 `node-karin/express` 时只 warn；
  不要改回静态 import。
- **base 三处同步**：`web/vite.config.mjs` 的 `base`、`src/web/paths.js` 的 `WEB_PREFIX`、`web.config.js` 的 `page.url` 必须一致。
- **SPA fallback 顺序**：`/v1` 必须在静态路由之前；fallback 只处理 GET / HEAD，不能吞掉 POST。
- **静态资源不鉴权、API 鉴权**：`/assets` 公开，`/v1` 走 `authMiddleware`；不要把配置或密钥写进前端静态文件。
- **登录态复用**：读写 Karin 主 Web 的 `userId` / `accessToken` / `refreshToken`；401 / 419 先刷新，失败后清空并回登录页。
- **HTTP 下没有 `crypto.subtle`**：局域网 HTTP 访问时 Web Crypto 不可用，`auth/crypto.ts` 的纯 JS SHA-256 回退不要删除。
- **主题同步**：`localStorage.theme` 与 Karin 共用；iframe 内忽略 `storage` 事件，只接受父页面 `karin-theme-change`。
- **Select 用 RAC 语义**：`selectedKey` / `onSelectionChange`（不是 `value` / `onChange`）；`Tabs` 同理用 `selectedKey`。
- **测试推送可能 400**：`targets` 为空且 `fallbackToMaster=false` 时后端返回 400，前端提示先配置目标。

### 测试与其它

- **测试文件位置**：测试脚本放 `test/`；mock、浏览器配置、截图、临时目录放 `dev/.tmp-*/`；禁止写到项目外，验证结束删除。
- **集成测试与真实 node-karin 冲突**：检测到 `node_modules/node-karin` 不是桩会中止测试；先移除或换干净目录。
- **不要并行**：测试共享 `node_modules`、`dev/.tmp-run` 和 `process.chdir`。
- **chdir 顺序**：集成测试先 `process.chdir(tempDir)` 再 import 插件；`karinPath` 在模块加载时计算，顺序错了会写错目录。
- **计数断言**：新增指令 / 任务要改 `__commands.length` / `__tasks.length`（当前 8 / 1）。
- **视窗断言**：改模板内边距或 `width` 默认值要改 `756`（= 700 + 56）。
- **文本断言**：改告警文案要改集成测试里的字符串。
- **覆盖缺口**：集成测试未覆盖面板恢复（`source-up`）、重复提醒、PENDING / 维护、only / ignore、浅色主题、单目标推送失败。
- **runCheck 的清理**：新增早退分支不要绕过 `finally` 的 `state.flush()` 与 `running` 释放。
- **非法 statusUrl**：在 `new StatusClient()` 抛错，由 `runCheck` 捕获并返回 `{ ok: false }`，不会卡锁。
- **user-agent 版本号**：`src/client.js` 硬编码 `karin-plugin-server-status/0.0.1`；升版本时顺手改。
- **docs 会发布**：`files` 包含 `docs`，不要放草稿；`.agents/` 不在 `files` 中，不会随包发布。
- **data 目录**：`karin.files` 声明了 `data`，但仓库里没有该目录，运行时由 `ensureConfig()` 创建。

## 14. 发布与检查清单

### 发布与提交

- **打包与发布只在用户明确指令后执行**：打 zip / tar.gz（`tar -a -c -f`、`tar -czf`）、`npm pack`、`npm publish`
  这类会产出发布物的操作，必须等用户明确提出「打包」「发布」等指令后才做。日常改完代码只需 `pnpm check` 与对应测试，
  **不要主动打包**，也不要把归档当成改动的默认收尾步骤。
  真要验证打包时，临时脚本放 `dev/.tmp-*/`、产物落 `dev/`，验证完删掉临时脚本；
  已生成的归档与 `dev/dist/` 的去留交给用户决定，不要自行删除或覆盖。
- `files` 决定发布内容：`index.js`、`apps`、`src`、`config`、`docs`、`web-dist`、`web.config.js`、`README.md`、`LICENSE`；
  新增顶层目录 / 文件要同步。`karin.files` 当前为 `config`、`data`；`karin.web` 指向 `./web.config.js`；
  `karin.apps` 为 `["apps"]`，Karin 自动加载，不要在 `index.js` 手动注册指令 / 任务。
- 生产 `page.url` 是 `/server-status/assets/karin-config`，`NODE_ENV=development` 时指向 Vite dev server。
- `prepublishOnly` 会执行 `pnpm build:web`，因此 `web-dist/` 虽被 git 忽略仍会进 npm 包；发布前先构建并检查产物。
  直接 `git clone` 的源码安装没有 `web-dist/`，需要用户自行构建（README 已说明）。
- README 截图放 `docs/preview*.png`；`dev/preview-*` 不提交。发布前确认 `main`、`type: "module"`、
  `engines.node >= 18`、`engines.karin >= 1.8.0` 未变，并跑完 `pnpm check`、`pnpm build:web`、`pnpm test`。
- 版本号遵循 SemVer：破坏性升 major，新增功能升 minor，修复升 patch；改名 / 改配置键必须在 README 标注迁移方式。
- 不提交：`node_modules/`、`@karinjs/`、`*.log`、`.DS_Store`、`test/`、`dev/`、`web-dist/`。
- `.gitattributes` 固定 `* text=auto eol=lf`；即使 Windows 的 `core.autocrlf=true` 也不要改回 CRLF。
- `pnpm-lock.yaml` 要提交，不要手改；README 必须与实现保持一致（指令表、配置表、默认值、消息示例、WebUI 入口与构建命令）。
- 改了本文件描述的目录、命令、分层或计数时，同步更新 `AGENTS.md`。
- 提交信息用简洁的祈使句说明「改了什么 + 为什么」；不提交与本次改动无关的格式化 / 重排。

### 交付前检查清单

- [ ] `pnpm check` 通过（后端 `node --check` + 前端 `tsc`）。
- [ ] `pnpm build:web` 通过，`web-dist/index.html` 与 assets 已生成。
- [ ] `pnpm test` 全部通过（engine 32 / api 25 / integration 102）。
- [ ] 配置项已同步 `defaultConfig`、`config/config.json`、README、本文件、`src/web/validate.js` 与 `web/src/types.ts`。
- [ ] 指令已同步帮助文案、README、集成测试计数；状态字段已同步初始值、`load()` 默认值与 JSDoc。
- [ ] 纯逻辑模块没有 import `node-karin`；`web/` 没有 import `node:*` / `node-karin`。
- [ ] 没有新增运行时依赖；前端依赖都在 `devDependencies`。
- [ ] 没有把临时 HTML / 截图写到插件目录，项目内临时产物都在 `dev/.tmp-*/` 且已删除；
      项目外（C 盘、`%TEMP%`、用户目录）没有测试脚本、截图或浏览器配置。
- [ ] 日志有 `[server-status]` 前缀，级别正确；用户文案为简体中文，没有上游产品名（允许位置除外）。
- [ ] `runCheck()` 的 `notifications` 与实际推送一致，`#监控检测` 文案已同步。
- [ ] 新增 `node-karin` API 已补 `test/stub`；发布相关文件（`files` / `karin.files` / `karin.web`）已检查，`web-dist/` 已构建。
- [ ] WebUI 在独立页和 iframe 内都验证过：无控制台报错、无横向滚动、保存 / 测试推送可用。
- [ ] 独立页侧边栏与「关于」保留 kkk 参考项目和 Uptime Kuma 的参考链接。
- [ ] 没有被用户要求时，没有自行生成 zip / tar.gz / `npm pack` 产物；如已生成，未擅自删除或覆盖。
