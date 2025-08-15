# Enterprise Multi-Tenant SaaS Platform

A production-ready enterprise SaaS platform built with Next.js 14, TypeScript, and MongoDB.

## Quick Start

### 1. Environment Setup

Copy the `.env.local` file and update the following variables:

```bash
# Required: MongoDB Connection
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/enterprise-saas

# Required: Authentication Secrets
JWT_SECRET=your-super-secure-jwt-secret-key-at-least-32-characters-long
NEXTAUTH_SECRET=your-nextauth-secret-key-for-session-encryption

# Optional: Google OAuth (for social login)
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret

# Optional: Encryption Key (for field-level encryption)
ENCRYPTION_KEY=your-32-character-encryption-key-12345
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

### 4. Access the Application

- **Main App**: http://localhost:3000
- **Login Page**: http://localhost:3000/auth/login
- **Dashboard**: http://localhost:3000/dashboard (after login)

## Demo Login

For development, you can create a demo account by attempting to login with any credentials:

- **Email**: admin@demo.com
- **Password**: password123
- **Tenant ID**: demo

The system will automatically create a demo user account on first login attempt.

## Features

### Authentication & Security

- JWT-based authentication with 15-minute expiry
- Multi-factor authentication (TOTP + WebAuthn)
- Password breach detection
- Rate limiting (5 requests/min for auth)
- Account lockout protection

### Multi-Tenancy

- Isolated MongoDB databases per tenant
- Role-based access control (Super Admin, Admin, User)
- Tenant-specific configurations and settings

### Dashboard & UI

- Drag-and-drop customizable dashboards
- Real-time updates via WebSockets
- Dark/light theme support
- Responsive design with mobile support
- Internationalization (20+ languages)

### Monitoring & Analytics

- Real-time security monitoring
- Comprehensive audit logging
- Performance metrics and health checks
- Threat detection and alerting

## Architecture

```
/app
├── /api                 # API routes
│   ├── /auth           # Authentication endpoints
│   ├── /dashboard      # Dashboard data
│   └── /health         # Health checks
├── /auth               # Authentication pages
├── /dashboard          # Main dashboard
└── layout.tsx          # Root layout

/lib
├── auth.ts             # Authentication utilities
├── db.ts               # Database connections
├── encryption.ts       # Security utilities
└── rateLimiter.ts      # Rate limiting

/styles
├── globals.css         # Global styles
└── /components         # Component-specific styles
```

## Deployment

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Docker

```bash
docker build -t enterprise-saas .
docker run -p 3000:3000 enterprise-saas
```

### Kubernetes

```bash
kubectl apply -f kubernetes/
```

## Security Features

- **Authentication**: JWT with refresh tokens, MFA support
- **Authorization**: Role-based access control (RBAC)
- **Data Protection**: Field-level encryption, secure password hashing
- **Network Security**: Rate limiting, CORS protection, CSP headers
- **Monitoring**: Audit logging, security alerts, threat detection

## Compliance

- **GDPR**: Automated data retention and deletion
- **CCPA**: Privacy controls and data export
- **SOC 2**: Audit logging and access controls
- **WCAG 2.1 AA**: Accessibility compliance

## Support

- **Documentation**: `/docs`
- **Health Check**: `/api/health`
- **Security Issues**: security@example.com

## License

Enterprise License - See LICENSE file for details.
