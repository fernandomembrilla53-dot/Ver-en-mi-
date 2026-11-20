# BM Viajes — APK piloto Android

La APK de prueba empaqueta la web pública de BM Viajes usando WebView HTTPS, restringe navegación a la carpeta de BM Viajes y pide permiso GPS solo para el origen autorizado. Sin secretos, viajes ni cobros reales.

## Descarga de prueba

- **APK:** https://raw.githubusercontent.com/fernandomembrilla53-dot/Ver-en-mi-/bm-viajes-android-pilot-apk-20261120/bm-viajes/android/dist/BM-Viajes-Piloto-Android.apk
- Paquete: `com.bmapps.viajes.pilot`
- Compatible desde Android 8.0 (API 26)
- Compilación confirmada: [GitHub Actions #44808537729](https://github.com/fernandomembrilla53-dot/Ver-en-mi-/actions/runs/44808537729) — build Gradle exitoso y archivo ZIP/APK validado
- Tamaño: 8.861 bytes
- SHA-256: `0d5237c8da3112b4b9ccdba6c39f9e9eb4a6ed21e4747f8b61f479f9489d63b4`

El APK fue firmado **solo con la clave automática de depuración** de Android. **No es una versión para Play Store ni para uso comercial real**; cada compilación no garantiza una firma reproducible.

## Compilar desde el código

Requisitos: Android SDK 35, JDK 17+ y Gradle compatible con Android Gradle Plugin 8.7.3.

Desde `bm-viajes/android` ejecutar `gradle :app:assembleDebug`. Salida: `app/build/outputs/apk/debug/app-debug.apk`.

## Pruebas pendientes en dispositivos reales

- Abrir la interfaz y navegar entre conductor/pasajero
- GPS y permisos en Android
- Código de acceso y sesión con correo real en dos celulares
- Conexión entre pasajero y conductor ficticios y seguimiento del recorrido
- Verificar que los pagos y viajes reales continúen bloqueados
- Probar enlaces externos, recuperación de sesión y problemas de conexión

**Advertencia:** OAuth de Google u otros proveedores puede rechazar autenticación embebida en WebView. Antes de habilitarlo, adaptar el login a Custom Tabs/navegador o TWA con Digital Asset Links verificados. No declarar autenticación validada hasta probarla.

La rama permanece aislada y el PR en borrador hasta completar las validaciones. No se fusionó ni desplegó producción.
