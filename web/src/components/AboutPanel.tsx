import { Card, Description } from '@heroui/react'
import { ExternalLink, Heart, Link2, ShieldCheck, Zap } from 'lucide-react'
import { useEffect } from 'react'

import { AUTHOR_HOME, AUTHOR_NAME, KKK_REPO, PLUGIN_REPO, UPTIME_KUMA_REPO } from '../references'

const features = [
  {
    icon: Zap,
    title: '只读监控',
    description: '只请求公开状态页接口，不登录、不写入、不修改面板。'
  },
  {
    icon: ShieldCheck,
    title: '状态机去重',
    description: '异常、恢复、重复提醒分别处理，重启不会重复刷屏。'
  },
  {
    icon: Heart,
    title: '截图与文本',
    description: '告警附带状态页截图；渲染器缺失时自动降级为文本。'
  }
]

interface Reference {
  href: string
  name: string
  badge?: string
  description: string
}

const references: Reference[] = [
  {
    href: KKK_REPO,
    name: 'ikenxuan/karin-plugin-kkk',
    badge: '独立 WebUI 参考',
    description: '本项目的独立 WebUI 在布局、交互与主题适配上参考了 kkk 的配置页实现，感谢作者与贡献者开源。'
  },
  {
    href: UPTIME_KUMA_REPO,
    name: 'louislam/uptime-kuma',
    description: '状态页数据格式参考 Uptime Kuma 1.x / 2.x 的公开 API。'
  }
]

/** 关于页 */
export const AboutPanel = () => {
  useEffect(() => {
    const previous = document.title
    document.title = '关于 · 服务器状态监控'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <Card.Header className="p-6 pb-2">
          <Card.Title className="text-xl">服务器状态监控</Card.Title>
          <Description>
            Karin 插件：轮询公开状态页 API，在监控项异常 / 恢复时推送 QQ 消息，并附带一张仿状态页的监控截图。
          </Description>
        </Card.Header>
        <Card.Content className="grid gap-4 p-6 pt-3 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div key={feature.title} className="rounded-xl border border-default-100 p-4">
                <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <p className="font-semibold">{feature.title}</p>
                <p className="mt-1 text-xs text-default-500">{feature.description}</p>
              </div>
            )
          })}
        </Card.Content>
      </Card>

      <Card>
        <Card.Header className="p-6 pb-2">
          <Card.Title className="text-base">配置与数据</Card.Title>
        </Card.Header>
        <Card.Content className="flex flex-col gap-2 p-6 pt-3 text-sm text-default-600">
          <p>
            用户配置：<code className="rounded bg-content2 px-1.5 py-0.5 text-xs">@karinjs/&lt;插件目录名&gt;/config/config.json</code>
          </p>
          <p>
            状态文件：<code className="rounded bg-content2 px-1.5 py-0.5 text-xs">@karinjs/&lt;插件目录名&gt;/data/state.json</code>
          </p>
          <p>配置保存后即时生效，无需重启 Karin；截图与文本的时间展示受 timezone 影响。</p>
        </Card.Content>
      </Card>

      <Card>
        <Card.Header className="p-6 pb-2">
          <Card.Title className="text-base">参考与鸣谢</Card.Title>
          <Description>感谢以下开源项目提供的实现参考与接口约定。</Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-3 p-6 pt-3">
          {references.map((reference) => (
            <a
              key={reference.href}
              href={reference.href}
              target="_blank"
              rel="noreferrer noopener"
              className="group flex items-start gap-3 rounded-xl border border-default-100 p-4 transition-colors hover:border-primary/40 hover:bg-content2"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Link2 className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                  <span className="truncate">{reference.name}</span>
                  {reference.badge ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {reference.badge}
                    </span>
                  ) : null}
                  <ExternalLink
                    className="size-3.5 shrink-0 text-default-400 transition-colors group-hover:text-primary"
                    aria-hidden="true"
                  />
                </p>
                <p className="mt-1 text-xs leading-relaxed text-default-500">{reference.description}</p>
              </div>
            </a>
          ))}
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="p-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-default-500">
            <Link2 className="size-4 shrink-0" aria-hidden="true" />
            <span>作者</span>
            <a
              className="inline-flex items-center gap-1 font-medium transition-colors hover:text-primary"
              href={AUTHOR_HOME}
              target="_blank"
              rel="noreferrer noopener"
            >
              {AUTHOR_NAME}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
            <span aria-hidden="true">·</span>
            <a
              className="inline-flex items-center gap-1 transition-colors hover:text-primary"
              href={PLUGIN_REPO}
              target="_blank"
              rel="noreferrer noopener"
            >
              插件仓库
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
            <span aria-hidden="true">·</span>
            <span>GPL-3.0-only</span>
          </div>
        </Card.Content>
      </Card>
    </div>
  )
}
