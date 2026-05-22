import { describe, it, expect } from 'vitest'
import { parseMillicores, parseMiB, pct } from './resourceUtils'

describe('parseMillicores', () => {
  it('parses millicores', () => expect(parseMillicores('100m')).toBe(100))
  it('parses cores', () => expect(parseMillicores('1.5')).toBe(1500))
  it('returns null for dash', () => expect(parseMillicores('—')).toBeNull())
  it('returns null for empty', () => expect(parseMillicores('')).toBeNull())
})

describe('parseMiB', () => {
  it('parses Mi', () => expect(parseMiB('128Mi')).toBe(128))
  it('parses Gi', () => expect(parseMiB('1Gi')).toBe(1024))
  it('parses Ki', () => expect(parseMiB('1024Ki')).toBe(1))
  it('returns null for dash', () => expect(parseMiB('—')).toBeNull())
})

describe('pct', () => {
  it('computes percentage', () => expect(pct('100m', '200m', parseMillicores)).toBe('50%'))
  it('returns dash when usage is dash', () => expect(pct('—', '200m', parseMillicores)).toBe('—'))
  it('returns dash when total is zero', () => expect(pct('0m', '0m', parseMillicores)).toBe('—'))
  it('returns dash when total is dash', () => expect(pct('100m', '—', parseMillicores)).toBe('—'))
})
