-- Solo para bases D1 creadas ANTES del campo photo_key.
-- No aplicar si la base se creó con el schema.sql actualizado.
ALTER TABLE products ADD COLUMN photo_key TEXT;
