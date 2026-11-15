# Gmail para BM Viajes

Implementación equivalente a Radar BM: OAuth refresh + Gmail API users/me/messages/send con permiso gmail.send. Remitente BM Viajes; OTP de seis dígitos con caducidad de diez minutos. No se modificó Radar ni se extraen sus secretos.

Configurar en el Worker bm-viajes-api, o mediante secretos independientes del repositorio BM_VIAJES_GMAIL_CLIENT_ID, BM_VIAJES_GMAIL_CLIENT_SECRET, BM_VIAJES_GMAIL_REFRESH_TOKEN y BM_VIAJES_GMAIL_SENDER_EMAIL. En Cloudflare los nombres son GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL y EMAIL_PROVIDER=gmail. Usar una autorización Gmail de envío válida; no publicar tokens. No rotar ni revocar la autorización de Radar. Una autorización independiente evita afectar los dos proyectos.

El despliegue conserva viajes y pagos deshabilitados. /api/health informa email_provider y email_configured sin mostrar valores. Un health positivo no prueba entrega: verificar con cuenta propietaria consentida y código de acceso real. Las pruebas locales usan credenciales ficticias. Si el proyecto OAuth sigue en Testing, revisar caducidad del refresh token y estado de publicación. El conector Gmail de ChatGPT no proporciona credenciales al Worker.
