import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

const mongoUri = process.env.MONGODB_URI;
const useMongo = Boolean(mongoUri);

const matches = (doc, filter) => Object.entries(filter).every(([key, value]) => doc[key] === value);

// A collection backed by MongoDB when MONGODB_URI is set, otherwise by memory
// (handy for running a single service locally without a database).
export function createCollection(name, seed = []) {
  const memory = seed.map((doc) => ({ ...doc }));
  const col = () => mongoose.connection.collection(name);
  const hidden = { projection: { _id: 0 } };

  return {
    async seed() {
      if (useMongo && seed.length && (await col().countDocuments()) === 0) {
        await col().insertMany(seed.map((doc) => ({ ...doc })));
      }
    },
    async list() {
      return useMongo ? col().find({}, hidden).toArray() : memory.map((doc) => ({ ...doc }));
    },
    async findOne(filter) {
      return useMongo ? col().findOne(filter, hidden) : memory.find((doc) => matches(doc, filter)) ?? null;
    },
    async insert(doc) {
      if (useMongo) {
        await col().insertOne({ ...doc });
      } else {
        memory.push({ ...doc });
      }
      return doc;
    },
    async update(filter, patch) {
      if (useMongo) {
        return col().findOneAndUpdate(filter, { $set: patch }, { returnDocument: 'after', ...hidden });
      }
      const doc = memory.find((item) => matches(item, filter));
      return doc ? Object.assign(doc, patch) : null;
    },
    async remove(filter) {
      if (useMongo) {
        await col().deleteOne(filter);
      } else {
        const index = memory.findIndex((doc) => matches(doc, filter));
        if (index >= 0) memory.splice(index, 1);
      }
    }
  };
}

async function connectWithRetry(dbName) {
  for (;;) {
    try {
      await mongoose.connect(mongoUri, { dbName, serverSelectionTimeoutMS: 5000 });
      console.log(`[${dbName}] connected to MongoDB`);
      return;
    } catch (error) {
      console.warn(`[${dbName}] MongoDB not reachable (${error.message}), retrying in 3s`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

// Calls another service. Returns `fallback` instead of throwing so one
// unavailable service never takes the caller down with it.
export async function callService(baseUrl, path, { method = 'GET', body, fallback = null, timeoutMs = 3000 } = {}) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(`call to ${baseUrl}${path} failed: ${error.message}`);
    return fallback;
  }
}

export async function startService({ name, port = 3000, collections = [], routes }) {
  const app = express();
  let ready = !useMongo;

  app.use(cors());
  app.use(express.json());
  app.use((req, _res, next) => {
    if (!req.path.startsWith('/healthz') && !req.path.startsWith('/readyz')) {
      console.log(`[${name}] ${req.method} ${req.originalUrl}`);
    }
    next();
  });

  // Liveness: process is up. Readiness: dependencies (MongoDB) are usable.
  app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: name }));
  app.get('/readyz', (_req, res) => {
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'starting', service: name });
  });

  routes(app);

  const server = app.listen(port, () => console.log(`[${name}] listening on port ${port}`));

  if (useMongo) {
    connectWithRetry(`suryarakshak_${name.replace(/-service$/, '')}`)
      .then(() => Promise.all(collections.map((collection) => collection.seed())))
      .then(() => {
        ready = true;
      })
      .catch((error) => console.error(`[${name}] startup failed:`, error));
  }

  const shutdown = () => {
    server.close(async () => {
      if (useMongo) await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return app;
}
