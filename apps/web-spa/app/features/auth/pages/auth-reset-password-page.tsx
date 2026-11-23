import type { AuthResetPasswordFormData } from '../forms/auth-reset-password-form'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { authClient } from '@/lib/auth-client'
import { AuthPageHeader } from '../components/auth-page-header'
import { AuthResetPasswordForm } from '../forms/auth-reset-password-form'

/** Better Auth error codes this page knows how to explain. */
const KNOWN_ERROR_CODES = ['INVALID_TOKEN', 'PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG'] as const

class ResetPasswordError extends Error {
  constructor(readonly code: string | undefined, message: string) {
    super(message)
  }
}

export default function AuthResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const resetPasswordMutation = useMutation({
    mutationFn: async (data: AuthResetPasswordFormData) => {
      const response = await authClient.resetPassword({
        newPassword: data.password,
        token,
      })

      if (response.error) {
        throw new ResetPasswordError(response.error.code, response.error.message || t('auth.resetPassword.failed'))
      }

      return response.data
    },
    onSuccess: () => {
      toast.success(t('auth.resetPassword.success'))
      navigate('/login')
    },
  })

  const handleResetPassword = (data: AuthResetPasswordFormData) => {
    resetPasswordMutation.mutate(data)
  }

  const error = resetPasswordMutation.error
  const errorCode = error instanceof ResetPasswordError ? error.code : undefined
  const errorMessage = errorCode && (KNOWN_ERROR_CODES as readonly string[]).includes(errorCode)
    ? t(`auth.resetPassword.errors.${errorCode}`)
    : t('auth.resetPassword.failed')

  return (
    <div className="space-y-6">
      <AuthPageHeader title={t('auth.resetPassword.title')} description={t('auth.resetPassword.description')} />
      {token
        ? (
            <AuthResetPasswordForm
              onSubmit={handleResetPassword}
              isPending={resetPasswordMutation.isPending}
            />
          )
        : null}
      {!token || error
        ? (
            <div role="alert" className="text-sm font-medium text-red-500">
              {token ? errorMessage : t('auth.resetPassword.errors.INVALID_TOKEN')}
            </div>
          )
        : null}
      <div className="text-sm text-center">
        <Link to="/login" className="font-medium transition-colors">
          {t('auth.resetPassword.backToLogin')}
        </Link>
      </div>
    </div>
  )
}
