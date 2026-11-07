import { BUDGET_MAX_COP, BUDGET_MIN_COP, GUESTS_MAX, GUESTS_MIN } from '../config/limits';
import { formatCOP, parseCOP } from './money';

export type EventType = 'cumpleanos' | 'boda' | 'xv';
export type FieldErrors = Partial<Record<'budget_cop' | 'event_type' | 'guests', string>>;

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
