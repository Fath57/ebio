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

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

const otpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  otp: z.string().length(6),
})

export type AdminLoginCredentialsData = z.infer<typeof credentialsSchema>
export type AdminLoginOtpData = z.infer<typeof otpSchema>

interface AdminLoginFormProps {
  step: 'credentials' | 'otp'
  onSubmitCredentials: (data: AdminLoginCredentialsData) => void
  onSubmitOtp: (data: AdminLoginOtpData) => void
  isPending: boolean
  credentials?: AdminLoginCredentialsData
}

export const AdminLoginForm: React.FC<AdminLoginFormProps> = ({
  step,
  onSubmitCredentials,
  onSubmitOtp,
  isPending,
  credentials,
}) => {
  const { t } = useTranslation()

  const credentialsForm = useForm<AdminLoginCredentialsData>({
    resolver: zodResolver(credentialsSchema),
  })

  const otpForm = useForm<AdminLoginOtpData>({
    resolver: zodResolver(otpSchema),
    defaultValues: {
      email: credentials?.email ?? '',
      password: credentials?.password ?? '',
    },
  })

  if (step === 'credentials') {
    return (
      <Form {...credentialsForm}>
        <form className="mt-8 space-y-6" onSubmit={credentialsForm.handleSubmit(onSubmitCredentials)}>
          <FormField
            control={credentialsForm.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="email">{t('auth.adminLogin.email')}</FormLabel>
                <FormControl>
                  <Input
                    id="email"
                    {...field}
                    type="email"
                    autoComplete="email"
                    placeholder="admin@ebio.fr"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={credentialsForm.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel htmlFor="password">{t('auth.adminLogin.password')}</FormLabel>
                <FormControl>
                  <Input
                    id="password"
                    {...field}
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button className="w-full" type="submit" disabled={isPending}>
            {t('auth.adminLogin.continue')}
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
              <FormLabel htmlFor="otp">{t('auth.adminLogin.otpCode')}</FormLabel>
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
          {t('auth.adminLogin.verify')}
        </Button>
      </form>
    </Form>
  )
}
