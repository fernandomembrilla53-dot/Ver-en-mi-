# BM Viajes — APK piloto Android

Esta compilación es de prueba: abre exclusivamente la PWA HTTPS de BM Viajes y permite geolocalización solo con consentimiento. No autoriza viajes ni cobros reales.

## APK para probar en Android

- [Descargar BM Viajes Piloto (.apk)](https://raw.githubusercontent.com/fernandomembrilla53-dot/Ver-en-mi-/bm-viajes-android-pilot-apk-20261120/bm-viajes/android/dist/BM-Viajes-Piloto-Android.apk)
- **Versión:** `0.1.1-pilot` (`versionCode 2`)
- **Paquete:** `com.bmapps.viajes.pilot`, compatible con Android 8.0 o superior
- **Ícono:** logo original de BM Viajes, asignado como `android:icon` y `android:roundIcon` y **comprobado por Android `aapt dump badging`**
- **Compilación reproducible:** [GitHub Actions #44811089346](https://github.com/fernandomembrilla53-dot/Ver-en-mi-/actions/runs/44811089346); Gradle `:app:assembleDebug` exitoso, archivo ZIP íntegro y pruebas del repositorio aprobadas
- **Tamaño:** 22567 bytes
- **SHA-256:** `112e7a74df6c83e22ce73fda8d4d97ee5a86a9c1a924acd9b2037afa33a785d7`

La versión anterior (0.1.0) no tenía ícono de lanzador. **Si Android impide actualizar una instalación previa, desinstalar la APK piloto antigua y luego instalar esta nueva:** las claves de firma debug de GitHub Actions pueden cambiar entre compilaciones. Las sesiones locales de la app se perderán al desinstalar.

## Compilación local

Requisitos: Android SDK 35, JDK 17 y Gradle compatible con Android Gradle Plugin 8.7.3.

En `bm-viajes/android`, ejecutar `gradle :app:assembleDebug`. Salida: `app/build/outputs/apk/debug/app-debug.apk`.

## Límites y pruebas pendientes

- La compilación y el ícono se **verificaron en CI**, no se probó instalación física ni GPS real.
- Probar con Fran: abrir app, permisos GPS, obtener código OTP, aprobación como conductor y sesión desde dos teléfonos.
- Validar conectividad API, seguimiento ficticio y cierre de sesión en ambos dispositivos.
- Confirmar bloqueo de viajes reales y cobros antes de promover el piloto.
- El proveedor OAuth puede no aceptar WebView. En tal caso se necesita navegador externo / Custom Tabs o TWA.
- Es una APK **debug** firmada con clave temporal de CI, **no apta para Play Store ni para producción**. No tiene todavía firma privada estable para actualizaciones.

Rama independiente; PR en borrador; sin cambios en Radar, VER-EN-MI ni despliegues productivos.
