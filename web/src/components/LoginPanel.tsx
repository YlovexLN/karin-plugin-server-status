import { Button, Card, Description, Input, Label, Spinner, TextField } from '@heroui/react'
import { Eye, EyeOff, KeyRound, LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { loginWithAuthKey } from '../api/client'

interface LoginPanelProps {
  onLogin: () => void
}

/** Karin HTTP 鉴权登录面板 */
export const LoginPanel = ({ onLogin }: LoginPanelProps) => {
  const [authKey, setAuthKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = authKey.trim()
    if (!value) {
      setError('请输入 Karin HTTP 鉴权密钥')
      return
    }

    try {
      setLoading(true)
      setError('')
      await loginWithAuthKey(value)
      onLogin()
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <Card.Header className="gap-4 p-6">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <Card.Title>Karin 鉴权</Card.Title>
            <Card.Description>使用 Karin HTTP 鉴权密钥登录后管理服务器状态监控配置。</Card.Description>
          </div>
        </Card.Header>
        <Card.Content className="p-6">
          <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <TextField fullWidth isInvalid={Boolean(error)} value={authKey} onChange={setAuthKey}>
              <Label>HTTP 鉴权密钥</Label>
              <div className="flex items-center gap-2">
                <Input
                  autoComplete="current-password"
                  className="min-w-0 flex-1"
                  placeholder="请输入 Karin 的 HTTP_AUTH_KEY"
                  type={showKey ? 'text' : 'password'}
                  variant="secondary"
                />
                <Button
                  isIconOnly
                  aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                  type="button"
                  variant="tertiary"
                  onPress={() => setShowKey((visible) => !visible)}
                >
                  {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
              <Description>{error || '登录后会复用 Karin 主 Web 的登录凭据。'}</Description>
            </TextField>

            <Button fullWidth isDisabled={loading} type="submit" variant="primary">
              {loading ? <Spinner color="current" size="sm" /> : <LogIn className="size-4" />}
              <span>{loading ? '登录中…' : '登录'}</span>
            </Button>
          </form>
        </Card.Content>
      </Card>
    </div>
  )
}
