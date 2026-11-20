# BM Viajes — APK piloto Android

Versión **0.1.2-pilot** — APK de prueba para Fran. Abre la PWA pública de BM Viajes mediante HTTPS. Sin viajes ni cobros reales habilitados.

## Descargar e instalar

- [Descargar BM Viajes Piloto (.apk)](https://raw.githubusercontent.com/fernandomembrilla53-dot/Ver-en-mi-/bm-viajes-android-pilot-apk-20261120/bm-viajes/android/dist/BM-Viajes-Piloto-Android.apk)
- **Paquete:** `com.bmapps.viajes.pilot`; Android 8.0 o superior
- **VersionCode:** 3
- **Nuevo ícono:** `@drawable/bm_viajes_launcher_v3` (monograma BM, ruta y pin); verificado como recurso de lanzador en Android con `aapt dump badging`
- **Compilación y pruebas:** [GitHub Actions #44813279738](https://github.com/fernandomembrilla53-dot/Ver-en-mi-/actions/runs/44813279738), Gradle `:app:assembleDebug` y test de integridad APK exitosos; 69 tests pasaron
- **Tamaño:** 24439 bytes
- **SHA-256:** `a1119fb2822cc564ca00244b3b963ad84d91e2113fefc36b054bee4ee89dd147`

## Actualizaciones sin desinstalar

La APK de depuración está firmada por la clave temporal del runner de GitHub. La clave utilizada para la versión anterior **no se guardó**. Por lo tanto, una actualización directa de la 0.1.1 a esta 0.1.2 puede fallar por firma distinta. **No se puede asegurar actualización sin reinstalar hasta configurar una clave de firma estable y privada**. No guardar claves privadas ni contraseñas en el repositorio.

Para permitir futuras actualizaciones sobre la misma instalación es necesario firmar la versión inicial con una clave de distribución estable, resguardada fuera de GitHub público (por ejemplo, GitHub Actions Secrets), y mantener el package name e incrementar versionCode. La clave privada usada para una versión ya instalada debe conservarse para firmar la siguiente.

## Validación pendiente

- La compilación y la presencia del ícono se probaron en CI, no se validó la instalación física.
- Probar con Fran GPS, login por correo, sesiones separadas y viaje ficticio con otro dispositivo.
- WebView puede bloquear OAuth de terceros; migrar ese flujo a Custom Tabs/TWA cuando corresponda.
- No se autorizó despliegue productivo ni uso para transporte comercial.

La demo pública en `main` ya utiliza las tarifas base de $4.000 para directo diurno y $6.000 para ida y vuelta diurna. El backend llevaba esos valores previamente; conserva $4.500 directo nocturno y espera extra.
