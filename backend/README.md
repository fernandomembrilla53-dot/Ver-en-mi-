# Ver en Mí — Tienda de Yami
Estado: servidor preparado en GitHub y base D1 ya creada en Cloudflare. El frontend está enlazado al Worker existente, pero la sección de tienda permanece invisible para clientes mientras no haya productos publicados con foto, nombre y precio verificados. El backend todavía requiere despliegue y pruebas reales.

## Arquitectura sin pago ni R2
- Cloudflare Worker: `ver-en-mi-tienda`
- Base Cloudflare D1: `ver-en-mi-tienda` UUID `fddadd94-6c4b-4142-9b65-833ce068cc84`
- Binding `DB` y texto `APP_ORIGIN=https://fernandomembrilla53-dot.github.io`
- **No R2**: fotos optimizadas en D1 en tabla `product_photos`. Respetan encuadre; no mosaicos de capturas. El panel conserva originales menores de 600 KB y redimensiona fotos grandes sin cortar, hasta 1600 px con calidad alta.
- El Worker inicializa tablas automáticamente al primer request, por si la consola SQL de Cloudflare no permite ejecutar DDL.
- `worker-single.js` es el archivo para editor web del dashboard; `worker.js` y `admin-page.js` son fuentes.
- Se necesitan secretos de Worker `ADMIN_PASSWORD` (12+ caracteres) y `SESSION_SECRET` (32+); nunca en GitHub.
- Correo opcional: `BREVO_API_KEY`, `ORDER_NOTIFY_EMAIL`, `NOTIFY_SENDER_EMAIL`. Sin estos secretos los pedidos se ven en el panel, pero NO hay alerta por correo con la app cerrada.
- Frontend vinculado a `https://ver-en-mi-tienda.fernandomembrilla53.workers.dev`, con `store.css`, `store-config.js` y `store.js` añadidos a la PWA y precaché actualizado. Si la API está caída o no hay productos completos, **no se muestra ninguna tarjeta** ni precios antiguos.
- Los nombres y precios los establece Yami desde `/admin`; no crear productos con precios viejos ni inventados.
- Categorías principales Ensaladas, Ensaladas de frutas, Verduras picadas y preparadas, Comidas elaboradas (arrollados de acelga, zanahoria y papa por separado) y Jugos. Congelados no se ofrece.
- Carrito calculado en el servidor, pedido rechazado si cambia precio desde que el cliente hizo carrito.

## Checklist de verificación antes de vender
1. `GET /admin` devuelve página, `GET /api/menu` JSON con productos vacío o solo publicados.
2. Administrador inicia sesión sin revelar secretos.
3. Yami crea borrador, sube foto individual y no se corta, escribe nombre, precio, disponibilidad y publica.
4. Otro celular ve precio; Yami lo edita y se actualiza.
5. Cliente pide y aparece en Pedidos, notificación enviada si existe Brevo en producción.
6. Probar rechazo de productos agotados/precio viejo.
7. Revisar política de privacidad y consentimiento al recabar teléfono y dirección.
