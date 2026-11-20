# Firma estable de BM Viajes para actualizar sin desinstalar

El APK de prueba 0.1.2 publicado en la rama se compiló con una **clave debug temporal de GitHub Actions**. La clave privada con la que se firmaron las versiones 0.1.0–0.1.2 no se conservó; no hay forma segura de producir una APK de reemplazo firmada con esa clave.

## Solución para las próximas versiones

Preparar una **nueva clave de firma permanente y privada** y usarla desde la primera instalación estable del piloto. Esa instalación inicial podrá requerir desinstalar la APK debug anterior. A partir de ella, posteriores APKs con el mismo `applicationId`, firma y `versionCode` mayor se actualizan encima sin borrar datos.

En una PC segura con JDK se puede crear el archivo con `keytool -genkeypair -v -keystore bm-viajes-pilot.jks -alias bm-viajes -keyalg RSA -keysize 3072 -validity 10000`. Guardar una copia **fuera de GitHub** en un lugar seguro. No guardar el archivo ni las contraseñas en chats, commits, CI logs o documentación pública.

`bm-viajes/android/app/build.gradle` admite cuatro variables de entorno: `BM_VIAJES_KEYSTORE_PATH` (ruta absoluta del archivo), `BM_VIAJES_KEYSTORE_PASSWORD`, `BM_VIAJES_KEY_ALIAS` y `BM_VIAJES_KEY_PASSWORD`. Con las cuatro configuradas, desde `bm-viajes/android` ejecutar `gradle :app:assembleRelease`. Sin esas variables, el build de release **se rechaza** para evitar APK sin firma. La compilación debug no necesita secretos.

Para configurar una firma estable en GitHub Actions se necesitan secretos privados en la cuenta y un workflow con permisos y manejo de secretos auditados. **Esta conexión de GitHub no ofrece gestión de secretos; no se intentó publicar una clave en el repositorio.**

## Verificación en cada actualización

1. Verificar la identidad del certificado de firma contra la versión anterior (huella SHA-256 del certificado) antes de entregar cualquier nueva APK.
2. Aumentar `versionCode`, conservar `applicationId` y usar la misma clave.
3. Comprobar instalación como actualización real en un dispositivo de prueba con datos guardados.
4. No publicar APK release ni activar viajes/pagos comerciales hasta validar infraestructura y regulación.

**Advertencia:** una APK descargada no puede cambiar su ícono nativo sin instalar una actualización. La primera transición desde la firma temporal puede exigir una sola desinstalación. La actualización de contenido web de BM Viajes sí puede llegar a una instalación existente sin reinstalar la APK.
