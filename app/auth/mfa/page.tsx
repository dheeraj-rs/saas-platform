'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Shield, 
  Smartphone, 
  Key, 
  QrCode,
  Download,
  Copy,
  CheckCircle,
  AlertCircle,
  Fingerprint,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import QRCode from 'qrcode';

export default function MfaSetupPage() {
  const [step, setStep] = useState('method'); // method, setup, verify, backup, complete
  const [selectedMethod, setSelectedMethod] = useState<'totp' | 'webauthn' | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [webauthnSupported, setWebauthnSupported] = useState(false);
  const [webauthnStatus, setWebauthnStatus] = useState<'waiting' | 'success' | 'error'>('waiting');

  const router = useRouter();
  const searchParams = useSearchParams();
  const isRequired = searchParams.get('required') === 'true';

  useEffect(() => {
    // Check WebAuthn support
    setWebauthnSupported(
      typeof window !== 'undefined' && 
      'credentials' in navigator &&
      'create' in navigator.credentials
    );
  }, []);

  const handleMethodSelect = async (method: 'totp' | 'webauthn') => {
    setSelectedMethod(method);
    setError('');
    
    if (method === 'totp') {
      await setupTotp();
    } else {
      setStep('setup');
    }
  };

  const setupTotp = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/mfa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'totp' }),
      });

      const data = await response.json();
      
      if (data.success) {
        setTotpSecret(data.secret);
        const qrUrl = await QRCode.toDataURL(data.qrCodeUrl);
        setQrCodeUrl(qrUrl);
        setStep('setup');
      } else {
        setError(data.error || 'Failed to setup TOTP');
      }
    } catch (error) {
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const setupWebauthn = async () => {
    if (!webauthnSupported) {
      setError('WebAuthn is not supported in this browser');
      return;
    }

    setLoading(true);
    setWebauthnStatus('waiting');

    try {
      // Get challenge from server
      const response = await fetch('/api/auth/mfa/webauthn/register', {
        method: 'POST',
      });

      const { publicKey } = await response.json();
      
      // Create credential
      const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;
      
      // Send credential to server
      const verifyResponse = await fetch('/api/auth/mfa/webauthn/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: {
            id: credential.id,
            rawId: Array.from(new Uint8Array(credential.rawId)),
            response: {
              attestationObject: Array.from(new Uint8Array((credential.response as AuthenticatorAttestationResponse).attestationObject)),
              clientDataJSON: Array.from(new Uint8Array(credential.response.clientDataJSON)),
            },
            type: credential.type,
          },
        }),
      });

      const verifyData = await verifyResponse.json();
      
      if (verifyData.success) {
        setWebauthnStatus('success');
        await generateBackupCodes();
      } else {
        setWebauthnStatus('error');
        setError(verifyData.error || 'WebAuthn setup failed');
      }
    } catch (error: any) {
      setWebauthnStatus('error');
      if (error.name === 'NotAllowedError') {
        setError('WebAuthn setup was cancelled');
      } else {
        setError('WebAuthn setup failed: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyTotp = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'totp',
          code: verificationCode,
          secret: totpSecret,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        await generateBackupCodes();
      } else {
        setError(data.error || 'Invalid verification code');
      }
    } catch (error) {
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const generateBackupCodes = async () => {
    try {
      const response = await fetch('/api/auth/mfa/backup-codes', {
        method: 'POST',
      });

      const data = await response.json();
      
      if (data.success) {
        setBackupCodes(data.codes);
        setStep('backup');
      } else {
        setError(data.error || 'Failed to generate backup codes');
      }
    } catch (error) {
      setError('Network error occurred');
    }
  };

  const copyBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    navigator.clipboard.writeText(codesText).then(() => {
      toast.success('Backup codes copied to clipboard');
    });
  };

  const downloadBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mfa-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Backup codes downloaded');
  };

  const completeMfaSetup = () => {
    setStep('complete');
    setTimeout(() => {
      router.push('/dashboard');
    }, 2000);
  };

  return (
    <div className="auth-container">
      <Card className="auth-card w-full max-w-2xl">
        <CardHeader className="auth-header">
          <Shield className="auth-logo" />
          <CardTitle className="auth-title">Multi-Factor Authentication</CardTitle>
          <CardDescription className="auth-subtitle">
            {isRequired 
              ? 'MFA is required for your account. Please set it up to continue.'
              : 'Add an extra layer of security to your account'
            }
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'method' && (
            <div className="mfa-container">
              <h3 className="text-lg font-semibold mb-4">Choose your MFA method</h3>
              
              <div className="space-y-4">
                <div 
                  className="mfa-method" 
                  onClick={() => handleMethodSelect('totp')}
                >
                  <div className="mfa-method-header">
                    <Smartphone className="mfa-method-icon" />
                    <span className="mfa-method-title">Authenticator App (Recommended)</span>
                    <ChevronRight className="w-5 h-5 ml-auto" />
                  </div>
                  <p className="mfa-method-description">
                    Use apps like Google Authenticator, Authy, or 1Password to generate codes.
                  </p>
                </div>

                <div 
                  className={`mfa-method ${!webauthnSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => webauthnSupported && handleMethodSelect('webauthn')}
                >
                  <div className="mfa-method-header">
                    <Fingerprint className="mfa-method-icon" />
                    <span className="mfa-method-title">Biometric Authentication</span>
                    <ChevronRight className="w-5 h-5 ml-auto" />
                  </div>
                  <p className="mfa-method-description">
                    Use your device's fingerprint, face recognition, or security key.
                    {!webauthnSupported && ' (Not supported in this browser)'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 'setup' && selectedMethod === 'totp' && (
            <div className="mfa-container">
              <h3 className="text-lg font-semibold mb-4">Setup Authenticator App</h3>
              
              <div className="space-y-6">
                <div className="text-center">
                  <p className="mb-4">Scan this QR code with your authenticator app:</p>
                  
                  {qrCodeUrl && (
                    <div className="qr-code-container">
                      <img src={qrCodeUrl} alt="QR Code" className="mx-auto" />
                    </div>
                  )}
                  
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                      Can't scan? Enter manually
                    </summary>
                    <div className="mt-2 p-3 bg-muted rounded font-mono text-sm break-all">
                      {totpSecret}
                    </div>
                  </details>
                </div>

                <div>
                  <p className="mb-2">Enter the 6-digit code from your app to verify:</p>
                  <Input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="verification-input text-center text-2xl"
                    maxLength={6}
                  />
                </div>

                <Button
                  onClick={verifyTotp}
                  disabled={loading || verificationCode.length !== 6}
                  className="w-full"
                >
                  {loading && <div className="loading-spinner mr-2" />}
                  Verify and Continue
                </Button>
              </div>
            </div>
          )}

          {step === 'setup' && selectedMethod === 'webauthn' && (
            <div className="webauthn-container">
              <Fingerprint className="webauthn-icon" />
              
              <h3 className="text-lg font-semibold mb-4">Setup Biometric Authentication</h3>
              
              <p className="webauthn-prompt">
                Click the button below and follow your device's prompts to register your biometric or security key.
              </p>

              <div className={`webauthn-status ${webauthnStatus}`}>
                {webauthnStatus === 'waiting' && (
                  <>
                    <Fingerprint className="w-6 h-6 mr-2" />
                    Ready to register your authenticator
                  </>
                )}
                {webauthnStatus === 'success' && (
                  <>
                    <CheckCircle className="w-6 h-6 mr-2" />
                    Successfully registered!
                  </>
                )}
                {webauthnStatus === 'error' && (
                  <>
                    <AlertCircle className="w-6 h-6 mr-2" />
                    Registration failed
                  </>
                )}
              </div>

              {webauthnStatus === 'waiting' && (
                <Button
                  onClick={setupWebauthn}
                  disabled={loading}
                  className="w-full"
                >
                  {loading && <div className="loading-spinner mr-2" />}
                  Register Authenticator
                </Button>
              )}
            </div>
          )}

          {step === 'backup' && (
            <div className="mfa-container">
              <h3 className="text-lg font-semibold mb-4">Save Your Backup Codes</h3>
              
              <Alert className="mb-4">
                <Key className="h-4 w-4" />
                <AlertDescription>
                  Store these backup codes in a safe place. You can use them to access your account if you lose your authenticator.
                </AlertDescription>
              </Alert>

              <div className="backup-codes-container">
                <div className="backup-codes-grid">
                  {backupCodes.map((code, index) => (
                    <div key={index} className="backup-code">
                      {code}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    onClick={copyBackupCodes}
                    className="flex-1"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Codes
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={downloadBackupCodes}
                    className="flex-1"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>

              <Button
                onClick={completeMfaSetup}
                className="w-full mt-4"
              >
                I've Saved My Backup Codes
              </Button>
            </div>
          )}

          {step === 'complete' && (
            <div className="text-center space-y-4">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <h3 className="text-xl font-semibold">MFA Setup Complete!</h3>
              <p className="text-muted-foreground">
                Your account is now protected with multi-factor authentication.
                Redirecting to dashboard...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}