// Valores PROPUESTO del SRS (RN-19). Cámbielos aquí y en el API a la vez.
export const BUDGET_MIN_COP = 1_000_000;
export const BUDGET_MAX_COP = 50_000_000;
export const GUESTS_MIN = 1;
export const GUESTS_MAX = 500;
export const REQUEST_TIMEOUT_MS = 60_000; // RNF-FIA-02: espera de hasta 60 s por arranque en frío (Propuesto)
export const SLOW_NOTICE_MS = 5_000; // aviso 'Estamos conectando...' tras 5 s (Propuesto)
export const PROVIDERS_PAGE_SIZE = 10; // HU_EU_02_05: tamaño de página del listado de proveedores (Propuesto)
