# Tienda de Yami · Ver en Mí
Estado: **código preparado en GitHub, no desplegado en Cloudflare**.
No reemplaza ni elimina la sección de recomendaciones automáticas de comidas de la app. No se ofrecen productos sin nombre, foto y precio vigente publicados por Yami.

## Yami podrá administrar
- Cargar foto original desde su celular (JPG/PNG/WebP hasta 12 MB), sin recortes forzados.
- Crear productos como borrador sin nombre ni precio; completarlos cuando desee.
- Poner y modificar **ella misma** nombre, ingredientes, categoría y precio en pesos.
- Activar/desactivar productos disponibles sin eliminarlos.
- Destacar lo que prepara cada día en el menú del día, junto a las recomendaciones existentes.
- Consultar pedidos y cambiar sus estados.
- Categorías: Ensaladas, Ensaladas de frutas, Verduras picadas, Verduras preparadas, Comidas elaboradas, Jugos y Otros. No hay congelados.
- Los arrollados de acelga, zanahoria y papa se crearán como productos separados cuando Yami les ponga nombre y precio, sin fijar valores históricos.

## Preparación de Cloudflare
Estos pasos requieren una cuenta Cloudflare autenticada; GitHub Pages no puede alojar por sí mismo el servidor de precios/pedidos.
1. Crear base D1 llamada `ver-en-mi-tienda`.
2. Ejecutar `backend/schema.sql` en D1. Si se actualiza una base ya existente, aplicar migración `backend/migrations/001_fotos.sql` para añadir `photo_key`; **no correr la migración si la base se creó recién con schema.sql**.
3. Crear bucket R2 privado `ver-en-mi-fotos` (sin habilitar acceso público directo).
4. Copiar `backend/wrangler.toml.example` a `backend/wrangler.toml` y completar el ID real de D1.
5. Crear secretos de Worker: `ADMIN_PASSWORD` de 12+ caracteres; `SESSION_SECRET` aleatorio de 32+ caracteres. No guardarlos en este repositorio ni enviarlos por chat.
6. Desplegar `backend/worker.js` con Wrangler como `main` y bindings `DB` y `FOTOS`; probar `/admin`, login y POST de fotos.
7. Abrir `https://nombre-del-worker.workers.dev/admin` en el celular de Yami.
8. Configurar `window.VEM_STORE_API` en el archivo `store-config.js` con la URL pública del Worker y activar `store.js` y `store.css` en `index.html` **solo después** de verificar el flujo completo.
9. Probar desde otro celular: agregar foto y nombre/precio; marcar Publicar; ver en Comidas; actualizar precio; registrar pedido; confirmar en panel. Comprobar también que precio/cantidad cambien con la red y que un pedido con precio antiguo se rechace.
10. Para avisos por correo configurar opcionalmente `BREVO_API_KEY`, `ORDER_NOTIFY_EMAIL`, `NOTIFY_SENDER_EMAIL` como secretos. Sin estos avisos, los pedidos se consultan desde el panel.

## Seguridad
- Contraseña en secreto Cloudflare, cookie httpOnly/SameSite Strict.
- Validación de contenido, tamaño y tipo de imagen; archivos alojados en R2 privado, accesibles mediante Worker.
- La API pública muestra únicamente productos publicados y disponibles; rechaza pedidos con precios ya cambiados.
- Los clientes no pueden modificar precios ni pedidos ajenos.
- No se usan fotos antiguas recortadas. Se suben desde el teléfono las fotos individuales originales.
- No se añadió cobro en línea. Los pedidos necesitan confirmación de Yami.

## Pendientes verificables
El código requiere aprovisionar y conectar D1, R2 y secretos en Cloudflare. Las fotografías originales de la conversación **no están subidas a R2**, porque esa cuenta aún no está autenticada para la integración. No presentar la tienda como operativa hasta probar el circuito completo.
