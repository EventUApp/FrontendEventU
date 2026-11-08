import React, { act } from 'react';
import { Pressable, Text } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import { ApiError, NetworkError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { ProviderSummary, ProvidersResponse } from '../src/api/types';
import ResultadosScreen from '../src/screens/ResultadosScreen';
import { FlowProvider, useFlow, type FlowState } from '../src/state/FlowContext';

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
});
