# CLAUDE.md — eventu-app (app móvil de EventU)

App móvil (React Native + Expo SDK 58 + TypeScript) que consume `eventu-api`. Es un **marketplace de servicios para eventos** (referencia: Booking, Trivago, TripAdvisor): buscar → resultados (lista o mapa) → ficha del proveedor → «Mi evento» (carrito) → datos del cliente → pago simulado → confirmación. El recomendador de 3 paquetes por presupuesto es un **atajo** que llena «Mi evento». Equipo: Jean Paul (esta app), David (API y QA), Yenny (contenido). El prototipo de Juan Carlos es la **referencia visual**: se adapta, no se rediseña.

**Expo cambia entre versiones:** lea `AGENTS.md` y consulte la documentación de la versión instalada antes de usar cualquier API de Expo o React Native. Instale dependencias con `npx expo install <paquete>` cuando haya red; no las añada de memoria.

## Léase antes de programar (carpeta `docs/`)
`20261105_SAD_EU.md` (§7 contrato del API, §7.3 red móvil, §8.2 estructura), `20261105_SRS_Requisitos_EU.md`, `20261105_PB_ProductBacklog_EU.md` y el Backlog Extendido (`.tsv`). Los mensajes entre comillas simples en los criterios son literales (Propuesto): úselos tal cual.

## Comandos
- `npm run check` = eslint + `tsc --noEmit` + jest (debe estar en verde antes de cada PR).
- `npx expo start` y abrir con Expo Go. Copie `.env.example` a `.env` y fije `EXPO_PUBLIC_API_BASE_URL` (URL desplegada o IP de la red local; en un dispositivo físico no sirve `localhost`).

## Estructura (SAD §8.2)
Navegación: pestañas Inicio · Resultados · Mi evento · Reservas (`@react-navigation/bottom-tabs`) y pantallas de detalle en un stack.
`src/screens` (una por pantalla) · `src/navigation` · `src/api` (cliente y endpoints tipados) · `src/state` (contexto del flujo) · `src/components` · `src/utils` (formato COP, validadores, `cart.ts` con las reglas de «Mi evento») · `src/config` (límites Propuesto y URL) · `src/theme`.
- `api/` no importa `screens/` ni `components/`. Las pantallas no se importan entre sí: navegan con `navigation`.
- Todo acceso al servidor pasa por `src/api/client.ts` (tiempo de espera de 60 s, error de red, error uniforme).

## Reglas que no se rompen
1. Importes en **COP enteros**; formatee solo para mostrar con `formatCOP`. El total que ve el usuario al ajustar se recalcula localmente, pero el servidor decide (`/quotes`, `/reservations`).
2. Se envían **identificadores de servicio, nunca precios** como fuente de verdad.
3. Cada petición muestra carga, bloquea el botón de envío mientras tarda, y ante fallo muestra el mensaje y **'Reintentar'**. La app nunca se cierra por un error de red y nunca muestra códigos ni trazas (RF-GEN-01 a 03).
4. Volver atrás **no borra** presupuesto, tipo de evento, invitados, paquete, el carrito «Mi evento» ni los datos del cliente (usar `FlowContext`).
   Reglas de «Mi evento» (`src/utils/cart.ts`, con pruebas): un servicio por rubro, espacio + alimentación + decoración para reservar, presupuesto opcional (RN-22, RN-23).
   Fotos: si una imagen no carga, muestre un recuadro neutro sin error (HU_EU_02_08). Mapa: instale `npx expo install react-native-maps` solo al implementar HU_EU_03_14.
5. Errores de validación **junto al campo** (`FieldError`), teclado adecuado por campo, áreas táctiles ≥ 44 pt y texto base ≥ 16 pt (`src/theme`).
6. Pantalla de pago: aviso permanente 'Pago simulado: no se cobrará dinero real.'; no guardar ni registrar datos de tarjeta, ni siquiera en el estado del flujo.
7. HTTPS obligatorio fuera de desarrollo; sin secretos en el repo.

## Cómo trabajar una historia
1. Lea la HU y sus criterios; abra la pantalla del prototipo como referencia.
2. Rama `hu/EU_<sprint>_<n>-<tema>`; un PR pequeño por tarea (`T_HU_…`).
3. Pruebas de validadores y del cliente con Jest; verifique la pantalla en emulador o dispositivo.
4. Entregue con `npm run check` en verde, criterios verificados, sin secretos y la fila de `docs/bitacora-prompts.md` completa.
5. Si el prototipo contradice el SRS, manda el SRS: anótelo en el PR.

## Mapa HU → pantalla
| HU | Pantalla |
|---|---|
| 01_12 | `InicioScreen` (buscador, categorías, destacados) |
| 01_01 | `PresupuestoScreen` (atajo por presupuesto) |
| 01_02 | `PaquetesScreen` |
| 01_04 | `client.ts`, `LoadingNotice`, `NetworkErrorView`, `FlowContext` (ya hay base) |
| 02_05 | `ResultadosScreen` (lista, filtros, orden) |
| 02_13 | `MiEventoScreen` (carrito; incluye el ajuste de HU 02_06) |
| 02_06 | Cambiar/quitar servicios dentro de `MiEventoScreen` (`POST /quotes`) |
| 02_07 | `CompararScreen` (Could) |
| 02_08 | `ProveedorScreen` (galería, calificación, reseñas, agregar a mi evento) |
| 03_14 | Vista de mapa dentro de `ResultadosScreen` (Could) |
| 03_09 | `DatosClienteScreen` |
| 03_10 | `PagoScreen` |
| 03_11 | `ConfirmacionScreen` y `ConsultarReservaScreen` (pestaña Reservas) |
