import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError, GENERIC_ERROR, NetworkError } from '../api/client';
import { getCatalog, postQuote } from '../api/endpoints';
import type { CartService, Category, Modality, Quote } from '../api/types';
import { LoadingNotice } from '../components/LoadingNotice';
import { NetworkErrorView } from '../components/NetworkErrorView';
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import {
  canRemove,
  cartTotal,
  catalogItemToCartService,
  fitsGuests,
  packageToCartServices,
  remainingBudget,
  removeFromCart,
  replaceService,
  serviceCost,
  withinBudget,
} from '../utils/cart';
import { formatCOP } from '../utils/money';

const CATEGORY_ORDER: Category[] = ['espacio', 'alimentacion', 'decoracion', 'entretenimiento'];

const CATEGORY_LABELS: Record<Category, string> = {
  espacio: 'Espacio',
  alimentacion: 'Alimentación',
  decoracion: 'Decoración',
  entretenimiento: 'Entretenimiento',
};

/** Mensaje literal de HU_EU_02_06 (criterio 6). */
export const BUDGET_EXCEEDED_MESSAGE = 'Ese cambio supera su presupuesto. Elija otra opción.';

const surfaceTokens = {
  subtleBg: '#F7F7FA',
  accentSurface: '#F3F0FF',
  accentBorder: '#D4C9FA',
  accentText: '#3A2399',
};

interface Alternatives {
  category: Category;
  items: CartService[];
}

/**
 * HU_EU_02_13 (carrito) con el ajuste de HU_EU_02_06: cambiar o quitar servicios con total y restante
 * en vivo. El total local es inmediato; el servidor decide con POST /quotes (ADR-09).
 */
export default function MiEventoScreen() {
  const { flow, update } = useFlow();
  const { cart, budgetCop, eventType, guests } = flow;
  const guestCount = guests ?? 0;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [alternatives, setAlternatives] = useState<Alternatives | null>(null);
  const [loadingAlternatives, setLoadingAlternatives] = useState(false);
  const [applying, setApplying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<{ message: string; retry: () => void } | null>(null);

  const busy = loadingAlternatives || applying;
  const total = quote?.total_cop ?? cartTotal(cart, guestCount);
  const remaining = quote
    ? quote.remaining_cop
    : remainingBudget(cart, guestCount, budgetCop);

  const resetMessages = () => {
    setChangeError(null);
    setNetworkError(null);
  };

  const reportFailure = (err: unknown, retry: () => void) => {
    if (err instanceof NetworkError) {
      setNetworkError({ message: err.message, retry });
    } else if (err instanceof ApiError && err.code === 'BUDGET_EXCEEDED') {
      setChangeError(BUDGET_EXCEEDED_MESSAGE);
    } else {
      setChangeError(GENERIC_ERROR);
    }
  };

  const loadAlternatives = async (category: Category) => {
    if (busy || eventType === null || guests === null) return;
    resetMessages();
    setLoadingAlternatives(true);
    setSlow(false);
    try {
      const res = await getCatalog(
        { category, event_type: eventType, guests },
        { onSlow: () => setSlow(true) },
      );
      const current = cart.find((c) => c.category === category);
      const items = res.items
        .map(catalogItemToCartService)
        .filter((s) => s.category === category && fitsGuests(s, guests) && s.service_id !== current?.service_id);
      setAlternatives({ category, items });
    } catch (err) {
      reportFailure(err, () => void loadAlternatives(category));
    } finally {
      setLoadingAlternatives(false);
      setSlow(false);
    }
  };

  /** Aplica un cambio: sin tope si no hay presupuesto; con presupuesto, nunca deja el total por encima (RN-22). */
  const applyChange = async (
    nextCart: CartService[],
    origin: 'personalizado' | Modality = 'personalizado',
  ) => {
    if (busy || eventType === null || guests === null) return;
    resetMessages();
    if (!withinBudget(nextCart, guests, budgetCop)) {
      setChangeError(BUDGET_EXCEEDED_MESSAGE);
      return;
    }
    const previous = { cart, cartOrigin: flow.cartOrigin };
    update({ cart: nextCart, cartOrigin: origin });
    setQuote(null);
    setAlternatives(null);
    setApplying(true);
    setSlow(false);
    try {
      const result = await postQuote(
        {
          ...(budgetCop !== null ? { budget_cop: budgetCop } : {}),
          event_type: eventType,
          guests,
          service_ids: nextCart.map((s) => s.service_id),
        },
        { onSlow: () => setSlow(true) },
      );
      setQuote(result);
    } catch (err) {
      // El servidor rechazó o no respondió: el cambio no se aplica.
      update(previous);
      reportFailure(err, () => void applyChange(nextCart, origin));
    } finally {
      setApplying(false);
      setSlow(false);
    }
  };

  const originPackage = flow.packages.find((p) => p.modality === flow.chosenModality) ?? null;
  const canReset = originPackage !== null && flow.cartOrigin === 'personalizado';

  const handleReset = async () => {
    if (!originPackage || busy) return;
    const nextCart = packageToCartServices(originPackage);
    await applyChange(nextCart, originPackage.modality);
  };

  if (cart.length === 0) {
    return (
      <View style={styles.emptyScreen}>
        <Text style={styles.title}>Mi evento</Text>
        <Text style={styles.muted} testID="cart-empty">
          Aún no ha agregado servicios a su evento.
        </Text>
      </View>
    );
  }

  const adjustable = eventType !== null && guests !== null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Mi evento</Text>

      {/* Total y restante siempre visibles (criterio 2.4) */}
      <View style={styles.summary} testID="cart-summary">
        <View style={styles.summaryLine}>
          <Text style={styles.summaryLabel}>Total</Text>
          <Text style={styles.summaryValue} testID="cart-total">
            {formatCOP(total)}
          </Text>
        </View>
        {remaining !== null ? (
          <View style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>Presupuesto restante</Text>
            <Text style={styles.summaryValue} testID="cart-remaining">
              {formatCOP(remaining)}
            </Text>
          </View>
        ) : null}
      </View>

      {!adjustable ? (
        <Text style={styles.muted} testID="cart-needs-search">
          Indique el tipo de evento y los invitados en Inicio para ajustar sus servicios.
        </Text>
      ) : null}

      {changeError ? (
        <View style={styles.errorBanner} accessibilityRole="alert" testID="cart-error">
          <Text style={styles.errorText}>{changeError}</Text>
        </View>
      ) : null}

      {networkError ? (
        <NetworkErrorView message={networkError.message} onRetry={networkError.retry} />
      ) : null}

      {busy ? <LoadingNotice slow={slow} /> : null}

      {/* Servicios agrupados por rubro (criterio 2.1) */}
      {CATEGORY_ORDER.map((category) => {
        const services = cart.filter((s) => s.category === category);
        if (services.length === 0) return null;
        return (
          <View key={category} style={styles.group}>
            <Text style={styles.groupTitle}>{CATEGORY_LABELS[category]}</Text>
            {services.map((service) => (
              <View key={service.service_id} style={styles.card} testID={`cart-item-${service.service_id}`}>
                <View style={styles.cardText}>
                  <Text style={styles.serviceName}>{service.name}</Text>
                  <Text style={styles.muted}>{service.provider_name}</Text>
                  <Text style={styles.price}>{formatCOP(serviceCost(service, guestCount))}</Text>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    testID={`btn-change-${category}`}
                    onPress={() => void loadAlternatives(category)}
                    disabled={busy || !adjustable}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy || !adjustable }}
                    style={[styles.secondaryButton, busy || !adjustable ? styles.disabled : null]}
                  >
                    <Text style={styles.secondaryText}>Cambiar</Text>
                  </Pressable>
                  {canRemove(service) ? (
                    <Pressable
                      testID={`btn-remove-${service.service_id}`}
                      onPress={() => void applyChange(removeFromCart(cart, service.service_id))}
                      disabled={busy || !adjustable}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy || !adjustable }}
                      style={[styles.secondaryButton, busy || !adjustable ? styles.disabled : null]}
                    >
                      <Text style={styles.secondaryText}>Quitar</Text>
                    </Pressable>
                  ) : null}
                </View>

                {/* Alternativas elegibles del mismo rubro con su precio (criterio 2.2) */}
                {alternatives?.category === category ? (
                  <View style={styles.alternatives} testID={`alternatives-${category}`}>
                    {alternatives.items.length === 0 ? (
                      <Text style={styles.muted}>No hay otras opciones para este rubro.</Text>
                    ) : (
                      alternatives.items.map((alt) => (
                        <Pressable
                          key={alt.service_id}
                          testID={`alt-${alt.service_id}`}
                          onPress={() => void applyChange(replaceService(cart, alt))}
                          disabled={busy}
                          accessibilityRole="button"
                          style={[styles.altRow, busy ? styles.disabled : null]}
                        >
                          <View style={styles.cardText}>
                            <Text style={styles.serviceName}>{alt.name}</Text>
                            <Text style={styles.muted}>{alt.provider_name}</Text>
                          </View>
                          <Text style={styles.price}>{formatCOP(serviceCost(alt, guestCount))}</Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        );
      })}

      {canReset ? (
        <Pressable
          testID="btn-reset"
          onPress={() => void handleReset()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          style={[styles.resetButton, busy ? styles.disabled : null]}
        >
          <Text style={styles.resetText}>Restablecer</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  emptyScreen: { flex: 1, padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.background },
  title: { fontSize: font.title, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.base, color: colors.muted },
  summary: {
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: surfaceTokens.accentBorder,
    backgroundColor: surfaceTokens.accentSurface,
    gap: spacing.xs,
  },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  summaryLabel: { fontSize: font.base, fontWeight: '600', color: surfaceTokens.accentText },
  summaryValue: {
    fontSize: font.base,
    fontWeight: '800',
    color: surfaceTokens.accentText,
    fontVariant: ['tabular-nums'],
  },
  errorBanner: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.background,
  },
  errorText: { fontSize: font.base, color: colors.error },
  group: { gap: spacing.sm },
  groupTitle: { fontSize: font.base + 2, fontWeight: '700', color: colors.text },
  card: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  cardText: { flex: 1, gap: 2 },
  serviceName: { fontSize: font.base, fontWeight: '700', color: colors.text },
  price: { fontSize: font.base, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: spacing.sm },
  secondaryButton: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: surfaceTokens.subtleBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: font.base, fontWeight: '600', color: colors.text },
  alternatives: { gap: spacing.xs, paddingTop: spacing.xs },
  altRow: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: surfaceTokens.accentBorder,
    backgroundColor: surfaceTokens.accentSurface,
  },
  resetButton: {
    minHeight: MIN_TOUCH,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: { fontSize: font.base, fontWeight: '700', color: colors.primary },
  disabled: { opacity: 0.6 },
});
