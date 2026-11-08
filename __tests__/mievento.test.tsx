import React, { act } from 'react';
import { Pressable, Text } from 'react-native';
import { createRoot, type TestInstance } from 'test-renderer';
import { ApiError, NetworkError } from '../src/api/client';
import * as endpoints from '../src/api/endpoints';
import type { CartService, CatalogItem, Package, Quote } from '../src/api/types';
import MiEventoScreen from '../src/screens/MiEventoScreen';
import { FlowProvider, useFlow, type FlowState } from '../src/state/FlowContext';
import {
  canRemove,
  CONTINUE_TO_RESERVE_TEXT,
  EMPTY_CART_ACTION_TEXT,
  EMPTY_CART_MESSAGE,
  INELIGIBLE_GUESTS_MESSAGE,
  MISSING_CATEGORIES_MESSAGE,
  remainingBudget,
  replaceService,
} from '../src/utils/cart';

function textOf(node: TestInstance): string {
  return node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}
function findAllText(root: TestInstance): string[] {
  return root.queryAll((n) => n.type === 'Text').map(textOf);
}
function find(root: TestInstance, testID: string): TestInstance {
  const m = root.queryAll((n) => n.props.testID === testID);
  if (m.length === 0) throw new Error(`No se encontró testID="${testID}"`);
  return m[0];
}
function has(root: TestInstance, testID: string): boolean {
  return root.queryAll((n) => n.props.testID === testID).length > 0;
}
function press(node: TestInstance): unknown {
  let curr: { memoizedProps?: { onPress?: () => unknown }; return?: unknown } | null = node.unstable_fiber;
  while (curr) {
    if (typeof curr.memoizedProps?.onPress === 'function') return curr.memoizedProps.onPress();
    curr = (curr.return as typeof curr) ?? null;
  }
  throw new Error('No se encontró manejador onPress');
}

const svc = (id: string, category: CartService['category'], cost: number): CartService => ({
  service_id: id,
  name: `Servicio ${id}`,
  category,
  provider_id: `prv-${id}`,
  provider_name: `Proveedor ${id}`,
  price_model: 'fijo',
  unit_price_cop: cost,
  min_guests: 1,
  max_guests: 500,
});

const CART: CartService[] = [
  svc('esp', 'espacio', 1_000_000),
  svc('ali', 'alimentacion', 2_000_000),
  svc('dec', 'decoracion', 500_000),
  svc('ent', 'entretenimiento', 300_000),
];

const catalogItem = (id: string, category: CatalogItem['category'], price: number, extra?: Partial<CatalogItem>): CatalogItem => ({
  id,
  name: `Alt ${id}`,
  category,
  provider_id: `prv-${id}`,
  provider_name: `Proveedor ${id}`,
  price_cop: price,
  price_model: 'fijo',
  level: 'equilibrado',
  min_guests: 1,
  max_guests: 500,
  ...extra,
});

const PACKAGE: Package = {
  modality: 'equilibrado',
  total_cop: 3_500_000,
  remaining_cop: 1_500_000,
  breakdown: [
    { category: 'espacio', subtotal_cop: 1_000_000, items: [{ service_id: 'esp', name: 'Servicio esp', provider_id: 'prv-esp', provider_name: 'Proveedor esp', verification_status: 'verificado', cost_cop: 1_000_000 }] },
    { category: 'alimentacion', subtotal_cop: 2_000_000, items: [{ service_id: 'ali', name: 'Servicio ali', provider_id: 'prv-ali', provider_name: 'Proveedor ali', verification_status: 'verificado', cost_cop: 2_000_000 }] },
    { category: 'decoracion', subtotal_cop: 500_000, items: [{ service_id: 'dec', name: 'Servicio dec', provider_id: 'prv-dec', provider_name: 'Proveedor dec', verification_status: 'verificado', cost_cop: 500_000 }] },
  ],
};

function quoteFor(total: number, budget: number | null): Quote {
  return { total_cop: total, remaining_cop: budget === null ? null : budget - total, breakdown: [], missing_categories: [], ineligible: [] };
}

function Harness({
  initial,
  navigation,
}: {
  initial: Partial<FlowState>;
  navigation?: any;
}) {
  const { flow, update } = useFlow();
  const [mounted, setMounted] = React.useState(false);
  return (
    <>
      {!mounted ? (
        <Pressable
          testID="seed"
          onPress={() => {
            update(initial);
            setMounted(true);
          }}
        />
      ) : (
        <MiEventoScreen navigation={navigation} />
      )}
      <Text testID="flow-snapshot">{JSON.stringify(flow)}</Text>
    </>
  );
}

async function mount(initial: Partial<FlowState>, navigation?: any) {
  const root = createRoot();
  await act(async () => {
    root.render(
      <FlowProvider>
        <Harness initial={initial} navigation={navigation} />
      </FlowProvider>,
    );
  });
  await act(async () => {
    press(find(root.container, 'seed'));
  });
  return root;
}

const snapshot = (root: TestInstance): FlowState => JSON.parse(textOf(find(root, 'flow-snapshot'))) as FlowState;
const BASE: Partial<FlowState> = { cart: CART, eventType: 'boda', guests: 100, budgetCop: 4_000_000 };

describe('utils/cart: ajuste de «Mi evento» (HU_EU_02_06)', () => {
  it('solo el entretenimiento se puede quitar (3.2)', () => {
    expect(CART.filter(canRemove).map((s) => s.category)).toEqual(['entretenimiento']);
  });
  it('replaceService cambia solo el servicio del mismo rubro sin mutar', () => {
    const next = replaceService(CART, svc('esp2', 'espacio', 900_000));
    expect(next.map((s) => s.service_id)).toEqual(['esp2', 'ali', 'dec', 'ent']);
    expect(CART[0].service_id).toBe('esp');
  });
  it('remainingBudget es null sin presupuesto y budget - total con presupuesto (RN-05, RN-22)', () => {
    expect(remainingBudget(CART, 100, null)).toBeNull();
    expect(remainingBudget(CART, 100, 4_000_000)).toBe(200_000);
  });
});

describe('MiEventoScreen: Cambiar, Quitar y Restablecer (HU_EU_02_06 — T_HU_EU_02_06_2)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('agrupa por rubro, muestra total y restante, y ofrece Quitar solo en entretenimiento (2.1, 2.3, 2.4, 3.2)', async () => {
    const root = await mount(BASE);
    const c = root.container;
    expect(textOf(find(c, 'cart-total'))).toBe('$3.800.000');
    expect(textOf(find(c, 'cart-remaining'))).toBe('$200.000');
    expect(findAllText(c)).toEqual(expect.arrayContaining(['Espacio', 'Alimentación', 'Decoración', 'Entretenimiento']));
    expect(has(c, 'btn-remove-ent')).toBe(true);
    expect(has(c, 'btn-remove-esp')).toBe(false);
    expect(has(c, 'btn-remove-ali')).toBe(false);
    expect(has(c, 'btn-remove-dec')).toBe(false);
  });

  it('sin presupuesto no muestra restante y no hay tope (RN-22)', async () => {
    jest.spyOn(endpoints, 'getCatalog').mockResolvedValue({ items: [catalogItem('esp2', 'espacio', 9_000_000)] });
    const post = jest.spyOn(endpoints, 'postQuote').mockResolvedValue(quoteFor(11_800_000, null));
    const root = await mount({ ...BASE, budgetCop: null });
    const c = root.container;
    expect(has(c, 'cart-remaining')).toBe(false);
    await act(async () => void press(find(c, 'btn-change-espacio')));
    await act(async () => void press(find(c, 'alt-esp2')));
    expect(post).toHaveBeenCalledWith(
      { event_type: 'boda', guests: 100, service_ids: ['esp2', 'ali', 'dec', 'ent'] },
      expect.any(Object),
    );
    expect(textOf(find(c, 'cart-total'))).toBe('$11.800.000');
    expect(has(c, 'cart-error')).toBe(false);
  });

  it('Cambiar muestra solo alternativas elegibles del mismo rubro con su precio (2.2, 3.1)', async () => {
    const getCatalog = jest.spyOn(endpoints, 'getCatalog').mockResolvedValue({
      items: [
        catalogItem('esp', 'espacio', 1_000_000), // el actual: no se ofrece
        catalogItem('esp-ok', 'espacio', 800_000),
        catalogItem('esp-chico', 'espacio', 400_000, { max_guests: 50 }), // no cubre 100 invitados
      ],
    });
    const root = await mount(BASE);
    await act(async () => void press(find(root.container, 'btn-change-espacio')));
    expect(getCatalog).toHaveBeenCalledWith({ category: 'espacio', event_type: 'boda', guests: 100 }, expect.any(Object));
    expect(has(root.container, 'alt-esp-ok')).toBe(true);
    expect(has(root.container, 'alt-esp')).toBe(false);
    expect(has(root.container, 'alt-esp-chico')).toBe(false);
    expect(textOf(find(root.container, 'alt-esp-ok'))).toContain('$800.000');
  });

  it('al cambiar, total y restante se actualizan en la misma pantalla con la cotización del servidor (3.3, 5)', async () => {
    jest.spyOn(endpoints, 'getCatalog').mockResolvedValue({ items: [catalogItem('esp-ok', 'espacio', 800_000)] });
    const post = jest.spyOn(endpoints, 'postQuote').mockResolvedValue(quoteFor(3_600_000, 4_000_000));
    const root = await mount(BASE);
    await act(async () => void press(find(root.container, 'btn-change-espacio')));
    await act(async () => void press(find(root.container, 'alt-esp-ok')));
    expect(post).toHaveBeenCalledWith(
      { budget_cop: 4_000_000, event_type: 'boda', guests: 100, service_ids: ['esp-ok', 'ali', 'dec', 'ent'] },
      expect.any(Object),
    );
    expect(textOf(find(root.container, 'cart-total'))).toBe('$3.600.000');
    expect(textOf(find(root.container, 'cart-remaining'))).toBe('$400.000');
    expect(snapshot(root.container).cart.map((s) => s.service_id)).toEqual(['esp-ok', 'ali', 'dec', 'ent']);
    expect(snapshot(root.container).cartOrigin).toBe('personalizado');
  });

  it('un cambio que supera el presupuesto no se aplica y muestra el mensaje literal (4, 6)', async () => {
    jest.spyOn(endpoints, 'getCatalog').mockResolvedValue({ items: [catalogItem('esp-caro', 'espacio', 3_000_000)] });
    const post = jest.spyOn(endpoints, 'postQuote');
    const root = await mount(BASE);
    await act(async () => void press(find(root.container, 'btn-change-espacio')));
    await act(async () => void press(find(root.container, 'alt-esp-caro')));
    expect(post).not.toHaveBeenCalled();
    expect(findAllText(root.container)).toContain('Ese cambio supera su presupuesto. Elija otra opción.');
    expect(snapshot(root.container).cart.map((s) => s.service_id)).toEqual(['esp', 'ali', 'dec', 'ent']);
    expect(textOf(find(root.container, 'cart-total'))).toBe('$3.800.000');
  });

  it('si el servidor rechaza con BUDGET_EXCEEDED (409) revierte el cambio y muestra el mensaje (6)', async () => {
    jest.spyOn(endpoints, 'getCatalog').mockResolvedValue({ items: [catalogItem('esp-ok', 'espacio', 800_000)] });
    jest.spyOn(endpoints, 'postQuote').mockRejectedValue(new ApiError(409, 'BUDGET_EXCEEDED', 'x'));
    const root = await mount(BASE);
    await act(async () => void press(find(root.container, 'btn-change-espacio')));
    await act(async () => void press(find(root.container, 'alt-esp-ok')));
    expect(findAllText(root.container)).toContain('Ese cambio supera su presupuesto. Elija otra opción.');
    expect(snapshot(root.container).cart.map((s) => s.service_id)).toEqual(['esp', 'ali', 'dec', 'ent']);
  });

  it('Quitar entretenimiento recalcula total y restante (2.3, 3.3)', async () => {
    const post = jest.spyOn(endpoints, 'postQuote').mockResolvedValue(quoteFor(3_500_000, 4_000_000));
    const root = await mount(BASE);
    await act(async () => void press(find(root.container, 'btn-remove-ent')));
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ service_ids: ['esp', 'ali', 'dec'] }),
      expect.any(Object),
    );
    expect(has(root.container, 'cart-item-ent')).toBe(false);
    expect(textOf(find(root.container, 'cart-total'))).toBe('$3.500.000');
    expect(textOf(find(root.container, 'cart-remaining'))).toBe('$500.000');
  });

  it('falla de conexión: revierte, muestra el aviso con Reintentar y el reintento aplica el cambio (HU_EU_01_04)', async () => {
    jest.spyOn(endpoints, 'getCatalog').mockResolvedValue({ items: [catalogItem('esp-ok', 'espacio', 800_000)] });
    const post = jest
      .spyOn(endpoints, 'postQuote')
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce(quoteFor(3_600_000, 4_000_000));
    const root = await mount(BASE);
    await act(async () => void press(find(root.container, 'btn-change-espacio')));
    await act(async () => void press(find(root.container, 'alt-esp-ok')));
    expect(findAllText(root.container)).toContain('Reintentar');
    expect(snapshot(root.container).cart[0].service_id).toBe('esp');
    const retry = root.container.queryAll((n) => n.props.accessibilityRole === 'button').find((b) => textOf(b).includes('Reintentar'))!;
    await act(async () => void press(retry));
    expect(post).toHaveBeenCalledTimes(2);
    expect(textOf(find(root.container, 'cart-total'))).toBe('$3.600.000');
  });

  it('error inesperado muestra el mensaje genérico y no aplica el cambio (6)', async () => {
    jest.spyOn(endpoints, 'postQuote').mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'x'));
    const root = await mount(BASE);
    await act(async () => void press(find(root.container, 'btn-remove-ent')));
    expect(findAllText(root.container)).toContain('No fue posible completar la operación. Intente nuevamente.');
    expect(has(root.container, 'cart-item-ent')).toBe(true);
  });

  it('Restablecer devuelve los servicios del paquete de origen (2.5, 5)', async () => {
    jest.spyOn(endpoints, 'postQuote').mockImplementation(async (body) =>
      quoteFor(body.service_ids.length === 3 ? 3_500_000 : 3_800_000, 4_000_000),
    );
    const root = await mount({ ...BASE, packages: [PACKAGE], chosenModality: 'equilibrado', cartOrigin: 'equilibrado' });
    expect(has(root.container, 'btn-reset')).toBe(false); // sin cambios no hace falta
    await act(async () => void press(find(root.container, 'btn-remove-ent')));
    expect(snapshot(root.container).cartOrigin).toBe('personalizado');
    await act(async () => void press(find(root.container, 'btn-reset')));
    expect(snapshot(root.container).cart.map((s) => s.service_id)).toEqual(['esp', 'ali', 'dec']);
    expect(snapshot(root.container).cartOrigin).toBe('equilibrado');
    expect(has(root.container, 'btn-reset')).toBe(false);
  });

  it('no ofrece Restablecer si «Mi evento» no viene de un paquete (2.5 opcional)', async () => {
    jest.spyOn(endpoints, 'postQuote').mockResolvedValue(quoteFor(3_500_000, 4_000_000));
    const root = await mount(BASE);
    await act(async () => void press(find(root.container, 'btn-remove-ent')));
    expect(has(root.container, 'btn-reset')).toBe(false);
  });

  it('bloquea Cambiar y Quitar mientras una petición está en curso (RF-GEN-01)', async () => {
    let resolve!: (q: Quote) => void;
    jest.spyOn(endpoints, 'postQuote').mockReturnValue(new Promise<Quote>((r) => (resolve = r)));
    const root = await mount(BASE);
    await act(async () => void press(find(root.container, 'btn-remove-ent')));
    expect(find(root.container, 'btn-change-espacio').props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => resolve(quoteFor(3_500_000, 4_000_000)));
    expect(find(root.container, 'btn-change-espacio').props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('muestra «Mi evento» vacío sin servicios', async () => {
    const root = await mount({});
    expect(has(root.container, 'cart-empty')).toBe(true);
  });
});

describe('MiEventoScreen: recálculo, casos límite del presupuesto, presupuesto ausente y servicios no removibles (HU_EU_02_06 — T_HU_EU_02_06_3)', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each<{
    caso: string;
    category: CartService['category'];
    alternative: CatalogItem;
    expectedServiceIds: string[];
    expectedTotalText: string;
    expectedRemainingText: string;
    quoteTotal: number;
  }>([
    {
      caso: 'reemplazo fijo en espacio que reduce el total y aumenta el restante',
      category: 'espacio',
      alternative: catalogItem('esp-barato', 'espacio', 750_000),
      expectedServiceIds: ['esp-barato', 'ali', 'dec', 'ent'],
      expectedTotalText: '$3.550.000',
      expectedRemainingText: '$450.000',
      quoteTotal: 3_550_000,
    },
    {
      caso: 'reemplazo por_invitado en alimentación (18.000 x 100 = 1.800.000)',
      category: 'alimentacion',
      alternative: catalogItem('ali-inv', 'alimentacion', 18_000, { price_model: 'por_invitado' }),
      expectedServiceIds: ['esp', 'ali-inv', 'dec', 'ent'],
      expectedTotalText: '$3.600.000',
      expectedRemainingText: '$400.000',
      quoteTotal: 3_600_000,
    },
    {
      caso: 'caso límite: reemplazo que deja el total exactamente igual al presupuesto (restante $0)',
      category: 'decoracion',
      alternative: catalogItem('dec-tope', 'decoracion', 700_000),
      expectedServiceIds: ['esp', 'ali', 'dec-tope', 'ent'],
      expectedTotalText: '$4.000.000',
      expectedRemainingText: '$0',
      quoteTotal: 4_000_000,
    },
  ])(
    'recalcula en vivo en la misma pantalla: $caso (criterios 2.2, 2.4, 3.3, 4 y 5)',
    async ({ category, alternative, expectedServiceIds, expectedTotalText, expectedRemainingText, quoteTotal }) => {
      jest.spyOn(endpoints, 'getCatalog').mockResolvedValue({ items: [alternative] });
      const post = jest.spyOn(endpoints, 'postQuote').mockResolvedValue(quoteFor(quoteTotal, 4_000_000));

      const root = await mount(BASE);
      const c = root.container;

      await act(async () => void press(find(c, `btn-change-${category}`)));
      await act(async () => void press(find(c, `alt-${alternative.id}`)));

      expect(post).toHaveBeenCalledWith(
        {
          budget_cop: 4_000_000,
          event_type: 'boda',
          guests: 100,
          service_ids: expectedServiceIds,
        },
        expect.any(Object),
      );
      expect(textOf(find(c, 'cart-total'))).toBe(expectedTotalText);
      expect(textOf(find(c, 'cart-remaining'))).toBe(expectedRemainingText);
      expect(snapshot(c).cart.map((s) => s.service_id)).toEqual(expectedServiceIds);
      expect(has(c, 'cart-error')).toBe(false);
    },
  );

  it.each<{
    caso: string;
    category: CartService['category'];
    alternative: CatalogItem;
  }>([
    {
      caso: 'excede el presupuesto por 1 COP (total $4.000.001 > presupuesto $4.000.000)',
      category: 'espacio',
      alternative: catalogItem('esp-limite-mas-1', 'espacio', 1_200_001),
    },
    {
      caso: 'alternativa por_invitado que al multiplicar por 100 invitados supera el presupuesto ($25.000 x 100 = $2.500.000 -> total $4.300.000)',
      category: 'alimentacion',
      alternative: catalogItem('ali-cara-inv', 'alimentacion', 25_000, { price_model: 'por_invitado' }),
    },
    {
      caso: 'alternativa de entretenimiento que supera el presupuesto ($600.000 -> total $4.100.000)',
      category: 'entretenimiento',
      alternative: catalogItem('ent-caro', 'entretenimiento', 600_000),
    },
  ])(
    'rechaza sin aplicar el cambio cuando $caso (criterios 4 y 6)',
    async ({ category, alternative }) => {
      jest.spyOn(endpoints, 'getCatalog').mockResolvedValue({ items: [alternative] });
      const post = jest.spyOn(endpoints, 'postQuote');

      const root = await mount(BASE);
      const c = root.container;

      await act(async () => void press(find(c, `btn-change-${category}`)));
      await act(async () => void press(find(c, `alt-${alternative.id}`)));

      expect(post).not.toHaveBeenCalled();
      expect(textOf(find(c, 'cart-error'))).toBe('Ese cambio supera su presupuesto. Elija otra opción.');
      expect(textOf(find(c, 'cart-total'))).toBe('$3.800.000');
      expect(textOf(find(c, 'cart-remaining'))).toBe('$200.000');
      expect(snapshot(c).cart.map((s) => s.service_id)).toEqual(['esp', 'ali', 'dec', 'ent']);
    },
  );

  it('con presupuesto ausente (null) permite cambios de cualquier monto y quitar entretenimiento sin mostrar nunca presupuesto restante (RN-22, criterios 2.4 y 4)', async () => {
    jest.spyOn(endpoints, 'getCatalog').mockResolvedValue({
      items: [catalogItem('esp-lujo', 'espacio', 15_000_000)],
    });
    const post = jest
      .spyOn(endpoints, 'postQuote')
      .mockResolvedValueOnce(quoteFor(17_800_000, null))
      .mockResolvedValueOnce(quoteFor(17_500_000, null));

    const root = await mount({ ...BASE, budgetCop: null });
    const c = root.container;

    expect(has(c, 'cart-remaining')).toBe(false);
    expect(textOf(find(c, 'cart-total'))).toBe('$3.800.000');

    // Cambiar espacio por uno de $15.000.000 sin tope de presupuesto
    await act(async () => void press(find(c, 'btn-change-espacio')));
    await act(async () => void press(find(c, 'alt-esp-lujo')));

    expect(post).toHaveBeenNthCalledWith(
      1,
      { event_type: 'boda', guests: 100, service_ids: ['esp-lujo', 'ali', 'dec', 'ent'] },
      expect.any(Object),
    );
    expect(textOf(find(c, 'cart-total'))).toBe('$17.800.000');
    expect(has(c, 'cart-remaining')).toBe(false);

    // Quitar entretenimiento también mantiene oculto el restante
    await act(async () => void press(find(c, 'btn-remove-ent')));
    expect(post).toHaveBeenNthCalledWith(
      2,
      { event_type: 'boda', guests: 100, service_ids: ['esp-lujo', 'ali', 'dec'] },
      expect.any(Object),
    );
    expect(textOf(find(c, 'cart-total'))).toBe('$17.500.000');
    expect(has(c, 'cart-remaining')).toBe(false);
  });

  it('no permite quitar espacio, alimentación ni decoración, y tras quitar entretenimiento no queda ningún botón Quitar (criterios 2.3 y 3.2)', async () => {
    jest.spyOn(endpoints, 'postQuote').mockResolvedValue(quoteFor(3_500_000, 4_000_000));
    const root = await mount(BASE);
    const c = root.container;

    // Antes de quitar entretenimiento: Cambiar existe en los 4 rubros, Quitar solo en entretenimiento
    for (const cat of ['espacio', 'alimentacion', 'decoracion', 'entretenimiento'] as const) {
      expect(has(c, `btn-change-${cat}`)).toBe(true);
    }
    expect(has(c, 'btn-remove-esp')).toBe(false);
    expect(has(c, 'btn-remove-ali')).toBe(false);
    expect(has(c, 'btn-remove-dec')).toBe(false);
    expect(has(c, 'btn-remove-ent')).toBe(true);

    // Al quitar entretenimiento, ningún servicio restante en pantalla tiene botón Quitar
    await act(async () => void press(find(c, 'btn-remove-ent')));
    expect(findAllText(c)).not.toContain('Quitar');
    expect(snapshot(c).cart.map((s) => s.category)).toEqual(['espacio', 'alimentacion', 'decoracion']);
  });

  it('filtra alternativas que no cumplen min_guests o max_guests para el número de invitados del evento (criterio 3.1, RN-14)', async () => {
    jest.spyOn(endpoints, 'getCatalog').mockResolvedValue({
      items: [
        catalogItem('ali', 'alimentacion', 2_000_000), // servicio actual: excluido
        catalogItem('ali-min-alto', 'alimentacion', 1_500_000, { min_guests: 150, max_guests: 300 }), // exige mínimo 150 > 100
        catalogItem('ali-max-bajo', 'alimentacion', 1_200_000, { min_guests: 10, max_guests: 80 }), // admite máximo 80 < 100
        catalogItem('ali-exacto', 'alimentacion', 17_500, { price_model: 'por_invitado', min_guests: 100, max_guests: 100 }), // elegible en el borde
      ],
    });

    const root = await mount(BASE);
    const c = root.container;

    await act(async () => void press(find(c, 'btn-change-alimentacion')));

    expect(has(c, 'alt-ali')).toBe(false);
    expect(has(c, 'alt-ali-min-alto')).toBe(false);
    expect(has(c, 'alt-ali-max-bajo')).toBe(false);
    expect(has(c, 'alt-ali-exacto')).toBe(true);
    expect(textOf(find(c, 'alt-ali-exacto'))).toContain('$1.750.000');
  });
});

describe('HU_EU_02_13 — T_HU_EU_02_13_2: Pantalla Mi evento (secciones, datos editables, avisos y reserva)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('estado vacío: muestra texto literal y botón Ir al inicio que navega a Inicio (criterio 6)', async () => {
    const mockNavigate = jest.fn();
    const root = await mount({}, { navigate: mockNavigate });
    const c = root.container;

    expect(has(c, 'cart-empty')).toBe(true);
    expect(textOf(find(c, 'cart-empty'))).toBe(EMPTY_CART_MESSAGE);
    expect(textOf(find(c, 'cart-empty'))).toBe('Aún no ha agregado servicios.');

    expect(has(c, 'btn-go-to-inicio')).toBe(true);
    expect(textOf(find(c, 'btn-go-to-inicio'))).toBe(EMPTY_CART_ACTION_TEXT);
    expect(textOf(find(c, 'btn-go-to-inicio'))).toBe('Ir al inicio');

    await act(async () => void press(find(c, 'btn-go-to-inicio')));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Inicio' });
  });

  it('permite editar tipo de evento, invitados, fecha y presupuesto opcional (criterios 2.3 y 2.4)', async () => {
    const root = await mount(BASE);
    const c = root.container;

    expect(has(c, 'event-data-section')).toBe(true);
    expect(has(c, 'option-event-type-cumpleanos')).toBe(true);
    expect(has(c, 'option-event-type-boda')).toBe(true);
    expect(has(c, 'option-event-type-xv')).toBe(true);

    // Cambiar tipo de evento a cumpleanos
    await act(async () => void press(find(c, 'option-event-type-cumpleanos')));
    expect(snapshot(c).eventType).toBe('cumpleanos');

    // Cambiar tipo de evento a xv
    await act(async () => void press(find(c, 'option-event-type-xv')));
    expect(snapshot(c).eventType).toBe('xv');

    // Editar invitados
    await act(async () => {
      find(c, 'input-guests').props.onChangeText('140');
    });
    expect(snapshot(c).guests).toBe(140);

    // Editar fecha
    await act(async () => {
      find(c, 'input-event-date').props.onChangeText('2027-11-20');
    });
    expect(snapshot(c).eventDate).toBe('2027-11-20');

    // Editar presupuesto opcional
    await act(async () => {
      find(c, 'input-budget').props.onChangeText('6000000');
    });
    expect(snapshot(c).budgetCop).toBe(6_000_000);
    // Presupuesto restante recalculado con nuevo presupuesto (6.000.000 - 3.800.000 = 2.200.000)
    expect(textOf(find(c, 'cart-remaining'))).toBe('$2.200.000');
  });

  it('revalida cada servicio y avisa de los que dejan de ser elegibles al cambiar los invitados (criterio 3.4)', async () => {
    // Carrito donde un espacio admite hasta 80 invitados
    const limitedCart: CartService[] = [
      {
        ...svc('esp-lim', 'espacio', 1_000_000),
        name: 'Salón Pequeño',
        min_guests: 10,
        max_guests: 80,
      },
      svc('ali', 'alimentacion', 2_000_000),
      svc('dec', 'decoracion', 500_000),
    ];

    const root = await mount({
      cart: limitedCart,
      eventType: 'boda',
      guests: 50,
      budgetCop: null,
    });
    const c = root.container;

    // Con 50 invitados, todos admiten (ningún aviso de inelegibles)
    expect(has(c, 'ineligible-services-notice')).toBe(false);
    expect(has(c, 'ineligible-badge-esp-lim')).toBe(false);

    // Cambiar a 100 invitados: Salón Pequeño deja de ser elegible (max 80 < 100)
    await act(async () => {
      find(c, 'input-guests').props.onChangeText('100');
    });

    expect(has(c, 'ineligible-services-notice')).toBe(true);
    expect(textOf(find(c, 'ineligible-services-notice'))).toContain('Salón Pequeño');
    expect(has(c, 'ineligible-badge-esp-lim')).toBe(true);
    expect(textOf(find(c, 'ineligible-badge-esp-lim'))).toBe(INELIGIBLE_GUESTS_MESSAGE);
    expect(textOf(find(c, 'ineligible-badge-esp-lim'))).toBe(
      'Este servicio no admite ese número de invitados.',
    );
  });

  it('muestra aviso de rubros faltantes cuando faltan espacio, alimentación o decoración y bloquea reserva (criterio 3.3)', async () => {
    const mockNavigate = jest.fn();
    // Carrito incompleto: solo espacio y alimentación (falta decoración)
    const incompleteCart: CartService[] = [
      svc('esp', 'espacio', 1_000_000),
      svc('ali', 'alimentacion', 2_000_000),
    ];

    const root = await mount(
      {
        cart: incompleteCart,
        eventType: 'boda',
        guests: 50,
        budgetCop: null,
      },
      { navigate: mockNavigate },
    );
    const c = root.container;

    // Aviso visible con el texto literal
    expect(has(c, 'missing-categories-notice')).toBe(true);
    expect(textOf(find(c, 'missing-categories-notice'))).toBe(MISSING_CATEGORIES_MESSAGE);
    expect(textOf(find(c, 'missing-categories-notice'))).toBe(
      'Agregue espacio, alimentación y decoración para reservar.',
    );

    // Al pulsar Continuar a reservar, NO navega porque faltan rubros obligatorios
    await act(async () => void press(find(c, 'btn-continue-to-reserve')));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Continuar a reservar con todos los rubros obligatorios y servicios elegibles abre Datos del cliente (criterios 2.5 y 5)', async () => {
    const mockNavigate = jest.fn();
    const root = await mount(BASE, { navigate: mockNavigate });
    const c = root.container;

    expect(has(c, 'missing-categories-notice')).toBe(false);
    expect(has(c, 'btn-continue-to-reserve')).toBe(true);
    expect(textOf(find(c, 'btn-continue-to-reserve'))).toBe(CONTINUE_TO_RESERVE_TEXT);
    expect(textOf(find(c, 'btn-continue-to-reserve'))).toBe('Continuar a reservar');

    await act(async () => void press(find(c, 'btn-continue-to-reserve')));
    expect(mockNavigate).toHaveBeenCalledWith('DatosCliente');
  });

  describe('T_HU_EU_02_13_3: Pruebas de integración de reglas de negocio en MiEventoScreen', () => {
    describe('Regla RN-03 / Criterio 3.3: Mínimo para reservar en pantalla', () => {
      it.each([
        {
          items: [svc('esp', 'espacio', 1_000_000)],
          desc: 'solo espacio',
          missingLabel: 'Alimentación, Decoración',
        },
        {
          items: [svc('esp', 'espacio', 1_000_000), svc('ali', 'alimentacion', 2_000_000)],
          desc: 'espacio y alimentación (falta decoración)',
          missingLabel: 'Decoración',
        },
        {
          items: [svc('esp', 'espacio', 1_000_000), svc('dec', 'decoracion', 500_000)],
          desc: 'espacio y decoración (falta alimentación)',
          missingLabel: 'Alimentación',
        },
        {
          items: [svc('ali', 'alimentacion', 2_000_000), svc('dec', 'decoracion', 500_000)],
          desc: 'alimentación y decoración (falta espacio)',
          missingLabel: 'Espacio',
        },
      ])('bloquea reserva y muestra rubros faltantes cuando falta algún obligatorio: $desc', async ({ items, missingLabel }) => {
        const mockNavigate = jest.fn();
        const root = await mount(
          { cart: items, eventType: 'boda', guests: 50, budgetCop: null },
          { navigate: mockNavigate },
        );
        const c = root.container;

        expect(has(c, 'missing-categories-notice')).toBe(true);
        expect(textOf(find(c, 'missing-categories-notice'))).toBe(MISSING_CATEGORIES_MESSAGE);
        expect(findAllText(c).join(' ')).toContain(`Rubros pendientes: ${missingLabel}`);

        // Continuar a reservar no debe navegar
        await act(async () => void press(find(c, 'btn-continue-to-reserve')));
        expect(mockNavigate).not.toHaveBeenCalled();
      });

      it('al quitar entretenimiento el carrito conserva los 3 obligatorios y permite reservar (3.2 y 3.3)', async () => {
        jest.spyOn(endpoints, 'postQuote').mockResolvedValue(quoteFor(3_500_000, 4_000_000));
        const mockNavigate = jest.fn();
        const root = await mount(BASE, { navigate: mockNavigate });
        const c = root.container;

        expect(has(c, 'btn-remove-ent')).toBe(true);
        expect(has(c, 'missing-categories-notice')).toBe(false);

        // Quitar entretenimiento
        await act(async () => void press(find(c, 'btn-remove-ent')));

        // Carrito conserva espacio, alimentación y decoración
        expect(has(c, 'cart-item-ent')).toBe(false);
        expect(has(c, 'missing-categories-notice')).toBe(false);

        // Puede reservar exitosamente
        await act(async () => void press(find(c, 'btn-continue-to-reserve')));
        expect(mockNavigate).toHaveBeenCalledWith('DatosCliente');
      });
    });

    describe('Regla RN-14 / Criterio 3.4: Revalidación dinámica por cambio de invitados y bloqueo de reserva', () => {
      it('detecta servicios inelegibles al cambiar invitados, muestra avisos y bloquea la reserva hasta corregir', async () => {
        const customCart: CartService[] = [
          {
            ...svc('esp-intimo', 'espacio', 1_500_000),
            name: 'Salón Íntimo',
            min_guests: 20,
            max_guests: 70,
          },
          {
            ...svc('ali-clasico', 'alimentacion', 2_000_000),
            name: 'Banquete Clásico',
            min_guests: 10,
            max_guests: 120,
          },
          {
            ...svc('dec-floral', 'decoracion', 600_000),
            name: 'Decoración Floral',
            min_guests: 5,
            max_guests: 200,
          },
        ];

        const mockNavigate = jest.fn();
        const root = await mount(
          {
            cart: customCart,
            eventType: 'boda',
            guests: 50,
            budgetCop: null,
          },
          { navigate: mockNavigate },
        );
        const c = root.container;

        // Con 50 invitados todos son elegibles
        expect(has(c, 'ineligible-services-notice')).toBe(false);
        expect(has(c, 'ineligible-badge-esp-intimo')).toBe(false);
        expect(has(c, 'ineligible-badge-ali-clasico')).toBe(false);

        // 1. Aumentar a 90 invitados: Salón Íntimo (max 70) deja de ser elegible
        await act(async () => {
          find(c, 'input-guests').props.onChangeText('90');
        });

        expect(has(c, 'ineligible-services-notice')).toBe(true);
        expect(textOf(find(c, 'ineligible-services-notice'))).toContain('Salón Íntimo');
        expect(has(c, 'ineligible-badge-esp-intimo')).toBe(true);
        expect(textOf(find(c, 'ineligible-badge-esp-intimo'))).toBe(INELIGIBLE_GUESTS_MESSAGE);
        expect(has(c, 'ineligible-badge-ali-clasico')).toBe(false);

        // Intentar reservar mientras hay servicio inelegible debe estar bloqueado
        await act(async () => void press(find(c, 'btn-continue-to-reserve')));
        expect(mockNavigate).not.toHaveBeenCalled();

        // 2. Aumentar a 150 invitados: Salón Íntimo (max 70) y Banquete Clásico (max 120) son inelegibles
        await act(async () => {
          find(c, 'input-guests').props.onChangeText('150');
        });

        expect(has(c, 'ineligible-services-notice')).toBe(true);
        const noticeText = textOf(find(c, 'ineligible-services-notice'));
        expect(noticeText).toContain('Salón Íntimo');
        expect(noticeText).toContain('Banquete Clásico');
        expect(has(c, 'ineligible-badge-esp-intimo')).toBe(true);
        expect(has(c, 'ineligible-badge-ali-clasico')).toBe(true);

        await act(async () => void press(find(c, 'btn-continue-to-reserve')));
        expect(mockNavigate).not.toHaveBeenCalled();

        // 3. Corregir invitados a 60 (dentro de [20, 70], [10, 120], [5, 200])
        await act(async () => {
          find(c, 'input-guests').props.onChangeText('60');
        });

        expect(has(c, 'ineligible-services-notice')).toBe(false);
        expect(has(c, 'ineligible-badge-esp-intimo')).toBe(false);
        expect(has(c, 'ineligible-badge-ali-clasico')).toBe(false);

        // Ahora la reserva procede normalmente hacia Datos del cliente
        await act(async () => void press(find(c, 'btn-continue-to-reserve')));
        expect(mockNavigate).toHaveBeenCalledWith('DatosCliente');
      });
    });

    describe('Regla RN-22: Presupuesto opcional en MiEventoScreen', () => {
      it('sin presupuesto no muestra restante; al escribir presupuesto muestra el restante y al borrarlo lo oculta', async () => {
        const root = await mount({
          cart: CART,
          eventType: 'boda',
          guests: 100,
          budgetCop: null,
        });
        const c = root.container;

        // Inicialmente sin presupuesto: no hay restante
        expect(has(c, 'cart-remaining')).toBe(false);
        expect(snapshot(c).budgetCop).toBeNull();

        // Ingresa presupuesto de 5.000.000
        await act(async () => {
          find(c, 'input-budget').props.onChangeText('5000000');
        });

        expect(snapshot(c).budgetCop).toBe(5_000_000);
        expect(has(c, 'cart-remaining')).toBe(true);
        // Total es 3.800.000 -> Restante es 1.200.000
        expect(textOf(find(c, 'cart-remaining'))).toBe('$1.200.000');

        // Borra el presupuesto (cadena vacía)
        await act(async () => {
          find(c, 'input-budget').props.onChangeText('');
        });

        expect(snapshot(c).budgetCop).toBeNull();
        expect(has(c, 'cart-remaining')).toBe(false);
      });
    });
  });
});
