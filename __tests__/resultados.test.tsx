import React, { act } from 'react';
import { Pressable, Text } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import { ApiError, NetworkError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { ProviderSummary, ProvidersResponse } from '../src/api/types';
import ResultadosScreen from '../src/screens/ResultadosScreen';
import { FlowProvider, useFlow, type FlowState } from '../src/state/FlowContext';
import { PRICE_MIN_GREATER_THAN_MAX_MESSAGE } from '../src/utils/validators';

const mockNavigate = jest.fn();
let mockRouteParams: Record<string, unknown> | undefined = undefined;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
  useRoute: () => ({
    params: mockRouteParams,
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

function makeProvider(index: number, overrides?: Partial<ProviderSummary>): ProviderSummary {
  return {
    id: `prv-${String(index).padStart(2, '0')}`,
    name: `Proveedor Cali ${index}`,
    categories: ['espacio', 'alimentacion'],
    neighborhood: 'Ciudad Jardín',
    municipality: 'Cali',
    latitude: 3.365,
    longitude: -76.531,
    cover_url: `https://picsum.photos/seed/prv-${index}/600/400`,
    rating_avg: 4.6,
    rating_count: 14,
    verification_status: 'verificado',
    price_from_cop: 1_200_000 + index * 50_000,
    featured: index <= 3,
    ...overrides,
  };
}

function FlowHarness({ initial }: { initial?: Partial<FlowState> }) {
  const { flow, update } = useFlow();
  const [mounted, setMounted] = React.useState(!initial);

  return (
    <>
      {!mounted ? (
        <Pressable
          testID="seed-flow"
          onPress={() => {
            if (initial) update(initial);
            setMounted(true);
          }}
        />
      ) : (
        <ResultadosScreen />
      )}
      <Text testID="flow-snapshot">{JSON.stringify(flow)}</Text>
    </>
  );
}

function getFlowSnapshot(root: TestInstance): FlowState {
  const node = findByTestId(root, 'flow-snapshot');
  return JSON.parse(textOf(node)) as FlowState;
}

describe('ResultadosScreen (HU_EU_02_05 — T_HU_EU_02_05_2)', () => {
  beforeEach(() => {
    mockRouteParams = undefined;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockNavigate.mockReset();
  });

  it('muestra tarjetas con foto, nombre, rubros, barrio/municipio, calificación o Sin reseñas, insignia Verificado, precio Desde, contador N resultados y controles (criterios 2.1, 2.2, 2.3, 3.2, 3.3 y 4)', async () => {
    const response: ProvidersResponse = {
      items: [
        makeProvider(1, {
          id: 'prv-salon-los-guaduales',
          name: 'Salón Los Guaduales',
          categories: ['espacio', 'decoracion'],
          neighborhood: 'Ciudad Jardín',
          municipality: 'Cali',
          rating_avg: 4.8,
          rating_count: 18,
          verification_status: 'verificado',
          price_from_cop: 1_600_000,
        }),
        makeProvider(2, {
          id: 'prv-terraza-san-antonio',
          name: 'Terraza San Antonio',
          categories: ['alimentacion'],
          neighborhood: 'San Antonio',
          municipality: 'Cali',
          cover_url: null,
          rating_avg: null,
          rating_count: 0,
          verification_status: 'en_revision',
          price_from_cop: 650_000,
        }),
      ],
      total: 2,
      page: 1,
      page_size: 10,
    };

    const spy = jest.spyOn(endpoints, 'getProviders').mockResolvedValueOnce(response);

    const root = createRoot();
    await act(async () => {
      root.render(
        <FlowProvider>
          <FlowHarness
            initial={{
              eventType: 'boda',
              guests: 100,
              filters: { category: 'espacio', event_type: 'boda', guests: 100 },
            }}
          />
        </FlowProvider>,
      );
    });

    await act(async () => {
      press(findByTestId(root.container, 'seed-flow'));
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'espacio',
        event_type: 'boda',
        guests: 100,
        page: 1,
        page_size: 10,
      }),
      expect.any(Object),
    );

    const allText = findAllText(root.container).join(' | ');

    // 2.2 Contador 'N resultados'
    expect(textOf(findByTestId(root.container, 'results-count'))).toContain('2 resultados');

    // 2.3 Acceso a filtros, orden y conmutador 'Lista / Mapa'
    expect(findByTestId(root.container, 'btn-filters')).toBeTruthy();
    expect(findByTestId(root.container, 'btn-sort')).toBeTruthy();
    expect(findByTestId(root.container, 'toggle-view-mode')).toBeTruthy();
    expect(allText).toContain('Lista');
    expect(allText).toContain('Mapa');

    // 2.1 Tarjeta 1: nombre, rubros, barrio y municipio, calificación con 1 decimal y reseñas, insignia 'Verificado' y precio 'Desde'
    expect(allText).toContain('Salón Los Guaduales');
    expect(allText).toContain('Espacio');
    expect(allText).toContain('Decoración');
    expect(allText).toContain('Ciudad Jardín · Cali');
    expect(allText).toContain('4.8');
    expect(allText).toContain('(18)');
    expect(allText).toContain('Verificado');
    expect(allText).toContain('Desde $1.600.000');

    // 2.1 y 3.3 Tarjeta 2: sin reseñas ('Sin reseñas'), sin insignia 'Verificado' y con recuadro neutro al no tener foto
    const card2 = findByTestId(root.container, 'provider-card-prv-terraza-san-antonio');
    const card2Text = textOf(card2);
    expect(card2Text).toContain('Terraza San Antonio');
    expect(card2Text).toContain('Alimentación');
    expect(card2Text).toContain('San Antonio · Cali');
    expect(card2Text).toContain('Sin reseñas');
    expect(card2Text).not.toContain('Verificado');
    expect(card2Text).toContain('Desde $650.000');
    expect(findByTestId(root.container, 'provider-placeholder-prv-terraza-san-antonio')).toBeTruthy();

    // Criterio 4: si una foto no carga se muestra un recuadro neutro, sin error
    const img1 = findByTestId(root.container, 'provider-image-prv-salon-los-guaduales');
    await act(async () => {
      img1.props.onError();
    });
    expect(
      findByTestId(root.container, 'provider-placeholder-prv-salon-los-guaduales'),
    ).toBeTruthy();
  });

  it('carga por páginas de 10 proveedores y muestra más al llegar al final; tocar una tarjeta abre la ficha del proveedor (criterio 5)', async () => {
    const page1Items = Array.from({ length: 10 }, (_, idx) => makeProvider(idx + 1));
    const page2Items = Array.from({ length: 6 }, (_, idx) => makeProvider(idx + 11));

    const spy = jest
      .spyOn(endpoints, 'getProviders')
      .mockResolvedValueOnce({
        items: page1Items,
        total: 16,
        page: 1,
        page_size: 10,
      })
      .mockResolvedValueOnce({
        items: page2Items,
        total: 16,
        page: 2,
        page_size: 10,
      });

    const root = createRoot();
    await act(async () => {
      root.render(
        <FlowProvider>
          <ResultadosScreen />
        </FlowProvider>,
      );
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, page_size: 10 }),
      expect.any(Object),
    );
    expect(textOf(findByTestId(root.container, 'results-count'))).toContain('16 resultados');
    expect(findByTestId(root.container, 'provider-card-prv-01')).toBeTruthy();
    expect(findByTestId(root.container, 'provider-card-prv-10')).toBeTruthy();
    expect(() => findByTestId(root.container, 'provider-card-prv-11')).toThrow();

    // Cargar página 2 al llegar al final / tocar Cargar más
    const loadMoreBtn = findByTestId(root.container, 'btn-load-more');
    await act(async () => {
      press(loadMoreBtn);
    });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, page_size: 10 }),
      expect.any(Object),
    );
    expect(findByTestId(root.container, 'provider-card-prv-11')).toBeTruthy();
    expect(findByTestId(root.container, 'provider-card-prv-16')).toBeTruthy();

    // Tocar una tarjeta abre la ficha del proveedor (HU_EU_02_08)
    await act(async () => {
      press(findByTestId(root.container, 'provider-card-prv-01'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('Proveedor', { providerId: 'prv-01' });
  });

  it('muestra estado vacío literal y acción Limpiar filtros cuando no hay resultados (criterio 6)', async () => {
    const spy = jest
      .spyOn(endpoints, 'getProviders')
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        page_size: 10,
      })
      .mockResolvedValueOnce({
        items: [makeProvider(1)],
        total: 1,
        page: 1,
        page_size: 10,
      });

    const root = createRoot();
    await act(async () => {
      root.render(
        <FlowProvider>
          <FlowHarness
            initial={{
              filters: { category: 'entretenimiento', verified: true },
            }}
          />
        </FlowProvider>,
      );
    });

    await act(async () => {
      press(findByTestId(root.container, 'seed-flow'));
    });

    const texts = findAllText(root.container);
    expect(texts).toContain('No encontramos proveedores con esos criterios.');
    expect(texts).toContain('Limpiar filtros');

    // Tocar 'Limpiar filtros' limpia los filtros en FlowContext y recarga la página 1
    await act(async () => {
      press(findByTestId(root.container, 'btn-clear-filters'));
    });

    expect(getFlowSnapshot(root.container).filters).toEqual({});
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(
      { page: 1, page_size: 10 },
      expect.any(Object),
    );
    expect(findByTestId(root.container, 'provider-card-prv-01')).toBeTruthy();
  });

  it('muestra error de red con Reintentar (HU_EU_01_04) y mensaje genérico ante fallo inesperado (criterio 6)', async () => {
    const spy = jest
      .spyOn(endpoints, 'getProviders')
      .mockRejectedValueOnce(new NetworkError())
      .mockRejectedValueOnce(
        new ApiError(
          500,
          'INTERNAL_ERROR',
          'No fue posible completar la operación. Intente nuevamente.',
        ),
      )
      .mockResolvedValueOnce({
        items: [makeProvider(1)],
        total: 1,
        page: 1,
        page_size: 10,
      });

    const root = createRoot();
    await act(async () => {
      root.render(
        <FlowProvider>
          <ResultadosScreen />
        </FlowProvider>,
      );
    });

    // Fallo de red
    expect(findAllText(root.container)).toContain(
      'No hay conexión con el servidor. Revise su conexión e intente nuevamente.',
    );
    expect(findAllText(root.container)).toContain('Reintentar');

    // Primer reintento -> falla con 500
    const retryNetworkBtn = root.container
      .queryAll((n) => n.props.accessibilityRole === 'button')
      .find((b) => textOf(b).includes('Reintentar'))!;
    await act(async () => {
      await press(retryNetworkBtn);
    });

    expect(findAllText(root.container)).toContain(
      'No fue posible completar la operación. Intente nuevamente.',
    );

    // Segundo reintento -> éxito
    await act(async () => {
      await press(findByTestId(root.container, 'btn-retry-providers'));
    });

    expect(spy).toHaveBeenCalledTimes(3);
    expect(findByTestId(root.container, 'provider-card-prv-01')).toBeTruthy();
  });

  describe('Casos tabulados de elegibilidad por invitados, precio Desde, paginación por scroll y estado vacío (T_HU_EU_02_05_4)', () => {
    interface SeedProviderFixture {
      provider: Omit<ProviderSummary, 'price_from_cop'>;
      services: {
        id: string;
        price_model: 'fijo' | 'por_invitado';
        unit_price_cop: number;
        min_guests: number;
        max_guests: number;
        event_types: ('cumpleanos' | 'boda' | 'xv')[];
      }[];
    }

    // Subconjunto representativo de la semilla de Cali y área metropolitana (BD §9.1 y §9.2)
    const SEED_FIXTURES: SeedProviderFixture[] = [
      {
        provider: {
          id: 'prv-terraza-san-antonio',
          name: 'Terraza San Antonio',
          categories: ['espacio'],
          neighborhood: 'San Antonio',
          municipality: 'Cali',
          latitude: 3.447,
          longitude: -76.54,
          cover_url: 'https://picsum.photos/seed/terraza/600/400',
          rating_avg: 4.3,
          rating_count: 6,
          verification_status: 'en_revision',
          featured: false,
        },
        services: [
          {
            id: 'svc-terraza-ahor',
            price_model: 'fijo',
            unit_price_cop: 650_000,
            min_guests: 15,
            max_guests: 40,
            event_types: ['cumpleanos'],
          },
          {
            id: 'svc-terraza-equi',
            price_model: 'fijo',
            unit_price_cop: 1_200_000,
            min_guests: 25,
            max_guests: 80,
            event_types: ['cumpleanos', 'boda'],
          },
        ],
      },
      {
        provider: {
          id: 'prv-salon-los-guaduales',
          name: 'Salón Los Guaduales',
          categories: ['espacio'],
          neighborhood: 'Ciudad Jardín',
          municipality: 'Cali',
          latitude: 3.365,
          longitude: -76.531,
          cover_url: 'https://picsum.photos/seed/guaduales/600/400',
          rating_avg: 4.8,
          rating_count: 18,
          verification_status: 'verificado',
          featured: true,
        },
        services: [
          {
            id: 'svc-guaduales-equi',
            price_model: 'fijo',
            unit_price_cop: 1_600_000,
            min_guests: 40,
            max_guests: 120,
            event_types: ['cumpleanos', 'xv'],
          },
          {
            id: 'svc-guaduales-prem',
            price_model: 'fijo',
            unit_price_cop: 3_800_000,
            min_guests: 80,
            max_guests: 250,
            event_types: ['boda', 'xv'],
          },
        ],
      },
      {
        provider: {
          id: 'prv-sabor-valluno',
          name: 'Sabor Valluno Catering',
          categories: ['alimentacion'],
          neighborhood: 'Granada',
          municipality: 'Cali',
          latitude: 3.458,
          longitude: -76.536,
          cover_url: 'https://picsum.photos/seed/sabor/600/400',
          rating_avg: 4.8,
          rating_count: 11,
          verification_status: 'verificado',
          featured: true,
        },
        services: [
          {
            id: 'svc-sabor-ahor',
            price_model: 'por_invitado',
            unit_price_cop: 14_000,
            min_guests: 20,
            max_guests: 300,
            event_types: ['cumpleanos', 'boda', 'xv'],
          },
          {
            id: 'svc-sabor-equi',
            price_model: 'por_invitado',
            unit_price_cop: 24_000,
            min_guests: 20,
            max_guests: 300,
            event_types: ['cumpleanos', 'boda', 'xv'],
          },
        ],
      },
      {
        provider: {
          id: 'prv-orquesta-canaveral',
          name: 'Orquesta Cañaveral',
          categories: ['entretenimiento'],
          neighborhood: 'Cañasgordas',
          municipality: 'Cali',
          latitude: 3.352,
          longitude: -76.538,
          cover_url: null,
          rating_avg: null,
          rating_count: 0,
          verification_status: 'verificado',
          featured: false,
        },
        services: [
          {
            id: 'svc-orquesta-equi',
            price_model: 'fijo',
            unit_price_cop: 900_000,
            min_guests: 1,
            max_guests: 200,
            event_types: ['boda'],
          },
          {
            id: 'svc-orquesta-prem',
            price_model: 'fijo',
            unit_price_cop: 1_900_000,
            min_guests: 1,
            max_guests: 500,
            event_types: ['cumpleanos', 'boda', 'xv'],
          },
        ],
      },
    ];

    /**
     * Simula el filtrado por capacidad/tipo de evento (RN-14), cálculo de price_from_cop (RN-15, RN-25)
     * y orden determinista (RN-26: destacados primero, mejor calificación y menor id en empate).
     */
    function simulateBackendProviders(query: {
      guests?: number;
      event_type?: 'cumpleanos' | 'boda' | 'xv';
    }): ProviderSummary[] {
      const results: ProviderSummary[] = [];

      for (const entry of SEED_FIXTURES) {
        const eligible = entry.services.filter((s) => {
          const matchesGuests =
            query.guests === undefined ||
            (query.guests >= s.min_guests && query.guests <= s.max_guests);
          const matchesEvent =
            query.event_type === undefined || s.event_types.includes(query.event_type);
          return matchesGuests && matchesEvent;
        });

        if (eligible.length === 0) continue;

        const costs = eligible.map((s) => {
          if (s.price_model === 'fijo') return s.unit_price_cop;
          const n = query.guests !== undefined ? query.guests : s.min_guests;
          return Math.round(s.unit_price_cop * n);
        });

        results.push({
          ...entry.provider,
          price_from_cop: Math.min(...costs),
        });
      }

      return results.sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        const rA = a.rating_avg ?? -1;
        const rB = b.rating_avg ?? -1;
        if (rA !== rB) return rB - rA;
        return a.id.localeCompare(b.id);
      });
    }

    it.each([
      {
        caso: 'sin invitados ni tipo -> 4 proveedores; Sabor Valluno usa capacidad mínima (20 × $14.000 = $280.000) y Terraza usa el menor fijo ($650.000)',
        guests: null,
        eventType: null,
        expectedIds: [
          // Empate en featured=true y rating=4.8: 'prv-sabor-valluno' < 'prv-salon-los-guaduales'
          'prv-sabor-valluno',
          'prv-salon-los-guaduales',
          'prv-terraza-san-antonio',
          'prv-orquesta-canaveral',
        ],
        expectedPricesText: [
          'Desde $280.000',
          'Desde $1.600.000',
          'Desde $650.000',
          'Desde $900.000',
        ],
      },
      {
        caso: '30 invitados y cumpleaños -> excluye Salón Los Guaduales (mínimo 40); Sabor Valluno cuesta 30 × $14.000 = $420.000; Terraza cuesta $650.000',
        guests: 30,
        eventType: 'cumpleanos' as const,
        expectedIds: [
          'prv-sabor-valluno',
          'prv-terraza-san-antonio',
          'prv-orquesta-canaveral',
        ],
        expectedPricesText: [
          'Desde $420.000',
          'Desde $650.000',
          'Desde $1.900.000', // el de $900.000 es solo boda
        ],
      },
      {
        caso: '100 invitados y boda -> excluye Terraza (máx 80); Salón Los Guaduales usa salón de boda ($3.800.000); Sabor Valluno cuesta 100 × $14.000 = $1.400.000',
        guests: 100,
        eventType: 'boda' as const,
        expectedIds: [
          'prv-sabor-valluno',
          'prv-salon-los-guaduales',
          'prv-orquesta-canaveral',
        ],
        expectedPricesText: [
          'Desde $1.400.000',
          'Desde $3.800.000',
          'Desde $900.000',
        ],
      },
      {
        caso: '400 invitados y XV años -> solo Orquesta Cañaveral cubre hasta 500 invitados ($1.900.000)',
        guests: 400,
        eventType: 'xv' as const,
        expectedIds: ['prv-orquesta-canaveral'],
        expectedPricesText: ['Desde $1.900.000'],
      },
    ])(
      'verifica elegibilidad por invitados, precio Desde y orden determinista: $caso (criterios 3.1, 3.2, 3.3 y 4)',
      async ({ guests, eventType, expectedIds, expectedPricesText }) => {
        const items = simulateBackendProviders({
          guests: guests ?? undefined,
          event_type: eventType ?? undefined,
        });

        const spy = jest.spyOn(endpoints, 'getProviders').mockResolvedValueOnce({
          items,
          total: items.length,
          page: 1,
          page_size: 10,
        });

        const root = createRoot();
        await act(async () => {
          root.render(
            <FlowProvider>
              <FlowHarness
                initial={{
                  guests,
                  eventType,
                  filters: {
                    ...(guests !== null ? { guests } : {}),
                    ...(eventType !== null ? { event_type: eventType } : {}),
                  },
                }}
              />
            </FlowProvider>,
          );
        });

        await act(async () => {
          press(findByTestId(root.container, 'seed-flow'));
        });

        expect(spy).toHaveBeenCalledWith(
          expect.objectContaining({
            ...(guests !== null ? { guests } : {}),
            ...(eventType !== null ? { event_type: eventType } : {}),
            page: 1,
            page_size: 10,
          }),
          expect.any(Object),
        );

        expect(textOf(findByTestId(root.container, 'results-count'))).toContain(
          `${expectedIds.length} resultados`,
        );

        const renderedCardNodes = root.container.queryAll(
          (n) =>
            typeof n.props.testID === 'string' &&
            n.props.testID.startsWith('provider-card-'),
        );
        const renderedIds = renderedCardNodes.map((n) =>
          (n.props.testID as string).replace('provider-card-', ''),
        );
        expect(renderedIds).toEqual(expectedIds);

        renderedCardNodes.forEach((cardNode, idx) => {
          expect(textOf(cardNode)).toContain(expectedPricesText[idx]);
        });
      },
    );

    it('carga la siguiente página automáticamente al hacer scroll hasta el final y oculta el botón cuando ya se cargaron todos (criterio 5)', async () => {
      const page1 = Array.from({ length: 10 }, (_, idx) => makeProvider(idx + 1));
      const page2 = Array.from({ length: 6 }, (_, idx) => makeProvider(idx + 11));

      const spy = jest
        .spyOn(endpoints, 'getProviders')
        .mockResolvedValueOnce({
          items: page1,
          total: 16,
          page: 1,
          page_size: 10,
        })
        .mockResolvedValueOnce({
          items: page2,
          total: 16,
          page: 2,
          page_size: 10,
        });

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <ResultadosScreen />
          </FlowProvider>,
        );
      });

      expect(spy).toHaveBeenCalledTimes(1);
      expect(findByTestId(root.container, 'btn-load-more')).toBeTruthy();

      // Simular scroll cerca del final (distanceFromBottom = 50 <= 120)
      const scrollView = findByTestId(root.container, 'results-scroll');
      await act(async () => {
        scrollView.props.onScroll({
          nativeEvent: {
            layoutMeasurement: { height: 600, width: 390 },
            contentOffset: { y: 1150, x: 0 },
            contentSize: { height: 1800, width: 390 },
          },
        });
      });

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, page_size: 10 }),
        expect.any(Object),
      );
      expect(findByTestId(root.container, 'provider-card-prv-16')).toBeTruthy();

      // Al completar los 16 resultados, el botón de paginación desaparece y otro scroll no pide página 3
      expect(() => findByTestId(root.container, 'btn-load-more')).toThrow();
      await act(async () => {
        scrollView.props.onScroll({
          nativeEvent: {
            layoutMeasurement: { height: 600, width: 390 },
            contentOffset: { y: 2000, x: 0 },
            contentSize: { height: 2500, width: 390 },
          },
        });
      });
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('HU_EU_02_15 — T_HU_EU_02_15_2: Hoja de Filtros, hoja de Ordenar y chips de filtros activos', () => {
    beforeEach(() => {
      mockRouteParams = undefined;
    });

    afterEach(() => {
      jest.restoreAllMocks();
      mockNavigate.mockReset();
    });

    it('abre y cierra la hoja de Filtros y la hoja de Ordenar (criterio 1)', async () => {
      jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
        items: [makeProvider(1)],
        total: 1,
        page: 1,
        page_size: 10,
      });

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <ResultadosScreen />
          </FlowProvider>,
        );
      });

      // Inicialmente las hojas están cerradas
      expect(hasTestId(root.container, 'filters-sheet')).toBe(false);
      expect(hasTestId(root.container, 'sort-sheet')).toBe(false);

      // 1. Abrir hoja de Filtros
      await act(async () => {
        press(findByTestId(root.container, 'btn-filters'));
      });
      expect(hasTestId(root.container, 'filters-sheet')).toBe(true);
      expect(textOf(findByTestId(root.container, 'filters-sheet-title'))).toBe('Filtros');

      // Cerrar hoja de Filtros
      await act(async () => {
        press(findByTestId(root.container, 'btn-close-filters'));
      });
      expect(hasTestId(root.container, 'filters-sheet')).toBe(false);

      // 2. Abrir hoja de Ordenar
      await act(async () => {
        press(findByTestId(root.container, 'btn-sort'));
      });
      expect(hasTestId(root.container, 'sort-sheet')).toBe(true);
      expect(textOf(findByTestId(root.container, 'sort-sheet-title'))).toContain('Ordenar');

      // Cerrar hoja de Ordenar
      await act(async () => {
        press(findByTestId(root.container, 'btn-close-sort'));
      });
      expect(hasTestId(root.container, 'sort-sheet')).toBe(false);
    });

    it('permite seleccionar rubro, tipo de evento, rango de precio, calificación y solo verificados, y aplica a la consulta (criterios 2.1 a 2.5, 2.7 y 5)', async () => {
      const spy = jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
        items: [makeProvider(1)],
        total: 1,
        page: 1,
        page_size: 10,
      });

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <ResultadosScreen />
          </FlowProvider>,
        );
      });

      // Abre Filtros
      await act(async () => {
        press(findByTestId(root.container, 'btn-filters'));
      });

      // Selecciona rubro decoracion
      await act(async () => {
        press(findByTestId(root.container, 'filter-rubro-decoracion'));
      });
      expect(findByTestId(root.container, 'filter-rubro-decoracion').props.accessibilityState).toMatchObject({
        selected: true,
      });

      // Selecciona tipo de evento boda
      await act(async () => {
        press(findByTestId(root.container, 'filter-event-type-boda'));
      });
      expect(findByTestId(root.container, 'filter-event-type-boda').props.accessibilityState).toMatchObject({
        selected: true,
      });

      // Ingresa rango de precio
      await act(async () => {
        findByTestId(root.container, 'input-min-price').props.onChangeText('1500000');
        findByTestId(root.container, 'input-max-price').props.onChangeText('4500000');
      });

      // Selecciona calificación 4
      await act(async () => {
        press(findByTestId(root.container, 'filter-rating-4'));
      });
      expect(findByTestId(root.container, 'filter-rating-4').props.accessibilityState).toMatchObject({
        selected: true,
      });

      // Activa switch solo verificados
      await act(async () => {
        press(findByTestId(root.container, 'toggle-only-verified'));
      });

      // Aplica los filtros
      await act(async () => {
        press(findByTestId(root.container, 'btn-apply-filters'));
      });

      // La hoja se cierra
      expect(hasTestId(root.container, 'filters-sheet')).toBe(false);

      // GET /providers es llamado con todos los filtros aplicados
      expect(spy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          category: 'decoracion',
          event_type: 'boda',
          min_price_cop: 1_500_000,
          max_price_cop: 4_500_000,
          min_rating: 4,
          verified: true,
          page: 1,
          page_size: 10,
        }),
        expect.any(Object),
      );
    });

    it('valida que precio mínimo no sea mayor que precio máximo y bloquea Aplicar mostrando mensaje literal (criterio 3.1 y 3.2)', async () => {
      const spy = jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
        items: [makeProvider(1)],
        total: 1,
        page: 1,
        page_size: 10,
      });

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <ResultadosScreen />
          </FlowProvider>,
        );
      });

      // Abre Filtros
      await act(async () => {
        press(findByTestId(root.container, 'btn-filters'));
      });

      // Ingresa min > max
      await act(async () => {
        findByTestId(root.container, 'input-min-price').props.onChangeText('6000000');
        findByTestId(root.container, 'input-max-price').props.onChangeText('2000000');
      });

      // Intenta aplicar
      await act(async () => {
        press(findByTestId(root.container, 'btn-apply-filters'));
      });

      // La hoja permanece abierta y muestra el error literal
      expect(hasTestId(root.container, 'filters-sheet')).toBe(true);
      expect(hasTestId(root.container, 'error-price-range')).toBe(true);
      expect(textOf(findByTestId(root.container, 'error-price-range'))).toBe(
        PRICE_MIN_GREATER_THAN_MAX_MESSAGE,
      );
      expect(textOf(findByTestId(root.container, 'error-price-range'))).toBe(
        'El precio mínimo no puede ser mayor que el máximo.',
      );

      // Corrige precio max a 8000000 (> min 6000000)
      await act(async () => {
        findByTestId(root.container, 'input-max-price').props.onChangeText('8000000');
      });

      expect(hasTestId(root.container, 'error-price-range')).toBe(false);

      // Ahora aplicar procede exitosamente
      await act(async () => {
        press(findByTestId(root.container, 'btn-apply-filters'));
      });

      expect(hasTestId(root.container, 'filters-sheet')).toBe(false);
      expect(spy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          min_price_cop: 6_000_000,
          max_price_cop: 8_000_000,
        }),
        expect.any(Object),
      );
    });

    it.each([
      ['recomendados', 'sort-option-recomendados'],
      ['precio_asc', 'sort-option-precio_asc'],
      ['precio_desc', 'sort-option-precio_desc'],
      ['calificacion', 'sort-option-calificacion'],
    ] as const)(
      'permite seleccionar el orden %s y lo envía a la consulta según RN-26 (criterios 2.6 y 3.3)',
      async (sortOrder, sortOptionTestId) => {
        const spy = jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
          items: [makeProvider(1)],
          total: 1,
          page: 1,
          page_size: 10,
        });

        const root = createRoot();
        await act(async () => {
          root.render(
            <FlowProvider>
              <ResultadosScreen />
            </FlowProvider>,
          );
        });

        // Abre hoja de Ordenar
        await act(async () => {
          press(findByTestId(root.container, 'btn-sort'));
        });

        // Selecciona la opción
        await act(async () => {
          press(findByTestId(root.container, sortOptionTestId));
        });

        // Aplica
        await act(async () => {
          press(findByTestId(root.container, 'btn-apply-sort'));
        });

        expect(hasTestId(root.container, 'sort-sheet')).toBe(false);
        expect(spy).toHaveBeenLastCalledWith(
          expect.objectContaining({
            sort: sortOrder,
            page: 1,
          }),
          expect.any(Object),
        );
      },
    );

    it('muestra chips con los filtros activos y permite quitar un filtro a la vez actualizando la lista (criterios 2.7 y 5)', async () => {
      const spy = jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
        items: [makeProvider(1)],
        total: 1,
        page: 1,
        page_size: 10,
      });

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <FlowHarness
              initial={{
                filters: {
                  category: 'espacio',
                  event_type: 'boda',
                  min_price_cop: 1_000_000,
                  max_price_cop: 5_000_000,
                  min_rating: 4,
                  verified: true,
                  sort: 'precio_asc',
                },
              }}
            />
          </FlowProvider>,
        );
      });

      await act(async () => {
        press(findByTestId(root.container, 'seed-flow'));
      });

      // Verifica presencia de chips activos
      expect(hasTestId(root.container, 'active-filters-chips')).toBe(true);
      expect(hasTestId(root.container, 'chip-category')).toBe(true);
      expect(textOf(findByTestId(root.container, 'chip-category'))).toContain('Espacio');

      expect(hasTestId(root.container, 'chip-event-type')).toBe(true);
      expect(textOf(findByTestId(root.container, 'chip-event-type'))).toContain('Boda');

      expect(hasTestId(root.container, 'chip-price')).toBe(true);
      expect(textOf(findByTestId(root.container, 'chip-price'))).toContain('$1.000.000 - $5.000.000');

      expect(hasTestId(root.container, 'chip-rating')).toBe(true);
      expect(textOf(findByTestId(root.container, 'chip-rating'))).toContain('★ 4+');

      expect(hasTestId(root.container, 'chip-verified')).toBe(true);
      expect(textOf(findByTestId(root.container, 'chip-verified'))).toContain('Solo verificados');

      expect(hasTestId(root.container, 'chip-sort')).toBe(true);
      expect(textOf(findByTestId(root.container, 'chip-sort'))).toContain('Menor precio');

      // 1. Quitar filtro de rubro
      await act(async () => {
        press(findByTestId(root.container, 'chip-remove-category'));
      });

      expect(hasTestId(root.container, 'chip-category')).toBe(false);
      expect(hasTestId(root.container, 'chip-event-type')).toBe(true);
      expect(spy).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ category: 'espacio' }),
        expect.any(Object),
      );

      // 2. Quitar filtro de precio
      await act(async () => {
        press(findByTestId(root.container, 'chip-remove-price'));
      });

      expect(hasTestId(root.container, 'chip-price')).toBe(false);
      expect(spy).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ min_price_cop: 1_000_000 }),
        expect.any(Object),
      );

      // 3. Quitar filtro de calificación
      await act(async () => {
        press(findByTestId(root.container, 'chip-remove-rating'));
      });

      expect(hasTestId(root.container, 'chip-rating')).toBe(false);

      // 4. Quitar filtro de verificación
      await act(async () => {
        press(findByTestId(root.container, 'chip-remove-verified'));
      });

      expect(hasTestId(root.container, 'chip-verified')).toBe(false);

      // 5. Quitar filtro de orden
      await act(async () => {
        press(findByTestId(root.container, 'chip-remove-sort'));
      });

      expect(hasTestId(root.container, 'chip-sort')).toBe(false);
    });

    it('la acción Limpiar filtros dentro de la hoja restablece los campos del borrador (criterio 2.7)', async () => {
      jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
        items: [makeProvider(1)],
        total: 1,
        page: 1,
        page_size: 10,
      });

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <FlowHarness
              initial={{
                filters: {
                  category: 'espacio',
                  min_price_cop: 2_000_000,
                  min_rating: 4.5,
                  verified: true,
                },
              }}
            />
          </FlowProvider>,
        );
      });

      await act(async () => {
        press(findByTestId(root.container, 'seed-flow'));
      });

      // Abre Filtros
      await act(async () => {
        press(findByTestId(root.container, 'btn-filters'));
      });

      // Presiona Limpiar filtros dentro de la hoja
      await act(async () => {
        press(findByTestId(root.container, 'btn-clear-filters-sheet'));
      });

      // Aplica los filtros limpios
      await act(async () => {
        press(findByTestId(root.container, 'btn-apply-filters'));
      });

      const snapshot = getFlowSnapshot(root.container);
      expect(snapshot.filters.category).toBeUndefined();
      expect(snapshot.filters.min_price_cop).toBeUndefined();
      expect(snapshot.filters.min_rating).toBeUndefined();
      expect(snapshot.filters.verified).toBeUndefined();
    });

    it('conserva los filtros y el orden elegidos al abrir una ficha y volver (criterio 4)', async () => {
      jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
        items: [makeProvider(1, { id: 'prv-01' })],
        total: 1,
        page: 1,
        page_size: 10,
      });

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <FlowHarness
              initial={{
                filters: {
                  category: 'espacio',
                  sort: 'precio_desc',
                },
              }}
            />
          </FlowProvider>,
        );
      });

      await act(async () => {
        press(findByTestId(root.container, 'seed-flow'));
      });

      // Tocar la tarjeta navega a la ficha del proveedor
      await act(async () => {
        press(findByTestId(root.container, 'provider-card-prv-01'));
      });

      expect(mockNavigate).toHaveBeenCalledWith('Proveedor', { providerId: 'prv-01' });

      // Los filtros y el orden permanecen intactos en el FlowContext al volver
      const snapshot = getFlowSnapshot(root.container);
      expect(snapshot.filters.category).toBe('espacio');
      expect(snapshot.filters.sort).toBe('precio_desc');
    });
  });

  describe('T_HU_EU_02_15_3: Pruebas de filtros combinados tabulados, orden RN-26 y validación de precios', () => {
    beforeEach(() => {
      mockRouteParams = undefined;
    });

    afterEach(() => {
      jest.restoreAllMocks();
      mockNavigate.mockReset();
    });

    interface TabulatedCase {
      scenario: string;
      initial: Partial<FlowState>;
      expectedQuery: Record<string, unknown>;
      expectedChips: { testID: string; labelSubstring: string }[];
      expectedFilterBadgeCount: number;
      expectedSortToolbarText: string;
    }

    const TABULATED_CASES: TabulatedCase[] = [
      {
        scenario: 'Rubro (alimentacion) + Tipo de evento (xv)',
        initial: {
          filters: { category: 'alimentacion', event_type: 'xv' },
        },
        expectedQuery: { category: 'alimentacion', event_type: 'xv' },
        expectedChips: [
          { testID: 'chip-category', labelSubstring: 'Alimentación' },
          { testID: 'chip-event-type', labelSubstring: 'XV años' },
        ],
        expectedFilterBadgeCount: 2,
        expectedSortToolbarText: 'Ordenar',
      },
      {
        scenario: 'Rubro (entretenimiento) + Rango completo de precio (500.000 a 2.000.000) + Orden Menor precio',
        initial: {
          filters: {
            category: 'entretenimiento',
            min_price_cop: 500_000,
            max_price_cop: 2_000_000,
            sort: 'precio_asc',
          },
        },
        expectedQuery: {
          category: 'entretenimiento',
          min_price_cop: 500_000,
          max_price_cop: 2_000_000,
          sort: 'precio_asc',
        },
        expectedChips: [
          { testID: 'chip-category', labelSubstring: 'Entretenimiento' },
          { testID: 'chip-price', labelSubstring: '$500.000 - $2.000.000' },
          { testID: 'chip-sort', labelSubstring: 'Menor precio' },
        ],
        expectedFilterBadgeCount: 2,
        expectedSortToolbarText: 'Menor precio',
      },
      {
        scenario: 'Calificación mínima (4,5) + Solo verificados (true) + Orden Mejor calificados',
        initial: {
          filters: {
            min_rating: 4.5,
            verified: true,
            sort: 'calificacion',
          },
        },
        expectedQuery: {
          min_rating: 4.5,
          verified: true,
          sort: 'calificacion',
        },
        expectedChips: [
          { testID: 'chip-rating', labelSubstring: '★ 4.5+' },
          { testID: 'chip-verified', labelSubstring: 'Solo verificados' },
          { testID: 'chip-sort', labelSubstring: 'Mejor calificados' },
        ],
        expectedFilterBadgeCount: 2,
        expectedSortToolbarText: 'Mejor calificados',
      },
      {
        scenario: 'Todos los filtros activos (espacio, boda, precio 1M-10M, 4 estrellas, verificados) + Mayor precio',
        initial: {
          filters: {
            category: 'espacio',
            event_type: 'boda',
            min_price_cop: 1_000_000,
            max_price_cop: 10_000_000,
            min_rating: 4,
            verified: true,
            sort: 'precio_desc',
          },
        },
        expectedQuery: {
          category: 'espacio',
          event_type: 'boda',
          min_price_cop: 1_000_000,
          max_price_cop: 10_000_000,
          min_rating: 4,
          verified: true,
          sort: 'precio_desc',
        },
        expectedChips: [
          { testID: 'chip-category', labelSubstring: 'Espacio' },
          { testID: 'chip-event-type', labelSubstring: 'Boda' },
          { testID: 'chip-price', labelSubstring: '$1.000.000 - $10.000.000' },
          { testID: 'chip-rating', labelSubstring: '★ 4+' },
          { testID: 'chip-verified', labelSubstring: 'Solo verificados' },
          { testID: 'chip-sort', labelSubstring: 'Mayor precio' },
        ],
        expectedFilterBadgeCount: 5,
        expectedSortToolbarText: 'Mayor precio',
      },
      {
        scenario: 'Solo precio mínimo (Desde $ 3.000.000) sin máximo',
        initial: {
          filters: {
            min_price_cop: 3_000_000,
          },
        },
        expectedQuery: {
          min_price_cop: 3_000_000,
        },
        expectedChips: [
          { testID: 'chip-price', labelSubstring: 'Desde $3.000.000' },
        ],
        expectedFilterBadgeCount: 1,
        expectedSortToolbarText: 'Ordenar',
      },
      {
        scenario: 'Solo precio máximo (Hasta $ 8.000.000) sin mínimo',
        initial: {
          filters: {
            max_price_cop: 8_000_000,
          },
        },
        expectedQuery: {
          max_price_cop: 8_000_000,
        },
        expectedChips: [
          { testID: 'chip-price', labelSubstring: 'Hasta $8.000.000' },
        ],
        expectedFilterBadgeCount: 1,
        expectedSortToolbarText: 'Ordenar',
      },
      {
        scenario: 'Tipo de evento (Cumpleaños) + Calificación mínima (3+)',
        initial: {
          filters: {
            event_type: 'cumpleanos',
            min_rating: 3,
          },
        },
        expectedQuery: {
          event_type: 'cumpleanos',
          min_rating: 3,
        },
        expectedChips: [
          { testID: 'chip-event-type', labelSubstring: 'Cumpleaños' },
          { testID: 'chip-rating', labelSubstring: '★ 3+' },
        ],
        expectedFilterBadgeCount: 2,
        expectedSortToolbarText: 'Ordenar',
      },
    ];

    it.each(TABULATED_CASES)(
      'aplica la combinación tabulada "$scenario" enviando la consulta exacta y mostrando sus chips (criterios 2.1-2.7 y 5)',
      async ({
        initial,
        expectedQuery,
        expectedChips,
        expectedFilterBadgeCount,
        expectedSortToolbarText,
      }) => {
        const spy = jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
          items: [makeProvider(1)],
          total: 1,
          page: 1,
          page_size: 10,
        });

        const root = createRoot();
        await act(async () => {
          root.render(
            <FlowProvider>
              <FlowHarness initial={initial} />
            </FlowProvider>,
          );
        });

        await act(async () => {
          press(findByTestId(root.container, 'seed-flow'));
        });

        // 1. Verifica llamada a getProviders con los parámetros esperados
        expect(spy).toHaveBeenCalledWith(
          expect.objectContaining({
            ...expectedQuery,
            page: 1,
            page_size: 10,
          }),
          expect.any(Object),
        );

        // 2. Verifica contador en el botón de Filtros
        const btnFilters = findByTestId(root.container, 'btn-filters');
        if (expectedFilterBadgeCount > 0) {
          expect(textOf(btnFilters)).toContain(`Filtros (${expectedFilterBadgeCount})`);
        } else {
          expect(textOf(btnFilters)).toBe('Filtros');
        }

        // 3. Verifica etiqueta en el botón de Ordenar
        const btnSort = findByTestId(root.container, 'btn-sort');
        expect(textOf(btnSort)).toContain(expectedSortToolbarText);

        // 4. Verifica presencia y texto de cada chip esperado
        expect(hasTestId(root.container, 'active-filters-chips')).toBe(true);
        for (const chip of expectedChips) {
          expect(hasTestId(root.container, chip.testID)).toBe(true);
          const chipNode = findByTestId(root.container, chip.testID);
          expect(textOf(chipNode)).toContain(chip.labelSubstring);
        }
      },
    );

    it('rechaza precio mínimo mayor que el máximo con mensaje literal y no aplica ni cierra la hoja (criterio 3.1)', async () => {
      const spy = jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
        items: [makeProvider(1)],
        total: 1,
        page: 1,
        page_size: 10,
      });

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <ResultadosScreen />
          </FlowProvider>,
        );
      });

      // Abre Filtros
      await act(async () => {
        press(findByTestId(root.container, 'btn-filters'));
      });

      // Ingresa precio min: 7.000.000 y max: 3.000.000
      await act(async () => {
        findByTestId(root.container, 'input-min-price').props.onChangeText('7000000');
        findByTestId(root.container, 'input-max-price').props.onChangeText('3000000');
      });

      const callsBefore = spy.mock.calls.length;

      // Presiona Aplicar
      await act(async () => {
        press(findByTestId(root.container, 'btn-apply-filters'));
      });

      // Permanece abierta la hoja y muestra el error literal
      expect(hasTestId(root.container, 'filters-sheet')).toBe(true);
      expect(hasTestId(root.container, 'error-price-range')).toBe(true);
      expect(textOf(findByTestId(root.container, 'error-price-range'))).toBe(
        'El precio mínimo no puede ser mayor que el máximo.',
      );

      // No se realizó una nueva llamada al API con ese rango inválido
      expect(spy).toHaveBeenCalledTimes(callsBefore);
    });

    it('permite aplicar cuando precio mínimo es exactamente igual al máximo (caso borde min == max)', async () => {
      const spy = jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
        items: [makeProvider(1)],
        total: 1,
        page: 1,
        page_size: 10,
      });

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <ResultadosScreen />
          </FlowProvider>,
        );
      });

      // Abre Filtros
      await act(async () => {
        press(findByTestId(root.container, 'btn-filters'));
      });

      // Ingresa precio min == max (2.500.000)
      await act(async () => {
        findByTestId(root.container, 'input-min-price').props.onChangeText('2500000');
        findByTestId(root.container, 'input-max-price').props.onChangeText('2500000');
      });

      // Presiona Aplicar
      await act(async () => {
        press(findByTestId(root.container, 'btn-apply-filters'));
      });

      // Se cierra la hoja y se envía la consulta con ambos valores iguales
      expect(hasTestId(root.container, 'filters-sheet')).toBe(false);
      expect(spy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          min_price_cop: 2_500_000,
          max_price_cop: 2_500_000,
        }),
        expect.any(Object),
      );
    });

    it('sanitiza caracteres no numéricos en los campos de precio aceptando solo números enteros (criterio 3.2)', async () => {
      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <ResultadosScreen />
          </FlowProvider>,
        );
      });

      // Abre Filtros
      await act(async () => {
        press(findByTestId(root.container, 'btn-filters'));
      });

      // Escribe texto con letras, símbolos y puntos
      await act(async () => {
        findByTestId(root.container, 'input-min-price').props.onChangeText('$ 1.250.000 COP');
        findByTestId(root.container, 'input-max-price').props.onChangeText('4.800.000,00');
      });

      // Solo quedan los dígitos numéricos
      expect(findByTestId(root.container, 'input-min-price').props.value).toBe('1250000');
      expect(findByTestId(root.container, 'input-max-price').props.value).toBe('480000000');
    });

    it('muestra el estado vacío literal con botón Limpiar filtros cuando no hay resultados (criterio 6)', async () => {
      const spy = jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        page_size: 10,
      });

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <FlowHarness
              initial={{
                filters: {
                  category: 'entretenimiento',
                  min_rating: 4.5,
                },
              }}
            />
          </FlowProvider>,
        );
      });

      await act(async () => {
        press(findByTestId(root.container, 'seed-flow'));
      });

      // Se muestra la tarjeta de vacío con el mensaje literal
      expect(hasTestId(root.container, 'empty-results')).toBe(true);
      const emptyNode = findByTestId(root.container, 'empty-results');
      expect(textOf(emptyNode)).toContain('No encontramos proveedores con esos criterios.');

      // Botón Limpiar filtros disponible
      expect(hasTestId(root.container, 'btn-clear-filters')).toBe(true);

      // Ahora simula que al limpiar hay resultados
      spy.mockResolvedValueOnce({
        items: [makeProvider(1)],
        total: 1,
        page: 1,
        page_size: 10,
      });

      // Presiona Limpiar filtros en el estado vacío
      await act(async () => {
        press(findByTestId(root.container, 'btn-clear-filters'));
      });

      // Se limpia el estado del flujo
      const snapshot = getFlowSnapshot(root.container);
      expect(snapshot.filters.category).toBeUndefined();
      expect(snapshot.filters.min_rating).toBeUndefined();
    });

    it('permite quitar el chip de orden restableciendo el orden a recomendados (criterios 2.6 y 5)', async () => {
      const spy = jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
        items: [makeProvider(1)],
        total: 1,
        page: 1,
        page_size: 10,
      });

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <FlowHarness
              initial={{
                filters: {
                  sort: 'precio_desc',
                },
              }}
            />
          </FlowProvider>,
        );
      });

      await act(async () => {
        press(findByTestId(root.container, 'seed-flow'));
      });

      // El chip de orden existe
      expect(hasTestId(root.container, 'chip-sort')).toBe(true);
      expect(textOf(findByTestId(root.container, 'chip-sort'))).toContain('Mayor precio');

      // Remueve el chip de orden
      await act(async () => {
        press(findByTestId(root.container, 'chip-remove-sort'));
      });

      // El chip desaparece
      expect(hasTestId(root.container, 'chip-sort')).toBe(false);

      // El botón en el toolbar vuelve a 'Ordenar'
      expect(textOf(findByTestId(root.container, 'btn-sort'))).toBe('Ordenar');

      // FlowContext ya no tiene sort 'precio_desc'
      const snapshot = getFlowSnapshot(root.container);
      expect(snapshot.filters.sort).toBeUndefined();

      // getProviders es llamado con baseQuery sin sort
      expect(spy).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ sort: 'precio_desc' }),
        expect.any(Object),
      );
    });

    it('permite remover chips de filtros secuencialmente y usar Limpiar filtros en chips (criterios 2.7 y 5)', async () => {
      jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
        items: [makeProvider(1)],
        total: 1,
        page: 1,
        page_size: 10,
      });

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <FlowHarness
              initial={{
                filters: {
                  category: 'decoracion',
                  event_type: 'boda',
                  min_rating: 4,
                  verified: true,
                },
              }}
            />
          </FlowProvider>,
        );
      });

      await act(async () => {
        press(findByTestId(root.container, 'seed-flow'));
      });

      // 4 chips iniciales
      expect(hasTestId(root.container, 'chip-category')).toBe(true);
      expect(hasTestId(root.container, 'chip-event-type')).toBe(true);
      expect(hasTestId(root.container, 'chip-rating')).toBe(true);
      expect(hasTestId(root.container, 'chip-verified')).toBe(true);

      // Quitar rubro decoracion
      await act(async () => {
        press(findByTestId(root.container, 'chip-remove-category'));
      });
      expect(hasTestId(root.container, 'chip-category')).toBe(false);
      expect(hasTestId(root.container, 'chip-event-type')).toBe(true);
      expect(hasTestId(root.container, 'chip-rating')).toBe(true);
      expect(hasTestId(root.container, 'chip-verified')).toBe(true);

      // Quitar tipo de evento
      await act(async () => {
        press(findByTestId(root.container, 'chip-remove-event-type'));
      });
      expect(hasTestId(root.container, 'chip-event-type')).toBe(false);
      expect(hasTestId(root.container, 'chip-rating')).toBe(true);
      expect(hasTestId(root.container, 'chip-verified')).toBe(true);

      // Presionar Limpiar filtros en la barra de chips
      await act(async () => {
        press(findByTestId(root.container, 'btn-clear-all-chips'));
      });

      // No quedan chips
      expect(hasTestId(root.container, 'active-filters-chips')).toBe(false);
      const snapshot = getFlowSnapshot(root.container);
      expect(snapshot.filters.category).toBeUndefined();
      expect(snapshot.filters.event_type).toBeUndefined();
      expect(snapshot.filters.min_rating).toBeUndefined();
      expect(snapshot.filters.verified).toBeUndefined();
    });
  });
});
