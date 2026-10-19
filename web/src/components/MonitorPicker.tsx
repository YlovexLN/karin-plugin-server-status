import { Button, Checkbox, Label, Spinner, toast } from '@heroui/react'
import { ListOrdered, RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import { fetchMonitors } from '../api/config'
import type { Config, MonitorOption } from '../types'

interface MonitorPickerProps {
  /** 已选中的监控项（写入 onlyMonitors） */
  value: string[]
  onChange: (value: string[]) => void
  /** 表单里尚未保存的连接信息，用于拉取列表 */
  connection: Pick<Config, 'statusUrl' | 'statusSlug' | 'metricsUrl' | 'metricsApiKey' | 'metricsApiUser'>
  disabled?: boolean
}

/** 状态码对应的展示文案与配色 */
const statusMeta = (status: number | null): { label: string; className: string } => {
  if (status === 1) return { label: '正常', className: 'bg-success/10 text-success border-success/20' }
  if (status === 0) return { label: '故障', className: 'bg-danger/10 text-danger border-danger/20' }
  if (status === 2) return { label: '待确认', className: 'bg-warning/10 text-warning border-warning/20' }
  if (status === 3) return { label: '维护', className: 'bg-primary/10 text-primary border-primary/20' }
  return { label: '无数据', className: 'bg-content2 text-default-500 border-default-200' }
}

/**
 * 监控项勾选器
 *
 * 从面板拉取监控项列表（优先指标接口，覆盖全部监控项；没有密钥时退回状态页），
 * 勾选结果写入 `onlyMonitors`（按 ID）。未勾选任何项表示监控全部。
 */
export const MonitorPicker = ({ value, onChange, connection, disabled }: MonitorPickerProps) => {
  const [monitors, setMonitors] = useState<MonitorOption[]>([])
  const [source, setSource] = useState<'metrics' | 'status-page' | ''>('')
  const [loading, setLoading] = useState(false)

  const selected = useMemo(() => new Set(value), [value])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const payload = await fetchMonitors(connection)
      setMonitors(payload.monitors)
      setSource(payload.source)
      if (payload.monitors.length === 0) {
        toast.warning('没有拉到监控项', {
          description: '面板里还没有监控项，或密钥没有对应权限。'
        })
      }
    } catch (error) {
      toast.danger('拉取监控项失败', {
        description: error instanceof Error ? error.message : '未知错误'
      })
    } finally {
      setLoading(false)
    }
  }, [connection])

  const toggle = (id: string, next: boolean) => {
    onChange(next ? [...value, id] : value.filter((item) => item !== id))
  }

  /** 勾选列表外的历史值（例如手填的名称片段）也要能看见并移除 */
  const extras = value.filter((item) => !monitors.some((monitor) => monitor.id === item))

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <Label className="font-semibold">监控哪些项</Label>
          <p className="text-xs text-default-500">
            {value.length === 0
              ? '未勾选任何项：监控面板里的全部监控项。'
              : `已勾选 ${value.length} 项，只监控这些。`}
            {source ? `（列表来自${source === 'metrics' ? '指标接口，含未公开的监控项' : '状态页，仅含已公开项'}）` : ''}
          </p>
        </div>
        <Button isDisabled={disabled || loading} size="sm" variant="secondary" onPress={load}>
          {loading ? <Spinner color="current" size="sm" /> : <RefreshCw className="size-4" aria-hidden="true" />}
          <span>{loading ? '拉取中…' : '拉取监控项列表'}</span>
        </Button>
      </div>

      {monitors.length > 0 ? (
        <div className="flex max-h-80 min-w-0 flex-col divide-y divide-default-100 overflow-y-auto rounded-xl border border-default-200 bg-content1 p-1">
          {monitors.map((monitor) => {
            const meta = statusMeta(monitor.status)
            return (
              <Checkbox
                key={monitor.id}
                className="w-full px-3 py-2"
                isDisabled={disabled}
                isSelected={selected.has(monitor.id)}
                onChange={(next: boolean) => toggle(monitor.id, next)}
              >
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{monitor.name}</span>
                      <span className="truncate text-xs text-default-500">
                        ID {monitor.id}
                        {monitor.type ? ` · ${monitor.type}` : ''}
                      </span>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${meta.className}`}>
                      {meta.label}
                    </span>
                  </div>
                </Checkbox.Content>
              </Checkbox>
            )
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-default-200 px-4 py-6 text-sm text-default-500">
          <ListOrdered className="size-4" aria-hidden="true" />
          {source ? '列表为空，面板里可能还没有监控项。' : '点击「拉取监控项列表」后在这里勾选。'}
        </div>
      )}

      {extras.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-default-500">不在列表中的历史值：</span>
          {extras.map((item) => (
            <span key={item} className="tag-chip">
              <span className="max-w-56 truncate">{item}</span>
              <button
                type="button"
                aria-label={`移除 ${item}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((current) => current !== item))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
