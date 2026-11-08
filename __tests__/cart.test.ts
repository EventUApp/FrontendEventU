import type { CartService, CatalogItem, Category, Package } from '../src/api/types';
import { GUESTS_MAX, GUESTS_MIN } from '../src/config/limits';
import {
  addToCart,
  CANCEL_REPLACE_TEXT,
  canRemove,
  canReserve,
  cartTotal,
  catalogItemToCartService,
  CONFIRM_REPLACE_TEXT,
  CONTINUE_TO_RESERVE_TEXT,
  EMPTY_CART_ACTION_TEXT,
  EMPTY_CART_MESSAGE,
  fitsGuests,
  INELIGIBLE_GUESTS_MESSAGE,
  ineligibleAfterGuestsChange,
  missingCategories,
  MISSING_CATEGORIES_MESSAGE,
  packageToCartServices,
  remainingBudget,
  REMOVABLE_CATEGORY,
  removeFromCart,
  REPLACE_CATEGORY_CONFIRMATION_MESSAGE,
  replaceService,
  REQUIRED_CATEGORIES,
  serviceCost,
  UNEXPECTED_ERROR_MESSAGE,
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

describe('HU_EU_02_13 — T_HU_EU_02_13_1: Estado de Mi evento (utils/cart)', () => {
  it('constantes literales coinciden con los criterios de aceptación de HU_EU_02_13', () => {
    expect(REPLACE_CATEGORY_CONFIRMATION_MESSAGE).toBe(
      'Ya tiene un servicio de este rubro. ¿Desea reemplazarlo?',
    );
    expect(CONFIRM_REPLACE_TEXT).toBe('Reemplazar');
    expect(CANCEL_REPLACE_TEXT).toBe('Cancelar');
    expect(INELIGIBLE_GUESTS_MESSAGE).toBe('Este servicio no admite ese número de invitados.');
    expect(MISSING_CATEGORIES_MESSAGE).toBe(
      'Agregue espacio, alimentación y decoración para reservar.',
    );
    expect(EMPTY_CART_MESSAGE).toBe('Aún no ha agregado servicios.');
    expect(EMPTY_CART_ACTION_TEXT).toBe('Ir al inicio');
    expect(UNEXPECTED_ERROR_MESSAGE).toBe(
      'No fue posible completar la operación. Intente nuevamente.',
    );
    expect(CONTINUE_TO_RESERVE_TEXT).toBe('Continuar a reservar');
  });

  describe('Adición con reemplazo por rubro (criterio 3.1, RN-23)', () => {
    it('agrega servicio cuando el carrito está vacío sin reemplazo', () => {
      const item = svc({ service_id: 's1', category: 'espacio' });
      const res = addToCart([], item);
      expect(res.cart).toEqual([item]);
      expect(res.replaced).toBeNull();
    });

    it('agrega servicios de rubros distintos acumulándolos', () => {
      const sEspacio = svc({ service_id: 's1', category: 'espacio' });
      const sAlim = svc({ service_id: 's2', category: 'alimentacion' });
      const sDeco = svc({ service_id: 's3', category: 'decoracion' });

      let current = addToCart([], sEspacio).cart;
      current = addToCart(current, sAlim).cart;
      const res = addToCart(current, sDeco);

      expect(res.cart).toHaveLength(3);
      expect(res.cart.map((s) => s.category)).toEqual(['espacio', 'alimentacion', 'decoracion']);
      expect(res.replaced).toBeNull();
    });

    it('reemplaza el servicio existente si es del mismo rubro y conserva los demás (RN-23)', () => {
      const sEspacio1 = svc({ service_id: 's1', category: 'espacio', name: 'Salón 1' });
      const sAlim = svc({ service_id: 's2', category: 'alimentacion' });
      const sEspacio2 = svc({ service_id: 's3', category: 'espacio', name: 'Salón 2' });

      const initial = [sEspacio1, sAlim];
      const res = addToCart(initial, sEspacio2);

      expect(res.cart).toHaveLength(2);
      expect(res.cart.map((s) => s.service_id)).toEqual(['s2', 's3']);
      expect(res.replaced).toEqual(sEspacio1);
    });

    it('addToCart no muta el array de entrada', () => {
      const s1 = svc({ service_id: 's1', category: 'espacio' });
      const s2 = svc({ service_id: 's2', category: 'espacio' });
      const original = [s1];
      Object.freeze(original);

      const res = addToCart(original, s2);
      expect(res.cart).toHaveLength(1);
      expect(res.cart[0].service_id).toBe('s2');
      expect(res.replaced).toEqual(s1);
    });
  });

  describe('Quitar servicios (criterio 2.1 y HU_EU_02_06)', () => {
    it('removeFromCart elimina el servicio indicado sin mutar el array original', () => {
      const s1 = svc({ service_id: 's1' });
      const s2 = svc({ service_id: 's2' });
      const original = [s1, s2];
      Object.freeze(original);

      const result = removeFromCart(original, 's1');
      expect(result).toEqual([s2]);
    });

    it('removeFromCart con id inexistente devuelve los mismos elementos', () => {
      const s1 = svc({ service_id: 's1' });
      const result = removeFromCart([s1], 'inexistente');
      expect(result).toEqual([s1]);
    });
  });

  describe('Revalidación por cambio de invitados (criterios 3.2, 3.4 y RN-14)', () => {
    const cart = [
      svc({ service_id: 'esp', category: 'espacio', min_guests: 50, max_guests: 150 }),
      svc({ service_id: 'ali', category: 'alimentacion', min_guests: 20, max_guests: 200 }),
      svc({ service_id: 'dec', category: 'decoracion', min_guests: 10, max_guests: 500 }),
    ];

    it.each([
      {
        caso: '100 invitados está dentro de la capacidad de todos -> ninguno inelegible',
        guests: 100,
        expectedIneligibleIds: [],
      },
      {
        caso: '40 invitados está por debajo del mínimo de espacio (50) -> espacio inelegible',
        guests: 40,
        expectedIneligibleIds: ['esp'],
      },
      {
        caso: '15 invitados está por debajo del mínimo de espacio (50) y alimentación (20)',
        guests: 15,
        expectedIneligibleIds: ['esp', 'ali'],
      },
      {
        caso: '180 invitados excede el máximo de espacio (150) -> espacio inelegible',
        guests: 180,
        expectedIneligibleIds: ['esp'],
      },
      {
        caso: '250 invitados excede el máximo de espacio (150) y alimentación (200)',
        guests: 250,
        expectedIneligibleIds: ['esp', 'ali'],
      },
      {
        caso: 'Borde exacto mínimo de espacio (50) -> todos admiten',
        guests: 50,
        expectedIneligibleIds: [],
      },
      {
        caso: 'Borde exacto máximo de espacio (150) -> todos admiten',
        guests: 150,
        expectedIneligibleIds: [],
      },
    ])('$caso', ({ guests, expectedIneligibleIds }) => {
      const ineligible = ineligibleAfterGuestsChange(cart, guests);
      expect(ineligible.map((s) => s.service_id)).toEqual(expectedIneligibleIds);
    });
  });

  describe('Reglas de reserva mínima (criterio 3.3, RN-03)', () => {
    it('canReserve exige espacio, alimentación y decoración', () => {
      const espacio = svc({ category: 'espacio' });
      const alimentacion = svc({ category: 'alimentacion' });
      const decoracion = svc({ category: 'decoracion' });
      const entretenimiento = svc({ category: 'entretenimiento' });

      expect(canReserve([])).toBe(false);
      expect(canReserve([espacio])).toBe(false);
      expect(canReserve([espacio, alimentacion])).toBe(false);
      expect(missingCategories([espacio, alimentacion])).toEqual(['decoracion']);

      expect(canReserve([espacio, alimentacion, decoracion])).toBe(true);
      expect(missingCategories([espacio, alimentacion, decoracion])).toEqual([]);

      // Entretenimiento es opcional pero con los 4 rubros también es válido
      expect(canReserve([espacio, alimentacion, decoracion, entretenimiento])).toBe(true);
    });
  });

  describe('HU_EU_02_13 — T_HU_EU_02_13_3: Pruebas exhaustivas de las reglas de negocio (RN-03, RN-14, RN-22, RN-23)', () => {
    describe('Regla RN-23: Un servicio por rubro y reemplazo exhaustivo en los 4 rubros', () => {
      it.each<Category>(['espacio', 'alimentacion', 'decoracion', 'entretenimiento'])(
        'reemplaza correctamente el servicio en el rubro %s y retorna el anterior',
        (category) => {
          const item1 = svc({ service_id: `${category}-1`, name: `${category} Original`, category });
          const item2 = svc({ service_id: `${category}-2`, name: `${category} Nuevo`, category });

          // Partiendo de un carrito con los 4 rubros completos
          const allFour: CartService[] = [
            svc({ service_id: 'esp-base', category: 'espacio' }),
            svc({ service_id: 'ali-base', category: 'alimentacion' }),
            svc({ service_id: 'dec-base', category: 'decoracion' }),
            svc({ service_id: 'ent-base', category: 'entretenimiento' }),
          ].map((s) => (s.category === category ? item1 : s));

          const result = addToCart(allFour, item2);

          // El carrito sigue teniendo exactamente 4 servicios
          expect(result.cart).toHaveLength(4);
          // El servicio de la categoría fue reemplazado por item2
          expect(result.cart.find((s) => s.category === category)?.service_id).toBe(item2.service_id);
          // El resultado informa exactamente el servicio reemplazado (item1)
          expect(result.replaced).toEqual(item1);
          // Los otros 3 servicios permanecen intactos
          for (const other of allFour.filter((s) => s.category !== category)) {
            expect(result.cart.find((s) => s.service_id === other.service_id)).toEqual(other);
          }
        },
      );

      it('acumula hasta los 4 rubros y reemplaza secuencialmente sin pérdida de datos ni mutación', () => {
        const e1 = svc({ service_id: 'e1', category: 'espacio' });
        const a1 = svc({ service_id: 'a1', category: 'alimentacion' });
        const d1 = svc({ service_id: 'd1', category: 'decoracion' });
        const ent1 = svc({ service_id: 'ent1', category: 'entretenimiento' });

        let current: CartService[] = [];
        const r1 = addToCart(current, e1);
        expect(r1.replaced).toBeNull();
        current = r1.cart;

        const r2 = addToCart(current, a1);
        expect(r2.replaced).toBeNull();
        current = r2.cart;

        const r3 = addToCart(current, d1);
        expect(r3.replaced).toBeNull();
        current = r3.cart;

        const r4 = addToCart(current, ent1);
        expect(r4.replaced).toBeNull();
        current = r4.cart;

        expect(current).toHaveLength(4);

        // Ahora reemplazamos cada uno con una versión 2
        const e2 = svc({ service_id: 'e2', category: 'espacio' });
        const rE = addToCart(current, e2);
        expect(rE.replaced?.service_id).toBe('e1');
        expect(rE.cart).toHaveLength(4);
        current = rE.cart;

        const a2 = svc({ service_id: 'a2', category: 'alimentacion' });
        const rA = addToCart(current, a2);
        expect(rA.replaced?.service_id).toBe('a1');
        expect(rA.cart).toHaveLength(4);
        current = rA.cart;

        const d2 = svc({ service_id: 'd2', category: 'decoracion' });
        const rD = addToCart(current, d2);
        expect(rD.replaced?.service_id).toBe('d1');
        expect(rD.cart).toHaveLength(4);
        current = rD.cart;

        const ent2 = svc({ service_id: 'ent2', category: 'entretenimiento' });
        const rEnt = addToCart(current, ent2);
        expect(rEnt.replaced?.service_id).toBe('ent1');
        expect(rEnt.cart).toHaveLength(4);
        current = rEnt.cart;

        expect(current.map((s) => s.service_id)).toEqual(['e2', 'a2', 'd2', 'ent2']);
      });
    });

    describe('Regla RN-03: Mínimo para reservar (espacio + alimentación + decoración) — Cobertura combinatoria completa (2^4 = 16 combinaciones)', () => {
      // Definimos las 16 combinaciones posibles de los 4 rubros
      const combinations: {
        hasEspacio: boolean;
        hasAlimentacion: boolean;
        hasDecoracion: boolean;
        hasEntretenimiento: boolean;
        canReserve: boolean;
        missing: Category[];
      }[] = [];

      const bools = [false, true];
      for (const hasEspacio of bools) {
        for (const hasAlimentacion of bools) {
          for (const hasDecoracion of bools) {
            for (const hasEntretenimiento of bools) {
              const expectedCanReserve = hasEspacio && hasAlimentacion && hasDecoracion;
              const expectedMissing: Category[] = [];
              if (!hasEspacio) expectedMissing.push('espacio');
              if (!hasAlimentacion) expectedMissing.push('alimentacion');
              if (!hasDecoracion) expectedMissing.push('decoracion');
              combinations.push({
                hasEspacio,
                hasAlimentacion,
                hasDecoracion,
                hasEntretenimiento,
                canReserve: expectedCanReserve,
                missing: expectedMissing,
              });
            }
          }
        }
      }

      it.each(combinations)(
        'E:$hasEspacio, A:$hasAlimentacion, D:$hasDecoracion, ENT:$hasEntretenimiento -> canReserve=$canReserve, missing=$missing',
        ({ hasEspacio, hasAlimentacion, hasDecoracion, hasEntretenimiento, canReserve: expectedCanReserve, missing: expectedMissing }) => {
          const testCart: CartService[] = [];
          if (hasEspacio) testCart.push(svc({ service_id: 'e', category: 'espacio' }));
          if (hasAlimentacion) testCart.push(svc({ service_id: 'a', category: 'alimentacion' }));
          if (hasDecoracion) testCart.push(svc({ service_id: 'd', category: 'decoracion' }));
          if (hasEntretenimiento) testCart.push(svc({ service_id: 'ent', category: 'entretenimiento' }));

          expect(canReserve(testCart)).toBe(expectedCanReserve);
          expect(missingCategories(testCart)).toEqual(expectedMissing);
        },
      );

      it('transición de completo a incompleto al quitar y viceversa', () => {
        const fullCart = [
          svc({ service_id: 'e', category: 'espacio' }),
          svc({ service_id: 'a', category: 'alimentacion' }),
          svc({ service_id: 'd', category: 'decoracion' }),
          svc({ service_id: 'ent', category: 'entretenimiento' }),
        ];

        expect(canReserve(fullCart)).toBe(true);

        // Quitar entretenimiento (opcional): sigue pudiendo reservar
        const withoutEnt = removeFromCart(fullCart, 'ent');
        expect(canReserve(withoutEnt)).toBe(true);
        expect(missingCategories(withoutEnt)).toEqual([]);

        // Quitar espacio (obligatorio): ya no puede reservar
        const withoutEsp = removeFromCart(withoutEnt, 'e');
        expect(canReserve(withoutEsp)).toBe(false);
        expect(missingCategories(withoutEsp)).toEqual(['espacio']);

        // Reincorporar espacio: vuelve a ser válido para reservar
        const restored = addToCart(withoutEsp, svc({ service_id: 'e2', category: 'espacio' })).cart;
        expect(canReserve(restored)).toBe(true);
        expect(missingCategories(restored)).toEqual([]);
      });
    });

    describe('Regla RN-14 y Criterio 3.2: Capacidad y límites de invitados en bordes exactos', () => {
      const multiRangeCart: CartService[] = [
        svc({ service_id: 's-estrecho', name: 'Salón Pequeño', category: 'espacio', min_guests: 30, max_guests: 80 }),
        svc({ service_id: 's-medio', name: 'Banquete Medio', category: 'alimentacion', min_guests: 50, max_guests: 150 }),
        svc({ service_id: 's-amplio', name: 'Decoración Amplia', category: 'decoracion', min_guests: 10, max_guests: 300 }),
      ];

      it.each([
        { guests: 9, expectedIneligible: ['s-estrecho', 's-medio', 's-amplio'], desc: 'debajo de min de los 3' },
        { guests: 10, expectedIneligible: ['s-estrecho', 's-medio'], desc: 'borde exacto min de s-amplio' },
        { guests: 29, expectedIneligible: ['s-estrecho', 's-medio'], desc: '1 debajo de min de s-estrecho' },
        { guests: 30, expectedIneligible: ['s-medio'], desc: 'borde exacto min de s-estrecho' },
        { guests: 49, expectedIneligible: ['s-medio'], desc: '1 debajo de min de s-medio' },
        { guests: 50, expectedIneligible: [], desc: 'borde exacto min de s-medio (los 3 admiten)' },
        { guests: 80, expectedIneligible: [], desc: 'borde exacto max de s-estrecho (los 3 admiten)' },
        { guests: 81, expectedIneligible: ['s-estrecho'], desc: '1 por encima del max de s-estrecho' },
        { guests: 150, expectedIneligible: ['s-estrecho'], desc: 'borde exacto max de s-medio' },
        { guests: 151, expectedIneligible: ['s-estrecho', 's-medio'], desc: '1 por encima del max de s-medio' },
        { guests: 300, expectedIneligible: ['s-estrecho', 's-medio'], desc: 'borde exacto max de s-amplio' },
        { guests: 301, expectedIneligible: ['s-estrecho', 's-medio', 's-amplio'], desc: '1 por encima del max de s-amplio' },
        { guests: 500, expectedIneligible: ['s-estrecho', 's-medio', 's-amplio'], desc: 'GUESTS_MAX' },
      ])('$desc ($guests invitados)', ({ guests, expectedIneligible }) => {
        const ineligible = ineligibleAfterGuestsChange(multiRangeCart, guests);
        expect(ineligible.map((s) => s.service_id)).toEqual(expectedIneligible);
      });

      it('fitsGuests responde estrictamente según min_guests <= guests <= max_guests', () => {
        const item = svc({ min_guests: 20, max_guests: 100 });
        expect(fitsGuests(item, 19)).toBe(false);
        expect(fitsGuests(item, 20)).toBe(true);
        expect(fitsGuests(item, 60)).toBe(true);
        expect(fitsGuests(item, 100)).toBe(true);
        expect(fitsGuests(item, 101)).toBe(false);
      });
    });

    describe('Regla RN-22: Presupuesto opcional y recálculo dinámico con cambio de invitados', () => {
      const dynamicCart: CartService[] = [
        svc({ service_id: 'e', category: 'espacio', price_model: 'fijo', unit_price_cop: 2_000_000 }),
        svc({ service_id: 'a', category: 'alimentacion', price_model: 'por_invitado', unit_price_cop: 30_000 }),
        svc({ service_id: 'd', category: 'decoracion', price_model: 'fijo', unit_price_cop: 1_000_000 }),
      ];

      it('sin presupuesto (null) nunca hay tope ni restricción de gasto (RN-22)', () => {
        for (const g of [10, 50, 100, 200, 500]) {
          expect(remainingBudget(dynamicCart, g, null)).toBeNull();
          expect(withinBudget(dynamicCart, g, null)).toBe(true);
        }
      });

      it.each([
        { guests: 50, expectedCost: 2_000_000 + 30_000 * 50 + 1_000_000, budget: 5_000_000, expectedRemaining: 500_000, within: true },
        { guests: 66, expectedCost: 2_000_000 + 30_000 * 66 + 1_000_000, budget: 4_980_000, expectedRemaining: 0, within: true },
        { guests: 67, expectedCost: 2_000_000 + 30_000 * 67 + 1_000_000, budget: 5_000_000, expectedRemaining: -10_000, within: false },
        { guests: 100, expectedCost: 2_000_000 + 30_000 * 100 + 1_000_000, budget: 6_000_000, expectedRemaining: 0, within: true },
      ])(
        'con $guests invitados -> total $expectedCost y presupuesto $budget (within=$within)',
        ({ guests, expectedCost, budget, expectedRemaining, within }) => {
          expect(cartTotal(dynamicCart, guests)).toBe(expectedCost);
          expect(remainingBudget(dynamicCart, guests, budget)).toBe(expectedRemaining);
          expect(withinBudget(dynamicCart, guests, budget)).toBe(within);
        },
      );
    });
  });
});
