import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { useNavigate, useLocation } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { authApi, type Organization } from '@/services/authApi'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isLoading, error, user, initialized } = useAuthStore()
  const { t } = useTranslation('auth')
  useEffect(() => {
    if (initialized && user && location.pathname === '/login') {
      navigate('/', { replace: true })
    }
  }, [initialized, user, location.pathname, navigate])

  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [organizationId, setOrganizationId] = useState<string>('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<'invalidCredentials' | 'selectCompanyRequired' | null>(null)

  useEffect(() => {
    authApi.getOrganizations()
      .then((data) => setOrganizations(data.organizations))
      .catch(() => setOrganizations([]))
  }, [])

  const hasSelectedCompany = organizationId !== ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (!organizationId) {
      setLocalError('selectCompanyRequired')
      return
    }
    const ok = await login(Number(organizationId), username, password)
    if (ok) {
      navigate('/')
    } else {
      setLocalError('invalidCredentials')
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="organization" className="text-sm font-medium">{t('company')}</label>
              <Select value={organizationId} onValueChange={setOrganizationId}>
                <SelectTrigger id="organization">
                  <SelectValue placeholder={t('selectCompany')} />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">{t('username')}</label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={!hasSelectedCompany}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">{t('password')}</label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!hasSelectedCompany}
              />
            </div>
            {(localError || error) && (
              <p className="text-sm text-red-600">{localError ? t(localError) : error}</p>
            )}
            <Button
              type="submit"
              disabled={isLoading || !hasSelectedCompany || !username || !password}
              className="w-full"
            >
              {isLoading ? t('signingIn') : t('submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
