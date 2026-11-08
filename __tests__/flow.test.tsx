import React, { act } from 'react';
import { Pressable, Text } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import { LoadingNotice } from '../src/components/LoadingNotice';
import { NetworkErrorView } from '../src/components/NetworkErrorView';
import { FlowProvider, initialFlow, useFlow, type FlowState } from '../src/state/FlowContext';

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
