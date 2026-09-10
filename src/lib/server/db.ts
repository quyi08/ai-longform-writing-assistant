import { Pool, type PoolClient } from "pg";

let pool: Pool | undefined;

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function withDatabaseClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}
