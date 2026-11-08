import { BUDGET_MAX_COP, BUDGET_MIN_COP, GUESTS_MAX, GUESTS_MIN } from '../config/limits';
import { formatCOP, parseCOP } from './money';

export type EventType = 'cumpleanos' | 'boda' | 'xv';
export type FieldErrors = Partial<
  Record<'budget_cop' | 'event_type' | 'guests' | 'event_date', string>
>;

function getLocalTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Mensajes PROPUESTO (backlog PB-01). Devuelven null si el campo es válido.
export function validateBudget(text: string): string | null {
  if (text.trim() === '') return 'Ingrese su presupuesto.';
  const value = parseCOP(text);
  if (value === null || value < BUDGET_MIN_COP || value > BUDGET_MAX_COP) {
    return `El presupuesto debe estar entre ${formatCOP(BUDGET_MIN_COP)} y ${formatCOP(BUDGET_MAX_COP)}.`;
  }
  return null;
}

export function validateEventType(value: EventType | null): string | null {
  return value ? null : 'Seleccione el tipo de evento.';
}

export function validateGuests(text: string): string | null {
  const msg = `Ingrese un número de invitados entre ${GUESTS_MIN} y ${GUESTS_MAX}.`;
  if (!/^\d+$/.test(text.trim())) return msg;
  const value = Number(text);
  return value < GUESTS_MIN || value > GUESTS_MAX ? msg : null;
}

export function validateEventDate(
  text: string,
  options?: { optional?: boolean; today?: string },
): string | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return options?.optional ? null : 'Seleccione una fecha posterior a hoy.';
  }
  const msg = 'Seleccione una fecha posterior a hoy.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return msg;
  const [yStr, mStr, dStr] = trimmed.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() + 1 !== m ||
    parsed.getUTCDate() !== d
  ) {
    return msg;
  }
  const todayISO = options?.today ?? getLocalTodayISO();
  return trimmed > todayISO ? null : msg;
}

/** Mensaje literal de HU_EU_02_15 (criterio 3.1). */
export const PRICE_MIN_GREATER_THAN_MAX_MESSAGE =
  'El precio mínimo no puede ser mayor que el máximo.';

/**
 * Valida que el precio mínimo no sea mayor que el precio máximo (criterio 3.1).
 * Ambos parámetros son opcionales (enteros en COP).
 */
export function validatePriceRange(
  minCop: number | null,
  maxCop: number | null,
): string | null {
  if (minCop !== null && maxCop !== null && minCop > maxCop) {
    return PRICE_MIN_GREATER_THAN_MAX_MESSAGE;
  }
  return null;
}

/** Mensajes literales de HU_EU_03_09 (criterios 3.1 a 3.4). */
export const NAME_REQUIRED_MESSAGE = 'Ingrese su nombre.';
export const EMAIL_INVALID_MESSAGE = 'Ingrese un correo electrónico válido.';
export const PHONE_INVALID_MESSAGE = 'Ingrese un teléfono de 10 dígitos.';
export const DATE_POSTERIOR_MESSAGE = 'Seleccione una fecha posterior a hoy.';

/**
 * Valida nombre obligatorio (criterio 3.1).
 */
export function validateName(text: string): string | null {
  return text.trim() === '' ? NAME_REQUIRED_MESSAGE : null;
}

/**
 * Valida correo electrónico con formato válido (criterio 3.2).
 */
export function validateEmail(text: string): string | null {
  const trimmed = text.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed) ? null : EMAIL_INVALID_MESSAGE;
}

/**
 * Valida teléfono numérico de exactamente 10 dígitos (Propuesto, criterio 3.3).
 */
export function validatePhone(text: string): string | null {
  const trimmed = text.trim();
  return /^\d{10}$/.test(trimmed) ? null : PHONE_INVALID_MESSAGE;
}


