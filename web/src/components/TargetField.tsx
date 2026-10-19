import {
  Button,
  Description,
  Input,
  Label,
  ListBox,
  Select
} from '@heroui/react'
import { Plus, X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

import type { PushScene, PushTarget } from '../types'
import { PEER_PLACEHOLDER, SCENE_HELP, sceneLabel, targetKey, validatePeer } from '../utils/targets'

interface TargetFieldProps {
  value: PushTarget[]
  onChange: (value: PushTarget[]) => void
  error?: string
  disabled?: boolean
}

const sceneOptions: Array<{ label: string; value: PushScene; description: string }> = [
  { label: '群聊', value: 'group', description: '发送到群，填群号' },
  { label: '私聊', value: 'friend', description: '发送给个人，填 QQ 号' }
]

/**
 * 推送目标编辑器
 *
 * 先选场景（群聊 / 私聊），再填对应的群号或 QQ 号；已添加的目标以列表展示，可逐个移除。
 */
export const TargetField = ({ value, onChange, error, disabled }: TargetFieldProps) => {
  const [scene, setScene] = useState<PushScene>('group')
  const [peer, setPeer] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)

  const addTarget = () => {
    const message = validatePeer(peer, scene)
    if (message) {
      setDraftError(message)
      return
    }

    const next: PushTarget = { scene, peer: peer.trim() }
    if (value.some((item) => targetKey(item) === targetKey(next))) {
      setDraftError('该目标已在列表中，无需重复添加')
      return
    }

    onChange([...value, next])
    setPeer('')
    setDraftError(null)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    addTarget()
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Label className="font-semibold">推送目标</Label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Select
          className="w-full sm:w-44"
          isDisabled={disabled}
          selectedKey={scene}
          variant="secondary"
          onSelectionChange={(key) => {
            if (key === null) return
            setScene(key as PushScene)
            setDraftError(null)
          }}
        >
          <Label className="sr-only">推送场景</Label>
          <Select.Trigger aria-label="推送场景">
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {sceneOptions.map((option) => (
                <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Label>{option.label}</Label>
                    <Description>{option.description}</Description>
                  </div>
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <div className="flex min-w-0 flex-1 gap-2">
          <Input
            aria-label={scene === 'group' ? '群号' : 'QQ 号'}
            className="min-w-0 flex-1"
            disabled={disabled}
            inputMode="numeric"
            placeholder={PEER_PLACEHOLDER[scene]}
            value={peer}
            variant="secondary"
            onChange={(event) => {
              /** 群号与 QQ 号都是纯数字，直接过滤掉其他字符 */
              setPeer(event.target.value.replace(/\D/g, ''))
              setDraftError(null)
            }}
            onKeyDown={handleKeyDown}
          />
          <Button isDisabled={disabled} variant="secondary" onPress={addTarget}>
            <Plus className="size-4" aria-hidden="true" />
            <span>添加</span>
          </Button>
        </div>
      </div>

      <p className={`text-xs ${draftError ? 'text-danger' : 'text-default-500'}`}>
        {draftError || SCENE_HELP[scene]}
      </p>

      {value.length ? (
        <ul className="flex flex-col gap-2">
          {value.map((item) => (
            <li
              key={targetKey(item)}
              className="flex items-center gap-3 rounded-xl border border-default-200 bg-content1 px-3 py-2"
            >
              <span className="tag-chip shrink-0">{sceneLabel(item.scene)}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {item.peer}
                {item.name ? <span className="ml-2 text-xs text-default-500">{item.name}</span> : null}
              </span>
              <button
                aria-label={`移除${sceneLabel(item.scene)} ${item.peer}`}
                className="shrink-0 text-default-500 transition-colors hover:text-danger"
                disabled={disabled}
                type="button"
                onClick={() => onChange(value.filter((current) => targetKey(current) !== targetKey(item)))}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-default-500">还没有添加推送目标。</p>
      )}

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  )
}
