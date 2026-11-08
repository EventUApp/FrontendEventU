import React, { act } from 'react';
import { createRoot, type TestInstance } from 'test-renderer';
import { NetworkError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { Provider, ProviderSummary } from '../src/api/types';
import ProveedorScreen from '../src/screens/ProveedorScreen';
import ResultadosScreen, {
  MAP_LOAD_ERROR_MESSAGE,
  SEARCH_THIS_ZONE_TEXT,
  VIEW_PROFILE_BUTTON_TEXT,
} from '../src/screens/ResultadosScreen';
import { FlowProvider, type FlowState } from '../src/state/FlowContext';
import {
  APPROXIMATE_LOCATION_TEXT,
  CALI_DEFAULT_REGION,
  calculateBbox,
  isValidCoordinate,
} from '../src/utils/map';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
  useRoute: () => ({
    params: { providerId: 'prv-01' },
  }),
}));

function textOf(node: TestInstance): string {
  return node.children
    .map((c) => (typeof c === 'string' ? c : textOf(c)))
    .join('');
}

function findAllText(root: TestInstance): string[] {
  return root.queryAll((n) => n.type === 'Text').map(textOf);
}

function findByTestId(root: TestInstance, testID: string): TestInstance {
  const matches = root.queryAll((n) => n.props.testID === testID);
  if (matches.length === 0) {
    throw new Error(`No se encontró testID="${testID}"`);
  }
  return matches[0];
}

function hasTestId(root: TestInstance, testID: string): boolean {
  return root.queryAll((n) => n.props.testID === testID).length > 0;
}

function press(node: TestInstance): unknown {
  let curr: { memoizedProps?: { onPress?: () => unknown }; return?: unknown } | null =
    node.unstable_fiber;
  while (curr) {
    if (typeof curr.memoizedProps?.onPress === 'function') {
      return curr.memoizedProps.onPress();
    }
    curr = (curr.return as typeof curr) ?? null;
  }
  throw new Error('No se encontró manejador onPress');
}

const sampleProviders: ProviderSummary[] = [
  {
    id: 'prv-01',
    name: 'Hacienda Campestre Real',
    categories: ['espacio'],
    neighborhood: 'Pance',
    municipality: 'Cali',
    latitude: 3.3245,
    longitude: -76.5412,
    cover_url: 'https://images.ejemplo.test/pance.jpg',
    rating_avg: 4.8,
    rating_count: 24,
    verification_status: 'verificado',
    price_from_cop: 2_500_000,
    featured: true,
  },
  {
    id: 'prv-02',
    name: 'Banquete Gourmet Granada',
    categories: ['alimentacion'],
    neighborhood: 'Granada',
    municipality: 'Cali',
    latitude: 3.4589,
    longitude: -76.5342,
    cover_url: null,
    rating_avg: 4.5,
    rating_count: 12,
    verification_status: 'verificado',
    price_from_cop: 1_200_000,
    featured: false,
  },
  {
    id: 'prv-03-no-coords',
    name: 'Decoraciones Sin Coordenadas',
    categories: ['decoracion'],
    neighborhood: 'San Fernando',
    municipality: 'Cali',
    latitude: null,
    longitude: null,
    cover_url: null,
    rating_avg: 4.0,
    rating_count: 5,
    verification_status: 'en_revision',
    price_from_cop: 800_000,
    featured: false,
  },
];

const sampleDetailWithCoords: Provider = {
  id: 'prv-01',
  name: 'Hacienda Campestre Real',
  categories: ['espacio'],
  description: 'Espacio campestre ideal para bodas.',
  neighborhood: 'Pance',
  municipality: 'Cali',
  phone: '3001234567',
  email: 'contacto@hacienda.test',
  latitude: 3.3245,
  longitude: -76.5412,
  images: [{ url: 'https://images.ejemplo.test/pance.jpg', alt_text: 'Foto campestre' }],
  rating_avg: 4.8,
  rating_count: 24,
  reviews: [],
  verification: {
    status: 'verificado',
    checks: [{ type: 'rut', date: '2026-01-10' }],
  },
  services: [
    {
      id: 'svc-01',
      name: 'Salón campestre',
      category: 'espacio',
      provider_id: 'prv-01',
      provider_name: 'Hacienda Campestre Real',
      price_cop: 2_500_000,
      price_model: 'fijo',
      level: 'premium',
      min_guests: 50,
      max_guests: 200,
    },
  ],
};

const sampleDetailWithoutCoords: Provider = {
  ...sampleDetailWithCoords,
  id: 'prv-03-no-coords',
  latitude: null,
  longitude: null,
};

async function mountResultados(props?: {
  initialFlow?: Partial<FlowState>;
  simulateMapError?: boolean;
}): Promise<TestInstance> {
  const root = createRoot();
  await act(async () => {
    root.render(
      <FlowProvider>
        <ResultadosScreen simulateMapError={props?.simulateMapError} />
      </FlowProvider>,
    );
  });
  return root.container;
}

async function mountProveedor(providerData: Provider): Promise<TestInstance> {
  jest.spyOn(endpoints, 'getProvider').mockResolvedValue(providerData);
  const root = createRoot();
  await act(async () => {
    root.render(
      <FlowProvider>
        <ProveedorScreen route={{ params: { providerId: providerData.id } }} />
      </FlowProvider>,
    );
  });
  return root.container;
}

describe('HU_EU_03_14 — Resultados en Mapa (T_HU_EU_03_14_2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockReset();
    jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
      items: sampleProviders,
      total: sampleProviders.length,
      page: 1,
      page_size: 10,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Utilidades de mapa (src/utils/map.ts)', () => {
    it('isValidCoordinate: valida números y rechaza null, undefined o NaN (Criterio 3.1)', () => {
      expect(isValidCoordinate(3.4516, -76.532)).toBe(true);
      expect(isValidCoordinate(0, 0)).toBe(true);
      expect(isValidCoordinate(null, -76.532)).toBe(false);
      expect(isValidCoordinate(3.4516, null)).toBe(false);
      expect(isValidCoordinate(undefined, -76.532)).toBe(false);
      expect(isValidCoordinate(NaN, -76.532)).toBe(false);
      expect(isValidCoordinate('3.4516', -76.532)).toBe(false);
    });

    it('calculateBbox: calcula lat_min,lon_min,lat_max,lon_max con 4 decimales (ADR-13, §7.1)', () => {
      const region = {
        latitude: 3.4516,
        longitude: -76.532,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
      const bbox = calculateBbox(region);
      expect(bbox).toBe('3.4116,-76.5720,3.4916,-76.4920');
    });

    it('CALI_DEFAULT_REGION: coordenadas por defecto en Cali (Criterio 3.2)', () => {
      expect(CALI_DEFAULT_REGION.latitude).toBeCloseTo(3.4516);
      expect(CALI_DEFAULT_REGION.longitude).toBeCloseTo(-76.532);
    });
  });

  describe('Pantalla ResultadosScreen en modo Mapa (Criterio 1)', () => {
    it('conmuta entre modo Lista y modo Mapa con los botones de la barra superior', async () => {
      const root = await mountResultados();

      // Por defecto inicia en lista
      expect(hasTestId(root, 'results-scroll')).toBe(true);
      expect(hasTestId(root, 'map-container')).toBe(false);

      // Conmutar a modo mapa
      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      expect(hasTestId(root, 'map-container')).toBe(true);
      expect(hasTestId(root, 'results-map')).toBe(true);
      expect(hasTestId(root, 'results-scroll')).toBe(false);

      // Conmutar de vuelta a lista
      await act(async () => {
        press(findByTestId(root, 'btn-view-lista'));
      });

      expect(hasTestId(root, 'results-scroll')).toBe(true);
      expect(hasTestId(root, 'map-container')).toBe(false);
    });

    it('criterio 2.1 y 3.1: solo dibuja marcadores para proveedores con coordenadas válidas, mostrando el precio Desde', async () => {
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      // prv-01 y prv-02 tienen coordenadas válidas
      expect(hasTestId(root, 'map-marker-prv-01')).toBe(true);
      expect(hasTestId(root, 'map-marker-prv-02')).toBe(true);

      // prv-03-no-coords tiene coordenadas null -> NO se dibuja (Criterio 3.1)
      expect(hasTestId(root, 'map-marker-prv-03-no-coords')).toBe(false);

      // El marcador incluye el precio Desde en COP formateado (Criterio 2.1)
      const marker1 = findByTestId(root, 'map-marker-prv-01');
      expect(textOf(marker1)).toContain('Desde $2.500.000');

      const marker2 = findByTestId(root, 'map-marker-prv-02');
      expect(textOf(marker2)).toContain('Desde $1.200.000');
    });

    it('criterio 2.2 y 5: tocar un marcador abre su tarjeta emergente y el botón Ver ficha navega a la ficha', async () => {
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      // Inicialmente la tarjeta emergente no está abierta
      expect(hasTestId(root, 'map-popup-card')).toBe(false);

      // Tocar el marcador de prv-01
      await act(async () => {
        press(findByTestId(root, 'map-marker-prv-01'));
      });

      // Aparece la tarjeta emergente con datos del proveedor
      expect(hasTestId(root, 'map-popup-card')).toBe(true);
      expect(textOf(findByTestId(root, 'map-popup-name'))).toBe('Hacienda Campestre Real');
      expect(textOf(findByTestId(root, 'map-popup-card'))).toContain('Desde $2.500.000');
      expect(hasTestId(root, 'map-popup-image')).toBe(true);

      // Botón literal 'Ver ficha'
      expect(VIEW_PROFILE_BUTTON_TEXT).toBe('Ver ficha');
      const viewProfileBtn = findByTestId(root, 'btn-popup-view-profile');
      expect(textOf(viewProfileBtn)).toBe('Ver ficha');

      // Tocar Ver ficha navega a Proveedor con providerId
      await act(async () => {
        press(viewProfileBtn);
      });
      expect(mockNavigate).toHaveBeenCalledWith('Proveedor', { providerId: 'prv-01' });

      // Botón cerrar tarjeta emergente
      await act(async () => {
        press(findByTestId(root, 'btn-popup-close'));
      });
      expect(hasTestId(root, 'map-popup-card')).toBe(false);
    });

    it('criterio 2.3: los filtros, el orden y los chips son compartidos entre lista y mapa', async () => {
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      // Accesos a filtros y ordenar están presentes en modo mapa
      expect(hasTestId(root, 'btn-filters')).toBe(true);
      expect(hasTestId(root, 'btn-sort')).toBe(true);
      expect(hasTestId(root, 'results-count')).toBe(true);
    });

    it('criterio 2.4 y 5: botón Buscar en esta zona consulta el API con bbox a partir de la región visible', async () => {
      const getSpy = jest.spyOn(endpoints, 'getProviders');
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      expect(SEARCH_THIS_ZONE_TEXT).toBe('Buscar en esta zona');
      expect(hasTestId(root, 'btn-search-this-zone')).toBe(true);
      expect(textOf(findByTestId(root, 'btn-search-this-zone'))).toContain('Buscar en esta zona');

      // Simular cambio de región del mapa
      const map = findByTestId(root, 'results-map');
      await act(async () => {
        map.props.onRegionChangeComplete({
          latitude: 3.42,
          longitude: -76.55,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      });

      // Pulsar 'Buscar en esta zona'
      await act(async () => {
        press(findByTestId(root, 'btn-search-this-zone'));
      });

      // Verifica que se haya llamado con bbox calculado
      expect(getSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          bbox: '3.3950,-76.5750,3.4450,-76.5250',
          page: 1,
        }),
        expect.any(Object),
      );
    });

    it('criterio 6: si el mapa no carga, muestra mensaje literal y vuelve a la lista', async () => {
      expect(MAP_LOAD_ERROR_MESSAGE).toBe('No fue posible mostrar el mapa. Use la vista de lista.');

      // Simular error al cargar el mapa
      const root = await mountResultados({ simulateMapError: true });

      // Intento de entrar a mapa
      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      // Vuelve automáticamente a la lista y muestra el aviso de error
      expect(hasTestId(root, 'results-scroll')).toBe(true);
      expect(hasTestId(root, 'map-load-error-banner')).toBe(true);
      expect(textOf(findByTestId(root, 'map-load-error-banner'))).toBe(
        'No fue posible mostrar el mapa. Use la vista de lista.',
      );
    });

    it('criterio 6: ante fallo de red en modo mapa muestra NetworkErrorView con botón Reintentar', async () => {
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      const getSpy = jest
        .spyOn(endpoints, 'getProviders')
        .mockRejectedValueOnce(
          new NetworkError('No hay conexión con el servidor. Revise su conexión e intente nuevamente.'),
        )
        .mockResolvedValueOnce({
          items: sampleProviders,
          total: sampleProviders.length,
          page: 1,
          page_size: 10,
        });

      // Buscar en zona con fallo de red
      await act(async () => {
        press(findByTestId(root, 'btn-search-this-zone'));
      });

      const all = findAllText(root).join(' ');
      expect(all).toContain('No hay conexión con el servidor.');
      expect(all).toContain('Reintentar');

      // Pulsar reintentar
      const retryBtn = root.queryAll(
        (n) => n.props.accessibilityRole === 'button' && textOf(n) === 'Reintentar',
      )[0];
      await act(async () => {
        press(retryBtn);
      });

      expect(getSpy).toHaveBeenCalled();
    });
  });

  describe('Ficha del proveedor ProveedorScreen (Criterio 1 y RN-28)', () => {
    it('criterio 1 y RN-28: si el proveedor tiene coordenadas válidas muestra mapa pequeño con aviso Ubicación aproximada', async () => {
      expect(APPROXIMATE_LOCATION_TEXT).toBe('Ubicación aproximada');

      const root = await mountProveedor(sampleDetailWithCoords);

      expect(hasTestId(root, 'provider-mini-map-container')).toBe(true);
      expect(hasTestId(root, 'provider-mini-map')).toBe(true);
      expect(hasTestId(root, 'provider-mini-map-marker')).toBe(true);
      expect(textOf(findByTestId(root, 'provider-mini-map-notice'))).toBe('Ubicación aproximada');

      // Las coordenadas aproximadas se pasan al mapa
      const map = findByTestId(root, 'provider-mini-map');
      expect(map.props.initialRegion.latitude).toBe(3.3245);
      expect(map.props.initialRegion.longitude).toBe(-76.5412);
    });

    it('criterio 3.1: si el proveedor no tiene coordenadas (null) NO muestra el mapa pequeño', async () => {
      const root = await mountProveedor(sampleDetailWithoutCoords);

      expect(hasTestId(root, 'provider-mini-map-container')).toBe(false);
      expect(hasTestId(root, 'provider-mini-map')).toBe(false);
    });
  });
});
