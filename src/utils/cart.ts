import type { CatalogItem, CartService, Category, Package } from '../api/types';
import { GUESTS_MAX, GUESTS_MIN } from '../config/limits';

/** Rubros obligatorios para poder reservar (RN-03, RN-23). */
export const REQUIRED_CATEGORIES: Category[] = ['espacio', 'alimentacion', 'decoracion'];

/** Rubro que se puede quitar de «Mi evento»: solo el entretenimiento (HU_EU_02_06, 3.2). */
export const REMOVABLE_CATEGORY: Category = 'entretenimiento';

/** Mensajes literales de HU_EU_02_13 (criterios 2.5, 3.1, 3.2, 3.3 y 6). */
export const REPLACE_CATEGORY_CONFIRMATION_MESSAGE =
  'Ya tiene un servicio de este rubro. ¿Desea reemplazarlo?';
export const CONFIRM_REPLACE_TEXT = 'Reemplazar';
export const CANCEL_REPLACE_TEXT = 'Cancelar';
export const INELIGIBLE_GUESTS_MESSAGE = 'Este servicio no admite ese número de invitados.';
export const MISSING_CATEGORIES_MESSAGE =
  'Agregue espacio, alimentación y decoración para reservar.';
export const EMPTY_CART_MESSAGE = 'Aún no ha agregado servicios.';
export const EMPTY_CART_ACTION_TEXT = 'Ir al inicio';
export const UNEXPECTED_ERROR_MESSAGE =
  'No fue posible completar la operación. Intente nuevamente.';
export const CONTINUE_TO_RESERVE_TEXT = 'Continuar a reservar';

export interface AddResult {
  cart: CartService[];
  replaced: CartService | null; // servicio del mismo rubro que se sustituyó (RN-23)
}

/** Servicios de un paquete recomendado como servicios de «Mi evento» (el costo ya incluye a los invitados). */
export function packageToCartServices(pkg: Package): CartService[] {
  return pkg.breakdown.flatMap((line) =>
    line.items.map((item) => ({
      service_id: item.service_id,
      name: item.name,
      category: line.category,
      provider_id: item.provider_id,
      provider_name: item.provider_name,
      price_model: 'fijo' as const,
      unit_price_cop: item.cost_cop,
      min_guests: GUESTS_MIN,
      max_guests: GUESTS_MAX,
    })),
  );
}

/** Alternativa del catálogo como servicio de «Mi evento». El precio es solo informativo: el servidor decide. */
export function catalogItemToCartService(item: CatalogItem): CartService {
  return {
    service_id: item.id,
    name: item.name,
    category: item.category,
    provider_id: item.provider_id,
    provider_name: item.provider_name,
    price_model: item.price_model,
    unit_price_cop: item.price_cop ?? 0,
    min_guests: item.min_guests ?? GUESTS_MIN,
    max_guests: item.max_guests ?? GUESTS_MAX,
  };
}

/** Un servicio se puede quitar solo si es de entretenimiento (HU_EU_02_06, 3.2). */
export function canRemove(s: Pick<CartService, 'category'>): boolean {
  return s.category === REMOVABLE_CATEGORY;
}

/** Cambia el servicio de un rubro por otro del mismo rubro. No muta la entrada. */
export function replaceService(cart: CartService[], item: CartService): CartService[] {
  return cart.map((c) => (c.category === item.category ? item : c));
}

/** Presupuesto restante (RN-05). Null si no hay presupuesto (RN-22). */
export function remainingBudget(cart: CartService[], guests: number, budgetCop: number | null): number | null {
  return budgetCop === null ? null : budgetCop - cartTotal(cart, guests);
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
