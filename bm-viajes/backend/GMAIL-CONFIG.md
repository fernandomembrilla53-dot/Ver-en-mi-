# BM Viajes: habilitar Gmail para códigos sin pagar proveedores

**Emisor elegido por el propietario:** `fernandomembrilla53@gmail.com`. Este procedimiento configura **solo** el Worker `bm-viajes-api`; no modifica Radar, Ver-en-mi, viajes reales, pagos, bases de datos ni tarifas.

## Lo que ya está listo

- El backend `gmail.mjs` envía códigos mediante Gmail API con el permiso limitado `https://www.googleapis.com/auth/gmail.send`.
- El usuario ingresa su correo en `conductores.html`, `finanzas.html` o `piloto.html` y el servidor genera/verifica un OTP de seis cifras.
- El Worker D1 informa `database: ready` pero actualmente `email_configured: false`. Por eso el botón está deshabilitado.
- El nuevo workflow manual `.github/workflows/bm-viajes-gmail-only.yml` carga credenciales **únicamente** en `bm-viajes-api` y prueba el envío a la cuenta del propietario. No vuelve a desplegar código ni migrar D1. Nunca muestra tokens.

## Tres secretos privados necesarios (no pegarlos en ChatGPT, commits, capturas ni archivos públicos)

Abrir [Google Cloud Console](https://console.cloud.google.com/auth/clients) con el Gmail del propietario. Se puede usar el proyecto Google Cloud ya creado para Gmail, **sin cambiar las credenciales de Radar**.

1. En **Google Auth Platform → Clients**, crear un cliente OAuth independiente tipo **Web application** llamado `BM Viajes Gmail` si no existe ya uno propio de BM Viajes. La URI de redirección autorizada debe ser `https://developers.google.com/oauthplayground`. Gmail API debe estar habilitada en ese proyecto.
2. En **Audience**, asegurar que `fernandomembrilla53@gmail.com` pueda autorizar el cliente (si está en modo de prueba, como usuario de prueba).
3. Abrir [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/), elegir el engranaje de configuración, **Use your own OAuth credentials**, introducir allí el Client ID y Client Secret recién creados (no en un chat). Elegir acceso **Offline**, si se ofrece.
4. En paso 1 seleccionar únicamente `https://www.googleapis.com/auth/gmail.send` y autorizar con el Gmail del propietario. En paso 2 pulsar **Exchange authorization code for tokens**. Guardar el `refresh_token` de forma privada.
5. En [GitHub Actions secrets de Ver-en-mi](https://github.com/fernandomembrilla53-dot/Ver-en-mi-/settings/secrets/actions), crear exactamente estos tres *Repository secrets*:
   - `BM_VIAJES_GMAIL_CLIENT_ID`: Client ID de BM Viajes.
   - `BM_VIAJES_GMAIL_CLIENT_SECRET`: Client Secret de BM Viajes.
   - `BM_VIAJES_GMAIL_REFRESH_TOKEN`: Refresh Token obtenido en OAuth Playground.
6. El secreto existente `CLOUDFLARE_API_TOKEN` debe permitir administrar secretos del Worker **bm-viajes-api**; no crear ni compartir otro token si ya sirve.
7. Ir a [GitHub Actions: configurar Gmail BM Viajes](https://github.com/fernandomembrilla53-dot/Ver-en-mi-/actions/workflows/bm-viajes-gmail-only.yml), elegir **Run workflow** en la rama `main`. El trabajo primero comprueba todos los secretos y el Worker de destino. Si falta algo, falla **antes de modificar Cloudflare**.
8. Comprobar el resultado: [health BM Viajes](https://bm-viajes-api.fernandomembrilla53.workers.dev/api/health) debe responder `email_provider: gmail`, `email_configured: true`. El workflow pide **un solo código de prueba** a `fernandomembrilla53@gmail.com`; verificar su llegada, también en spam. La aceptación HTTP no prueba la recepción.
9. Probar el ingreso desde [panel de administración](https://fernandomembrilla53-dot.github.io/Ver-en-mi-/bm-viajes/finanzas.html) y [registro de conductores](https://fernandomembrilla53-dot.github.io/Ver-en-mi-/bm-viajes/conductores.html). La cuenta del administrador también debe estar dada de alta en `admin_users`; el correo por sí solo no otorga permisos.

**Importante para que no falle a la semana:** Google explica que los `refresh_token` emitidos a proyectos OAuth externos en estado **Testing** expiran habitualmente tras **siete días** cuando se solicita `gmail.send`. Evaluar con el propietario si corresponde pasar a producción una vez verificado el correo y las obligaciones de Google; no publicar automáticamente la app OAuth. Fuente: https://developers.google.com/identity/protocols/oauth2 y https://developers.google.com/identity/protocols/oauth2/production-readiness/overview.

## Diagnóstico rápido

- `email_provider=brevo`, `email_configured=false`: los cinco secretos no se han aplicado; no hay envío.
- `email_provider=gmail`, `email_configured=false`: faltan o son inválidos al menos uno de los parámetros exigidos; revisar solamente nombres de secretos.
- `email_provider=gmail`, `email_configured=true` pero al pedir código devuelve error: Google rechazó OAuth, el token caducó o el servicio no pudo enviar; revisar el estado de OAuth y el job, sin mostrar credenciales.
- Código enviado pero no llega: revisar spam, cuotas de Gmail y logs sin incluir contenido privado.
- Si la cuenta ingresa pero no ve administración: revisar el permiso `admin_users`; **no** dar acceso administrativo por ser propietario del correo desde el frontend.

Referencia oficial del permiso mínimo: https://developers.google.com/workspace/gmail/api/auth/scopes
