import React, { act } from 'react';
import { Pressable, Text } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import { ApiError, NetworkError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { HomeResponse, ProviderSummary } from '../src/api/types';
import InicioScreen from '../src/screens/InicioScreen';
import { FlowProvider, useFlow, type FlowState } from '../src/state/FlowContext';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
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
    id: `prov-${index}`,
    name: `Proveedor Destacado ${index}`,
    categories: ['espacio'],
    neighborhood: 'Ciudad Jardín',
    municipality: 'Cali',
    latitude: 3.37,
    longitude: -76.53,
    cover_url: `https://example.com/prov-${index}.jpg`,
    rating_avg: 4.5,
    rating_count: 12,
    verification_status: 'verificado',
    price_from_cop: 1500000 + index * 100000,
    featured: true,
    ...overrides,
  };
}

const SAMPLE_HOME: HomeResponse = {
  categories: [
    { category: 'espacio', count: 5 },
    { category: 'alimentacion', count: 4 },
    { category: 'decoracion', count: 3 },
    { category: 'entretenimiento', count: 2 },
  ],
  featured: [
    makeProvider(1, { rating_avg: 4.8, rating_count: 20, price_from_cop: 2500000 }),
    makeProvider(2, { rating_avg: null, rating_count: 0, cover_url: null, price_from_cop: 900000 }),
    makeProvider(3),
    makeProvider(4),
    makeProvider(5),
    makeProvider(6),
    makeProvider(7), // El 7º no debe mostrarse (máximo 6 destacados: criterio 2.3)
  ],
};

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
        <InicioScreen />
      )}
      <Text testID="flow-snapshot">{JSON.stringify(flow)}</Text>
    </>
  );
}

function getFlowSnapshot(root: TestInstance): FlowState {
  const node = findByTestId(root, 'flow-snapshot');
  return JSON.parse(textOf(node)) as FlowState;
}

describe('InicioScreen (HU_EU_01_12 — T_HU_EU_01_12_1)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockNavigate.mockReset();
  });

  it('carga GET /home al montar y muestra categorías con conteo, hasta 6 destacados, acceso a presupuesto y contador de Mi evento (criterios 2.1 a 2.5)', async () => {
    const spy = jest.spyOn(endpoints, 'getHome').mockResolvedValueOnce(SAMPLE_HOME);

    const root = createRoot();
    await act(async () => {
      root.render(
        <FlowProvider>
          <FlowHarness
            initial={{
              cart: [
                {
                  service_id: 'svc-1',
                  name: 'Salón Imperial',
                  category: 'espacio',
                  provider_id: 'prov-1',
                  provider_name: 'Hacienda Real',
                  price_model: 'fijo',
                  unit_price_cop: 2000000,
                  min_guests: 20,
                  max_guests: 200,
                },
                {
                  service_id: 'svc-2',
                  name: 'Banquete Gourmet',
                  category: 'alimentacion',
                  provider_id: 'prov-2',
                  provider_name: 'Sabores del Valle',
                  price_model: 'por_invitado',
                  unit_price_cop: 45000,
                  min_guests: 20,
                  max_guests: 200,
                },
              ],
            }}
          />
        </FlowProvider>,
      );
    });

    await act(async () => {
      press(findByTestId(root.container, 'seed-flow'));
    });

    expect(spy).toHaveBeenCalledTimes(1);

    const allText = findAllText(root.container).join(' | ');

    // 2.1 Buscador: tipos de evento y botón 'Buscar'
    expect(allText).toContain('Cumpleaños');
    expect(allText).toContain('Boda');
    expect(allText).toContain('XV años');
    expect(allText).toContain('Buscar');

    // 2.2 Categorías con conteo
    expect(findByTestId(root.container, 'category-espacio')).toBeTruthy();
    expect(findByTestId(root.container, 'category-alimentacion')).toBeTruthy();
    expect(findByTestId(root.container, 'category-decoracion')).toBeTruthy();
    expect(findByTestId(root.container, 'category-entretenimiento')).toBeTruthy();
    expect(allText).toContain('5 proveedores');
    expect(allText).toContain('4 proveedores');
    expect(allText).toContain('3 proveedores');
    expect(allText).toContain('2 proveedores');

    // 2.3 Sección 'Destacados': hasta 6 proveedores con nombre, calificación (o 'Sin reseñas') y precio 'Desde'
    expect(allText).toContain('Destacados');
    expect(findByTestId(root.container, 'featured-prov-1')).toBeTruthy();
    expect(findByTestId(root.container, 'featured-prov-6')).toBeTruthy();
    expect(() => findByTestId(root.container, 'featured-prov-7')).toThrow();

    expect(allText).toContain('Proveedor Destacado 1');
    expect(allText).toContain('★ 4.8');
    expect(allText).toContain('Desde $2.500.000');

    // Proveedor 2 sin reseñas y sin cover_url -> 'Sin reseñas' y recuadro neutro
    expect(allText).toContain('Sin reseñas');
    expect(allText).toContain('Desde $900.000');
    expect(findByTestId(root.container, 'featured-placeholder-prov-2')).toBeTruthy();

    // Si falla la carga de una imagen con cover_url, pasa a recuadro neutro sin mostrar error
    const img1 = findByTestId(root.container, 'featured-image-prov-1');
    await act(async () => {
      img1.props.onError();
    });
    expect(findByTestId(root.container, 'featured-placeholder-prov-1')).toBeTruthy();

    // 2.4 Acceso 'Arma mi evento por presupuesto'
    expect(allText).toContain('Arma mi evento por presupuesto');

    // 2.5 Acceso a 'Mi evento' con el número de servicios agregados (2)
    expect(allText).toContain('Mi evento');
    const myEventBtn = findByTestId(root.container, 'btn-my-event');
    expect(myEventBtn).toBeTruthy();
    expect(textOf(myEventBtn)).toContain('2');
  });

  it('muestra errores de validación 3.1, 3.2 y 3.3 junto al campo al tocar Buscar con datos inválidos', async () => {
    jest.spyOn(endpoints, 'getHome').mockResolvedValueOnce(SAMPLE_HOME);

    const root = createRoot();
    await act(async () => {
      root.render(
        <FlowProvider>
          <InicioScreen />
        </FlowProvider>,
      );
    });

    // Tocar 'Buscar' sin seleccionar tipo ni invitados y con fecha pasada
    const dateInput = findByTestId(root.container, 'input-date');
    await act(async () => {
      dateInput.props.onChangeText('2020-01-01');
    });

    const searchBtn = findByTestId(root.container, 'btn-search');
    await act(async () => {
      press(searchBtn);
    });

    const allText = findAllText(root.container);
    expect(allText).toContain('Seleccione el tipo de evento.');
    expect(allText).toContain('Ingrese un número de invitados entre 1 y 500.');
    expect(allText).toContain('Seleccione una fecha posterior a hoy.');
    expect(mockNavigate).not.toHaveBeenCalled();

    // Invitados fuera de rango (501)
    const guestsInput = findByTestId(root.container, 'input-guests');
    await act(async () => {
      guestsInput.props.onChangeText('501');
      press(searchBtn);
    });
    expect(findAllText(root.container)).toContain(
      'Ingrese un número de invitados entre 1 y 500.',
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('permite buscar sin fecha (opcional) o con fecha futura, actualiza FlowContext y navega a Resultados (criterio 5)', async () => {
    jest.spyOn(endpoints, 'getHome').mockResolvedValueOnce(SAMPLE_HOME);

    const root = createRoot();
    await act(async () => {
      root.render(
        <FlowProvider>
          <FlowHarness />
        </FlowProvider>,
      );
    });

    // Seleccionar 'Boda' y 120 invitados, dejando fecha vacía (opcional)
    await act(async () => {
      press(findByTestId(root.container, 'option-boda'));
      findByTestId(root.container, 'input-guests').props.onChangeText('120');
    });

    await act(async () => {
      press(findByTestId(root.container, 'btn-search'));
    });

    expect(mockNavigate).toHaveBeenCalledWith('Resultados', {
      eventType: 'boda',
      guests: 120,
      date: undefined,
    });

    let snap = getFlowSnapshot(root.container);
    expect(snap.eventType).toBe('boda');
    expect(snap.guests).toBe(120);
    expect(snap.eventDate).toBeNull();
    expect(snap.filters).toMatchObject({ event_type: 'boda', guests: 120 });

    // Ahora con fecha futura seleccionada mediante el chip rápido "En 3 meses"
    mockNavigate.mockClear();
    await act(async () => {
      press(findByTestId(root.container, 'date-preset-3m'));
    });

    const presetDate = findByTestId(root.container, 'input-date').props.value as string;
    expect(presetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await act(async () => {
      press(findByTestId(root.container, 'btn-search'));
    });

    expect(mockNavigate).toHaveBeenCalledWith('Resultados', {
      eventType: 'boda',
      guests: 120,
      date: presetDate,
    });

    snap = getFlowSnapshot(root.container);
    expect(snap.eventDate).toBe(presetDate);

    // Y permite limpiar la fecha opcional con "Limpiar"
    await act(async () => {
      press(findByTestId(root.container, 'date-preset-clear'));
    });
    expect(getFlowSnapshot(root.container).eventDate).toBeNull();
  });

  it('navega a Resultados por rubro, a Proveedor al tocar un destacado, a Presupuesto y a MiEvento sin llenar el buscador (criterios 4 y 5)', async () => {
    jest.spyOn(endpoints, 'getHome').mockResolvedValueOnce(SAMPLE_HOME);

    const root = createRoot();
    await act(async () => {
      root.render(
        <FlowProvider>
          <FlowHarness />
        </FlowProvider>,
      );
    });

    // Tocar categoría 'alimentacion' sin llenar buscador
    await act(async () => {
      press(findByTestId(root.container, 'category-alimentacion'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('Resultados', { category: 'alimentacion' });
    expect(getFlowSnapshot(root.container).filters.category).toBe('alimentacion');

    // Tocar un proveedor destacado abre su ficha
    mockNavigate.mockClear();
    await act(async () => {
      press(findByTestId(root.container, 'featured-prov-1'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('Proveedor', { providerId: 'prov-1' });

    // Tocar 'Arma mi evento por presupuesto' abre 'Presupuesto'
    mockNavigate.mockClear();
    await act(async () => {
      press(findByTestId(root.container, 'btn-budget-shortcut'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('Presupuesto');

    // Tocar acceso a 'Mi evento' abre 'MiEvento'
    mockNavigate.mockClear();
    await act(async () => {
      press(findByTestId(root.container, 'btn-my-event'));
    });
    expect(mockNavigate).toHaveBeenCalledWith('MiEvento');
  });

  it('muestra error de red con botón Reintentar (HU_EU_01_04) y error genérico ante fallo inesperado en GET /home (criterio 6)', async () => {
    const spy = jest
      .spyOn(endpoints, 'getHome')
      .mockRejectedValueOnce(new NetworkError())
      .mockRejectedValueOnce(
        new ApiError(
          500,
          'INTERNAL_ERROR',
          'No fue posible completar la operación. Intente nuevamente.',
        ),
      )
      .mockResolvedValueOnce(SAMPLE_HOME);

    const root = createRoot();
    await act(async () => {
      root.render(
        <FlowProvider>
          <InicioScreen />
        </FlowProvider>,
      );
    });

    // Fallo de red inicial
    expect(findAllText(root.container)).toContain(
      'No hay conexión con el servidor. Revise su conexión e intente nuevamente.',
    );
    expect(findAllText(root.container)).toContain('Reintentar');

    // Primer reintento -> falla con 500 -> mensaje inesperado literal
    const retryBtn = root.container
      .queryAll((n) => n.props.accessibilityRole === 'button')
      .find((b) => textOf(b).includes('Reintentar'))!;
    await act(async () => {
      await press(retryBtn);
    });

    expect(findAllText(root.container)).toContain(
      'No fue posible completar la operación. Intente nuevamente.',
    );

    // Segundo reintento desde el aviso de error inesperado -> carga exitosa
    const retryUnexpected = findByTestId(root.container, 'btn-retry-home');
    await act(async () => {
      await press(retryUnexpected);
    });

    expect(spy).toHaveBeenCalledTimes(3);
    expect(findAllText(root.container)).toContain('Proveedor Destacado 1');
  });
});
