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
  {
    id: 'prv-04-partial-lat',
    name: 'Sonido Solo Latitud',
    categories: ['entretenimiento'],
    neighborhood: 'El Peñón',
    municipality: 'Cali',
    latitude: 3.45,
    longitude: null,
    cover_url: null,
    rating_avg: 3.9,
    rating_count: 2,
    verification_status: 'en_revision',
    price_from_cop: 500_000,
    featured: false,
  },
  {
    id: 'prv-05-partial-lon',
    name: 'Animación Solo Longitud',
    categories: ['entretenimiento'],
    neighborhood: 'Menga',
    municipality: 'Cali',
    latitude: null,
    longitude: -76.52,
    cover_url: null,
    rating_avg: 4.2,
    rating_count: 4,
    verification_status: 'verificado',
    price_from_cop: 650_000,
    featured: false,
  },
  {
    id: 'prv-06-invalid-range',
    name: 'Proveedor Coordenadas Fuera de Rango',
    categories: ['decoracion'],
    neighborhood: 'Ciudad Jardín',
    municipality: 'Cali',
    latitude: 95.0,
    longitude: -76.53,
    cover_url: null,
    rating_avg: 4.1,
    rating_count: 3,
    verification_status: 'verificado',
    price_from_cop: 900_000,
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
      <FlowProvider initial={props?.initialFlow}>
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

describe('HU_EU_03_14 — Resultados en Mapa (T_HU_EU_03_14_4 / QA)', () => {
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

  describe('1. Utilidades y validación exhaustiva de coordenadas (Criterio 3.1 y RN-28)', () => {
    it.each([
      [3.4516, -76.532, true, 'coordenadas válidas estándar de Cali'],
      [0, 0, true, 'meridiano de Greenwich y ecuador'],
      [-90, -180, true, 'límites mínimos del globo (-90, -180)'],
      [90, 180, true, 'límites máximos del globo (90, 180)'],
      [3.123456, -76.654321, true, 'números de punto flotante de alta precisión'],
      [null, -76.532, false, 'latitud null'],
      [3.4516, null, false, 'longitud null'],
      [null, null, false, 'ambas null'],
      [undefined, -76.532, false, 'latitud undefined'],
      [3.4516, undefined, false, 'longitud undefined'],
      [NaN, -76.532, false, 'latitud NaN'],
      [3.4516, NaN, false, 'longitud NaN'],
      [Infinity, -76.532, false, 'latitud Infinity'],
      [-Infinity, -76.532, false, 'latitud -Infinity'],
      [3.4516, Infinity, false, 'longitud Infinity'],
      ['3.4516', -76.532, false, 'latitud string'],
      [3.4516, '-76.532', false, 'longitud string'],
      [90.0001, -76.532, false, 'latitud mayor a 90 grados'],
      [-90.0001, -76.532, false, 'latitud menor a -90 grados'],
      [3.4516, 180.0001, false, 'longitud mayor a 180 grados'],
      [3.4516, -180.0001, false, 'longitud menor a -180 grados'],
      [{}, -76.532, false, 'objeto como latitud'],
      [true, -76.532, false, 'booleano como latitud'],
    ])('isValidCoordinate(%p, %p) -> %p (%s)', (lat, lon, expected, _description) => {
      expect(isValidCoordinate(lat, lon)).toBe(expected);
    });

    it('calculateBbox: formatea rigurosamente lat_min,lon_min,lat_max,lon_max con 4 decimales (ADR-13, §7.1)', () => {
      const region = {
        latitude: 3.4516,
        longitude: -76.532,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
      const bbox = calculateBbox(region);
      expect(bbox).toBe('3.4116,-76.5720,3.4916,-76.4920');

      const parts = bbox.split(',');
      expect(parts).toHaveLength(4);
      parts.forEach((part) => {
        const decimals = part.split('.')[1];
        expect(decimals).toBeDefined();
        expect(decimals.length).toBe(4);
      });
    });

    it('calculateBbox: maneja deltas negativos o cero sin invertir el orden lat_min <= lat_max', () => {
      const region = {
        latitude: 3.45,
        longitude: -76.5,
        latitudeDelta: -0.04,
        longitudeDelta: -0.04,
      };
      const bbox = calculateBbox(region);
      const [latMin, lonMin, latMax, lonMax] = bbox.split(',').map(Number);
      expect(latMin).toBeLessThanOrEqual(latMax);
      expect(lonMin).toBeLessThanOrEqual(lonMax);
    });

    it('CALI_DEFAULT_REGION: región predeterminada con coordenadas de Cali (Criterio 3.2)', () => {
      expect(CALI_DEFAULT_REGION.latitude).toBeCloseTo(3.4516, 4);
      expect(CALI_DEFAULT_REGION.longitude).toBeCloseTo(-76.532, 4);
      expect(CALI_DEFAULT_REGION.latitudeDelta).toBeGreaterThan(0);
      expect(CALI_DEFAULT_REGION.longitudeDelta).toBeGreaterThan(0);
    });
  });

  describe('2. Conmutación y compartición de controles Lista / Mapa (Criterios 1 y 2.3)', () => {
    it('conmuta entre modo Lista y modo Mapa preservando contador de resultados y botones superiores', async () => {
      const root = await mountResultados();

      // Inicia en modo lista por defecto
      expect(hasTestId(root, 'results-scroll')).toBe(true);
      expect(hasTestId(root, 'map-container')).toBe(false);
      expect(hasTestId(root, 'btn-filters')).toBe(true);
      expect(hasTestId(root, 'btn-sort')).toBe(true);
      expect(hasTestId(root, 'results-count')).toBe(true);

      // Conmutar a modo mapa
      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      expect(hasTestId(root, 'map-container')).toBe(true);
      expect(hasTestId(root, 'results-map')).toBe(true);
      expect(hasTestId(root, 'results-scroll')).toBe(false);

      // Los controles de orden y filtros siguen presentes y visibles
      expect(hasTestId(root, 'btn-filters')).toBe(true);
      expect(hasTestId(root, 'btn-sort')).toBe(true);
      expect(hasTestId(root, 'results-count')).toBe(true);
      expect(textOf(findByTestId(root, 'results-count'))).toContain('6 resultados');

      // Conmutar de vuelta a lista
      await act(async () => {
        press(findByTestId(root, 'btn-view-lista'));
      });

      expect(hasTestId(root, 'results-scroll')).toBe(true);
      expect(hasTestId(root, 'map-container')).toBe(false);
    });

    it('permite abrir y aplicar ordenamiento desde el modo mapa reflejando el orden seleccionado', async () => {
      const getSpy = jest.spyOn(endpoints, 'getProviders');
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      // Abrir modal de ordenamiento
      await act(async () => {
        press(findByTestId(root, 'btn-sort'));
      });

      expect(hasTestId(root, 'sort-sheet')).toBe(true);

      // Seleccionar menor precio y aplicar
      await act(async () => {
        press(findByTestId(root, 'sort-option-precio_asc'));
      });
      await act(async () => {
        press(findByTestId(root, 'btn-apply-sort'));
      });

      // Se envió la consulta ordenada
      expect(getSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: 'precio_asc',
          page: 1,
        }),
        expect.any(Object),
      );
    });
  });

  describe('3. Marcadores y filtrado estricto de coordenadas (Criterios 2.1 y 3.1)', () => {
    it('solo dibuja marcadores para proveedores con latitud y longitud válidas y en rango', async () => {
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      // Válidos: prv-01 y prv-02
      expect(hasTestId(root, 'map-marker-prv-01')).toBe(true);
      expect(hasTestId(root, 'map-marker-prv-02')).toBe(true);

      // Inválidos / nulos / parciales / fuera de rango NO deben tener marcador
      expect(hasTestId(root, 'map-marker-prv-03-no-coords')).toBe(false);
      expect(hasTestId(root, 'map-marker-prv-04-partial-lat')).toBe(false);
      expect(hasTestId(root, 'map-marker-prv-05-partial-lon')).toBe(false);
      expect(hasTestId(root, 'map-marker-prv-06-invalid-range')).toBe(false);
    });

    it('cada marcador incluye el precio Desde en COP formateado según Criterio 2.1', async () => {
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      const marker1 = findByTestId(root, 'map-marker-prv-01');
      expect(textOf(marker1)).toBe('Desde $2.500.000');

      const marker2 = findByTestId(root, 'map-marker-prv-02');
      expect(textOf(marker2)).toBe('Desde $1.200.000');
    });
  });

  describe('4. Tarjeta emergente e interacción (Criterios 2.2, 5 y HU_EU_02_08)', () => {
    it('al pulsar un marcador muestra la tarjeta emergente con foto, nombre, estrellas, precio y botón Ver ficha', async () => {
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      expect(hasTestId(root, 'map-popup-card')).toBe(false);

      // Pulsar prv-01
      await act(async () => {
        press(findByTestId(root, 'map-marker-prv-01'));
      });

      expect(hasTestId(root, 'map-popup-card')).toBe(true);
      expect(textOf(findByTestId(root, 'map-popup-name'))).toBe('Hacienda Campestre Real');
      expect(hasTestId(root, 'map-popup-image')).toBe(true);
      expect(textOf(findByTestId(root, 'map-popup-card'))).toContain('Desde $2.500.000');

      // Botón literal 'Ver ficha'
      expect(VIEW_PROFILE_BUTTON_TEXT).toBe('Ver ficha');
      const viewProfileBtn = findByTestId(root, 'btn-popup-view-profile');
      expect(textOf(viewProfileBtn)).toBe('Ver ficha');

      // Tocar Ver ficha navega a Proveedor con providerId
      await act(async () => {
        press(viewProfileBtn);
      });
      expect(mockNavigate).toHaveBeenCalledWith('Proveedor', { providerId: 'prv-01' });

      // Botón cerrar cierra la tarjeta
      await act(async () => {
        press(findByTestId(root, 'btn-popup-close'));
      });
      expect(hasTestId(root, 'map-popup-card')).toBe(false);
    });

    it('al seleccionar un proveedor sin foto (cover_url: null) renderiza placeholder con iniciales sin romperse', async () => {
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      // prv-02 no tiene cover_url
      await act(async () => {
        press(findByTestId(root, 'map-marker-prv-02'));
      });

      expect(hasTestId(root, 'map-popup-card')).toBe(true);
      expect(textOf(findByTestId(root, 'map-popup-name'))).toBe('Banquete Gourmet Granada');
      expect(hasTestId(root, 'map-popup-image')).toBe(false);
      // El placeholder muestra las iniciales 'BA'
      const cardText = textOf(findByTestId(root, 'map-popup-card'));
      expect(cardText).toContain('BA');
    });

    it('si la imagen de la tarjeta emergente falla al cargar (onError), muestra el placeholder neutro (HU_EU_02_08)', async () => {
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      // prv-01 tiene cover_url
      await act(async () => {
        press(findByTestId(root, 'map-marker-prv-01'));
      });

      expect(hasTestId(root, 'map-popup-image')).toBe(true);
      const img = findByTestId(root, 'map-popup-image');

      // Simular fallo de carga de imagen
      await act(async () => {
        img.props.onError();
      });

      // Desaparece la imagen y se muestra el placeholder neutro
      expect(hasTestId(root, 'map-popup-image')).toBe(false);
      expect(textOf(findByTestId(root, 'map-popup-card'))).toContain('HA');
    });

    it('al tocar otro marcador se actualiza la tarjeta con los datos del nuevo proveedor', async () => {
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      // Abrir prv-01
      await act(async () => {
        press(findByTestId(root, 'map-marker-prv-01'));
      });
      expect(textOf(findByTestId(root, 'map-popup-name'))).toBe('Hacienda Campestre Real');

      // Tocar directamente prv-02
      await act(async () => {
        press(findByTestId(root, 'map-marker-prv-02'));
      });
      expect(textOf(findByTestId(root, 'map-popup-name'))).toBe('Banquete Gourmet Granada');
    });
  });

  describe('5. Búsqueda por zona con bbox y filtros combinados (Criterios 2.4, 5 y ADR-13)', () => {
    it('botón Buscar en esta zona calcula el bbox de la región visible y consulta al API preservando filtros existentes', async () => {
      const getSpy = jest.spyOn(endpoints, 'getProviders');
      const root = await mountResultados({
        initialFlow: {
          filters: { category: 'espacio', min_price_cop: 1_000_000 },
          eventType: 'boda',
          guests: 100,
        },
      });

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      expect(SEARCH_THIS_ZONE_TEXT).toBe('Buscar en esta zona');
      const searchZoneBtn = findByTestId(root, 'btn-search-this-zone');
      expect(textOf(searchZoneBtn)).toContain('Buscar en esta zona');

      // Mover el mapa hacia el sur de Cali
      const map = findByTestId(root, 'results-map');
      await act(async () => {
        map.props.onRegionChangeComplete({
          latitude: 3.33,
          longitude: -76.54,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        });
      });

      // Presionar 'Buscar en esta zona'
      await act(async () => {
        press(searchZoneBtn);
      });

      // Verifica bbox calculado y preservación de category, min_price_cop, event_type y guests
      expect(getSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          bbox: '3.3000,-76.5700,3.3600,-76.5100',
          category: 'espacio',
          min_price_cop: 1_000_000,
          event_type: 'boda',
          guests: 100,
          page: 1,
        }),
        expect.any(Object),
      );
    });

    it('si la búsqueda por zona retorna 0 resultados, la pantalla actualiza el contador y limpia marcadores sin crashear', async () => {
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      expect(hasTestId(root, 'map-marker-prv-01')).toBe(true);

      // Simular respuesta con 0 proveedores en la zona
      jest.spyOn(endpoints, 'getProviders').mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        page_size: 10,
      });

      await act(async () => {
        press(findByTestId(root, 'btn-search-this-zone'));
      });

      // No hay marcadores en el mapa
      expect(hasTestId(root, 'map-marker-prv-01')).toBe(false);
      expect(hasTestId(root, 'map-marker-prv-02')).toBe(false);
      expect(textOf(findByTestId(root, 'results-count'))).toContain('0 resultados');

      // Al volver a la lista, se visualiza el estado vacío
      await act(async () => {
        press(findByTestId(root, 'btn-view-lista'));
      });

      expect(hasTestId(root, 'empty-results')).toBe(true);
      expect(textOf(findByTestId(root, 'empty-results'))).toContain(
        'No encontramos proveedores con esos criterios.',
      );
    });
  });

  describe('6. Casos de fallo en modo mapa (Criterio 6)', () => {
    it('criterio 6: si el mapa no carga, muestra mensaje literal y conmuta automáticamente a la lista', async () => {
      expect(MAP_LOAD_ERROR_MESSAGE).toBe(
        'No fue posible mostrar el mapa. Use la vista de lista.',
      );

      const root = await mountResultados({ simulateMapError: true });

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      // Vuelve automáticamente a la lista y muestra el aviso de error
      expect(hasTestId(root, 'results-scroll')).toBe(true);
      expect(hasTestId(root, 'map-container')).toBe(false);
      expect(hasTestId(root, 'map-load-error-banner')).toBe(true);
      expect(textOf(findByTestId(root, 'map-load-error-banner'))).toBe(
        'No fue posible mostrar el mapa. Use la vista de lista.',
      );
    });

    it('criterio 6: ante fallo de red en modo mapa muestra NetworkErrorView y permite reintentar con éxito', async () => {
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      const getSpy = jest
        .spyOn(endpoints, 'getProviders')
        .mockRejectedValueOnce(
          new NetworkError(
            'No hay conexión con el servidor. Revise su conexión e intente nuevamente.',
          ),
        )
        .mockResolvedValueOnce({
          items: sampleProviders,
          total: sampleProviders.length,
          page: 1,
          page_size: 10,
        });

      // Fallo de red al buscar en la zona
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

      expect(getSpy).toHaveBeenCalledTimes(3); // inicial + fallo + reintento
    });

    it('criterio 6: ante error inesperado (500) en modo mapa muestra mensaje literal y botón Reintentar', async () => {
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      const getSpy = jest
        .spyOn(endpoints, 'getProviders')
        .mockRejectedValueOnce(new Error('Internal Server Error 500'))
        .mockResolvedValueOnce({
          items: sampleProviders,
          total: sampleProviders.length,
          page: 1,
          page_size: 10,
        });

      // Error inesperado al buscar en la zona
      await act(async () => {
        press(findByTestId(root, 'btn-search-this-zone'));
      });

      const all = findAllText(root).join(' ');
      expect(all).toContain('No fue posible completar la operación. Intente nuevamente.');
      expect(all).toContain('Reintentar');

      // Reintentar limpia el error
      const retryBtn = root.queryAll(
        (n) => n.props.accessibilityRole === 'button' && textOf(n) === 'Reintentar',
      )[0];
      await act(async () => {
        press(retryBtn);
      });

      expect(getSpy).toHaveBeenCalled();
    });
  });

  describe('7. Mini-mapa en ficha del proveedor ProveedorScreen (Criterios 1, 3.1 y RN-28)', () => {
    it('si el proveedor tiene coordenadas válidas muestra mini-mapa con aviso Ubicación aproximada', async () => {
      expect(APPROXIMATE_LOCATION_TEXT).toBe('Ubicación aproximada');

      const root = await mountProveedor(sampleDetailWithCoords);

      expect(hasTestId(root, 'provider-mini-map-container')).toBe(true);
      expect(hasTestId(root, 'provider-mini-map')).toBe(true);
      expect(hasTestId(root, 'provider-mini-map-marker')).toBe(true);
      expect(textOf(findByTestId(root, 'provider-mini-map-notice'))).toBe(
        'Ubicación aproximada',
      );

      const map = findByTestId(root, 'provider-mini-map');
      expect(map.props.initialRegion.latitude).toBe(3.3245);
      expect(map.props.initialRegion.longitude).toBe(-76.5412);
      expect(map.props.scrollEnabled).toBe(false);
      expect(map.props.zoomEnabled).toBe(false);
    });

    it('si el proveedor no tiene coordenadas (null) NO muestra el mini-mapa ni su contenedor', async () => {
      const root = await mountProveedor(sampleDetailWithoutCoords);

      expect(hasTestId(root, 'provider-mini-map-container')).toBe(false);
      expect(hasTestId(root, 'provider-mini-map')).toBe(false);
    });

    it('si el proveedor tiene coordenadas fuera de rango no muestra el mini-mapa', async () => {
      const invalidCoordsDetail: Provider = {
        ...sampleDetailWithCoords,
        id: 'prv-invalid-range',
        latitude: 95.0,
        longitude: -76.5,
      };

      const root = await mountProveedor(invalidCoordsDetail);
      expect(hasTestId(root, 'provider-mini-map-container')).toBe(false);
      expect(hasTestId(root, 'provider-mini-map')).toBe(false);
    });
  });

  describe('8. Verificación de privacidad y restricciones (RN-28 y Criterio 4)', () => {
    it('no expone dirección exacta en ResultadosScreen ni en ProveedorScreen', async () => {
      const rootResultados = await mountResultados();
      const resultadosText = findAllText(rootResultados).join(' ');

      // Solo barrio y municipio, nunca calle, carrera, #, nomenclatura ni coordenadas completas
      expect(resultadosText).toContain('Pance');
      expect(resultadosText).not.toMatch(/Calle\s+\d+/i);
      expect(resultadosText).not.toMatch(/Carrera\s+\d+/i);

      const rootProveedor = await mountProveedor(sampleDetailWithCoords);
      const proveedorText = findAllText(rootProveedor).join(' ');
      expect(proveedorText).toContain('Pance, Cali');
      expect(proveedorText).not.toMatch(/Calle\s+\d+/i);
      expect(proveedorText).not.toMatch(/Carrera\s+\d+/i);
    });

    it('la ubicación GPS del usuario no se envía en ningún query al servidor ni se guarda en el contexto', async () => {
      const getSpy = jest.spyOn(endpoints, 'getProviders');
      const root = await mountResultados();

      await act(async () => {
        press(findByTestId(root, 'btn-view-mapa'));
      });

      await act(async () => {
        press(findByTestId(root, 'btn-search-this-zone'));
      });

      // getProviders se llama con bbox, pero NUNCA con user_lat, user_lon, user_location, gps, etc.
      const lastCallArgs = getSpy.mock.calls[getSpy.mock.calls.length - 1][0];
      expect(lastCallArgs).toHaveProperty('bbox');
      expect(lastCallArgs).not.toHaveProperty('user_lat');
      expect(lastCallArgs).not.toHaveProperty('user_lon');
      expect(lastCallArgs).not.toHaveProperty('latitude');
      expect(lastCallArgs).not.toHaveProperty('longitude');
      expect(lastCallArgs).not.toHaveProperty('user_location');
    });
  });
});
