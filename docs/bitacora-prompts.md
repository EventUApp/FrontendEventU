# Bitácora de prompts

Registre aquí, por cada tarea, el prompt dado al agente y el resultado (una fila por tarea). Es parte de la definición de terminado.

| Fecha | HU / Tarea | Persona | Prompt (resumen o enlace) | Resultado y ajustes manuales |
|---|---|---|---|---|
| 2026-11-07 | HU_EU_01_01 / T_HU_EU_01_01_1 | Jean Paul | [prompts/T_HU_EU_01_01_1.md](../prompts/T_HU_EU_01_01_1.md) — Adaptar pantalla `PresupuestoScreen` ('Arma mi evento por presupuesto') con tres campos, selector de tipo de evento, teclados numéricos, mensajes de error junto al campo, precarga desde `FlowContext` y llamada a `POST /recommendations`. | Se implementó `PresupuestoScreen.tsx`, se alineó el título en `RootNavigator.tsx` ('Arma mi evento por presupuesto') y se agregaron pruebas de pantalla en `__tests__/presupuesto.test.tsx`. `npm run check` en verde (31/31 tests). |
