# UVER — demostración, 11 de noviembre de 2026

Cambio acotado a `bm-viajes/`. Continúa la PWA y el motor de simulación existentes. Backend Workers + D1 y `config.js` conservados, API sin configurar, viajes reales y pagos deshabilitados.

## Implementado

- Inicio «¿A dónde vas?», navegación Inicio/Opciones/Actividad/Cuenta y diseño blanco responsive.
- Perfil y preferencias locales, seguridad, ayuda, panel conductor y acceso separado al piloto existente.
- Leaflet/OpenStreetMap, selección manual A/B y GPS voluntario. OSRM calcula una ruta vial únicamente tras pulsar el botón; el fallo mantiene la línea aérea identificada, nunca una ruta falsa.
- Invalidación de rutas al cambiar puntos, tiempo sin tráfico y precios identificados como ilustrativos.
- Identidad e iconos UVER, manifiesto y nueva caché acotada a la carpeta.

## Verificación previa a publicación

- `node --test bm-viajes/tests/*.test.mjs`: 16 pruebas superadas.
- `NODE_PATH=/tmp/uver-qa/node_modules node bm-viajes/tests/ui.cjs`: flujos DOM de navegación, ruta exitosa simulada, invalidación, error de proveedor, solicitud/aceptación/finalización, actividad, perfil, preferencias y GPS rechazado/borrado superados. Para repetir en otro entorno, instalar jsdom en un directorio temporal y ajustar NODE_PATH.
- Consulta real a OSRM entre dos puntos públicos del centro de Ayacucho: respuesta Ok, 898,1 metros, 132,2 segundos, geometría de 13 puntos. No prueba GPS de un teléfono ni tráfico en vivo.
- El lanzamiento local de Chromium está bloqueado por restricciones de sockets del entorno. Revisión visual posterior mediante navegador público.

## Límites explícitos

No se comprobó seguimiento entre dos celulares y no se habilitó. OSRM y mosaicos requieren conexión y disponibilidad de sus servicios públicos; no se habilitaron servicios pagos. No hay búsqueda geocodificada de direcciones: para una ruta vial se eligen puntos del mapa. El perfil de demo no crea una cuenta autenticada. No hay reservas ni cobros reales.
