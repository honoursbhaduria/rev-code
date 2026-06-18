import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly encryptionKey: Buffer;

  constructor() {
    const keyHex = process.env.ENCRYPTION_KEY;
    if (keyHex && keyHex.length >= 32) {
      // Use provided key (must be 32 bytes / 64 hex chars for AES-256)
      this.encryptionKey = Buffer.from(keyHex.substring(0, 64), 'hex');
      if (this.encryptionKey.length < 32) {
        // If hex decode gives less than 32 bytes, derive from string
        this.encryptionKey = crypto
          .createHash('sha256')
          .update(keyHex)
          .digest();
      }
    } else {
      // Generate a deterministic key from JWT_SECRET as fallback
      const fallbackSecret =
        process.env.JWT_SECRET || 'recode-default-encryption-key';
      this.encryptionKey = crypto
        .createHash('sha256')
        .update(fallbackSecret)
        .digest();
      this.logger.warn(
        'ENCRYPTION_KEY not set in .env — using derived key from JWT_SECRET. ' +
          'Set ENCRYPTION_KEY to a 64-character hex string for production.',
      );
    }
  }

  /**
   * Encrypt a plaintext string using AES-256-GCM
   * Returns: base64-encoded string containing IV + encrypted data + auth tag
   */
  encrypt(plaintext: string): string {
    if (!plaintext) return plaintext;

    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);

      let encrypted = cipher.update(plaintext, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      const authTag = cipher.getAuthTag();

      // Concatenate: IV (16) + AuthTag (16) + EncryptedData
      const result = Buffer.concat([iv, authTag, encrypted]);
      return `enc:${result.toString('base64')}`;
    } catch (error) {
      this.logger.error(`Encryption failed: ${error.message}`);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt a previously encrypted string
   */
  decrypt(encryptedText: string): string {
    if (!encryptedText) return encryptedText;

    // If not encrypted (no prefix), return as-is (backward compat)
    if (!encryptedText.startsWith('enc:')) {
      return encryptedText;
    }

    try {
      const data = Buffer.from(encryptedText.slice(4), 'base64');

      const iv = data.subarray(0, IV_LENGTH);
      const authTag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
      const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);

      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        this.encryptionKey,
        iv,
      );
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error) {
      this.logger.error(`Decryption failed: ${error.message}`);
      throw new Error('Failed to decrypt data — key may have changed');
    }
  }

  /**
   * Check if a string is already encrypted
   */
  isEncrypted(text: string): boolean {
    return text?.startsWith('enc:') ?? false;
  }

  /**
   * Hash a string (one-way, for comparison)
   */
  hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }
}
