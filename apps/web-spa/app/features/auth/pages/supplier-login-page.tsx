import type { SupplierLoginOtpData, SupplierLoginPhoneData } from '../forms/supplier-login-form'
import { toast } from '@boilerstone/ui/components/primitives/sonner'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { authClient } from '@/lib/auth-client'
import { AuthPageHeader } from '../components/auth-page-header'
import { SupplierLoginForm } from '../forms/supplier-login-form'

export default function SupplierLoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')

  const { mutate: sendOtpMutate, isPending: isSendingOtp } = useMutation({
    mutationFn: async (data: SupplierLoginPhoneData) => {
      const response = await authClient.phoneNumber.sendOtp({
        phoneNumber: data.phone,
      })

      if (response.error) {
        throw new Error(response.error.code)
      }

      return response.data
    },
    onSuccess: (_data, variables) => {
      setPhone(variables.phone)
      setStep('otp')
      toast.success(t('auth.supplierLogin.otpSent'))
    },
  })

  const { mutate: verifyOtpMutate, isPending: isVerifying, error } = useMutation({
    mutationFn: async (data: SupplierLoginOtpData) => {
      const response = await authClient.phoneNumber.verify({
        phoneNumber: data.phone,
        code: data.otp,
      })

      if (response.error) {
        throw new Error(response.error.code)
      }

      toast.success(t('auth.supplierLogin.loggedInSuccess'))
      return response.data
    },
    onSuccess: () => {
      navigate('/catalogue')
    },
  })

  const handleSubmitPhone = (data: SupplierLoginPhoneData) => {
    sendOtpMutate(data)
  }

  const handleSubmitOtp = (data: SupplierLoginOtpData) => {
    verifyOtpMutate(data)
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <AuthPageHeader
          title={t('auth.supplierLogin.title')}
          description={t('auth.supplierLogin.description')}
        />
        <SupplierLoginForm
          step={step}
          onSubmitPhone={handleSubmitPhone}
          onSubmitOtp={handleSubmitOtp}
          isPending={isSendingOtp || isVerifying}
          phone={phone}
        />
        <div className="h-10">
          {error
            ? (
                <div className="text-sm font-medium text-red-500">
                  {t('auth.supplierLogin.error')}
                </div>
              )
            : null}
        </div>
      </div>
    </div>
  )
}
