import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Shield, Users, BarChart3, Globe, Lock, Activity } from 'lucide-react';

export default function HomePage() {
  const features = [
    {
      icon: Shield,
      title: 'Enterprise Security',
      description:
        'Multi-factor authentication, biometric login, and advanced threat detection.',
    },
    {
      icon: Users,
      title: 'Multi-Tenant Architecture',
      description:
        'Isolated databases per tenant with role-based access control.',
    },
    {
      icon: BarChart3,
      title: 'Real-time Analytics',
      description:
        'Comprehensive dashboards with drag-and-drop widgets and live updates.',
    },
    {
      icon: Globe,
      title: 'Global Scale',
      description:
        '20+ languages support with RTL text direction and CDN optimization.',
    },
    {
      icon: Lock,
      title: 'GDPR Compliant',
      description:
        'Automated data retention and secure deletion for privacy compliance.',
    },
    {
      icon: Activity,
      title: 'Live Monitoring',
      description:
        'Real-time security alerts with geolocation tracking and SIEM integration.',
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-container">
          <div className="hero-content">
            <div className="hero-text">
              <h1 className="hero-title">
                Enterprise-Grade
                <span className="hero-gradient">Multi-Tenant SaaS</span>
              </h1>
              <p className="hero-description">
                Secure, scalable, and compliant platform with advanced security
                features, multi-factor authentication, and real-time threat
                detection.
              </p>
              <div className="hero-actions">
                <Link href="/auth/login">
                  <Button size="lg" className="hero-button-primary">
                    Get Started
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button
                    variant="outline"
                    size="lg"
                    className="hero-button-secondary"
                  >
                    View Dashboard
                  </Button>
                </Link>
              </div>
            </div>
            <div className="hero-visual">
              <div className="security-badge">
                <Shield className="security-icon" />
                <span>Enterprise Security</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="features-container">
          <div className="section-header">
            <h2 className="section-title">Enterprise Features</h2>
            <p className="section-description">
              Built for enterprise security, scalability, and compliance
              requirements.
            </p>
          </div>
          <div className="features-grid">
            {features.map((feature, index) => (
              <Card key={index} className="feature-card">
                <CardHeader className="feature-header">
                  <feature.icon className="feature-icon" />
                  <CardTitle className="feature-title">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="feature-description">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security Stats Section */}
      <section className="stats-section">
        <div className="stats-container">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-number">99.9%</div>
              <div className="stat-label">Uptime SLA</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">256-bit</div>
              <div className="stat-label">AES Encryption</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">20+</div>
              <div className="stat-label">Languages</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">GDPR</div>
              <div className="stat-label">Compliant</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-container">
          <div className="cta-content">
            <h3 className="cta-title">Ready to Get Started?</h3>
            <p className="cta-description">
              Join thousands of enterprises using our secure platform.
            </p>
            <Link href="/auth/login">
              <Button size="lg" className="cta-button">
                Start Your Free Trial
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-container">
          <div className="footer-content">
            <p className="footer-text">
              © 2024 Enterprise SaaS Platform. All rights reserved.
            </p>
            <div className="footer-links">
              <a href="/privacy" className="footer-link">
                Privacy Policy
              </a>
              <a href="/terms" className="footer-link">
                Terms of Service
              </a>
              <a href="/security" className="footer-link">
                Security
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
