import { Button } from '@boilerstone/ui/components/primitives/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@boilerstone/ui/components/primitives/form'
import { Input } from '@boilerstone/ui/components/primitives/input'
import { zodResolver } from '@hookform/resolvers/zod'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

const phoneStepSchema = z.object({
  phone: z.string().min(10),
})

const otpStepSchema = z.object({
  phone: z.string().min(10),
  otp: z.string().length(6),
})

export type SupplierLoginPhoneData = z.infer<typeof phoneStepSchema>
export type SupplierLoginOtpData = z.infer<typeof otpStepSchema>

interface SupplierLoginFormProps {
  step: 'phone' | 'otp'
  onSubmitPhone: (data: SupplierLoginPhoneData) => void
  onSubmitOtp: (data: SupplierLoginOtpData) => void
  isPending: boolean
  phone?: string
}

export const SupplierLoginForm: React.FC<SupplierLoginFormProps> = ({
  step,
  onSubmitPhone,
  onSubmitOtp,
  isPending,
  phone,
}) => {
  const { t } = useTranslation()

  const phoneForm = useForm<SupplierLoginPhoneData>({
    resolver: zodResolver(phoneStepSchema),
  })

  const otpForm = useForm<SupplierLoginOtpData>({
    resolver: zodResolver(otpStepSchema),
    defaultValues: {
      phone: phone ?? '',
    },
  })

  if (step === 'phone') {
    return (
      <Form {...phoneForm}>
        <form className="mt-8 space-y-6" onSubmit={phoneForm.handleSubmit(onSubmitPhone)}>
          <FormField
            control={phoneForm.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="phone">{t('auth.supplierLogin.phone')}</FormLabel>
                <FormControl>
                  <Input
                    id="phone"
                    {...field}
                    type="tel"
                    autoComplete="tel"
                    placeholder="+33 6 12 34 56 78"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button className="w-full" type="submit" disabled={isPending}>
            {t('auth.supplierLogin.sendOtp')}
          </Button>
        </form>
      </Form>
    )
  }

  return (
    <Form {...otpForm}>
      <form className="mt-8 space-y-6" onSubmit={otpForm.handleSubmit(onSubmitOtp)}>
        <FormField
          control={otpForm.control}
          name="otp"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="otp">{t('auth.supplierLogin.otpCode')}</FormLabel>
              <FormControl>
                <Input
                  id="otp"
                  {...field}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="000000"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className="w-full" type="submit" disabled={isPending}>
          {t('auth.supplierLogin.verify')}
        </Button>
      </form>
    </Form>
  )
}
