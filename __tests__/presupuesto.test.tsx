import React, { act } from 'react';
import { Pressable, Text } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import { ApiError, GENERIC_ERROR, NetworkError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import PresupuestoScreen from '../src/screens/PresupuestoScreen';
import { FlowProvider, useFlow, type FlowState } from '../src/state/FlowContext';

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
        <PresupuestoScreen />
      )}
      <Text testID="flow-snapshot">{JSON.stringify(flow)}</Text>
    </>
  );
}

describe('PresupuestoScreen (HU_EU_01_01)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockNavigate.mockReset();
  });

  it('muestra los tres campos, las opciones de tipo de evento con teclados numéricos y el botón Ver paquetes', () => {
    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <PresupuestoScreen />
        </FlowProvider>,
      );
    });

    const budgetInput = findByTestId(root.container, 'input-budget');
    const guestsInput = findByTestId(root.container, 'input-guests');
    expect(budgetInput.props.keyboardType).toBe('numeric');
    expect(guestsInput.props.keyboardType).toBe('numeric');

    const texts = findAllText(root.container);
    expect(texts).toContain('Cumpleaños');
    expect(texts).toContain('Boda');
    expect(texts).toContain('XV años');
    expect(texts).toContain('Ver paquetes');
  });

  it('valida campos vacíos y muestra mensajes junto a cada campo sin consultar el API', () => {
    const spy = jest.spyOn(endpoints, 'postRecommendations');
    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <PresupuestoScreen />
        </FlowProvider>,
      );
    });

    const submitBtn = findByTestId(root.container, 'btn-submit');
    act(() => {
      press(submitBtn);
    });

    const texts = findAllText(root.container);
    expect(texts).toContain('Ingrese su presupuesto.');
    expect(texts).toContain('Seleccione el tipo de evento.');
    expect(texts).toContain('Ingrese un número de invitados entre 1 y 500.');
    expect(spy).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('valida presupuesto e invitados fuera de rango (RN-19)', () => {
    const spy = jest.spyOn(endpoints, 'postRecommendations');
    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <PresupuestoScreen />
        </FlowProvider>,
      );
    });

    act(() => {
      findByTestId(root.container, 'input-budget').props.onChangeText('500000');
      press(findByTestId(root.container, 'option-boda'));
      findByTestId(root.container, 'input-guests').props.onChangeText('600');
    });

    act(() => {
      press(findByTestId(root.container, 'btn-submit'));
    });

    const texts = findAllText(root.container);
    expect(texts).toContain('El presupuesto debe estar entre $1.000.000 y $50.000.000.');
    expect(texts).toContain('Ingrese un número de invitados entre 1 y 500.');
    expect(spy).not.toHaveBeenCalled();
  });

  it('precarga tipo de evento e invitados desde FlowContext y conserva los datos al enviar con éxito', async () => {
    const spy = jest.spyOn(endpoints, 'postRecommendations').mockResolvedValue({
      packages: [
        {
          modality: 'ahorro',
          total_cop: 4_000_000,
          remaining_cop: 1_000_000,
          breakdown: [],
        },
      ],
      unavailable: [],
    });

    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <FlowHarness initial={{ eventType: 'xv', guests: 120 }} />
        </FlowProvider>,
      );
    });

    act(() => {
      press(findByTestId(root.container, 'seed-flow'));
    });

    expect(findByTestId(root.container, 'input-guests').props.value).toBe('120');
    expect(findByTestId(root.container, 'option-xv').props.accessibilityState).toMatchObject({ selected: true });

    act(() => {
      findByTestId(root.container, 'input-budget').props.onChangeText('5.000.000');
    });

    await act(async () => {
      await press(findByTestId(root.container, 'btn-submit'));
    });

    expect(spy).toHaveBeenCalledWith(
      { budget_cop: 5_000_000, event_type: 'xv', guests: 120 },
      expect.any(Object),
    );
    const snapshot = JSON.parse(textOf(findByTestId(root.container, 'flow-snapshot'))) as FlowState;
    expect(snapshot).toMatchObject({
      budgetCop: 5_000_000,
      eventType: 'xv',
      guests: 120,
    });
    expect(mockNavigate).toHaveBeenCalledWith('Paquetes');
  });

  it('muestra error de red con botón Reintentar cuando falla la conexión (HU_EU_01_04)', async () => {
    const spy = jest
      .spyOn(endpoints, 'postRecommendations')
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce({ packages: [], unavailable: [] });

    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <FlowHarness initial={{ budgetCop: 3_000_000, eventType: 'cumpleanos', guests: 50 }} />
        </FlowProvider>,
      );
    });

    act(() => {
      press(findByTestId(root.container, 'seed-flow'));
    });

    await act(async () => {
      await press(findByTestId(root.container, 'btn-submit'));
    });

    const texts = findAllText(root.container);
    expect(texts).toContain('No hay conexión con el servidor. Revise su conexión e intente nuevamente.');
    expect(texts).toContain('Reintentar');

    const retryBtn = root.container.queryAll(
      (n) => n.props.accessibilityRole === 'button' && textOf(n).includes('Reintentar'),
    )[0];

    await act(async () => {
      await press(retryBtn);
    });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(mockNavigate).toHaveBeenCalledWith('Paquetes');
  });

  it('muestra mensaje genérico ante un error inesperado del servidor (criterio 6)', async () => {
    jest
      .spyOn(endpoints, 'postRecommendations')
      .mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', GENERIC_ERROR));

    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <FlowHarness initial={{ budgetCop: 3_000_000, eventType: 'boda', guests: 80 }} />
        </FlowProvider>,
      );
    });

    act(() => {
      press(findByTestId(root.container, 'seed-flow'));
    });

    await act(async () => {
      await press(findByTestId(root.container, 'btn-submit'));
    });

    const texts = findAllText(root.container);
    expect(texts).toContain('No fue posible completar la operación. Intente nuevamente.');
  });

  it('muestra los errores de campo devueltos por POST /recommendations ante 422 VALIDATION_ERROR', async () => {
    jest.spyOn(endpoints, 'postRecommendations').mockRejectedValue(
      new ApiError(422, 'VALIDATION_ERROR', 'Revise los datos ingresados.', {
        budget_cop: 'El presupuesto debe estar entre $1.000.000 y $50.000.000.',
        guests: 'Ingrese un número de invitados entre 1 y 500.',
      }),
    );

    const root = createRoot();
    act(() => {
      root.render(
        <FlowProvider>
          <FlowHarness initial={{ budgetCop: 3_000_000, eventType: 'boda', guests: 80 }} />
        </FlowProvider>,
      );
    });

    act(() => {
      press(findByTestId(root.container, 'seed-flow'));
    });

    await act(async () => {
      await press(findByTestId(root.container, 'btn-submit'));
    });

    const texts = findAllText(root.container);
    expect(texts).toContain('El presupuesto debe estar entre $1.000.000 y $50.000.000.');
    expect(texts).toContain('Ingrese un número de invitados entre 1 y 500.');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('permite corregir errores de validación y enviar el formulario con éxito (criterio 3.5)', async () => {
    const spy = jest.spyOn(endpoints, 'postRecommendations').mockResolvedValue({
      packages: [],
      unavailable: [],
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
      press(findByTestId(root.container, 'btn-submit'));
    });

    expect(findAllText(root.container)).toContain('Ingrese su presupuesto.');
    expect(spy).not.toHaveBeenCalled();

    act(() => {
      findByTestId(root.container, 'input-budget').props.onChangeText('1.000.000');
      press(findByTestId(root.container, 'option-cumpleanos'));
      findByTestId(root.container, 'input-guests').props.onChangeText('1');
    });

    expect(findAllText(root.container)).not.toContain('Ingrese su presupuesto.');
    expect(findAllText(root.container)).not.toContain('Seleccione el tipo de evento.');
    expect(findAllText(root.container)).not.toContain('Ingrese un número de invitados entre 1 y 500.');

    await act(async () => {
      await press(findByTestId(root.container, 'btn-submit'));
    });

    expect(spy).toHaveBeenCalledWith(
      { budget_cop: 1_000_000, event_type: 'cumpleanos', guests: 1 },
      expect.any(Object),
    );
    expect(mockNavigate).toHaveBeenCalledWith('Paquetes');
  });
});
