import { NextRequest, NextResponse } from 'next/server';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: NextRequest) => string;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

// Simple in-memory rate limiter for development
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export class RateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private keyGenerator: (req: NextRequest) => string;
  private message: string;
  private skipSuccessfulRequests: boolean;
  private skipFailedRequests: boolean;

  constructor(options: RateLimitOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.keyGenerator = options.keyGenerator || this.defaultKeyGenerator;
    this.message = options.message || 'Too many requests, please try again later.';
    this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
    this.skipFailedRequests = options.skipFailedRequests || false;
  }

  private defaultKeyGenerator(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : req.ip || 'unknown';
    return `rate_limit:${ip}`;
  }

  async check(req: NextRequest): Promise<{
    success: boolean;
    remaining: number;
    resetTime: number;
    response?: NextResponse;
  }> {
    const key = this.keyGenerator(req);
    const now = Date.now();
    const windowStart = now - this.windowMs;

    try {
      // Clean old entries
      for (const [storeKey, data] of rateLimitStore.entries()) {
        if (data.resetTime < now) {
          rateLimitStore.delete(storeKey);
        }
      }
      
      const current = rateLimitStore.get(key);
      const requestCount = current && current.resetTime > now ? current.count : 0;

      if (requestCount >= this.maxRequests) {
        // Rate limit exceeded
        const resetTime = Math.ceil((now + this.windowMs) / 1000);
        
        return {
          success: false,
          remaining: 0,
          resetTime,
          response: NextResponse.json(
            { error: this.message, retryAfter: Math.ceil(this.windowMs / 1000) },
            { 
              status: 429,
              headers: {
                'X-RateLimit-Limit': this.maxRequests.toString(),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': resetTime.toString(),
                'Retry-After': Math.ceil(this.windowMs / 1000).toString(),
              }
            }
          )
        };
      }

      // Update request count
      rateLimitStore.set(key, {
        count: requestCount + 1,
        resetTime: current && current.resetTime > now ? current.resetTime : now + this.windowMs
      });

      return {
        success: true,
        remaining: this.maxRequests - requestCount - 1,
        resetTime: Math.ceil((now + this.windowMs) / 1000),
      };

    } catch (error) {
      console.error('Rate limiting error:', error);
      // Fail open - allow the request if Redis is down
      return {
        success: true,
        remaining: this.maxRequests,
        resetTime: Math.ceil((now + this.windowMs) / 1000),
      };
    }
  }
}

// Pre-configured rate limiters for different endpoints
export const authRateLimit = new RateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'), // 1 minute
  maxRequests: parseInt(process.env.RATE_LIMIT_REQUESTS || '5'), // 5 requests per minute
  keyGenerator: (req) => {
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : req.ip || 'unknown';
    return `auth_limit:${ip}`;
  },
  message: 'Too many authentication attempts. Please try again later.',
});

export const apiRateLimit = new RateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  keyGenerator: (req) => {
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : req.ip || 'unknown';
    const userId = req.headers.get('x-user-id') || 'anonymous';
    return `api_limit:${ip}:${userId}`;
  },
  message: 'API rate limit exceeded. Please slow down your requests.',
});

export const adminRateLimit = new RateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 30, // 30 requests per minute for admin operations
  keyGenerator: (req) => {
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : req.ip || 'unknown';
    const userId = req.headers.get('x-user-id') || 'anonymous';
    return `admin_limit:${ip}:${userId}`;
  },
  message: 'Admin API rate limit exceeded.',
});

// Middleware function to apply rate limiting
export async function withRateLimit(
  rateLimiter: RateLimiter,
  req: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const result = await rateLimiter.check(req);
  
  if (!result.success && result.response) {
    return result.response;
  }
  
  const response = await handler();
  
  // Add rate limit headers to successful responses
  response.headers.set('X-RateLimit-Limit', rateLimiter.maxRequests.toString());
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  response.headers.set('X-RateLimit-Reset', result.resetTime.toString());
  
  return response;
}

// Honeypot rate limiter - very restrictive for suspicious endpoints
export const honeypotRateLimit = new RateLimiter({
  windowMs: 3600000, // 1 hour
  maxRequests: 1, // Only 1 request per hour
  keyGenerator: (req) => {
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : req.ip || 'unknown';
    return `honeypot_limit:${ip}`;
  },
  message: 'Access denied. Suspicious activity detected.',
});

// Geographic rate limiting based on country
export const geoRateLimit = new RateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 10, // Reduced limit for certain countries
  keyGenerator: (req) => {
    const country = req.headers.get('cf-ipcountry') || 'unknown';
    const forwarded = req.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : req.ip || 'unknown';
    return `geo_limit:${country}:${ip}`;
  },
  message: 'Geographic rate limit exceeded.',
});