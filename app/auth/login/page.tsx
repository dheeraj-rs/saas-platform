'use client';

import React, { useState, useEffect } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Eye, EyeOff, Chrome, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface PasswordRequirement {
  met: boolean;
  text: string;
}

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    tenantId: '',
    mfaCode: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requireMfa, setRequireMfa] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    requirements: [] as PasswordRequirement[],
  });

  const router = useRouter();

  useEffect(() => {
    // Check if user is already logged in
    getSession().then((session) => {
      if (session) {
        router.push('/dashboard');
      }
    });
  }, [router]);

  useEffect(() => {
    if (!isLogin && formData.password) {
      calculatePasswordStrength(formData.password);
    }
  }, [formData.password, isLogin]);

  const calculatePasswordStrength = (password: string) => {
    const requirements: PasswordRequirement[] = [
      { met: password.length >= 8, text: 'At least 8 characters' },
      { met: /[a-z]/.test(password), text: 'One lowercase letter' },
      { met: /[A-Z]/.test(password), text: 'One uppercase letter' },
      { met: /[0-9]/.test(password), text: 'One number' },
      { met: /[^A-Za-z0-9]/.test(password), text: 'One special character' },
    ];

    const score = requirements.filter(req => req.met).length;
    setPasswordStrength({ score, requirements });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        // Handle login
        if (requireMfa && !formData.mfaCode) {
          setError('MFA code is required');
          setLoading(false);
          return;
        }

        const result = await signIn('credentials', {
          email: formData.email,
          password: formData.password,
          tenantId: formData.tenantId,
          mfaCode: formData.mfaCode,
          redirect: false,
        });

        if (result?.error) {
          if (result.error.includes('MFA')) {
            setRequireMfa(true);
            setError('Please enter your MFA code');
          } else {
            // Create demo user if not exists (for development)
            if (process.env.NODE_ENV === 'development') {
              const hashedPassword = await bcrypt.hash(credentials.password, 12);
              const newUser = {
                email: credentials.email,
                password: hashedPassword,
                name: credentials.email.split('@')[0],
                tenantId: credentials.tenantId,
                role: 'admin',
                permissions: ['dashboard:read', 'dashboard:update', 'user:read'],
                isActive: true,
                mfaEnabled: false,
                loginAttempts: 0,
                passwordLastChanged: new Date(),
                preferences: {
                  theme: 'system',
                  language: 'en',
                  timezone: 'UTC',
                  dateFormat: 'YYYY-MM-DD',
                  notifications: {
                    email: true,
                    push: true,
                    sms: false,
                    security: true,
                    marketing: false,
                  },
                  dashboard: {
                    layout: 'grid',
                    widgetsPerRow: 3,
                    showWelcome: true,
                    compactMode: false,
                  },
                },
                createdAt: new Date(),
                updatedAt: new Date(),
                consentGiven: true,
                consentDate: new Date(),
              };

              await db.collection('users').insertOne(newUser);
              return {
                id: newUser._id?.toString() || 'demo',
                email: newUser.email,
                name: newUser.name,
                tenantId: newUser.tenantId,
                role: newUser.role,
              };
            }
            setError(result.error);
          }
        } else if (result?.ok) {
          toast.success('Login successful!');
          router.push('/dashboard');
        }
      } else {
        // Handle registration
        if (formData.password !== formData.confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        if (passwordStrength.score < 4) {
          setError('Password does not meet security requirements');
          setLoading(false);
          return;
        }

        const response = await fetch('/api/auth', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            name: formData.name,
            tenantId: formData.tenantId,
          }),
        });

        const data = await response.json();

        if (data.success) {
          toast.success('Registration successful! Please login.');
          setIsLogin(true);
          setFormData(prev => ({ ...prev, password: '', confirmPassword: '', name: '' }));
        } else {
          setError(data.error || 'Registration failed');
        }
      }
    } catch (error) {
      console.error('Auth error:', error);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl: '/dashboard' });
  };

  return (
    <div className="auth-container">
      <Card className="auth-card">
        <CardHeader className="auth-header">
          <Shield className="auth-logo" />
          <CardTitle className="auth-title">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </CardTitle>
          <CardDescription className="auth-subtitle">
            {isLogin
              ? 'Sign in to your secure enterprise account'
              : 'Join the secure enterprise platform'
            }
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="auth-form">
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!isLogin && (
              <div className="auth-form-group">
                <Label htmlFor="name" className="auth-label">Full Name</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleInputChange}
                  required={!isLogin}
                  className="auth-input"
                  placeholder="Enter your full name"
                />
              </div>
            )}

            <div className="auth-form-group">
              <Label htmlFor="email" className="auth-label">Email Address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                className="auth-input"
                placeholder="Enter your email"
                autoComplete="email"
              />
            </div>

            <div className="auth-form-group">
              <Label htmlFor="tenantId" className="auth-label">Organization ID</Label>
              <Input
                id="tenantId"
                name="tenantId"
                type="text"
                value={formData.tenantId}
                onChange={handleInputChange}
                required
                className="auth-input"
                placeholder="Enter your organization ID"
              />
            </div>

            <div className="auth-form-group">
              <Label htmlFor="password" className="auth-label">Password</Label>
              <div className="auth-password-input">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                  className="auth-input pr-10"
                  placeholder="Enter your password"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="auth-password-toggle"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {!isLogin && formData.password && (
                <div className="password-strength">
                  <div className="password-strength-bar">
                    <div
                      className={`password-strength-fill ${passwordStrength.score <= 1 ? 'weak' :
                          passwordStrength.score <= 2 ? 'fair' :
                            passwordStrength.score <= 3 ? 'good' : 'strong'
                        }`}
                    />
                  </div>
                  <div className="password-requirements">
                    {passwordStrength.requirements.map((req, index) => (
                      <div key={index} className={`password-requirement ${req.met ? 'met' : 'unmet'}`}>
                        {req.met ? (
                          <CheckCircle2 className="requirement-icon" />
                        ) : (
                          <AlertCircle className="requirement-icon" />
                        )}
                        <span>{req.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!isLogin && (
              <div className="auth-form-group">
                <Label htmlFor="confirmPassword" className="auth-label">Confirm Password</Label>
                <div className="auth-password-input">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    required={!isLogin}
                    className="auth-input pr-10"
                    placeholder="Confirm your password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="auth-password-toggle"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {requireMfa && (
              <div className="auth-form-group">
                <Label htmlFor="mfaCode" className="auth-label">
                  <Lock className="w-4 h-4 inline mr-2" />
                  MFA Code
                </Label>
                <Input
                  id="mfaCode"
                  name="mfaCode"
                  type="text"
                  value={formData.mfaCode}
                  onChange={handleInputChange}
                  required={requireMfa}
                  className="auth-input verification-input"
                  placeholder="000000"
                  maxLength={6}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="auth-button"
              disabled={loading}
            >
              {loading && <div className="loading-spinner mr-2" />}
              {isLogin ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <div className="auth-divider">
            <span>Or continue with</span>
          </div>

          <div className="auth-social">
            <Button
              type="button"
              variant="outline"
              className="auth-social-button google"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <Chrome className="auth-social-icon" />
              Google
            </Button>
          </div>

          <div className="auth-links">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setRequireMfa(false);
                setFormData(prev => ({ ...prev, mfaCode: '', password: '', confirmPassword: '' }));
              }}
              className="auth-link"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>

            {isLogin && (
              <Link href="/auth/forgot-password" className="auth-link">
                Forgot your password?
              </Link>
            )}
          </div>

          <div className="auth-footer">
            <p>
              By continuing, you agree to our{' '}
              <Link href="/terms" className="text-primary">Terms of Service</Link>
              {' '}and{' '}
              <Link href="/privacy" className="text-primary">Privacy Policy</Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}