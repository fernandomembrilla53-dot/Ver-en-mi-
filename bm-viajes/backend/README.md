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

## Prueba integral local, sin servicios externos

Desde la raíz del repositorio, con **Node.js 22.13 o superior** (incluye `node:sqlite`):

```sh
node --test bm-viajes/tests/backend-journey.test.mjs
```

No requiere `npm install`, Wrangler, Cloudflare, Brevo, claves, `.env` ni conexión a Internet. Cada caso crea una base SQLite **en memoria**, aplica `schema.sql` y la destruye al terminar. Las peticiones se entregan directamente a `worker.fetch` mediante objetos Request/Response; no se abre un puerto ni se usa una URL de producción. El correo se captura en un buzón ficticio y cualquier otra llamada a `fetch` hace fallar la prueba, aunque el backend capture su error.

El recorrido usa cuentas `@example.invalid`: solicita y verifica OTP, registra la solicitud del conductor, simula su aprobación manual únicamente en la base temporal, crea y acepta el pedido, comparte tres posiciones, inicia/finaliza el viaje, verifica historial y borrado GPS, y revoca ambas sesiones. Se comprueba que tarifa y pago continúan sin implementar. No hay cobros simulados como exitosos.

Para recorrer los estados, el objeto de configuración **local de la prueba** cambia `ENABLE_LIVE_RIDES` a `true`; no modifica ninguna configuración de despliegue. Otro caso comprueba que `false` bloquea creación, aceptación, cambios de estado y lectura/escritura GPS, incluso con un viaje ya aceptado.

Los ocho casos también cubren: cuentas sin aprobar, OTP reutilizado, acceso ajeno, transición indebida, cancelación, GPS vencido o impreciso, suspensión, dos aceptaciones competidoras, vencimiento del pedido y rollback del cierre si falla el borrado GPS. No hay esperas temporizadas: el vencimiento se prepara en la base temporal. IDs y códigos son aleatorios como en producción; los resultados esperados no dependen de sus valores.

La salida de Node identifica cada escenario y termina con código distinto de cero ante un fallo. Para ejecutar además las pruebas existentes:

```sh
node --test bm-viajes/tests/*.test.mjs
python3 bm-viajes/backend/test_accept.py
```

El workflow existente `.github/workflows/bm-viajes.yml` incluye automáticamente el archivo `*.test.mjs`. El adaptador ejecuta SQL real y transacciones SQLite, pero no reproduce la infraestructura distribuida de D1. Esta prueba valida el backend en proceso; no acredita entrega real de correos, dos teléfonos, GPS físico, mapas, tarifas, pagos ni despliegue en Cloudflare.

## Estado de operación

El sitio es una **demo pública instalable**. La API y D1 son infraestructura de preparación, no un servicio ya activado. No usar como sistema de transporte hasta satisfacer todos los criterios.
