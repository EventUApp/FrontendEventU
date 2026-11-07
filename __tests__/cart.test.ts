import type { CartService } from '../src/api/types';
import {
  addToCart,
  canReserve,
  cartTotal,
  ineligibleAfterGuestsChange,
  missingCategories,
  removeFromCart,
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
