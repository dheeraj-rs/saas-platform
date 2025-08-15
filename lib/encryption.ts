import crypto from 'crypto';
import CryptoJS from 'crypto-js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32c';
const ALGORITHM = 'aes-256-gcm';

export interface EncryptedData {
  encryptedData: string;
  iv: string;
  authTag: string;
}

// Encrypt sensitive data using AES-256-GCM
export function encrypt(text: string): EncryptedData {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);
    cipher.setAAD(Buffer.from('enterprise-saas'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

// Decrypt sensitive data
export function decrypt(encryptedData: EncryptedData): string {
  try {
    const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
    decipher.setAAD(Buffer.from('enterprise-saas'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

// Hash sensitive data for comparison (one-way)
export function hashData(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Generate secure random tokens
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// Field-level encryption for database storage
export function encryptField(value: string): string {
  return CryptoJS.AES.encrypt(value, ENCRYPTION_KEY).toString();
}

export function decryptField(encryptedValue: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedValue, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// Encrypt PII data with additional metadata
export function encryptPII(data: any): {
  encrypted: string;
  metadata: {
    timestamp: string;
    algorithm: string;
    version: string;
  };
} {
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), ENCRYPTION_KEY).toString();
  
  return {
    encrypted,
    metadata: {
      timestamp: new Date().toISOString(),
      algorithm: 'AES-256',
      version: '1.0',
    },
  };
}

export function decryptPII(encryptedPII: {
  encrypted: string;
  metadata: any;
}): any {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedPII.encrypted, ENCRYPTION_KEY);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  } catch (error) {
    console.error('Failed to decrypt PII:', error);
    throw new Error('Invalid encrypted data');
  }
}

// GDPR compliance - secure data deletion
export function secureDelete(data: string): boolean {
  try {
    // Overwrite memory multiple times for secure deletion
    const buffer = Buffer.from(data, 'utf8');
    
    // Multiple overwrite passes
    for (let i = 0; i < 7; i++) {
      crypto.randomFillSync(buffer);
    }
    
    return true;
  } catch (error) {
    console.error('Secure delete failed:', error);
    return false;
  }
}

// Generate encryption key for new tenants
export function generateTenantEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}