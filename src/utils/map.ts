/**
 * Constantes y utilidades para la vista de mapa (HU_EU_03_14, ADR-13, RN-28).
 */

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Coordenadas por defecto centradas en Cali (Criterio 3.2, Propuesto). */
export const CALI_DEFAULT_REGION: MapRegion = {
  latitude: 3.4516,
  longitude: -76.532,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

/** Mensajes literales requeridos por HU_EU_03_14. */
export const SEARCH_THIS_ZONE_TEXT = 'Buscar en esta zona';
export const VIEW_PROFILE_BUTTON_TEXT = 'Ver ficha';
export const MAP_LOAD_ERROR_MESSAGE = 'No fue posible mostrar el mapa. Use la vista de lista.';
export const APPROXIMATE_LOCATION_TEXT = 'Ubicación aproximada';

/**
 * Valida si las coordenadas son válidas y ambas están presentes (Criterio 3.1).
 */
export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    !isNaN(latitude) &&
    !isNaN(longitude)
  );
}

/**
 * Calcula el bounding box (bbox) a partir de una región del mapa.
 * Formato del API: 'lat_min,lon_min,lat_max,lon_max' (SAD ADR-13 y §7.1).
 */
export function calculateBbox(region: MapRegion): string {
  const latMin = (region.latitude - region.latitudeDelta / 2).toFixed(4);
  const lonMin = (region.longitude - region.longitudeDelta / 2).toFixed(4);
  const latMax = (region.latitude + region.latitudeDelta / 2).toFixed(4);
  const lonMax = (region.longitude + region.longitudeDelta / 2).toFixed(4);
  return `${latMin},${lonMin},${latMax},${lonMax}`;
}
