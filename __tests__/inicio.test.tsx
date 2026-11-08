import React, { act } from 'react';
import { Pressable, Text, View } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import { ApiError, NetworkError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { HomeResponse, ProviderSummary } from '../src/api/types';
import { RootNavigator } from '../src/navigation/RootNavigator';
import InicioScreen from '../src/screens/InicioScreen';
import { FlowProvider, useFlow, type FlowState } from '../src/state/FlowContext';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

type MockTabScreenProps = {
  name: string;
  component: React.ComponentType;
  options?: {
    title?: string;
    tabBarButtonTestID?: string;
    tabBarBadge?: number | string;
  };
};

type MockStackScreenProps = {
  name: string;
  component: React.ComponentType;
};

jest.mock('@react-navigation/bottom-tabs', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactMock = require('react') as typeof React;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable: MockPressable, Text: MockText, View: MockView } = require('react-native') as {
    Pressable: typeof Pressable;
    Text: typeof Text;
    View: typeof View;
  };

  function Navigator({
    initialRouteName,
    children,
  }: {
    initialRouteName?: string;
    children: React.ReactNode;
  }) {
    const screens = ReactMock.Children.toArray(
      children,
    ) as React.ReactElement<MockTabScreenProps>[];
    const [activeTab, setActiveTab] = ReactMock.useState<string>(
      initialRouteName ?? screens[0]?.props.name ?? 'Inicio',
    );
    const current = screens.find((s) => s.props.name === activeTab) ?? screens[0];
    const ActiveComponent = current?.props.component;

    return (
      <MockView testID="bottom-tab-navigator">
        <MockView testID="bottom-tab-content">
          {ActiveComponent ? <ActiveComponent /> : null}
        </MockView>
        <MockView testID="bottom-tab-bar" accessibilityRole="tablist">
          {screens.map((screen) => {
            const { name, options } = screen.props;
            const label = options?.title ?? name;
            const selected = name === activeTab;
            return (
              <MockPressable
                key={name}
                testID={options?.tabBarButtonTestID ?? `tab-${name}`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setActiveTab(name)}
              >
                <MockText>{label}</MockText>
                {options?.tabBarBadge !== undefined ? (
                  <MockText testID={`tab-badge-${name}`}>{String(options.tabBarBadge)}</MockText>
                ) : null}
              </MockPressable>
            );
          })}
        </MockView>
      </MockView>
    );
  }

  function Screen(_props: MockTabScreenProps) {
    return null;
  }

  return {
    createBottomTabNavigator: () => ({ Navigator, Screen }),
  };
});

jest.mock('@react-navigation/native-stack', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactMock = require('react') as typeof React;

  function Navigator({
    initialRouteName,
    children,
  }: {
    initialRouteName?: string;
    children: React.ReactNode;
  }) {
    const screens = ReactMock.Children.toArray(
      children,
    ) as React.ReactElement<MockStackScreenProps>[];
    const initial =
      screens.find((s) => s.props.name === initialRouteName) ?? screens[0];
    const InitialComponent = initial?.props.component;
    return InitialComponent ? <InitialComponent /> : null;
  }

  function Screen(_props: MockStackScreenProps) {
    return null;
  }

  return {
    createNativeStackNavigator: () => ({ Navigator, Screen }),
  };
});

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

  it('ofrece las 4 pestañas inferiores (Inicio, Resultados, Mi evento, Reservas) y conserva los datos ingresados al cambiar entre pestañas (T_HU_EU_01_12_3, criterios 1, 2.6 y 4)', async () => {
    jest.spyOn(endpoints, 'getHome').mockResolvedValue(SAMPLE_HOME);
    jest.spyOn(endpoints, 'getProviders').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
    });

    const root = createRoot();
    await act(async () => {
      root.render(
        <FlowProvider>
          <RootNavigator />
        </FlowProvider>,
      );
    });

    // Criterio 2.6: las 4 pestañas existen con sus rótulos literales y 'Inicio' está activa al abrir la app
    const tabInicio = findByTestId(root.container, 'tab-Inicio');
    const tabResultados = findByTestId(root.container, 'tab-Resultados');
    const tabMiEvento = findByTestId(root.container, 'tab-MiEvento');
    const tabReservas = findByTestId(root.container, 'tab-Reservas');

    expect(textOf(tabInicio)).toContain('Inicio');
    expect(textOf(tabResultados)).toContain('Resultados');
    expect(textOf(tabMiEvento)).toContain('Mi evento');
    expect(textOf(tabReservas)).toContain('Reservas');
    expect(tabInicio.props.accessibilityState).toMatchObject({ selected: true });

    // Ingresar datos en el buscador de Inicio: tipo 'XV años', fecha '2027-09-18' e invitados '180'
    await act(async () => {
      press(findByTestId(root.container, 'option-xv'));
      findByTestId(root.container, 'input-date').props.onChangeText('2027-09-18');
      findByTestId(root.container, 'input-guests').props.onChangeText('180');
    });

    // Cambiar por todas las pestañas inferiores: Resultados -> Mi evento -> Reservas -> volver a Inicio
    await act(async () => {
      press(tabResultados);
    });
    expect(findByTestId(root.container, 'tab-Resultados').props.accessibilityState).toMatchObject({
      selected: true,
    });

    await act(async () => {
      press(tabMiEvento);
    });
    expect(findByTestId(root.container, 'tab-MiEvento').props.accessibilityState).toMatchObject({
      selected: true,
    });

    await act(async () => {
      press(tabReservas);
    });
    expect(findByTestId(root.container, 'tab-Reservas').props.accessibilityState).toMatchObject({
      selected: true,
    });

    // Volver a la pestaña 'Inicio' y comprobar que los datos ingresados no se borraron (criterio 4)
    await act(async () => {
      press(findByTestId(root.container, 'tab-Inicio'));
    });

    expect(findByTestId(root.container, 'option-xv').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(findByTestId(root.container, 'input-date').props.value).toBe('2027-09-18');
    expect(findByTestId(root.container, 'input-guests').props.value).toBe('180');
  });

  it('muestra el contador de servicios en la pestaña Mi evento cuando hay servicios agregados en el carrito (criterios 2.5 y 2.6)', async () => {
    jest.spyOn(endpoints, 'getHome').mockResolvedValue(SAMPLE_HOME);

    function SeedAndRenderNav() {
      const { update } = useFlow();
      const [ready, setReady] = React.useState(false);
      return !ready ? (
        <Pressable
          testID="seed-nav-cart"
          onPress={() => {
            update({
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
              ],
            });
            setReady(true);
          }}
        />
      ) : (
        <RootNavigator />
      );
    }

    const root = createRoot();
    await act(async () => {
      root.render(
        <FlowProvider>
          <SeedAndRenderNav />
        </FlowProvider>,
      );
    });

    await act(async () => {
      press(findByTestId(root.container, 'seed-nav-cart'));
    });

    const badge = findByTestId(root.container, 'tab-badge-MiEvento');
    expect(textOf(badge)).toBe('1');
  });

  describe('Casos tabulados del buscador, categorías y orden RN-26 (T_HU_EU_01_12_4)', () => {
    it.each([
      {
        caso: 'todo vacío (sin tipo ni invitados, fecha vacía opcional)',
        eventType: null,
        guests: '',
        date: '',
        expectedErrors: [
          'Seleccione el tipo de evento.',
          'Ingrese un número de invitados entre 1 y 500.',
        ],
        unexpectedErrors: ['Seleccione una fecha posterior a hoy.'],
      },
      {
        caso: 'tipo seleccionado pero invitados en 0 y fecha pasada',
        eventType: 'cumpleanos' as const,
        guests: '0',
        date: '2020-05-10',
        expectedErrors: [
          'Ingrese un número de invitados entre 1 y 500.',
          'Seleccione una fecha posterior a hoy.',
        ],
        unexpectedErrors: ['Seleccione el tipo de evento.'],
      },
      {
        caso: 'tipo e invitados válidos (1) pero fecha con formato inválido',
        eventType: 'boda' as const,
        guests: '1',
        date: '31/12/2027',
        expectedErrors: ['Seleccione una fecha posterior a hoy.'],
        unexpectedErrors: [
          'Seleccione el tipo de evento.',
          'Ingrese un número de invitados entre 1 y 500.',
        ],
      },
      {
        caso: 'tipo y fecha futura válidos pero invitados mayor a 500 (501)',
        eventType: 'xv' as const,
        guests: '501',
        date: '2027-10-15',
        expectedErrors: ['Ingrese un número de invitados entre 1 y 500.'],
        unexpectedErrors: [
          'Seleccione el tipo de evento.',
          'Seleccione una fecha posterior a hoy.',
        ],
      },
      {
        caso: 'invitados no numérico (texto)',
        eventType: 'cumpleanos' as const,
        guests: 'ochenta',
        date: '',
        expectedErrors: ['Ingrese un número de invitados entre 1 y 500.'],
        unexpectedErrors: [
          'Seleccione el tipo de evento.',
          'Seleccione una fecha posterior a hoy.',
        ],
      },
    ])(
      'valida en el buscador: $caso (criterios 3.1 a 3.3, 4 y 6)',
      async ({ eventType, guests, date, expectedErrors, unexpectedErrors }) => {
        const homeSpy = jest.spyOn(endpoints, 'getHome').mockResolvedValueOnce(SAMPLE_HOME);

        const root = createRoot();
        await act(async () => {
          root.render(
            <FlowProvider>
              <InicioScreen />
            </FlowProvider>,
          );
        });

        await act(async () => {
          if (eventType) {
            press(findByTestId(root.container, `option-${eventType}`));
          }
          findByTestId(root.container, 'input-guests').props.onChangeText(guests);
          findByTestId(root.container, 'input-date').props.onChangeText(date);
        });

        await act(async () => {
          press(findByTestId(root.container, 'btn-search'));
        });

        const texts = findAllText(root.container);
        for (const err of expectedErrors) {
          expect(texts).toContain(err);
        }
        for (const notErr of unexpectedErrors) {
          expect(texts).not.toContain(notErr);
        }
        expect(mockNavigate).not.toHaveBeenCalled();
        // La búsqueda no guarda datos en el servidor (solo se llamó GET /home al montar)
        expect(homeSpy).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      { eventType: 'cumpleanos' as const, guests: '1', date: '' },
      { eventType: 'boda' as const, guests: '500', date: '2027-11-20' },
      { eventType: 'xv' as const, guests: '150', date: '   ' },
    ])(
      'acepta búsqueda válida con bordes ($eventType, invitados=$guests, fecha="$date") sin guardar en servidor (criterios 3, 4 y 5)',
      async ({ eventType, guests, date }) => {
        const homeSpy = jest.spyOn(endpoints, 'getHome').mockResolvedValueOnce(SAMPLE_HOME);

        const root = createRoot();
        await act(async () => {
          root.render(
            <FlowProvider>
              <InicioScreen />
            </FlowProvider>,
          );
        });

        await act(async () => {
          press(findByTestId(root.container, `option-${eventType}`));
          findByTestId(root.container, 'input-guests').props.onChangeText(guests);
          findByTestId(root.container, 'input-date').props.onChangeText(date);
        });

        await act(async () => {
          press(findByTestId(root.container, 'btn-search'));
        });

        expect(mockNavigate).toHaveBeenCalledWith('Resultados', {
          eventType,
          guests: Number(guests),
          date: date.trim() || undefined,
        });
        expect(homeSpy).toHaveBeenCalledTimes(1);
      },
    );

    it.each(['espacio', 'alimentacion', 'decoracion', 'entretenimiento'] as const)(
      'tocar la categoría %s abre Resultados filtrado por ese rubro sin llenar el buscador (criterios 2.2, 4 y 5)',
      async (category) => {
        jest.spyOn(endpoints, 'getHome').mockResolvedValueOnce(SAMPLE_HOME);

        const root = createRoot();
        await act(async () => {
          root.render(
            <FlowProvider>
              <FlowHarness />
            </FlowProvider>,
          );
        });

        await act(async () => {
          press(findByTestId(root.container, `category-${category}`));
        });

        expect(mockNavigate).toHaveBeenCalledWith('Resultados', { category });
        expect(getFlowSnapshot(root.container).filters.category).toBe(category);
      },
    );

    it('respeta en pantalla el orden RN-26 de los proveedores destacados devueltos por GET /home (criterio 5)', async () => {
      const orderedHome: HomeResponse = {
        categories: SAMPLE_HOME.categories,
        featured: [
          makeProvider(1, { id: 'prv-a', name: 'Primero 4.9', rating_avg: 4.9, rating_count: 10 }),
          makeProvider(2, { id: 'prv-b', name: 'Segundo 4.8 A', rating_avg: 4.8, rating_count: 8 }),
          makeProvider(3, { id: 'prv-c', name: 'Tercero 4.8 B', rating_avg: 4.8, rating_count: 15 }),
          makeProvider(4, { id: 'prv-d', name: 'Cuarto Sin Reseñas', rating_avg: null, rating_count: 0 }),
        ],
      };
      jest.spyOn(endpoints, 'getHome').mockResolvedValueOnce(orderedHome);

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <InicioScreen />
          </FlowProvider>,
        );
      });

      const renderedNames = root.container
        .queryAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('featured-prv-'))
        .map((card) => textOf(card));

      expect(renderedNames).toHaveLength(4);
      expect(renderedNames[0]).toContain('Primero 4.9');
      expect(renderedNames[1]).toContain('Segundo 4.8 A');
      expect(renderedNames[2]).toContain('Tercero 4.8 B');
      expect(renderedNames[3]).toContain('Cuarto Sin Reseñas');
    });

    it('no falla si el backend devuelve proveedores destacados sin categories', async () => {
      const homeWithoutCategories: HomeResponse = {
        categories: SAMPLE_HOME.categories,
        featured: [
          makeProvider(1, { id: 'prv-no-cat', name: 'Sin Categorias', categories: undefined }),
        ],
      };
      jest.spyOn(endpoints, 'getHome').mockResolvedValueOnce(homeWithoutCategories);

      const root = createRoot();
      await act(async () => {
        root.render(
          <FlowProvider>
            <InicioScreen />
          </FlowProvider>,
        );
      });

      const card = findByTestId(root.container, 'featured-prv-no-cat');
      expect(card).toBeTruthy();
      expect(textOf(card)).toContain('Sin Categorias');
    });
  });
});
