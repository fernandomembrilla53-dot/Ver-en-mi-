# Tienda Ver en Mí — estado e instalación

El catálogo está preparado para que Yami ingrese cada foto como un borrador sin precios antiguos. **Las fotografías son un mosaico de las capturas originales; la calidad es limitada.** No hay productos congelados, y ensalada de frutas es una categoría independiente.

## Frontend
- La PWA pública funciona en GitHub Pages (rama main): https://fernandomembrilla53-dot.github.io/Ver-en-mi-/
- Sección Comidas: recomendaciones existentes + fotos de Yami; hasta que se conecte la API, mostrar fotos sin precio ni pedidos.
- Cuando exista Worker, configurar su URL en `store-config.js` (no poner contraseñas ni claves).
- El cliente ve exclusivamente productos con nombre, precio positivo, disponibles y publicados.

## Servidor y panel de Yami
- Cloudflare Workers + D1, código: `backend/worker.js`; panel: `backend/admin-page.js`.
- Crear una base D1 llamada `ver-en-mi-tienda`, aplicar `backend/schema.sql`.
- Copiar `backend/wrangler.toml.example` a `backend/wrangler.toml` y completar el ID real de D1.
- Configurar **secretos en Cloudflare, nunca en GitHub**: `ADMIN_PASSWORD` (mínimo 12 caracteres), `SESSION_SECRET` (32+ caracteres aleatorios).
- Opcionales para notificación por correo: `BREVO_API_KEY`, `ORDER_NOTIFY_EMAIL`, `NOTIFY_SENDER_EMAIL`. Sin ellos los pedidos se registran en el panel pero **no se avisa por correo**.
- Desplegar Worker por una cuenta Cloudflare autorizada. Verificar CORS para https://fernandomembrilla53-dot.github.io.
- Publicar `store-config.js` con URL del Worker, sin barra final.
- Abrir `https://WORKER.workers.dev/admin` y entrar con contraseña privada.
- Pulsar **Importar mis 16 fotos** una vez: quedan borradores sin nombre/precio. Yami agrega nombres, ingredientes, precio actual, disponibilidad y menú del día; recién después publica cada producto.
- Probar desde un celular diferente: cargar catálogo, agregar carrito, enviar pedido de prueba y confirmar que aparece en panel; validar que avisos funcionan antes de anunciar recepción automática.

## Límites claros
- El backend aún requiere aprovisionar D1 y credenciales, no está desplegado.
- Fotos adicionales y mejor calidad requieren imágenes originales individuales de Yami o un almacenamiento de imágenes; el mosaico actual parte de capturas.
- No se implementó carga de fotos nuevas desde panel: se pueden preparar nuevos productos sin foto y ampliar luego con R2.
- La notificación del navegador funciona solo con el panel abierto. Para push con la app cerrada habría que configurar Web Push por separado.
- No usar como pagos online: pedidos sin cobro integrado.
- Ningún precio se tomó de anuncios viejos.