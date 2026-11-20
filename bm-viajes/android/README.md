# BM Viajes — APK piloto Android

Proyecto Android nativo mínimo que abre **solo** la PWA pública de BM Viajes dentro de un WebView; enlaces externos se abren en el navegador. El GPS requiere permiso del usuario. No contiene credenciales, viajes ni cobros reales.

## Compilar

Requisitos: Android SDK 35, JDK 17 y Gradle 8.9 (o wrapper generado con esa versión).

Desde `bm-viajes/android` ejecutar `gradle :app:assembleDebug`.
El APK resultante estará en `app/build/outputs/apk/debug/app-debug.apk`.

**Estado:** código fuente preparado, **no compilado ni probado en un teléfono**. No distribuir como APK funcional hasta completar build, instalación y pruebas de GPS, inicio de sesión, conexión multi-dispositivo y bloqueo de cobros reales. No distribuir build debug como versión pública. Para distribución piloto se requiere firma y revisión de seguridad.

**Limitación conocida:** proveedores OAuth pueden bloquear WebView embebido. Si el login del piloto usa OAuth, migrar a navegador/Custom Tabs o TWA con Digital Asset Links verificados antes de considerarlo funcional. No confundir interfaz visible con autenticación validada.
