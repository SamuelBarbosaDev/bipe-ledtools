import Database from 'better-sqlite3'

// Cria o arquivo dev.db na raiz do projeto
const db = new Database('dev.db')

// Ativa as chaves estrangeiras e ganho de performance
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Criação das tabelas usando SQL puro (se não existirem)
db.exec(`
  CREATE TABLE IF NOT EXISTS "Order" (
    id INTEGER PRIMARY KEY,
    externalOrderId TEXT,
    deliveryPackageNr TEXT,
    status TEXT,
    dateConfirmed INTEGER
  );

  -- O índice essencial para a bipagem ultrarrápida
  CREATE INDEX IF NOT EXISTS idx_deliveryPackage_nr ON "Order"(deliveryPackageNr);

  CREATE TABLE IF NOT EXISTS Product (
    id TEXT PRIMARY KEY,
    orderId INTEGER,
    ean TEXT,
    sku TEXT,
    name TEXT,
    quantity INTEGER,
    FOREIGN KEY(orderId) REFERENCES "Order"(id) ON DELETE CASCADE
  );
`)

export { db }