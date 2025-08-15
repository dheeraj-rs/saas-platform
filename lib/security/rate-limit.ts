import { redis } from '../database/connection';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: any) => string;
  message?: string;
}

export class RateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private keyGenerator: (req: any) => string;
  private message: string;

  constructor(options: RateLimitOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.keyGenerator = options.keyGenerator || ((req) => req.ip || 'unknown');
    this.message = options.message || 'Too many requests, please try again later.';
  }

  async isAllowed(req: any): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const key = `rate_limit:${this.keyGenerator(req)}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    try {
      // Remove old entries and count current requests
      await redis.zremrangebyscore(key, '-inf', windowStart);
      const currentRequests = await redis.zcard(key);
      
      if (currentRequests >= this.maxRequests) {
        const oldestRequest = await redis.zrange(key, 0, 0, 'WITHSCORES');
        const resetTime = oldestRequest.length > 0 ? parseInt(oldestRequest[1]) + this.windowMs : now + this.windowMs;
        
        return {
          allowed: false,
          remaining: 0,
          resetTime: Math.ceil(resetTime / 1000)
        };
      }

      // Add current request
      await redis.zadd(key, now, `${now}-${Math.random()}`);
      await redis.expire(key, Math.ceil(this.windowMs / 1000));

      return {
        allowed: true,
        remaining: this.maxRequests - currentRequests - 1,
        resetTime: Math.ceil((now + this.windowMs) / 1000)
      };
    } catch (error) {
      console.error('Rate limiting error:', error);
      // Fail open - allow the request if Redis is down
      return {
        allowed: true,
        remaining: this.maxRequests,
        resetTime: Math.ceil((now + this.windowMs) / 1000)
      };
    }
  }
}

// Pre-configured rate limiters
export const authRateLimit = new RateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'),
  maxRequests: parseInt(process.env.RATE_LIMIT_REQUESTS || '5'),
  keyGenerator: (req) => `auth:${req.ip}`,
  message: 'Too many authentication attempts, please try again later.'
});

export const apiRateLimit = new RateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 100,
  keyGenerator: (req) => `api:${req.ip}:${req.user?.id || 'anonymous'}`,
  message: 'API rate limit exceeded.'
});