import { MongoClient, MongoClientOptions } from 'mongodb';
import Redis from 'ioredis';

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}

const uri = process.env.MONGODB_URI;
const options: MongoClientOptions = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

// Redis connection
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export default clientPromise;

export async function getDatabase(tenantId: string) {
  const client = await clientPromise;
  return client.db(`tenant_${tenantId}`);
}

export async function getTenantDatabase(tenantId: string) {
  const client = await clientPromise;
  return client.db(`tenant_${tenantId}`);
}