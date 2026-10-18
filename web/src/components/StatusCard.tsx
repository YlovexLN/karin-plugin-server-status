import { Card, Spinner } from '@heroui/react'
import { Activity, CircleCheck, RefreshCw, ServerOff, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import { getState } from '../api/config'
import type { StatePayload } from '../types'
import { formatRelative } from '../utils/format'
import { MiniTag } from './fields'

/** 配置页顶部的运行概览 */
export const StatusCard = () => {
  const [data, setData] = useState<StatePayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    getState()
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <Card className="mb-4">
        <Card.Content className="flex items-center gap-3 p-5 text-sm text-default-500">
          <Spinner size="sm" />
          正在读取运行状态…
        </Card.Content>
      </Card>
    )
  }

  const monitors = Object.values(data?.state?.monitors || {})
  const down = monitors.filter((item) => item.status === 0).length
  const up = monitors.filter((item) => item.status === 1).length
  const sourceDown = Boolean(data?.state?.source?.down)

  const items = [
    {
      label: '监控项',
      value: String(monitors.length),
      hint: 'state.json 中已记录',
      icon: Activity,
      tone: 'default' as const
    },
    {
      label: '正常',
      value: String(up),
      hint: '最近一次记录为 UP',
      icon: CircleCheck,
      tone: 'success' as const
    },
    {
      label: '异常',
      value: String(down),
      hint: '最近一次记录为 DOWN',
      icon: TriangleAlert,
      tone: down ? ('danger' as const) : ('default' as const)
    },
    {
      label: '面板',
      value: sourceDown ? '不可达' : '正常',
      hint: data?.state?.source?.lastError || '最近一次请求结果',
      icon: ServerOff,
      tone: sourceDown ? ('danger' as const) : ('success' as const)
    }
  ]

  return (
    <Card className="mb-4" data-config-section>
      <Card.Header className="flex flex-row items-center justify-between gap-3 p-5 pb-2">
        <Card.Title className="text-base">运行概览</Card.Title>
        <MiniTag>
          <RefreshCw className="size-3" />
          {formatRelative(data?.updatedAt)}
        </MiniTag>
      </Card.Header>
      <Card.Content className="grid grid-cols-2 gap-3 p-5 pt-3 md:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon
          const toneClass =
            item.tone === 'danger'
              ? 'text-danger bg-danger/10'
              : item.tone === 'success'
                ? 'text-success bg-success/10'
                : 'text-default-600 bg-content2'

          return (
            <div key={item.label} className="flex min-w-0 items-start gap-3 rounded-xl border border-default-100 p-3">
              <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}>
                <Icon className="size-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-default-500">{item.label}</p>
                <p className="truncate text-lg font-semibold">{item.value}</p>
                <p className="truncate text-[11px] text-default-400">{item.hint}</p>
              </div>
            </div>
          )
        })}
      </Card.Content>
    </Card>
  )
}
