# BM Viajes — piloto de movilidad local

La aplicación pública está en `../index.html` y funciona como **demo**. La API de `worker.mjs` es una base de piloto en Cloudflare Workers + D1; **no está desplegada ni configurada por incluir el código en GitHub**.

## Qué ya está implementado en código

- PWA independiente con iconos, service worker y funcionamiento básico sin conexión (no descarga mapas).
- Mapa interactivo de OpenStreetMap (requiere Internet) y GPS voluntario del usuario. Elegir puntos no constituye una reserva.
- Demo local de pasajeros, conductores, tipos de vehículo, comisión del 10%, favoritos y compartir.
- API separada para solicitud/verificación de código de correo por Brevo, sesiones con tokens aleatorios, permisos de conductor con aprobación manual, creación/aceptación/estado de viajes, y posición reciente solo de conductor asignado.
- Control CORS, limitación de intentos, exclusión de conductores no verificados, ubicación caducable, solicitud atómica de aceptación, sin credenciales públicas. **Las operaciones de viajes y GPS fallan cerrado** hasta que `ENABLE_LIVE_RIDES` sea exactamente `true`. Autenticación, configuración, historial autorizado y cotizaciones simuladas tienen controles separados.

## Configuración segura para un piloto controlado

1. Instalar Wrangler y crear una base D1 para BM Viajes.
2. Copiar `wrangler.toml.example` a `wrangler.toml`; colocar el identificador de la base; configurar `FRONTEND_ORIGIN` como origen HTTPS real del cliente y `MAIL_FROM` como correo remitente previamente verificado.
3. Ejecutar el esquema en D1: `npx wrangler d1 execute bm-viajes-db --remote --file=./schema.sql` desde esta carpeta.
4. Configurar secretos privados (nunca en GitHub): `npx wrangler secret put AUTH_SECRET` (32+ caracteres aleatorios) y `npx wrangler secret put BREVO_API_KEY`.
5. Desplegar la API: `npx wrangler deploy`. Validar `GET /api/health`, `GET /api/config`, CORS y la entrega real de OTP antes de probar con un usuario invitado.
6. Antes de habilitar viajes, comprobar requisitos locales, seguros, documentación, consentimiento GPS y respuesta a emergencias. Aprobar a cada conductor verificándolo fuera de esta app; el estado por defecto siempre es `pending` o `none`.
7. Solo para un piloto autorizado y después de superar pruebas de aceptación, cambiar `ENABLE_LIVE_RIDES` a `true`; la API todavía **no implementa cobros ni tarifa oficial**. La cotización simulada no autoriza un traslado.

## Tarifas de simulación (no comerciales)

`GET /api/fare/estimate?kind=one_way` devuelve $4.000 ARS; `kind=round_trip` devuelve $6.000; `kind=one_way&night=true` devuelve $4.500. Para ida y vuelta, `waitSeconds=600` devuelve $7.250: cinco minutos gratuitos y $250 por minuto adicional iniciado. Comisión: 10%. La respuesta incluye `simulationOnly: true` y versión del tarifario.

La ruta funciona incluso sin el binding DB y no consulta la base. Las demás rutas requieren el binding; `/api/health` consulta D1 y comprueba la presencia de las seis tablas requeridas; devuelve 503 si falla la consulta o faltan tablas. No valida columnas, índices, correo ni permisos de escritura. No requiere sesión, no crea viajes ni activa pagos. Rechaza parámetros desconocidos o duplicados, espera en solo ida e ida y vuelta nocturna (sin tarifa definida). Los viajes rurales tampoco tienen tarifa definida. La creación de viajes guarda una tarifa base de piloto en `ride_fares` en el mismo batch transaccional que el viaje. Acepta `kind` (por compatibilidad, `one_way` por defecto), determina nocturnidad según Buenos Aires y rechaza ida y vuelta nocturna. En instalaciones existentes aplicar `migrations/0001_ride_fares.sql` antes de actualizar el Worker. Devuelve `fare_ars` base y `payment_status: "not_implemented"`. Aplicar también `migrations/0002_wait_totals.sql` antes de actualizar un Worker existente. La interfaz piloto aún debe enviar explícitamente la modalidad seleccionada y confirmar el precio.

Pruebas específicas: `node --test bm-viajes/tests/fare-api.test.mjs`. No se necesitan credenciales ni servicios externos.

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

El recorrido usa cuentas `@example.invalid`: solicita y verifica OTP, registra la solicitud del conductor, simula su aprobación manual únicamente en la base temporal, crea y acepta el pedido, comparte tres posiciones, inicia/finaliza el viaje, verifica historial y borrado GPS, y revoca ambas sesiones. Se comprueba la tarifa base devuelta. Las pruebas adicionales cubren el precio final y rollback; los pagos continúan sin implementar. No hay cobros simulados como exitosos.

Para recorrer los estados, el objeto de configuración **local de la prueba** cambia `ENABLE_LIVE_RIDES` a `true`; no modifica ninguna configuración de despliegue. Otro caso comprueba que `false` bloquea creación, aceptación, cambios de estado y lectura/escritura GPS, incluso con un viaje ya aceptado.

Los ocho casos también cubren: cuentas sin aprobar, OTP reutilizado, acceso ajeno, transición indebida, cancelación, GPS vencido o impreciso, suspensión, dos aceptaciones competidoras, vencimiento del pedido y rollback del cierre si falla el borrado GPS. No hay esperas temporizadas: el vencimiento se prepara en la base temporal. IDs y códigos son aleatorios como en producción; los resultados esperados no dependen de sus valores.

La salida de Node identifica cada escenario y termina con código distinto de cero ante un fallo. Para ejecutar además las pruebas existentes:

```sh
node --test bm-viajes/tests/*.test.mjs
python3 bm-viajes/backend/test_accept.py
```

El workflow existente `.github/workflows/bm-viajes.yml` incluye automáticamente el archivo `*.test.mjs`. El adaptador ejecuta SQL real y transacciones SQLite, pero no reproduce la infraestructura distribuida de D1. Esta prueba valida el backend en proceso; no acredita entrega real de correos, dos teléfonos, GPS físico, mapas, tarifas comerciales, pagos ni despliegue en Cloudflare.

## Estado de operación

El sitio es una **demo pública instalable**. La API y D1 son infraestructura de preparación, no un servicio ya activado. No usar como sistema de transporte hasta satisfacer todos los criterios.

## Espera y cierre financiero de piloto

`POST /api/rides/:id/wait` con `{ "action": "start" }` o `{ "action": "stop" }` registra un único intervalo de espera por ida y vuelta, solo durante un viaje en curso y por el conductor asignado. El inicio exige conductor aprobado. El reloj es del servidor; no se aceptan segundos enviados por el cliente. Al completar el viaje se cierra cualquier espera abierta y se guardan los importes finales en la misma transacción que el estado y el borrado GPS. Cinco minutos gratis; minuto adicional iniciado, con tope de 24 horas de espera facturable en piloto. Comisión redondeada al peso más cercano; los importes no representan cobros. `GET /api/rides/:id` devuelve `financials` a los participantes; los viajes legados sin tarifa devuelven null. Falta UI de espera, consentimiento y gestión de controversias, historial financiero, conciliación y validación comercial; no habilitar viajes ni cobros reales.

## Efectivo y deuda de comisión (piloto)

Aplicar `migrations/0003_cash_ledger.sql` después de 0002. Tras finalizar un viaje con importe persistido, cada participante puede declarar el pago en efectivo mediante `POST /api/rides/:id/cash` con `{"confirm":true}`. No se aceptan importes del cliente. `GET` en esa ruta devuelve el estado de confirmación a los participantes. La segunda declaración inserta automáticamente una única deuda de comisión en el libro mayor, en la misma sentencia transaccional mediante trigger. Reintentos no duplican deuda. Las declaraciones y asientos no se pueden editar ni borrar. `GET /api/driver/ledger` devuelve exclusivamente los asientos propios y deuda acumulada en ARS. No implica verificación bancaria ni liquidación. Pendiente: método de pago acordado antes del viaje, exclusión mutua con checkout, correcciones contables mediante contraasientos, liquidaciones verificadas y paneles. No activar límites de deuda ni pagos reales. Los endpoints son de piloto; no desplegar hasta completar las condiciones de #9.
