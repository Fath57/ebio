import type { AdminLoginCredentialsData, AdminLoginOtpData } from '../forms/admin-login-form'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { authClient } from '@/lib/auth-client'
import { AuthPageHeader } from '../components/auth-page-header'
import { AdminLoginForm } from '../forms/admin-login-form'

export default function AdminLoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials')
  const [credentials, setCredentials] = useState<AdminLoginCredentialsData>()

  const { mutate: loginMutate, isPending: isLoginPending } = useMutation({
    mutationFn: async (data: AdminLoginCredentialsData) => {
      const response = await authClient.signIn.email({
        email: data.email,
        password: data.password,
      })

      if (response.error) {
        throw new Error(response.error.code)
      }

      return response.data
    },
    onSuccess: (_data, variables) => {
      setCredentials(variables)
      setStep('otp')
      toast.success(t('auth.adminLogin.otpSent'))
    },
  })

  const { mutate: verifyOtpMutate, isPending: isVerifying, error } = useMutation({
    mutationFn: async (data: AdminLoginOtpData) => {
      const response = await authClient.twoFactor.verifyTotp({
        code: data.otp,
      })

      if (response.error) {
        throw new Error(response.error.code)
      }

      toast.success(t('auth.adminLogin.loggedInSuccess'))
      return response.data
    },
    onSuccess: () => {
      navigate('/admin')
    },
  })

  const handleSubmitCredentials = (data: AdminLoginCredentialsData) => {
    loginMutate(data)
  }

  const handleSubmitOtp = (data: AdminLoginOtpData) => {
    verifyOtpMutate(data)
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <AuthPageHeader
          title={t('auth.adminLogin.title')}
          description={t('auth.adminLogin.description')}
        />
        <AdminLoginForm
          step={step}
          onSubmitCredentials={handleSubmitCredentials}
          onSubmitOtp={handleSubmitOtp}
          isPending={isLoginPending || isVerifying}
          credentials={credentials}
        />
        <div className="h-10">
          {error
            ? (
                <div className="text-sm font-medium text-red-500">
                  {t('auth.adminLogin.error')}
                </div>
              )
            : null}
        </div>
      </div>
    </div>
  )
}
