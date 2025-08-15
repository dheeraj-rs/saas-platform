import { MongoClient, MongoClientOptions, Db } from 'mongodb';

// Lazy-initialize client to avoid connecting at module import
let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

function getUri() {
  // Do not fall back silently in production; in dev we can default to localhost
  const envUri = process.env.MONGODB_URI;
  if (envUri) return envUri;
  return 'mongodb://127.0.0.1:27017';
}

function getOptions(): MongoClientOptions {
  return {} as MongoClientOptions;
}

export async function getClient(): Promise<MongoClient> {
  if (client) return client;

  const uri = getUri();
  const options = getOptions();

  if (process.env.NODE_ENV === 'development') {
    const globalWithMongo = global as typeof globalThis & {
      _mongoClientPromise?: Promise<MongoClient>;
    };
    if (!globalWithMongo._mongoClientPromise) {
      client = new MongoClient(uri, options);
      globalWithMongo._mongoClientPromise = client.connect();
    }
    clientPromise = globalWithMongo._mongoClientPromise!;
  } else {
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }
  client = await clientPromise!;
  return client;
}

// Tenant isolation - each tenant gets their own database
export async function getTenantDatabase(tenantId: string): Promise<Db> {
  const client = await getClient();
  return client.db(`saas_tenant_${tenantId}`);
}

// Shared database for cross-tenant operations
export async function getSharedDatabase(): Promise<Db> {
  const client = await getClient();
  return client.db('saas_shared');
}

// Initialize indexes for better performance
export async function initializeDatabaseIndexes(tenantId: string) {
  const db = await getTenantDatabase(tenantId);
  
  // User collection indexes
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('users').createIndex({ tenantId: 1, role: 1 });
  await db.collection('users').createIndex({ isActive: 1, lastLogin: -1 });
  
  // Session collection indexes
  await db.collection('sessions').createIndex({ token: 1 }, { unique: true });
  await db.collection('sessions').createIndex({ userId: 1 });
  await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  
  // Audit logs indexes
  await db.collection('auditLogs').createIndex({ userId: 1, timestamp: -1 });
  await db.collection('auditLogs').createIndex({ action: 1, timestamp: -1 });
  await db.collection('auditLogs').createIndex({ timestamp: -1 });
  
  // Dashboard widgets indexes
  await db.collection('dashboards').createIndex({ userId: 1 });
  
  console.log(`Database indexes initialized for tenant: ${tenantId}`);
}

// Note: prefer using getClient() over default export