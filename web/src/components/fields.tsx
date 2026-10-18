import {
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  Select,
  Switch,
  TextField
} from '@heroui/react'
import { X } from 'lucide-react'
import { useState, type KeyboardEvent, type ReactNode } from 'react'

export interface SelectOption {
  label: string
  value: string
  description?: string
}

interface BaseFieldProps {
  label: string
  help?: ReactNode
  disabled?: boolean
}

interface SwitchFieldProps extends BaseFieldProps {
  value: boolean
  onChange: (value: boolean) => void
}

export const SwitchField = ({ label, help, value, onChange, disabled }: SwitchFieldProps) => (
  <Switch isDisabled={disabled} isSelected={value} onChange={onChange}>
    <Switch.Content>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      <span className="font-semibold">{label}</span>
    </Switch.Content>
    {help ? <Description>{help}</Description> : null}
  </Switch>
)

interface TextFieldProps extends BaseFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'password'
  error?: string
}

export const TextFieldInput = ({
  label,
  help,
  value,
  onChange,
  placeholder,
  type = 'text',
  error,
  disabled
}: TextFieldProps) => (
  <TextField
    fullWidth
    isDisabled={disabled}
    isInvalid={Boolean(error)}
    value={value}
    onChange={onChange}
  >
    <Label className="font-semibold">{label}</Label>
    <Input variant="secondary" placeholder={placeholder || label} type={type} />
    {error ? <FieldError>{error}</FieldError> : help ? <Description>{help}</Description> : null}
  </TextField>
)

interface NumberFieldProps extends BaseFieldProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  fallback?: number
  error?: string
}

export const NumberField = ({
  label,
  help,
  value,
  onChange,
  min,
  max,
  step = 1,
  fallback = 0,
  error,
  disabled
}: NumberFieldProps) => (
  <TextField
    fullWidth
    isDisabled={disabled}
    isInvalid={Boolean(error)}
    value={String(value)}
    onChange={(nextValue) => {
      const parsed = Number(nextValue)
      onChange(Number.isFinite(parsed) ? parsed : fallback)
    }}
  >
    <Label className="font-semibold">{label}</Label>
    <Input variant="secondary" type="number" min={min} max={max} step={step} />
    {error ? <FieldError>{error}</FieldError> : help ? <Description>{help}</Description> : null}
  </TextField>
)

interface SelectFieldProps extends BaseFieldProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
}

export const SelectField = ({ label, help, value, onChange, options, disabled }: SelectFieldProps) => (
  <Select
    fullWidth
    isDisabled={disabled}
    selectedKey={value}
    variant="secondary"
    onSelectionChange={(key) => {
      if (key !== null) onChange(String(key))
    }}
  >
    <Label className="font-semibold">{label}</Label>
    <Select.Trigger>
      <Select.Value />
      <Select.Indicator />
    </Select.Trigger>
    {help ? <Description>{help}</Description> : null}
    <Select.Popover>
      <ListBox>
        {options.map((option) => (
          <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
            <div className="flex min-w-0 flex-col gap-0.5">
              <Label>{option.label}</Label>
              {option.description ? <Description>{option.description}</Description> : null}
            </div>
            <ListBox.ItemIndicator />
          </ListBox.Item>
        ))}
      </ListBox>
    </Select.Popover>
  </Select>
)

interface TagFieldProps extends BaseFieldProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  error?: string
}

/** 标签输入：回车 / 逗号添加，Backspace 删除最后一个 */
export const TagField = ({ label, help, value, onChange, placeholder, error, disabled }: TagFieldProps) => {
  const [draft, setDraft] = useState('')

  const addDraft = () => {
    const next = draft.trim()
    if (!next) return
    if (!value.includes(next)) onChange([...value, next])
    setDraft('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
      event.preventDefault()
      addDraft()
      return
    }
    if (event.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label className="font-semibold">{label}</Label>
      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-default-200 bg-content1 px-3 py-2">
        {value.map((item) => (
          <span key={item} className="tag-chip">
            <span className="max-w-56 truncate">{item}</span>
            <button
              type="button"
              aria-label={`移除 ${item}`}
              disabled={disabled}
              onClick={() => onChange(value.filter((current) => current !== item))}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          aria-label={label}
          className="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-default-400"
          disabled={disabled}
          placeholder={value.length ? '继续添加…' : placeholder || '输入后按回车'}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addDraft}
        />
      </div>
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : help ? (
        <p className="text-xs text-default-500">{help}</p>
      ) : null}
    </div>
  )
}

/** 只读的小标签，用于状态卡片 */
export const MiniTag = ({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'danger' | 'success' }) => {
  const toneClass =
    tone === 'danger'
      ? 'bg-danger/10 text-danger border-danger/20'
      : tone === 'success'
        ? 'bg-success/10 text-success border-success/20'
        : 'bg-content2 text-default-600 border-default-200'

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${toneClass}`}>
      {children}
    </span>
  )
}
