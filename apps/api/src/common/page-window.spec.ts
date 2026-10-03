import { describe, expect, it } from 'vitest'
import { readPageWindow } from './page-window'

describe('readPageWindow', () => {
  it('returns null without a limit, so older apps keep the whole list', () => {
    expect(readPageWindow()).toBeNull()
    expect(readPageWindow('2')).toBeNull()
    expect(readPageWindow('1', 'abc')).toBeNull()
    expect(readPageWindow('1', '0')).toBeNull()
  })

  it('turns a page and a limit into an offset', () => {
    expect(readPageWindow('1', '20')).toEqual({ limit: 20, offset: 0 })
    expect(readPageWindow('3', '20')).toEqual({ limit: 20, offset: 40 })
  })

  it('starts at the first page when the page is missing or invalid', () => {
    expect(readPageWindow(undefined, '10')).toEqual({ limit: 10, offset: 0 })
    expect(readPageWindow('-4', '10')).toEqual({ limit: 10, offset: 0 })
  })

  it('caps the page size', () => {
    expect(readPageWindow('2', '1000')).toEqual({ limit: 50, offset: 50 })
  })
})
