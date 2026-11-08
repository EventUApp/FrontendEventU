import type { CartService, CatalogItem, Category, Package } from '../src/api/types';
import { GUESTS_MAX, GUESTS_MIN } from '../src/config/limits';
import {
  addToCart,
  canRemove,
  canReserve,
  cartTotal,
  catalogItemToCartService,
  ineligibleAfterGuestsChange,
  missingCategories,
  packageToCartServices,
  remainingBudget,
  REMOVABLE_CATEGORY,
  removeFromCart,
  replaceService,
  REQUIRED_CATEGORIES,
  serviceCost,
  withinBudget,
} from '../src/utils/cart';

const svc = (over: Partial<CartService>): CartService => ({
  service_id: 'svc-a',
  name: 'Servicio',
  category: 'espacio',
  provider_id: 'prv-a',
  provider_name: 'Proveedor',
  price_model: 'fijo',
  unit_price_cop: 1_000_000,
  min_guests: 20,
  max_guests: 100,
  ...over,
});

describe('costo (RN-15)', () => {
  it('fijo no depende de los invitados', () => {
    expect(serviceCost(svc({}), 50)).toBe(1_000_000);
  });
  it('por invitado multiplica', () => {
    expect(serviceCost(svc({ price_model: 'por_invitado', unit_price_cop: 14_000 }), 50)).toBe(700_000);
  });
});

describe('un servicio por rubro (RN-23)', () => {
  it('reemplaza el del mismo rubro y lo informa', () => {
    const a = svc({ service_id: 'a' });
    const b = svc({ service_id: 'b' });
    const r = addToCart([a], b);
    expect(r.cart.map((c) => c.service_id)).toEqual(['b']);
    expect(r.replaced?.service_id).toBe('a');
  });
  it('no muta la entrada', () => {
    const cart = [svc({ service_id: 'a' })];
    addToCart(cart, svc({ service_id: 'b', category: 'decoracion' }));
    expect(cart).toHaveLength(1);
  });
  it('rubros distintos conviven', () => {
    const r = addToCart([svc({ service_id: 'a' })], svc({ service_id: 'b', category: 'decoracion' }));
    expect(r.cart).toHaveLength(2);
    expect(r.replaced).toBeNull();
  });
});

describe('mínimo para reservar (RN-03)', () => {
  const base = [
    svc({ service_id: 'e', category: 'espacio' }),
    svc({ service_id: 'a', category: 'alimentacion' }),
  ];
  it('faltan rubros', () => {
    expect(missingCategories(base)).toEqual(['decoracion']);
    expect(canReserve(base)).toBe(false);
  });
  it('el entretenimiento es opcional', () => {
    const full = [...base, svc({ service_id: 'd', category: 'decoracion' })];
    expect(canReserve(full)).toBe(true);
  });
  it('quitar puede volver a incompleto', () => {
    const full = [...base, svc({ service_id: 'd', category: 'decoracion' })];
    expect(canReserve(removeFromCart(full, 'd'))).toBe(false);
  });
});

describe('presupuesto opcional (RN-22)', () => {
  const cart = [svc({ unit_price_cop: 800_000 }), svc({ service_id: 'b', category: 'decoracion', unit_price_cop: 300_000 })];
  it('sin presupuesto siempre es válido', () => {
    expect(withinBudget(cart, 50, null)).toBe(true);
  });
  it('con presupuesto compara el total', () => {
    expect(cartTotal(cart, 50)).toBe(1_100_000);
    expect(withinBudget(cart, 50, 1_100_000)).toBe(true);
    expect(withinBudget(cart, 50, 1_099_999)).toBe(false);
  });
});

describe('cambio de invitados', () => {
  it('detecta servicios que dejan de ser elegibles', () => {
    const cart = [svc({ service_id: 'a', max_guests: 100 }), svc({ service_id: 'b', category: 'decoracion', max_guests: 300 })];
    expect(ineligibleAfterGuestsChange(cart, 150).map((c) => c.service_id)).toEqual(['a']);
    expect(ineligibleAfterGuestsChange(cart, 50)).toEqual([]);
  });
});

describe('HU_EU_02_06 — T_HU_EU_02_06_3: recálculo, casos límite del presupuesto y servicios no removibles', () => {
  it.each<{ category: Category; removable: boolean }>([
    { category: 'espacio', removable: false },
    { category: 'alimentacion', removable: false },
    { category: 'decoracion', removable: false },
    { category: 'entretenimiento', removable: true },
  ])(
    'canRemove($category) devuelve $removable (criterios 2.3 y 3.2)',
    ({ category, removable }) => {
      expect(canRemove(svc({ category }))).toBe(removable);
    },
  );

  it('REQUIRED_CATEGORIES y REMOVABLE_CATEGORY son disjuntos y cubren los 4 rubros (RN-03, 3.2)', () => {
    expect(REQUIRED_CATEGORIES).toEqual(['espacio', 'alimentacion', 'decoracion']);
    expect(REMOVABLE_CATEGORY).toBe('entretenimiento');
    for (const cat of REQUIRED_CATEGORIES) {
      expect(canRemove({ category: cat })).toBe(false);
    }
    expect(canRemove({ category: REMOVABLE_CATEGORY })).toBe(true);
  });

  it.each([
    {
      caso: 'todos fijos con presupuesto holgado',
      items: [
        svc({ service_id: 'e', category: 'espacio', price_model: 'fijo', unit_price_cop: 1_200_000 }),
        svc({ service_id: 'a', category: 'alimentacion', price_model: 'fijo', unit_price_cop: 1_800_000 }),
        svc({ service_id: 'd', category: 'decoracion', price_model: 'fijo', unit_price_cop: 500_000 }),
      ],
      guests: 80,
      budgetCop: 4_000_000,
      expectedTotal: 3_500_000,
      expectedRemaining: 500_000,
      expectedWithin: true,
    },
    {
      caso: 'mixto fijo + por_invitado exactamente en el tope del presupuesto (restante = 0)',
      items: [
        svc({ service_id: 'e', category: 'espacio', price_model: 'fijo', unit_price_cop: 1_500_000 }),
        svc({ service_id: 'a', category: 'alimentacion', price_model: 'por_invitado', unit_price_cop: 20_000 }),
        svc({ service_id: 'd', category: 'decoracion', price_model: 'fijo', unit_price_cop: 500_000 }),
      ],
      guests: 100,
      budgetCop: 4_000_000,
      expectedTotal: 4_000_000,
      expectedRemaining: 0,
      expectedWithin: true,
    },
    {
      caso: 'caso límite: 1 COP por debajo del presupuesto',
      items: [
        svc({ service_id: 'e', category: 'espacio', price_model: 'fijo', unit_price_cop: 1_999_999 }),
        svc({ service_id: 'a', category: 'alimentacion', price_model: 'fijo', unit_price_cop: 1_500_000 }),
        svc({ service_id: 'd', category: 'decoracion', price_model: 'fijo', unit_price_cop: 500_000 }),
      ],
      guests: 100,
      budgetCop: 4_000_000,
      expectedTotal: 3_999_999,
      expectedRemaining: 1,
      expectedWithin: true,
    },
    {
      caso: 'caso límite: 1 COP por encima del presupuesto (rechazado)',
      items: [
        svc({ service_id: 'e', category: 'espacio', price_model: 'fijo', unit_price_cop: 2_000_001 }),
        svc({ service_id: 'a', category: 'alimentacion', price_model: 'fijo', unit_price_cop: 1_500_000 }),
        svc({ service_id: 'd', category: 'decoracion', price_model: 'fijo', unit_price_cop: 500_000 }),
      ],
      guests: 100,
      budgetCop: 4_000_000,
      expectedTotal: 4_000_001,
      expectedRemaining: -1,
      expectedWithin: false,
    },
    {
      caso: 'servicio por_invitado que al escalar a 200 invitados supera el presupuesto',
      items: [
        svc({ service_id: 'e', category: 'espacio', price_model: 'fijo', unit_price_cop: 1_000_000 }),
        svc({ service_id: 'a', category: 'alimentacion', price_model: 'por_invitado', unit_price_cop: 18_000 }),
        svc({ service_id: 'd', category: 'decoracion', price_model: 'fijo', unit_price_cop: 500_000 }),
      ],
      guests: 200,
      budgetCop: 5_000_000,
      expectedTotal: 5_100_000,
      expectedRemaining: -100_000,
      expectedWithin: false,
    },
    {
      caso: 'presupuesto ausente (null): sin tope y restante null (RN-22)',
      items: [
        svc({ service_id: 'e', category: 'espacio', price_model: 'fijo', unit_price_cop: 12_000_000 }),
        svc({ service_id: 'a', category: 'alimentacion', price_model: 'por_invitado', unit_price_cop: 45_000 }),
        svc({ service_id: 'd', category: 'decoracion', price_model: 'fijo', unit_price_cop: 3_500_000 }),
      ],
      guests: 300,
      budgetCop: null,
      expectedTotal: 29_000_000,
      expectedRemaining: null,
      expectedWithin: true,
    },
  ])(
    'recálculo y validación de tope: $caso (RN-01, RN-05, RN-15, RN-22, criterios 3.3 y 4)',
    ({ items, guests, budgetCop, expectedTotal, expectedRemaining, expectedWithin }) => {
      expect(cartTotal(items, guests)).toBe(expectedTotal);
      expect(remainingBudget(items, guests, budgetCop)).toBe(expectedRemaining);
      expect(withinBudget(items, guests, budgetCop)).toBe(expectedWithin);
    },
  );

  it('replaceService reemplaza únicamente el servicio del rubro indicado conservando el orden y sin mutar', () => {
    const initial = [
      svc({ service_id: 'e1', category: 'espacio', unit_price_cop: 1_000_000 }),
      svc({ service_id: 'a1', category: 'alimentacion', unit_price_cop: 2_000_000 }),
      svc({ service_id: 'd1', category: 'decoracion', unit_price_cop: 500_000 }),
      svc({ service_id: 'ent1', category: 'entretenimiento', unit_price_cop: 300_000 }),
    ];
    const replacement = svc({ service_id: 'a2', category: 'alimentacion', unit_price_cop: 1_600_000 });
    const updated = replaceService(initial, replacement);

    expect(updated.map((s) => s.service_id)).toEqual(['e1', 'a2', 'd1', 'ent1']);
    expect(cartTotal(updated, 100)).toBe(3_400_000);
    expect(initial.map((s) => s.service_id)).toEqual(['e1', 'a1', 'd1', 'ent1']);
  });

  it('packageToCartServices y catalogItemToCartService preservan rubros y costos para Restablecer y Cambiar (2.2, 2.5)', () => {
    const pkg: Package = {
      modality: 'equilibrado',
      total_cop: 3_800_000,
      remaining_cop: 200_000,
      breakdown: [
        {
          category: 'espacio',
          subtotal_cop: 1_200_000,
          items: [
            {
              service_id: 'esp-pkg',
              name: 'Hacienda',
              provider_id: 'prv-1',
              provider_name: 'Proveedor 1',
              verification_status: 'verificado',
              cost_cop: 1_200_000,
            },
          ],
        },
        {
          category: 'alimentacion',
          subtotal_cop: 2_000_000,
          items: [
            {
              service_id: 'ali-pkg',
              name: 'Banquete',
              provider_id: 'prv-2',
              provider_name: 'Proveedor 2',
              verification_status: 'verificado',
              cost_cop: 2_000_000,
            },
          ],
        },
        {
          category: 'decoracion',
          subtotal_cop: 600_000,
          items: [
            {
              service_id: 'dec-pkg',
              name: 'Flores',
              provider_id: 'prv-3',
              provider_name: 'Proveedor 3',
              verification_status: 'en_revision',
              cost_cop: 600_000,
            },
          ],
        },
      ],
    };

    const fromPkg = packageToCartServices(pkg);
    expect(fromPkg).toHaveLength(3);
    expect(cartTotal(fromPkg, 150)).toBe(pkg.total_cop);

    const rawCatalog: CatalogItem = {
      id: 'cat-1',
      name: 'Catering Gourmet',
      category: 'alimentacion',
      provider_id: 'prv-9',
      provider_name: 'Chef Cali',
      price_cop: 25_000,
      price_model: 'por_invitado',
      level: 'premium',
    };
    const converted = catalogItemToCartService(rawCatalog);
    expect(converted).toEqual({
      service_id: 'cat-1',
      name: 'Catering Gourmet',
      category: 'alimentacion',
      provider_id: 'prv-9',
      provider_name: 'Chef Cali',
      price_model: 'por_invitado',
      unit_price_cop: 25_000,
      min_guests: GUESTS_MIN,
      max_guests: GUESTS_MAX,
    });
    expect(serviceCost(converted, 100)).toBe(2_500_000);
  });
});
