import { useNavigation } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiError, GENERIC_ERROR, NetworkError } from '../api/client';
import { postReservation } from '../api/endpoints';
import type { Category, ReservationRequest } from '../api/types';
import { FieldError } from '../components/FieldError';
import { LoadingNotice } from '../components/LoadingNotice';
import { MinimalIcon } from '../components/MinimalIcon';
import { NetworkErrorView } from '../components/NetworkErrorView';
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import {
  cartTotal,
  missingCategories,
  MISSING_CATEGORIES_MESSAGE,
  remainingBudget,
  serviceCost,
} from '../utils/cart';
import { formatCOP } from '../utils/money';
import {
  validateEmail,
  validateEventDate,
  validateName,
  validatePhone,
} from '../utils/validators';

/** Mensajes literales de HU_EU_03_09 (criterios 2.6, 4 y 6). */
export const RESERVATION_CREATION_FAILED_MESSAGE =
  'No fue posible crear la reserva. Revise su evento e intente nuevamente.';
export const UNEXPECTED_ERROR_MESSAGE = GENERIC_ERROR;
export const CONTINUE_TO_PAYMENT_TEXT = 'Continuar al pago';
export const DATA_TREATMENT_NOTICE =
  'Solo guardamos su nombre, correo y teléfono para gestionar la reserva. No pedimos contraseña ni cobramos dinero en este paso.';

export const CATEGORY_LABELS: Record<Category, string> = {
  espacio: 'Espacio',
  alimentacion: 'Alimentación',
  decoracion: 'Decoración',
  entretenimiento: 'Entretenimiento',
};

const surfaceTokens = {
  subtleBg: '#F7F7FA',
  accentSurface: '#F3F0FF',
  accentBorder: '#D4C9FA',
  accentText: '#3A2399',
  warningBg: '#FFFBEB',
  warningBorder: '#FCD34D',
  warningText: '#92400E',
  successText: '#1B7A43',
};

interface QuickDatePreset {
  id: string;
  label: string;
  months: number;
}

const QUICK_DATE_PRESETS: QuickDatePreset[] = [
  { id: '1m', label: '+1 mes', months: 1 },
  { id: '3m', label: '+3 meses', months: 3 },
  { id: '6m', label: '+6 meses', months: 6 },
];

function addMonthsISO(months: number): string {
  const target = new Date();
  target.setMonth(target.getMonth() + months);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function useNavigationSafe(): any {
  try {
    return useNavigation();
  } catch {
    return null;
  }
}

export interface DatosClienteScreenProps {
  navigation?: any;
}

/**
 * HU_EU_03_09: Pantalla «Datos del cliente» y «Resumen de la reserva».
 * Captura datos de contacto (nombre, correo, teléfono) y fecha del evento,
 * presenta el resumen de los servicios de «Mi evento» con su total y presupuesto
 * restante (si hay presupuesto), valida campos según criterios y crea la reserva
 * antes de proceder al pago simulado.
 */
export default function DatosClienteScreen({
  navigation: navProp,
}: DatosClienteScreenProps = {}) {
  const navHook = useNavigationSafe();
  const navigation = navProp ?? navHook;

  const { flow, update } = useFlow();
  const { cart, budgetCop, eventType, guests, cartOrigin, customer, eventDate } = flow;
  const guestCount = guests ?? 0;

  // Precarga desde FlowContext (RF-GEN-01)
  const [nameText, setNameText] = useState(customer?.name ?? '');
  const [emailText, setEmailText] = useState(customer?.email ?? '');
  const [phoneText, setPhoneText] = useState(customer?.phone ?? '');
  const [dateText, setDateText] = useState(eventDate ?? '');

  // Referencia síncrona para evitar lecturas obsoletas en actualizaciones concurrentes
  const valuesRef = useRef({
    name: customer?.name ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    date: eventDate ?? '',
  });

  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [topError, setTopError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<{
    message: string;
    retry: () => void;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);

  const total = cartTotal(cart, guestCount);
  const remaining = remainingBudget(cart, guestCount, budgetCop);
  const missing = missingCategories(cart);

  const handleNameChange = (text: string) => {
    valuesRef.current.name = text;
    setNameText(text);
    update({
      customer: {
        name: text,
        email: valuesRef.current.email,
        phone: valuesRef.current.phone,
      },
    });
    if (errors.name) {
      setErrors((prev) => ({ ...prev, name: undefined }));
    }
    if (topError) setTopError(null);
  };

  const handleEmailChange = (text: string) => {
    valuesRef.current.email = text;
    setEmailText(text);
    update({
      customer: {
        name: valuesRef.current.name,
        email: text,
        phone: valuesRef.current.phone,
      },
    });
    if (errors.email) {
      setErrors((prev) => ({ ...prev, email: undefined }));
    }
    if (topError) setTopError(null);
  };

  const handlePhoneChange = (text: string) => {
    valuesRef.current.phone = text;
    setPhoneText(text);
    update({
      customer: {
        name: valuesRef.current.name,
        email: valuesRef.current.email,
        phone: text,
      },
    });
    if (errors.phone) {
      setErrors((prev) => ({ ...prev, phone: undefined }));
    }
    if (topError) setTopError(null);
  };

  const handleDateChange = (text: string) => {
    valuesRef.current.date = text;
    setDateText(text);
    const trimmed = text.trim();
    update({ eventDate: trimmed === '' ? null : trimmed });
    if (errors.event_date) {
      setErrors((prev) => ({ ...prev, event_date: undefined }));
    }
    if (topError) setTopError(null);
  };

  const handleSubmit = async () => {
    if (loading) return;

    const currentName = valuesRef.current.name;
    const currentEmail = valuesRef.current.email;
    const currentPhone = valuesRef.current.phone;
    const currentDate = valuesRef.current.date;

    // Validación de campos (criterios 3.1 a 3.4)
    const nameError = validateName(currentName);
    const emailError = validateEmail(currentEmail);
    const phoneError = validatePhone(currentPhone);
    const dateError = validateEventDate(currentDate, { optional: false });

    const nextErrors: Record<string, string | undefined> = {};
    if (nameError) nextErrors.name = nameError;
    if (emailError) nextErrors.email = emailError;
    if (phoneError) nextErrors.phone = phoneError;
    if (dateError) nextErrors.event_date = dateError;

    setErrors(nextErrors);
    setTopError(null);
    setNetworkError(null);

    if (nameError || emailError || phoneError || dateError) {
      return;
    }

    if (missing.length > 0 || cart.length === 0) {
      setTopError(RESERVATION_CREATION_FAILED_MESSAGE);
      return;
    }

    setLoading(true);
    setSlow(false);

    try {
      const cleanCustomer = {
        name: currentName.trim(),
        email: currentEmail.trim(),
        phone: currentPhone.trim(),
      };
      const cleanDate = currentDate.trim();

      const req: ReservationRequest = {
        ...(budgetCop !== null ? { budget_cop: budgetCop } : {}),
        event_type: eventType ?? 'cumpleanos',
        guests: guests ?? 1,
        modality: cartOrigin ?? 'personalizado',
        service_ids: cart.map((s) => s.service_id),
        expected_total_cop: total,
        customer: cleanCustomer,
        event_date: cleanDate,
      };

      const response = await postReservation(req, {
        onSlow: () => setSlow(true),
      });

      update({
        customer: cleanCustomer,
        eventDate: cleanDate,
        reservationCode: response.code,
      });

      if (navigation) {
        navigation.navigate('Pago');
      }
    } catch (err) {
      if (err instanceof NetworkError) {
        setNetworkError({ message: err.message, retry: handleSubmit });
      } else if (err instanceof ApiError) {
        if (err.code === 'TOTAL_MISMATCH' || err.code === 'BUDGET_EXCEEDED') {
          setTopError(RESERVATION_CREATION_FAILED_MESSAGE);
        } else if (err.status === 422) {
          if (err.fields && Object.keys(err.fields).length > 0) {
            const mapped: Record<string, string | undefined> = {};
            if (err.fields.name || err.fields.customer_name || err.fields['customer.name']) {
              mapped.name =
                err.fields.name ?? err.fields.customer_name ?? err.fields['customer.name'];
            }
            if (err.fields.email || err.fields.customer_email || err.fields['customer.email']) {
              mapped.email =
                err.fields.email ?? err.fields.customer_email ?? err.fields['customer.email'];
            }
            if (err.fields.phone || err.fields.customer_phone || err.fields['customer.phone']) {
              mapped.phone =
                err.fields.phone ?? err.fields.customer_phone ?? err.fields['customer.phone'];
            }
            if (err.fields.event_date) {
              mapped.event_date = err.fields.event_date;
            }
            if (Object.keys(mapped).length > 0) {
              setErrors((prev) => ({ ...prev, ...mapped }));
            } else {
              setTopError(RESERVATION_CREATION_FAILED_MESSAGE);
            }
          } else {
            setTopError(RESERVATION_CREATION_FAILED_MESSAGE);
          }
        } else {
          setTopError(UNEXPECTED_ERROR_MESSAGE);
        }
      } else {
        setTopError(UNEXPECTED_ERROR_MESSAGE);
      }
    } finally {
      setLoading(false);
      setSlow(false);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Cabecera */}
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Datos del cliente</Text>
        <Text style={styles.subtitle}>
          Ingresa tus datos de contacto y la fecha de tu evento para confirmar la reserva.
        </Text>
      </View>

      {/* Banner de error de reserva o inesperado */}
      {topError ? (
        <View style={styles.errorBanner} testID="reservation-error" accessibilityRole="alert">
          <Text style={styles.errorBannerText}>{topError}</Text>
        </View>
      ) : null}

      {/* Formulario de contacto */}
      <View style={styles.formCard}>
        <View style={styles.formGroup}>
          <Text style={styles.label}>Nombre completo</Text>
          <TextInput
            testID="input-name"
            style={[styles.input, errors.name ? styles.inputError : null]}
            value={nameText}
            onChangeText={handleNameChange}
            placeholder="Ej. María Pérez"
            placeholderTextColor={colors.muted}
            editable={!loading}
            autoCapitalize="words"
            accessibilityLabel="Nombre completo"
          />
          <FieldError message={errors.name} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Correo electrónico</Text>
          <TextInput
            testID="input-email"
            style={[styles.input, errors.email ? styles.inputError : null]}
            value={emailText}
            onChangeText={handleEmailChange}
            placeholder="correo@ejemplo.com"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            accessibilityLabel="Correo electrónico"
          />
          <FieldError message={errors.email} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Teléfono</Text>
          <TextInput
            testID="input-phone"
            style={[styles.input, errors.phone ? styles.inputError : null]}
            value={phoneText}
            onChangeText={handlePhoneChange}
            placeholder="Ej. 3001234567"
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            maxLength={10}
            editable={!loading}
            accessibilityLabel="Teléfono de 10 dígitos"
          />
          <FieldError message={errors.phone} />
        </View>

        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Fecha del evento</Text>
            <Text style={styles.fieldHint}>AAAA-MM-DD</Text>
          </View>
          <TextInput
            testID="input-event-date"
            style={[styles.input, errors.event_date ? styles.inputError : null]}
            value={dateText}
            onChangeText={handleDateChange}
            placeholder="AAAA-MM-DD"
            placeholderTextColor={colors.muted}
            editable={!loading}
            accessibilityLabel="Fecha del evento en formato AAAA-MM-DD"
          />
          <View style={styles.datePresetsRow}>
            {QUICK_DATE_PRESETS.map((preset) => {
              const iso = addMonthsISO(preset.months);
              const isSelected = dateText.trim() === iso;
              return (
                <Pressable
                  key={preset.id}
                  testID={`date-preset-${preset.id}`}
                  onPress={() => handleDateChange(iso)}
                  disabled={loading}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.datePresetChip,
                    isSelected ? styles.datePresetChipActive : null,
                    pressed ? styles.interactivePressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.datePresetText,
                      isSelected ? styles.datePresetTextActive : null,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <FieldError message={errors.event_date} />
        </View>

        {/* Aviso de tratamiento de datos personales (RNF-SEG-05, Criterio 4) */}
        <View style={styles.dataNoticeBox}>
          <MinimalIcon name="check" size={16} color={colors.primary} />
          <Text style={styles.dataNoticeText}>{DATA_TREATMENT_NOTICE}</Text>
        </View>
      </View>

      {/* Resumen de la reserva (Criterio 2.5) */}
      <View style={styles.summaryCard} testID="reservation-summary">
        <View style={styles.summaryHeader}>
          <MinimalIcon name="event" size={20} color={colors.primary} />
          <Text style={styles.sectionTitle}>Resumen de la reserva</Text>
        </View>

        {cart.length === 0 ? (
          <Text style={styles.emptyCartNotice}>
            No hay servicios agregados en su evento.
          </Text>
        ) : (
          <View style={styles.servicesList}>
            {cart.map((item) => {
              const cost = serviceCost(item, guestCount);
              return (
                <View
                  key={item.service_id}
                  style={styles.serviceRow}
                  testID={`summary-item-${item.service_id}`}
                >
                  <View style={styles.serviceInfo}>
                    <View style={styles.badgeRow}>
                      <Text style={styles.categoryBadge}>
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </Text>
                    </View>
                    <Text style={styles.serviceName}>{item.name}</Text>
                    <Text style={styles.serviceProvider}>{item.provider_name}</Text>
                  </View>
                  <Text style={styles.serviceCost}>{formatCOP(cost)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {missing.length > 0 ? (
          <View style={styles.missingWarning}>
            <Text style={styles.missingWarningText}>
              {MISSING_CATEGORIES_MESSAGE}
            </Text>
          </View>
        ) : null}

        <View style={styles.divider} />

        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue} testID="summary-total">
              {formatCOP(total)}
            </Text>
          </View>

          {budgetCop !== null && remaining !== null ? (
            <View style={styles.budgetRow}>
              <Text style={styles.budgetLabel}>Presupuesto restante</Text>
              <Text
                style={[
                  styles.budgetValue,
                  remaining < 0 ? styles.budgetNegative : null,
                ]}
                testID="summary-remaining-budget"
              >
                {formatCOP(remaining)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Estado de carga (RNF-FIA-02) */}
      {loading ? <LoadingNotice slow={slow} /> : null}

      {/* Error de red con reintento (HU_EU_01_04) */}
      {networkError ? (
        <View testID="network-error-container">
          <NetworkErrorView message={networkError.message} onRetry={networkError.retry} />
        </View>
      ) : null}

      {/* Botón de acción principal (Criterio 2.6) */}
      <Pressable
        testID="btn-continue-payment"
        onPress={handleSubmit}
        disabled={loading}
        accessibilityRole="button"
        accessibilityState={{ disabled: loading }}
        style={({ pressed }) => [
          styles.submitButton,
          loading ? styles.submitButtonDisabled : null,
          pressed ? styles.interactivePressed : null,
        ]}
      >
        <Text style={styles.submitButtonText}>{CONTINUE_TO_PAYMENT_TEXT}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.lg * 2,
  },
  headerBlock: {
    gap: spacing.xs,
  },
  title: {
    fontSize: font.title,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: font.base,
    color: colors.muted,
    lineHeight: 22,
  },
  formCard: {
    backgroundColor: surfaceTokens.subtleBg,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formGroup: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  label: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
  },
  fieldHint: {
    fontSize: font.base - 2,
    color: colors.muted,
  },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    fontSize: font.base,
    color: colors.text,
    backgroundColor: colors.background,
  },
  inputError: {
    borderColor: colors.error,
  },
  datePresetsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  datePresetChip: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePresetChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  datePresetText: {
    fontSize: font.base - 2,
    fontWeight: '600',
    color: colors.text,
  },
  datePresetTextActive: {
    color: colors.background,
  },
  dataNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: '#F3F0FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D4C9FA',
    marginTop: spacing.xs,
  },
  dataNoticeText: {
    flex: 1,
    fontSize: font.base - 3,
    color: '#3A2399',
    lineHeight: 18,
  },
  summaryCard: {
    backgroundColor: surfaceTokens.subtleBg,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: font.base + 2,
    fontWeight: '700',
    color: colors.text,
  },
  emptyCartNotice: {
    fontSize: font.base,
    color: colors.muted,
    fontStyle: 'italic',
  },
  servicesList: {
    gap: spacing.sm,
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
  },
  serviceInfo: {
    flex: 1,
    marginRight: spacing.sm,
    gap: 2,
  },
  badgeRow: {
    flexDirection: 'row',
  },
  categoryBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: surfaceTokens.accentText,
    backgroundColor: '#EBE7FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: 'uppercase',
  },
  serviceName: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
  },
  serviceProvider: {
    fontSize: font.base - 2,
    color: colors.muted,
  },
  serviceCost: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
  },
  missingWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.sm,
  },
  missingWarningText: {
    fontSize: font.base - 2,
    color: '#92400E',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  totalsSection: {
    gap: spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: font.base + 1,
    fontWeight: '700',
    color: colors.text,
  },
  totalValue: {
    fontSize: font.base + 2,
    fontWeight: '800',
    color: colors.primary,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetLabel: {
    fontSize: font.base,
    color: colors.muted,
  },
  budgetValue: {
    fontSize: font.base,
    fontWeight: '700',
    color: surfaceTokens.successText,
  },
  budgetNegative: {
    color: colors.error,
  },
  errorBanner: {
    backgroundColor: '#FDE8E8',
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
  },
  errorBannerText: {
    fontSize: font.base,
    color: colors.error,
    fontWeight: '600',
  },
  submitButton: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.background,
  },
  interactivePressed: {
    opacity: 0.85,
  },
});
