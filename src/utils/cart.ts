import type { CartService, Category } from '../api/types';

/** Rubros obligatorios para poder reservar (RN-03, RN-23). */
export const REQUIRED_CATEGORIES: Category[] = ['espacio', 'alimentacion', 'decoracion'];

export interface AddResult {
  cart: CartService[];
  replaced: CartService | null; // servicio del mismo rubro que se sustituyó (RN-23)
}

/** Costo de un servicio para un número de invitados (RN-15). Solo informativo: el servidor decide. */
export function serviceCost(s: CartService, guests: number): number {
  return s.price_model === 'fijo' ? s.unit_price_cop : s.unit_price_cop * guests;
}

/** El servicio admite el número de invitados (RN-14). */
export function fitsGuests(s: Pick<CartService, 'min_guests' | 'max_guests'>, guests: number): boolean {
  return guests >= s.min_guests && guests <= s.max_guests;
}

/** Agrega un servicio; si ya hay uno del mismo rubro lo reemplaza (un servicio por rubro, RN-23). No muta la entrada. */
export function addToCart(cart: CartService[], item: CartService): AddResult {
  const replaced = cart.find((c) => c.category === item.category) ?? null;
  return { cart: [...cart.filter((c) => c.category !== item.category), item], replaced };
}

export function removeFromCart(cart: CartService[], serviceId: string): CartService[] {
  return cart.filter((c) => c.service_id !== serviceId);
}

/** Rubros obligatorios que faltan para reservar. */
export function missingCategories(cart: CartService[]): Category[] {
  return REQUIRED_CATEGORIES.filter((cat) => !cart.some((c) => c.category === cat));
}

export function canReserve(cart: CartService[]): boolean {
  return missingCategories(cart).length === 0;
}

export function cartTotal(cart: CartService[], guests: number): number {
  return cart.reduce((sum, s) => sum + serviceCost(s, guests), 0);
}

/** Con presupuesto, el cambio no puede dejar el total por encima (RN-01, RN-22). Sin presupuesto siempre es válido. */
export function withinBudget(cart: CartService[], guests: number, budgetCop: number | null): boolean {
  return budgetCop === null || cartTotal(cart, guests) <= budgetCop;
}

/** Servicios del carrito que dejan de admitir el nuevo número de invitados (HU_EU_02_13, 3.3). */
export function ineligibleAfterGuestsChange(cart: CartService[], guests: number): CartService[] {
  return cart.filter((s) => !fitsGuests(s, guests));
}
