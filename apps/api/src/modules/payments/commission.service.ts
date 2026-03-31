import { Injectable } from '@nestjs/common'

interface CommissionResult {
  rate: number
  commissionAmount: number
  supplierAmount: number
}

const CATEGORY_RATES: Record<string, number> = {
  alimentaire: 0.04,
  intrants: 0.03,
  semences: 0.025,
}

const DEFAULT_RATE = 0.04

@Injectable()
export class CommissionService {
  getRate(categorySlug: string): number {
    return CATEGORY_RATES[categorySlug] ?? DEFAULT_RATE
  }

  calculate(amount: number, categorySlug: string): CommissionResult {
    const rate = this.getRate(categorySlug)
    const commissionAmount = Math.round(amount * rate * 100) / 100
    const supplierAmount = Math.round((amount - commissionAmount) * 100) / 100

    return { rate, commissionAmount, supplierAmount }
  }
}
