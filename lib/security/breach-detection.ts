import crypto from 'crypto';

export async function checkPasswordBreach(password: string): Promise<boolean> {
  try {
    // Hash the password with SHA-1
    const sha1Hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1Hash.substring(0, 5);
    const suffix = sha1Hash.substring(5);

    // Query Have I Been Pwned API
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'User-Agent': 'Enterprise-SaaS-Platform',
        ...(process.env.PWNED_API_KEY && {
          'hibp-api-key': process.env.PWNED_API_KEY
        })
      }
    });

    if (!response.ok) {
      console.warn('Failed to check password breach status');
      return false; // Fail open - don't block if service is down
    }

    const data = await response.text();
    return data.includes(suffix);
  } catch (error) {
    console.error('Password breach check failed:', error);
    return false; // Fail open
  }
}

export function generateSecurePassword(length: number = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  let password = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, charset.length);
    password += charset[randomIndex];
  }
  
  return password;
}

export function calculatePasswordStrength(password: string): {
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  // Length check
  if (password.length >= 8) score += 1;
  else feedback.push('Use at least 8 characters');

  if (password.length >= 12) score += 1;

  // Complexity checks
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Include lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Include uppercase letters');

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push('Include numbers');

  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else feedback.push('Include special characters');

  // Pattern checks
  if (!/(.)\1{2,}/.test(password)) score += 1;
  else feedback.push('Avoid repeating characters');

  if (!/^(.*[a-zA-Z]){3}/.test(password) && !/^(.*[0-9]){3}/.test(password)) score += 1;
  else feedback.push('Avoid common patterns');

  return { score, feedback };
}