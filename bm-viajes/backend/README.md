# BM Viajes — piloto de movilidad local

La aplicación pública está en `../index.html` y funciona como **demo**. La API de `worker.mjs` es una base de piloto en Cloudflare Workers + D1; **no está desplegada ni configurada por incluir el código en GitHub**.

## Qué ya está implementado en código

- PWA independiente con iconos, service worker y funcionamiento básico sin conexión (no descarga mapas).
- Mapa interactivo de OpenStreetMap (requiere Internet) y GPS voluntario del usuario. Elegir puntos no constituye una reserva.
- Demo local de pasajeros, conductores, tipos de vehículo, comisión del 10%, favoritos y compartir.
- API separada para solicitud/verificación de código de correo por Brevo, sesiones con tokens aleatorios, permisos de conductor con aprobación manual, creación/aceptación/estado de viajes, y posición reciente solo de conductor asignado.
- Control CORS, limitación de intentos, exclusión de conductores no verificados, ubicación caducable, solicitud atómica de aceptación, sin credenciales públicas. **Todo el servidor falla cerrado** hasta que `ENABLE_LIVE_RIDES` sea exactamente `true`.

## Configuración segura para un piloto controlado

1. Instalar Wrangler y crear una base D1 para BM Viajes.
2. Copiar `wrangler.toml.example` a `wrangler.toml`; colocar el identificador de la base; configurar `FRONTEND_ORIGIN` como origen HTTPS real del cliente y `MAIL_FROM` como correo remitente previamente verificado.
3. Ejecutar el esquema en D1: `npx wrangler d1 execute bm-viajes-db --remote --file=./schema.sql` desde esta carpeta.
4. Configurar secretos privados (nunca en GitHub): `npx wrangler secret put AUTH_SECRET` (32+ caracteres aleatorios) y `npx wrangler secret put BREVO_API_KEY`.
5. Desplegar la API: `npx wrangler deploy`. Validar `GET /api/health`, `GET /api/config`, CORS y la entrega real de OTP antes de probar con un usuario invitado.
6. Antes de habilitar viajes, comprobar requisitos locales, seguros, documentación, consentimiento GPS y respuesta a emergencias. Aprobar a cada conductor verificándolo fuera de esta app; el estado por defecto siempre es `pending` o `none`.
7. Solo para un piloto autorizado y después de superar pruebas de aceptación, cambiar `ENABLE_LIVE_RIDES` a `true`; la API todavía **no implementa cobros ni tarifa oficial**.

## Criterios de aceptación antes de operar con personas reales

- Dos celulares distintos: alta de pasajero y conductor, correo OTP real, aceptación única de solicitud concurrente y estados sincronizados.
- Un conductor sin revisar no puede listar, aceptar ni recibir ubicación detallada.
- Las posiciones GPS solo se comparten tras consentimiento del conductor durante un viaje asignado y caducan; el pasajero solo ve la de su conductor.
- Tarifas legales verificadas; estimaciones trazadas sobre vías, no distancia aérea; comprobantes y reembolsos si se habilitan pagos.
- Política de privacidad con retención, protección de datos y mecanismos de acceso/eliminación; registro de incidentes, accesibilidad, pruebas de carga, auditoría de seguridad y soporte.
- Para pagos reales: integrar Mercado Pago desde servidor, verificar firma de webhooks, idempotencia y conciliación. Jamás exponer el access token en el navegador ni simular un cobro como exitoso.

## Estado actual

El sitio es una **demo pública instalable**. La API y D1 son infraestructura de preparación, no un servicio ya activado. No usar como sistema de transporte hasta satisfacer todos los criterios.