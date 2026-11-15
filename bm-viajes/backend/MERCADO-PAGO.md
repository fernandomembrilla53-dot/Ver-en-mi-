# Mercado Pago — BM Viajes (preparación, no habilitado)

Usar aplicación independiente de Radar, modelo Marketplace Split 1:1 con Checkout Pro. Cada conductor autoriza su propia cuenta por OAuth con PKCE y state de un solo uso, expiración y vínculo al usuario autenticado. Verificar KYC y elegibilidad. Guardar secretos únicamente en Worker Secrets y cifrar tokens por conductor en D1; no reutilizar credenciales de Radar.

## Viajes
Seleccionar método al crear viaje. Efectivo es el único método habilitado en piloto; Mercado Pago devuelve 503 hasta completar integración. No cambiar método posteriormente. Crear preferencia únicamente después del cierre y desde ride_totals: moneda ARS, unit_price total_ars, marketplace_fee commission_ars, referencia externa única por viaje. Usar token OAuth del conductor. No usar importe del cliente. No crear preferencia nueva ante timeout sin reconciliar la anterior. No aceptar redirección como prueba de pago.

## Liquidaciones de deuda
Separar cobros de deuda (cuenta propia de BM Viajes) de cobros de viajes (cuenta del conductor con split). Crear intención de liquidación con monto y referencia propios; verificar pago aprobado consultando API con credencial propia, moneda, importe, referencia, receptor y ambiente. Solo entonces insertar commission_settlements con referencia de proveedor única. Si el importe supera deuda, retener para revisión/reembolso, no perder el pago. La tabla no tiene endpoint de escritura público. Créditos verificados reducen saldo; no constituyen todavía un flujo de pago operativo.

## Webhooks
Validar firma HMAC según documentación oficial, consultar recurso en API, deduplicar por identificador de pago, verificar vendedor y referencia, tratar reembolsos/contracargos mediante eventos compensatorios auditados. No activar producción hasta probar OAuth, expiración, concurrencia, reintentos, conciliación y devolución con cuentas de prueba separadas.

## Fuentes oficiales
- https://www.mercadopago.com.ar/developers/es/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace
- https://www.mercadopago.com.ar/developers/es/docs/split-payments/split-1-1/prerequisites
- https://www.mercadopago.com.ar/developers/es/docs/split-payments/additional-content/security/oauth/creation
- https://www.mercadopago.com.ar/developers/es/docs/split-payments/additional-content/your-integrations/notifications/webhooks

Pendiente: aplicación externa, OAuth, preferencias, verificador, webhooks, UI, pruebas sandbox y autorización de lanzamiento. No hay llamadas a Mercado Pago en esta etapa.
