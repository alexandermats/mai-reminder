import { describe, it, expect, beforeEach } from 'vitest'
import { encryptionService } from '../../../src/services/encryptionService'

describe('EncryptionService', () => {
  beforeEach(async () => {
    await encryptionService.init()
  })

  it('generates a secure key', () => {
    const key = encryptionService.generateKey()
    expect(key).toBeTypeOf('string')
    expect(key.length).toBeGreaterThan(0)
  })

  it('generates a valid UUID user ID', () => {
    const userId = encryptionService.generateUserId()
    expect(userId).toBeTypeOf('string')
    expect(userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('encrypts and decrypts a payload successfully', () => {
    const key = encryptionService.generateKey()
    const payload = JSON.stringify({ id: '123', title: 'Test Reminder' })

    const encrypted = encryptionService.encrypt(payload, key)

    expect(encrypted.ciphertextBase64).toBeTypeOf('string')
    expect(encrypted.nonceBase64).toBeTypeOf('string')

    const decrypted = encryptionService.decrypt(encrypted, key)

    expect(decrypted).toBe(payload)
  })

  it('throws an error if decryption key is wrong', () => {
    const key1 = encryptionService.generateKey()
    const key2 = encryptionService.generateKey()
    const payload = 'Secret message'

    const encrypted = encryptionService.encrypt(payload, key1)

    expect(() => encryptionService.decrypt(encrypted, key2)).toThrow()
  })

  it('throws an error if ciphertext is tampered with', () => {
    const key = encryptionService.generateKey()
    const payload = 'Secret message'

    const encrypted = encryptionService.encrypt(payload, key)

    // Tamper with the ciphertext by changing the first character
    const tamperedCiphertext =
      (encrypted.ciphertextBase64.charAt(0) === 'A' ? 'B' : 'A') +
      encrypted.ciphertextBase64.slice(1)

    const tamperedEncrypted = {
      ...encrypted,
      ciphertextBase64: tamperedCiphertext,
    }

    expect(() => encryptionService.decrypt(tamperedEncrypted, key)).toThrow()
  })
})
