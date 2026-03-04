import sodium from 'libsodium-wrappers'

export interface EncryptionResult {
  ciphertextBase64: string
  nonceBase64: string
}

export class EncryptionService {
  private isReady = false

  async init(): Promise<void> {
    if (this.isReady) return
    await sodium.ready
    this.isReady = true
  }

  /**
   * Generates a new random 32-byte key for encryption
   * @returns Base64 encoded key
   */
  generateKey(): string {
    if (!this.isReady) throw new Error('EncryptionService not initialized')
    const key = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES)
    return sodium.to_base64(key, sodium.base64_variants.ORIGINAL)
  }

  /**
   * Encrypts a plaintext string using XChaCha20-Poly1305
   * @param plaintext The string to encrypt (e.g., JSON.stringify(payload))
   * @param keyBase64 The base64 encoded symmetric key
   */
  encrypt(plaintext: string, keyBase64: string): EncryptionResult {
    if (!this.isReady) throw new Error('EncryptionService not initialized')

    const key = sodium.from_base64(keyBase64, sodium.base64_variants.ORIGINAL)
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
    const plaintextUint8 = sodium.from_string(plaintext)

    const ciphertext = sodium.crypto_secretbox_easy(plaintextUint8, nonce, key)

    return {
      ciphertextBase64: sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL),
      nonceBase64: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
    }
  }

  /**
   * Decrypts a ciphertext back to plaintext
   * @param encryptedData The ciphertext and nonce
   * @param keyBase64 The base64 encoded symmetric key
   */
  decrypt(encryptedData: EncryptionResult, keyBase64: string): string {
    if (!this.isReady) throw new Error('EncryptionService not initialized')

    const key = sodium.from_base64(keyBase64, sodium.base64_variants.ORIGINAL)
    const nonce = sodium.from_base64(encryptedData.nonceBase64, sodium.base64_variants.ORIGINAL)
    const ciphertext = sodium.from_base64(
      encryptedData.ciphertextBase64,
      sodium.base64_variants.ORIGINAL
    )

    const plaintextUint8 = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key)

    return sodium.to_string(plaintextUint8)
  }

  /**
   * Generates a random secure UUID for identifying the user anonymously
   */
  generateUserId(): string {
    return crypto.randomUUID()
  }
}

export const encryptionService = new EncryptionService()
