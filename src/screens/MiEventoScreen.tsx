import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, GENERIC_ERROR, NetworkError } from '../api/client';
import { getCatalog, postQuote } from '../api/endpoints';
import type { CartService, Category, EventType, Modality, Quote } from '../api/types';
import { LoadingNotice } from '../components/LoadingNotice';
import { NetworkErrorView } from '../components/NetworkErrorView';
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import {
  canRemove,
  cartTotal,
  catalogItemToCartService,
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
  removeFromCart,
  replaceService,
  serviceCost,
  withinBudget,
} from '../utils/cart';
import { formatCOP, parseCOP } from '../utils/money';

const CATEGORY_ORDER: Category[] = ['espacio', 'alimentacion', 'decoracion', 'entretenimiento'];

const CATEGORY_LABELS: Record<Category, string> = {
  espacio: 'Espacio',
  alimentacion: 'Alimentación',
  decoracion: 'Decoración',
  entretenimiento: 'Entretenimiento',
};

const EVENT_TYPES: { id: EventType; label: string }[] = [
  { id: 'cumpleanos', label: 'Cumpleaños' },
  { id: 'boda', label: 'Boda' },
  { id: 'xv', label: 'XV años' },
];

/** Mensaje literal de HU_EU_02_06 (criterio 6). */
export const BUDGET_EXCEEDED_MESSAGE = 'Ese cambio supera su presupuesto. Elija otra opción.';

const surfaceTokens = {
  subtleBg: '#F7F7FA',
  accentSurface: '#F3F0FF',
  accentBorder: '#D4C9FA',
  accentText: '#3A2399',
  warningBg: '#FFFBEB',
  warningBorder: '#FCD34D',
  warningText: '#92400E',
};

interface Alternatives {
  category: Category;
  items: CartService[];
}

function useNavigationSafe(): any {
  try {
    return useNavigation();
  } catch {
    return null;
  }
}

export interface MiEventoScreenProps {
  navigation?: any;
}

/**
 * HU_EU_02_13: Pantalla «Mi evento» (carrito de servicios).
 * Agrupa servicios por rubro, muestra total y presupuesto restante, permite editar datos del evento
 * (tipo, invitados, fecha, presupuesto), revalida elegibilidad por capacidad, advierte rubros faltantes
 * y conduce a la reserva.
 */
export default function MiEventoScreen({ navigation: navProp }: MiEventoScreenProps = {}) {
  const navHook = useNavigationSafe();
  const navigation = navProp ?? navHook;

  const { flow, update } = useFlow();
  const { cart, budgetCop, eventType, guests, eventDate } = flow;
  const guestCount = guests ?? 0;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [alternatives, setAlternatives] = useState<Alternatives | null>(null);
  const [loadingAlternatives, setLoadingAlternatives] = useState(false);
  const [applying, setApplying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<{ message: string; retry: () => void } | null>(null);

  // Campos editables locales (criterio 2.3)
  const [guestsText, setGuestsText] = useState(guests !== null ? String(guests) : '');
  const [dateText, setDateText] = useState(eventDate ?? '');
  const [budgetText, setBudgetText] = useState(budgetCop !== null ? String(budgetCop) : '');

  const busy = loadingAlternatives || applying;
  const total = quote?.total_cop ?? cartTotal(cart, guestCount);
  const remaining = quote
    ? quote.remaining_cop
    : remainingBudget(cart, guestCount, budgetCop);

  // Validación de rubros faltantes y capacidad (criterios 3.3 y 3.4)
  const missing = missingCategories(cart);
  const hasMissingCategories = missing.length > 0;
  const ineligibleServices = guests !== null ? ineligibleAfterGuestsChange(cart, guests) : [];

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

  const handleEventTypeSelect = (type: EventType) => {
    update({ eventType: type });
  };

  const handleGuestsChange = (text: string) => {
    setGuestsText(text);
    const trimmed = text.trim();
    if (/^\d+$/.test(trimmed)) {
      update({ guests: Number(trimmed) });
    } else if (trimmed === '') {
      update({ guests: null });
    }
  };

  const handleDateChange = (text: string) => {
    setDateText(text);
    const trimmed = text.trim();
    update({ eventDate: trimmed === '' ? null : trimmed });
  };

  const handleBudgetChange = (text: string) => {
    setBudgetText(text);
    const parsed = parseCOP(text);
    update({ budgetCop: parsed });
  };

  const handleGoToInicio = () => {
    if (navigation) {
      try {
        navigation.navigate('Tabs', { screen: 'Inicio' });
      } catch {
        navigation.navigate('Inicio');
      }
    }
  };

  const handleContinueToReserve = () => {
    if (hasMissingCategories || ineligibleServices.length > 0) {
      return;
    }
    if (navigation) {
      navigation.navigate('DatosCliente');
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
          {EMPTY_CART_MESSAGE}
        </Text>
        <Pressable
          testID="btn-go-to-inicio"
          onPress={handleGoToInicio}
          accessibilityRole="button"
          style={styles.goToInicioButton}
        >
          <Text style={styles.goToInicioButtonText}>{EMPTY_CART_ACTION_TEXT}</Text>
        </Pressable>
      </View>
    );
  }

  const adjustable = eventType !== null && guests !== null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Mi evento</Text>

      {/* Total y restante siempre visibles (criterio 2.2 y 2.4) */}
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

      {/* Datos del evento editables (criterio 2.3) */}
      <View style={styles.eventDataCard} testID="event-data-section">
        <Text style={styles.sectionHeaderTitle}>Datos del evento</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Tipo de evento</Text>
          <View style={styles.chipsRow}>
            {EVENT_TYPES.map((type) => {
              const selected = eventType === type.id;
              return (
                <Pressable
                  key={type.id}
                  testID={`option-event-type-${type.id}`}
                  onPress={() => handleEventTypeSelect(type.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.chip, selected ? styles.chipSelected : null]}
                >
                  <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
                    {type.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldRow}>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>Invitados</Text>
            <TextInput
              testID="input-guests"
              value={guestsText}
              onChangeText={handleGuestsChange}
              keyboardType="number-pad"
              placeholder="Ej. 100"
              placeholderTextColor={colors.muted}
              style={styles.input}
              accessibilityLabel="Número de invitados"
            />
          </View>

          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>Fecha</Text>
            <TextInput
              testID="input-event-date"
              value={dateText}
              onChangeText={handleDateChange}
              placeholder="AAAA-MM-DD"
              placeholderTextColor={colors.muted}
              style={styles.input}
              accessibilityLabel="Fecha del evento"
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Presupuesto (opcional)</Text>
          <TextInput
            testID="input-budget"
            value={budgetText}
            onChangeText={handleBudgetChange}
            keyboardType="number-pad"
            placeholder="Sin presupuesto"
            placeholderTextColor={colors.muted}
            style={styles.input}
            accessibilityLabel="Presupuesto en pesos"
          />
        </View>
      </View>

      {/* Aviso de rubros faltantes para poder reservar (criterio 3.3) */}
      {hasMissingCategories ? (
        <View
          style={styles.missingNoticeCard}
          accessibilityRole="alert"
        >
          <Text
            style={styles.missingNoticeText}
            testID="missing-categories-notice"
          >
            {MISSING_CATEGORIES_MESSAGE}
          </Text>
          <Text style={styles.missingCategoriesSubtext}>
            {`Rubros pendientes: ${missing.map((c) => CATEGORY_LABELS[c]).join(', ')}`}
          </Text>
        </View>
      ) : null}

      {/* Aviso de servicios que dejan de ser elegibles por capacidad de invitados (criterio 3.4) */}
      {ineligibleServices.length > 0 ? (
        <View
          style={styles.ineligibleNoticeCard}
          accessibilityRole="alert"
          testID="ineligible-services-notice"
        >
          <Text style={styles.ineligibleNoticeText}>
            {`Los siguientes servicios no admiten ese número de invitados: ${ineligibleServices.map((s) => s.name).join(', ')}`}
          </Text>
        </View>
      ) : null}

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
            {services.map((service) => {
              const isServiceIneligible = ineligibleServices.some(
                (s) => s.service_id === service.service_id,
              );
              return (
                <View key={service.service_id} style={styles.card} testID={`cart-item-${service.service_id}`}>
                  <View style={styles.cardText}>
                    <Text style={styles.serviceName}>{service.name}</Text>
                    <Text style={styles.muted}>{service.provider_name}</Text>
                    <Text style={styles.price}>{formatCOP(serviceCost(service, guestCount))}</Text>
                  </View>

                  {/* Aviso individual en el servicio inelegible (criterio 3.4) */}
                  {isServiceIneligible ? (
                    <View
                      style={styles.serviceIneligibleBadge}
                      testID={`ineligible-badge-${service.service_id}`}
                      accessibilityRole="alert"
                    >
                      <Text style={styles.serviceIneligibleBadgeText}>
                        {INELIGIBLE_GUESTS_MESSAGE}
                      </Text>
                    </View>
                  ) : null}

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
              );
            })}
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

      {/* Botón Continuar a reservar (criterios 2.5, 3.3 y 5) */}
      <Pressable
        testID="btn-continue-to-reserve"
        onPress={handleContinueToReserve}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        style={[
          styles.continueButton,
          busy || hasMissingCategories || ineligibleServices.length > 0
            ? styles.continueButtonDisabled
            : null,
        ]}
      >
        <Text style={styles.continueButtonText}>{CONTINUE_TO_RESERVE_TEXT}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  emptyScreen: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { fontSize: font.title, fontWeight: '800', color: colors.text },
  muted: { fontSize: font.base, color: colors.muted },
  goToInicioButton: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.lg,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  goToInicioButtonText: {
    fontSize: font.base,
    fontWeight: '700',
    color: '#FFFFFF',
  },
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
  eventDataCard: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    gap: spacing.sm,
  },
  sectionHeaderTitle: {
    fontSize: font.base + 2,
    fontWeight: '700',
    color: colors.text,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chip: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: surfaceTokens.subtleBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: font.base - 1,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  fieldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfField: {
    flex: 1,
    gap: spacing.xs,
  },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    fontSize: font.base,
    color: colors.text,
    backgroundColor: colors.background,
  },
  missingNoticeCard: {
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: surfaceTokens.warningBorder,
    backgroundColor: surfaceTokens.warningBg,
  },
  missingNoticeText: {
    fontSize: font.base,
    fontWeight: '600',
    color: surfaceTokens.warningText,
  },
  missingCategoriesSubtext: {
    fontSize: font.base - 2,
    color: surfaceTokens.warningText,
    marginTop: 2,
  },
  ineligibleNoticeCard: {
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: '#FDF2F2',
  },
  ineligibleNoticeText: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.error,
  },
  serviceIneligibleBadge: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    alignSelf: 'flex-start',
  },
  serviceIneligibleBadgeText: {
    fontSize: font.base - 2,
    fontWeight: '600',
    color: colors.error,
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
  continueButton: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  continueButtonDisabled: {
    opacity: 0.6,
  },
  continueButtonText: {
    fontSize: font.base,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  disabled: { opacity: 0.6 },
});
