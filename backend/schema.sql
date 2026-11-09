-- Configurar una base D1 privada antes de publicar la tienda.
CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT '',
 category TEXT NOT NULL DEFAULT 'Por clasificar',
 price_ars INTEGER,
 photo_index INTEGER UNIQUE,
 photo_url TEXT,
 photo_key TEXT,
 active INTEGER NOT NULL DEFAULT 0,
 available INTEGER NOT NULL DEFAULT 1,
 featured INTEGER NOT NULL DEFAULT 0,
 menu_date TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS products_active ON products(active,available,category);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 phone TEXT NOT NULL,
 delivery TEXT NOT NULL,
 address TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '',
 total_ars INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pendiente',
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_id TEXT NOT NULL REFERENCES orders(id),
 product_id TEXT NOT NULL,
 product_name TEXT NOT NULL,
 quantity INTEGER NOT NULL,
 unit_price_ars INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS request_limits (
 identity TEXT NOT NULL,
 at_time INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS request_limits_lookup ON request_limits(identity,at_time);

-- Fotos individuales optimizadas para web, guardadas de forma privada en D1
CREATE TABLE IF NOT EXISTS product_photos (
 product_id TEXT PRIMARY KEY,
 content_type TEXT NOT NULL,
 image_base64 TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
