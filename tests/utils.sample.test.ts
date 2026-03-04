import { describe, it, expect } from 'vitest'
import { greet } from '../src/utils/sample'

describe('Sample Utils', () => {
  it('should greet with the provided name', () => {
    const result = greet('World')
    expect(result).toBe('Hello, World!')
  })
})
