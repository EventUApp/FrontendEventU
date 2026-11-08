import React, { act } from 'react';
import { Pressable, Text } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import type { RecommendationResponse } from '../src/api/types';
import * as endpoints from '../src/api/endpoints';
import { LoadingNotice } from '../src/components/LoadingNotice';
import { NetworkErrorView } from '../src/components/NetworkErrorView';
import { SLOW_NOTICE_MS } from '../src/config/limits';
import PaquetesScreen from '../src/screens/PaquetesScreen';
import PresupuestoScreen from '../src/screens/PresupuestoScreen';
import { FlowProvider, initialFlow, useFlow, type FlowState } from '../src/state/FlowContext';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
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

describe('LoadingNotice y NetworkErrorView (HU_EU_01_04, criterios 2 y 3)', () => {
  it('LoadingNotice muestra el indicador y solo muestra el aviso de arranque en frío cuando slow es true', () => {
    const root = createRoot();
    act(() => {
      root.render(<LoadingNotice slow={false} />);
    });

    expect(findAllText(root.container)).not.toContain(
      'Estamos conectando con el servidor. Esto puede tardar un momento.',
    );

    act(() => {
      root.render(<LoadingNotice slow={true} />);
    });

    expect(findAllText(root.container)).toContain(
      'Estamos conectando con el servidor. Esto puede tardar un momento.',
    );
  });

  it('NetworkErrorView muestra el mensaje de error de red y ejecuta onRetry al pulsar Reintentar', () => {
    const onRetry = jest.fn();
    const root = createRoot();
    act(() => {
      root.render(
        <NetworkErrorView
          message="No hay conexión con el servidor. Revise su conexión e intente nuevamente."
          onRetry={onRetry}
        />,
      );
    });

    const texts = findAllText(root.container);
    expect(texts).toContain(
      'No hay conexión con el servidor. Revise su conexión e intente nuevamente.',
    );
    expect(texts).toContain('Reintentar');

    const retryBtn = root.container.queryAll((n) => n.props.accessibilityRole === 'button')[0];
    act(() => {
      press(retryBtn);
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('FlowContext — conservación del estado al navegar y volver atrás (HU_EU_01_04, criterio 4)', () => {
  function ScreenSimulator() {
    const { flow, update, reset } = useFlow();
    const [screen, setScreen] = React.useState<'A' | 'B'>('A');

    return (
      <>
        <Pressable
          testID="populate-all"
          onPress={() =>
            update({
              budgetCop: 12_000_000,
              eventType: 'boda',
              guests: 150,
              filters: {
                category: 'espacio',
                event_type: 'boda',
                guests: 150,
                min_price_cop: 1_000_000,
                max_price_cop: 8_000_000,
                min_rating: 4,
                verified: true,
                sort: 'recomendados',
              },
              chosenModality: 'equilibrado',
              chosenServiceIds: ['svc-1'],
              cart: [
                {
                  service_id: 'svc-1',
                  name: 'Hacienda Real',
                  category: 'espacio',
                  provider_id: 'prv-1',
                  provider_name: 'Eventos Cali',
                  price_model: 'fijo',
                  unit_price_cop: 3_000_000,
                  min_guests: 20,
                  max_guests: 200,
                },
              ],
              cartOrigin: 'equilibrado',
              customer: {
                name: 'Ana Gómez',
                email: 'ana@ejemplo.co',
                phone: '3001234567',
              },
              eventDate: '2027-06-15',
            })
          }
        />
        <Pressable testID="go-to-b" onPress={() => setScreen('B')} />
        <Pressable testID="go-back-to-a" onPress={() => setScreen('A')} />
        <Pressable testID="reset-flow" onPress={() => reset()} />
        <Text testID="current-screen">{screen}</Text>
        <Text testID="flow-json">{JSON.stringify(flow)}</Text>
      </>
    );
  }

  it('conserva presupuesto, tipo de evento, invitados, filtros, carrito Mi evento, paquete y datos del cliente al ir y volver entre pantallas', () => {
    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <ScreenSimulator />
        </FlowProvider>,
      );
    });

    act(() => {
      press(findByTestId(root.container, 'populate-all'));
    });

    act(() => {
      press(findByTestId(root.container, 'go-to-b'));
    });
    expect(textOf(findByTestId(root.container, 'current-screen'))).toBe('B');

    act(() => {
      press(findByTestId(root.container, 'go-back-to-a'));
    });
    expect(textOf(findByTestId(root.container, 'current-screen'))).toBe('A');

    const snapshot = JSON.parse(textOf(findByTestId(root.container, 'flow-json'))) as FlowState;
    expect(snapshot.budgetCop).toBe(12_000_000);
    expect(snapshot.eventType).toBe('boda');
    expect(snapshot.guests).toBe(150);
    expect(snapshot.filters).toEqual({
      category: 'espacio',
      event_type: 'boda',
      guests: 150,
      min_price_cop: 1_000_000,
      max_price_cop: 8_000_000,
      min_rating: 4,
      verified: true,
      sort: 'recomendados',
    });
    expect(snapshot.chosenModality).toBe('equilibrado');
    expect(snapshot.cart).toHaveLength(1);
    expect(snapshot.cart[0].service_id).toBe('svc-1');
    expect(snapshot.customer).toEqual({
      name: 'Ana Gómez',
      email: 'ana@ejemplo.co',
      phone: '3001234567',
    });
    expect(snapshot.eventDate).toBe('2027-06-15');

    act(() => {
      press(findByTestId(root.container, 'reset-flow'));
    });
    const resetSnapshot = JSON.parse(textOf(findByTestId(root.container, 'flow-json'))) as FlowState;
    expect(resetSnapshot).toEqual(initialFlow);
  });
});

describe('Escenarios de red simulados y navegación real entre pantallas (T_HU_EU_01_04_3)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockNavigate.mockReset();
  });

  it('criterio 3.1 y 3.2: con respuesta lenta muestra el aviso de arranque en frío y bloquea el botón de envío mientras tarda', async () => {
    let triggerSlow: (() => void) | undefined;
    let resolveRequest: ((val: RecommendationResponse) => void) | undefined;

    const spy = jest.spyOn(endpoints, 'postRecommendations').mockImplementation((_body, opts) => {
      triggerSlow = opts?.onSlow;
      return new Promise((resolve) => {
        resolveRequest = resolve;
      });
    });

    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <PresupuestoScreen />
        </FlowProvider>,
      );
    });

    act(() => {
      findByTestId(root.container, 'input-budget').props.onChangeText('8.000.000');
      press(findByTestId(root.container, 'option-boda'));
      findByTestId(root.container, 'input-guests').props.onChangeText('90');
    });

    // Inicia la petición (queda en curso)
    act(() => {
      void press(findByTestId(root.container, 'btn-submit'));
    });

    // El botón está deshabilitado y un segundo clic no dispara una segunda petición (criterio 3.1)
    expect(findByTestId(root.container, 'btn-submit').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    act(() => {
      void press(findByTestId(root.container, 'btn-submit'));
    });
    expect(spy).toHaveBeenCalledTimes(1);

    // Simula que transcurrieron los 5 s de arranque en frío (SLOW_NOTICE_MS, criterio 3.2)
    expect(SLOW_NOTICE_MS).toBe(5_000);
    act(() => {
      triggerSlow?.();
    });

    expect(findAllText(root.container)).toContain(
      'Estamos conectando con el servidor. Esto puede tardar un momento.',
    );

    // Finalmente responde el servidor
    await act(async () => {
      resolveRequest?.({ packages: [], unavailable: [] });
    });

    expect(mockNavigate).toHaveBeenCalledWith('Paquetes');
  });

  it('criterio 4 y 5: ir de PresupuestoScreen a PaquetesScreen y volver atrás conserva presupuesto, tipo de evento, invitados y paquete elegido', async () => {
    jest.spyOn(endpoints, 'postRecommendations').mockResolvedValue({
      packages: [
        {
          modality: 'ahorro',
          total_cop: 5_000_000,
          remaining_cop: 3_000_000,
          breakdown: [
            {
              category: 'espacio',
              subtotal_cop: 2_000_000,
              items: [
                {
                  service_id: 'svc-e1',
                  name: 'Salón Cali',
                  provider_id: 'prv-1',
                  provider_name: 'Eventos Sur',
                  verification_status: 'verificado',
                  cost_cop: 2_000_000,
                },
              ],
            },
            {
              category: 'alimentacion',
              subtotal_cop: 2_000_000,
              items: [
                {
                  service_id: 'svc-a1',
                  name: 'Banquete Cali',
                  provider_id: 'prv-2',
                  provider_name: 'Sabores Sur',
                  verification_status: 'verificado',
                  cost_cop: 2_000_000,
                },
              ],
            },
            {
              category: 'decoracion',
              subtotal_cop: 1_000_000,
              items: [
                {
                  service_id: 'svc-d1',
                  name: 'Flores Cali',
                  provider_id: 'prv-3',
                  provider_name: 'Arte Sur',
                  verification_status: 'verificado',
                  cost_cop: 1_000_000,
                },
              ],
            },
          ],
        },
      ],
      unavailable: [],
    });

    function TwoScreenHarness() {
      const [route, setRoute] = React.useState<'Presupuesto' | 'Paquetes'>('Presupuesto');
      return (
        <>
          <Pressable testID="nav-to-paquetes" onPress={() => setRoute('Paquetes')} />
          <Pressable testID="nav-back-presupuesto" onPress={() => setRoute('Presupuesto')} />
          {route === 'Presupuesto' ? <PresupuestoScreen /> : <PaquetesScreen />}
        </>
      );
    }

    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <TwoScreenHarness />
        </FlowProvider>,
      );
    });

    // Ingresa datos en PresupuestoScreen y envía
    act(() => {
      findByTestId(root.container, 'input-budget').props.onChangeText('8000000');
      press(findByTestId(root.container, 'option-xv'));
      findByTestId(root.container, 'input-guests').props.onChangeText('120');
    });

    await act(async () => {
      await press(findByTestId(root.container, 'btn-submit'));
    });

    // Pasa a PaquetesScreen y elige el paquete Ahorro
    act(() => {
      press(findByTestId(root.container, 'nav-to-paquetes'));
    });
    expect(findAllText(root.container).join(' ')).toContain('XV años · 120 invitados');

    act(() => {
      press(findByTestId(root.container, 'choose-package-ahorro'));
    });

    // Vuelve atrás a PresupuestoScreen (desmonta PaquetesScreen y monta PresupuestoScreen de nuevo)
    act(() => {
      press(findByTestId(root.container, 'nav-back-presupuesto'));
    });

    expect(findByTestId(root.container, 'input-budget').props.value).toBe('8000000');
    expect(findByTestId(root.container, 'input-guests').props.value).toBe('120');
    expect(findByTestId(root.container, 'option-xv').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });
});
