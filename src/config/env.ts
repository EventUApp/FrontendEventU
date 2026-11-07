// URL base del API por variable de entorno (RNF-POR-01). Desde un dispositivo físico
// no sirve localhost: use la URL desplegada o la IP de la red local.
const raw = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export const API_BASE_URL = raw.replace(/\/+$/, '');

export function assertApiBaseUrl(): void {
  if (!API_BASE_URL) {
    throw new Error('Falta EXPO_PUBLIC_API_BASE_URL (ver .env.example).');
  }
  if (!API_BASE_URL.startsWith('https://') && !__DEV__) {
    throw new Error('El API debe usarse por HTTPS fuera de desarrollo (RNF-SEG-01).');
  }
}
