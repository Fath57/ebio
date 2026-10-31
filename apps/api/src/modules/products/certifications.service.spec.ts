import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { CertificationsService } from './certifications.service'

function serviceWith(active: string[]) {
  const em = {
    find: vi.fn().mockImplementation(async (_entity: unknown, where: { code: { $in: string[] } }) =>
      where.code.$in.filter(code => active.includes(code)).map(code => ({ code }))),
  }
  return { service: new CertificationsService(em as never), em }
}

describe('certificationsService.assertUsable', () => {
  it('accepts active labels', async () => {
    const { service } = serviceWith(['organic', 'ecocert'])
    await expect(service.assertUsable(['organic', 'ecocert'])).resolves.toBeUndefined()
  })

  it('refuses a label unknown or retired, naming it', async () => {
    const { service } = serviceWith(['organic'])
    await expect(service.assertUsable(['organic', 'halal'])).rejects.toThrow(BadRequestException)
    await expect(service.assertUsable(['organic', 'halal'])).rejects.toThrow('halal')
  })

  it('keeps accepting a label the product already wears, even retired', async () => {
    const { service, em } = serviceWith([])
    await expect(service.assertUsable(['local'], ['local'])).resolves.toBeUndefined()
    expect(em.find).not.toHaveBeenCalled()
  })
})
