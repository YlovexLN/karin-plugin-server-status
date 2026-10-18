import { Button, Card, Spinner, Tabs, Tooltip, toast } from '@heroui/react'
import deepEqual from 'fast-deep-equal'
import gsap from 'gsap'
import { RotateCcw, Save, Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getConfig, saveConfig, testPush } from '../api/config'
import type { Config, DeviceLayout } from '../types'
import { validateConfig, validateTarget } from '../utils/validation'
import { NumberField, SelectField, SwitchField, TagField, TextFieldInput } from './fields'
import { StatusCard } from './StatusCard'

interface ConfigPanelProps {
  device: DeviceLayout
}

type TabKey = 'basic' | 'push' | 'filter' | 'image'

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'basic', label: '基础' },
  { key: 'push', label: '推送' },
  { key: 'filter', label: '过滤' },
  { key: 'image', label: '截图' }
]

const themeOptions = [
  { label: '深色', value: 'dark' },
  { label: '浅色', value: 'light' }
]

/** 配置管理面板：加载、校验、保存、测试推送 */
export const ConfigPanel = ({ device }: ConfigPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [savedConfig, setSavedConfig] = useState<Config | null>(null)
  const [tab, setTab] = useState<TabKey>('basic')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const payload = await getConfig()
      setConfig(payload.config)
      setSavedConfig(payload.config)
    } catch (error) {
      toast.danger('加载配置失败', {
        description: error instanceof Error ? error.message : '未知错误'
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (loading || !config || !panelRef.current) return
    const sections = panelRef.current.querySelectorAll('[data-config-section]')
    gsap.fromTo(
      sections,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.35, stagger: 0.04, overwrite: true }
    )
  }, [tab, loading])

  const setField = useCallback(<K extends keyof Config,>(key: K, value: Config[K]) => {
    setConfig((current) => (current ? { ...current, [key]: value } : current))
  }, [])

  const dirty = useMemo(() => Boolean(config && savedConfig && !deepEqual(config, savedConfig)), [config, savedConfig])
  const errors = useMemo(() => validateConfig(config), [config])
  const hasError = Object.keys(errors).length > 0

  const targetError = useMemo(() => {
    if (!config) return undefined
    for (const item of config.targets) {
      const message = validateTarget(item)
      if (message) return message
    }
    return undefined
  }, [config])

  const handleSave = async () => {
    if (!config || hasError || targetError) return
    setSaving(true)
    try {
      const next = await saveConfig(config)
      setConfig(next)
      setSavedConfig(next)
      toast.success('配置已保存')
    } catch (error) {
      toast.danger('保存失败', {
        description: error instanceof Error ? error.message : '未知错误'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTestPush = async () => {
    setTesting(true)
    try {
      const result = await testPush()
      toast.success(`测试推送完成：${result.success}/${result.total}`)
    } catch (error) {
      toast.danger('测试推送失败', {
        description: error instanceof Error ? error.message : '未知错误'
      })
    } finally {
      setTesting(false)
    }
  }

  if (loading || !config) {
    return (
      <div className="flex min-h-80 items-center justify-center gap-3 text-sm text-default-500">
        <Spinner size="sm" />
        正在读取配置…
      </div>
    )
  }

  return (
    <div ref={panelRef} className="relative flex min-w-0 max-w-full flex-col gap-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">配置管理</h2>
          <p className="mt-1 text-sm text-default-500">
            修改后点击保存即时生效，无需重启 Karin。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip delay={0}>
            <Tooltip.Trigger aria-label="重新读取配置">
              <Button isIconOnly isDisabled={loading || saving} variant="secondary" onPress={load}>
                <RotateCcw className="size-4" aria-hidden="true" />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content showArrow placement="bottom">
              <Tooltip.Arrow />
              重新读取
            </Tooltip.Content>
          </Tooltip>
          <Button
            isDisabled={!dirty || hasError || Boolean(targetError) || saving}
            variant="primary"
            onPress={handleSave}
          >
            {saving ? <Spinner color="current" size="sm" /> : <Save className="size-4" aria-hidden="true" />}
            <span>{saving ? '保存中…' : '保存'}</span>
          </Button>
        </div>
      </div>

      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key) as TabKey)}>
        <Tabs.ListContainer className="w-full overflow-x-auto">
          <Tabs.List aria-label="配置分区" className="w-fit min-w-max">
            {tabs.map((item, index) => (
              <Tabs.Tab key={item.key} id={item.key}>
                {index > 0 ? <Tabs.Separator /> : null}
                <span className="whitespace-nowrap">{item.label}</span>
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      {tab === 'basic' ? (
        <>
          <StatusCard />
          <Card data-config-section>
            <Card.Header className="p-5 pb-2">
              <Card.Title className="text-base">监控面板</Card.Title>
            </Card.Header>
            <Card.Content className={`grid gap-5 p-5 pt-3 ${device === 'mobile' ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
              <SwitchField
                help="关闭后定时任务不再发起请求，但仍保留状态与配置。"
                label="启用定时监控"
                value={config.enable}
                onChange={(value) => setField('enable', value)}
              />
              <TextFieldInput
                error={errors.statusUrl}
                help="可填面板根地址、/status/:slug 或 /status-page/:slug 完整地址。"
                label="面板地址"
                placeholder="http://127.0.0.1:3001"
                value={config.statusUrl}
                onChange={(value) => setField('statusUrl', value)}
              />
              <TextFieldInput
                help="面板根地址时使用；URL 中已含状态页路径时以 URL 为准。"
                label="状态页 Slug"
                placeholder="default"
                value={config.statusSlug}
                onChange={(value) => setField('statusSlug', value)}
              />
              <NumberField
                error={errors.interval}
                help="cron 每分钟触发，实际最小 60 秒。"
                label="检测间隔（秒）"
                min={30}
                step={30}
                value={config.interval}
                onChange={(value) => setField('interval', value)}
              />
              <NumberField
                error={errors.timeout}
                help="单次状态页请求的超时时间。"
                label="请求超时（毫秒）"
                min={1000}
                step={1000}
                value={config.timeout}
                onChange={(value) => setField('timeout', value)}
              />
              <TextFieldInput
                help="如 Asia/Shanghai；留空使用系统时区。"
                label="时区"
                placeholder="Asia/Shanghai"
                value={config.timezone}
                onChange={(value) => setField('timezone', value)}
              />
            </Card.Content>
          </Card>
        </>
      ) : null}

      {tab === 'push' ? (
        <Card data-config-section>
          <Card.Header className="flex flex-row items-center justify-between gap-3 p-5 pb-2">
            <Card.Title className="text-base">推送设置</Card.Title>
            <Button isDisabled={testing} size="sm" variant="secondary" onPress={handleTestPush}>
              {testing ? <Spinner color="current" size="sm" /> : <Send className="size-4" aria-hidden="true" />}
              <span>测试推送</span>
            </Button>
          </Card.Header>
          <Card.Content className={`grid gap-5 p-5 pt-3 ${device === 'mobile' ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
            <div className="md:col-span-2">
              <TagField
                error={targetError}
                help="格式：group:123456、friend:10001、群:123456；裸字符串按私聊处理。"
                label="推送目标"
                placeholder="group:123456"
                value={config.targets}
                onChange={(value) => setField('targets', value)}
              />
            </div>
            <SwitchField
              help="targets 为空时推送给机器人主人。"
              label="回退到主人"
              value={config.fallbackToMaster}
              onChange={(value) => setField('fallbackToMaster', value)}
            />
            <SwitchField
              help="默认关闭，避免重启后重复刷屏。"
              label="启动时异常也告警"
              value={config.notifyOnStart}
              onChange={(value) => setField('notifyOnStart', value)}
            />
            <SwitchField
              help="进入「待确认」状态时是否告警。"
              label="待确认状态告警"
              value={config.alertOnPending}
              onChange={(value) => setField('alertOnPending', value)}
            />
            <SwitchField
              help="仅在此前产生过告警时发送恢复消息。"
              label="恢复通知"
              value={config.notifyRecovery}
              onChange={(value) => setField('notifyRecovery', value)}
            />
            <NumberField
              error={errors.repeatInterval}
              help="0 表示不重复提醒。"
              label="重复提醒间隔（分钟）"
              min={0}
              step={5}
              value={config.repeatInterval}
              onChange={(value) => setField('repeatInterval', value)}
            />
            <SwitchField
              help="面板连续请求失败时推送告警。"
              label="面板掉线告警"
              value={config.notifySourceDown}
              onChange={(value) => setField('notifySourceDown', value)}
            />
            <NumberField
              error={errors.sourceDownRetries}
              help="连续失败达到该次数后才判定面板掉线。"
              label="连续失败次数"
              min={1}
              step={1}
              value={config.sourceDownRetries}
              onChange={(value) => setField('sourceDownRetries', value)}
            />
          </Card.Content>
        </Card>
      ) : null}

      {tab === 'filter' ? (
        <Card data-config-section>
          <Card.Header className="p-5 pb-2">
            <Card.Title className="text-base">监控项过滤</Card.Title>
          </Card.Header>
          <Card.Content className={`grid gap-5 p-5 pt-3 ${device === 'mobile' ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
            <TagField
              help="留空表示全部监控；填写 ID 或名称片段。"
              label="只监控这些"
              placeholder="Web 主站"
              value={config.onlyMonitors}
              onChange={(value) => setField('onlyMonitors', value)}
            />
            <TagField
              help="命中即排除，优先级高于「只监控」。"
              label="忽略这些"
              placeholder="测试环境"
              value={config.ignoreMonitors}
              onChange={(value) => setField('ignoreMonitors', value)}
            />
          </Card.Content>
        </Card>
      ) : null}

      {tab === 'image' ? (
        <Card data-config-section>
          <Card.Header className="p-5 pb-2">
            <Card.Title className="text-base">截图设置</Card.Title>
          </Card.Header>
          <Card.Content className={`grid gap-5 p-5 pt-3 ${device === 'mobile' ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
            <SwitchField
              help="关闭后只发送文本；需要安装 Karin 渲染器才能截图。"
              label="附带状态截图"
              value={config.enableImage}
              onChange={(value) => setField('enableImage', value)}
            />
            <SelectField
              help="影响截图配色，不影响 Karin WebUI。"
              label="截图主题"
              options={themeOptions}
              value={config.theme}
              onChange={(value) => setField('theme', value as Config['theme'])}
            />
            <NumberField
              error={errors.width}
              help="600 - 1600 px，实际视窗会额外加 56px 内边距。"
              label="截图宽度（px）"
              max={1600}
              min={600}
              step={50}
              value={config.width}
              onChange={(value) => setField('width', value)}
            />
            <NumberField
              error={errors.deviceScaleFactor}
              help="越大越清晰，文件也越大。"
              label="缩放倍率"
              max={4}
              min={1}
              step={0.5}
              value={config.deviceScaleFactor}
              onChange={(value) => setField('deviceScaleFactor', value)}
            />
            <NumberField
              error={errors.maxHeartbeats}
              help="状态图中展示的历史心跳数量。"
              label="心跳数量"
              max={100}
              min={10}
              step={5}
              value={config.maxHeartbeats}
              onChange={(value) => setField('maxHeartbeats', value)}
            />
          </Card.Content>
        </Card>
      ) : null}

      {hasError || targetError ? (
        <p className="text-xs text-danger">存在未通过校验的配置项，请先修正后再保存。</p>
      ) : null}
    </div>
  )
}
