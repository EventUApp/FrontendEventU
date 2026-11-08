import type { NavigationProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ApiError, GENERIC_ERROR, NetworkError } from '../api/client';
import { postPayment } from '../api/endpoints';
import { FieldError } from '../components/FieldError';
import { LoadingNotice } from '../components/LoadingNotice';
import { MinimalIcon } from '../components/MinimalIcon';
import { NetworkErrorView } from '../components/NetworkErrorView';
import { TEST_CARD_APPROVED, TEST_CARD_DECLINED } from '../config/limits';
import type { RootStackParamList } from '../navigation/types';
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import { cartTotal } from '../utils/cart';
import { formatCOP } from '../utils/money';
import {
  CARD_CVV_INVALID_MESSAGE,
  CARD_EXPIRY_INVALID_MESSAGE,
  CARD_NUMBER_INVALID_MESSAGE,
  formatCardExpiry,
  formatCardNumber,
  validateCardCvv,
  validateCardExpiry,
  validateCardNumber,
} from '../utils/validators';

/** Mensajes literales de HU_EU_03_10 (criterios 2.4, 2.5 y 6). */
export const SIMULATION_NOTICE = 'Pago simulado: no se cobrará dinero real.';
export const PAYMENT_DECLINED_MESSAGE =
  'El pago fue rechazado. Verifique los datos o intente con otra tarjeta.';
export const UNEXPECTED_ERROR_MESSAGE = GENERIC_ERROR;
export const PAY_BUTTON_TEXT = 'Pagar';

const surfaceTokens = {
  subtleBg: '#F7F7FA',
  noticeBg: '#EFF6FF',
  noticeBorder: '#BFDBFE',
  noticeText: '#1E40AF',
  warningBg: '#FFFBEB',
  warningBorder: '#FCD34D',
  warningText: '#92400E',
  declinedBg: '#FEF2F2',
  declinedBorder: '#FECACA',
  declinedText: '#991B1B',
  approvedBg: '#ECFDF5',
  approvedBorder: '#A7F3D0',
  approvedText: '#065F46',
  cardBg: '#FFFFFF',
};

export default function PagoScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { flow, update } = useFlow();

  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');

  const cardNumberRef = useRef(cardNumber);
  const cardExpiryRef = useRef(cardExpiry);
  const cardCvvRef = useRef(cardCvv);
  const isSubmittingRef = useRef(false);

  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<{
    message: string;
    retry: () => void;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);

  const reservationCode = flow.reservationCode ?? 'EU-000000';
  const totalCop =
    flow.reservationTotalCop ??
    (flow.cart.length > 0 ? cartTotal(flow.cart, flow.guests ?? 1) : 0);

  const handleCardNumberChange = (text: string) => {
    const formatted = formatCardNumber(text);
    cardNumberRef.current = formatted;
    setCardNumber(formatted);
    if (errors.cardNumber) {
      setErrors((prev) => ({ ...prev, cardNumber: undefined }));
    }
    if (paymentError) setPaymentError(null);
    if (genericError) setGenericError(null);
  };

  const handleCardExpiryChange = (text: string) => {
    const formatted = formatCardExpiry(text);
    cardExpiryRef.current = formatted;
    setCardExpiry(formatted);
    if (errors.cardExpiry) {
      setErrors((prev) => ({ ...prev, cardExpiry: undefined }));
    }
    if (paymentError) setPaymentError(null);
    if (genericError) setGenericError(null);
  };

  const handleCardCvvChange = (text: string) => {
    const digitsOnly = text.replace(/\D/g, '').slice(0, 4);
    cardCvvRef.current = digitsOnly;
    setCardCvv(digitsOnly);
    if (errors.cardCvv) {
      setErrors((prev) => ({ ...prev, cardCvv: undefined }));
    }
    if (paymentError) setPaymentError(null);
    if (genericError) setGenericError(null);
  };

  const applyDemoCard = (type: 'approved' | 'declined') => {
    const rawNumber = type === 'approved' ? TEST_CARD_APPROVED : TEST_CARD_DECLINED;
    const formatted = formatCardNumber(rawNumber);
    cardNumberRef.current = formatted;
    cardExpiryRef.current = '12/28';
    cardCvvRef.current = '123';
    setCardNumber(formatted);
    setCardExpiry('12/28');
    setCardCvv('123');
    setErrors({});
    setPaymentError(null);
    setGenericError(null);
    setNetworkError(null);
  };

  const handleSubmit = async () => {
    if (loading || isSubmittingRef.current) return;

    const currentNumber = cardNumberRef.current;
    const currentExpiry = cardExpiryRef.current;
    const currentCvv = cardCvvRef.current;

    const numError = validateCardNumber(currentNumber);
    const expError = validateCardExpiry(currentExpiry);
    const cvvError = validateCardCvv(currentCvv);

    const nextErrors: Record<string, string | undefined> = {};
    if (numError) nextErrors.cardNumber = numError;
    if (expError) nextErrors.cardExpiry = expError;
    if (cvvError) nextErrors.cardCvv = cvvError;

    setErrors(nextErrors);
    setPaymentError(null);
    setGenericError(null);
    setNetworkError(null);

    if (numError || expError || cvvError) {
      return;
    }

    const code = flow.reservationCode;
    if (!code) {
      setGenericError(UNEXPECTED_ERROR_MESSAGE);
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setSlow(false);

    try {
      const cleanNumber = currentNumber.replace(/[\s-]/g, '');
      const cleanExpiry = currentExpiry.trim();
      const cleanCvv = currentCvv.trim();

      const response = await postPayment(
        {
          reservation_code: code,
          card: {
            number: cleanNumber,
            expiry: cleanExpiry,
            cvv: cleanCvv,
          },
        },
        {
          onSlow: () => setSlow(true),
        },
      );

      if (response.payment.status === 'aprobado') {
        // Regla que no se rompe #6: NUNCA guardar datos de tarjeta en el flujo.
        cardNumberRef.current = '';
        cardExpiryRef.current = '';
        cardCvvRef.current = '';
        setCardNumber('');
        setCardExpiry('');
        setCardCvv('');

        update({ lastPayment: response.payment });
        if (navigation) {
          navigation.navigate('Confirmacion');
        }
      } else {
        // Pago rechazado (HTTP 200 con status 'rechazado') (criterio 6, RF-PAG-04)
        // Permite verificar datos o intentar con otra tarjeta (RF-PAG-05)
        setPaymentError(PAYMENT_DECLINED_MESSAGE);
      }
    } catch (err) {
      if (err instanceof NetworkError) {
        setNetworkError({ message: err.message, retry: handleSubmit });
      } else if (err instanceof ApiError) {
        if (err.code === 'ALREADY_PAID') {
          // RF-PAG-08: Un segundo pago aprobado sobre una reserva ya pagada se ignora
          if (navigation) {
            navigation.navigate('Confirmacion');
          }
        } else if (err.status === 422) {
          if (err.fields && Object.keys(err.fields).length > 0) {
            const mapped: Record<string, string | undefined> = {};
            if (err.fields.number || err.fields['card.number']) {
              mapped.cardNumber = CARD_NUMBER_INVALID_MESSAGE;
            }
            if (err.fields.expiry || err.fields['card.expiry']) {
              mapped.cardExpiry = CARD_EXPIRY_INVALID_MESSAGE;
            }
            if (err.fields.cvv || err.fields['card.cvv']) {
              mapped.cardCvv = CARD_CVV_INVALID_MESSAGE;
            }
            setErrors(mapped);
          } else {
            setGenericError(UNEXPECTED_ERROR_MESSAGE);
          }
        } else {
          setGenericError(UNEXPECTED_ERROR_MESSAGE);
        }
      } else {
        setGenericError(UNEXPECTED_ERROR_MESSAGE);
      }
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
      setSlow(false);
    }
  };

  return (
    <ScrollView
      testID="payment-screen"
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      {/* 2.1 Resumen: número de reserva y monto a pagar en COP */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Text style={styles.summarySubtitle}>Resumen de su reserva</Text>
          <View style={styles.badgeCode}>
            <Text testID="summary-reservation-code" style={styles.badgeCodeText}>
              {reservationCode}
            </Text>
          </View>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Monto total a pagar</Text>
          <Text testID="summary-total-cop" style={styles.totalAmount}>
            {formatCOP(totalCop)}
          </Text>
        </View>

        {flow.customer && (
          <Text style={styles.customerNotice}>
            Titular: {flow.customer.name} · {flow.customer.email}
          </Text>
        )}
      </View>

      {/* 2.4 Aviso permanente: 'Pago simulado: no se cobrará dinero real.' */}
      <View testID="simulation-notice" style={styles.simulationNotice}>
        <View style={styles.noticeIconBox}>
          <MinimalIcon name="check" size={18} color={surfaceTokens.noticeText} />
        </View>
        <Text style={styles.simulationNoticeText}>{SIMULATION_NOTICE}</Text>
      </View>

      {/* Error de pago rechazado (criterio 6, RF-PAG-04) */}
      {paymentError && (
        <View testID="payment-declined-error" style={styles.declinedErrorCard}>
          <Text style={styles.declinedErrorTitle}>Pago rechazado</Text>
          <Text style={styles.declinedErrorText}>{paymentError}</Text>
        </View>
      )}

      {/* Error inesperado (criterio 6) */}
      {genericError && (
        <View testID="payment-generic-error" style={styles.genericErrorCard}>
          <Text style={styles.genericErrorText}>{genericError}</Text>
        </View>
      )}

      {/* Error de red con reintento (criterio 6, HU_EU_01_04) */}
      {networkError && (
        <View style={styles.networkErrorBox}>
          <NetworkErrorView message={networkError.message} onRetry={networkError.retry} />
        </View>
      )}

      {/* 2.6 Tarjetas de prueba visibles para la demo (Propuesto) */}
      <View style={styles.demoSection}>
        <Text style={styles.demoSectionTitle}>Tarjetas de prueba (demo)</Text>
        <Text style={styles.demoSectionSubtitle}>
          Toque una tarjeta para autocompletar los campos y probar el flujo de pago:
        </Text>

        <View style={styles.demoCardsRow}>
          <Pressable
            testID="btn-demo-approved"
            accessibilityRole="button"
            accessibilityLabel="Usar tarjeta de prueba aprobada"
            style={({ pressed }) => [
              styles.demoCard,
              styles.demoCardApproved,
              pressed && styles.pressed,
            ]}
            onPress={() => applyDemoCard('approved')}
          >
            <View style={styles.demoBadgeApproved}>
              <Text style={styles.demoBadgeApprovedText}>Aprobada</Text>
            </View>
            <Text style={styles.demoCardNumber}>4242 4242 4242 4242</Text>
            <Text style={styles.demoCardMeta}>Exp: 12/28 · CVV: 123</Text>
          </Pressable>

          <Pressable
            testID="btn-demo-declined"
            accessibilityRole="button"
            accessibilityLabel="Usar tarjeta de prueba rechazada"
            style={({ pressed }) => [
              styles.demoCard,
              styles.demoCardDeclined,
              pressed && styles.pressed,
            ]}
            onPress={() => applyDemoCard('declined')}
          >
            <View style={styles.demoBadgeDeclined}>
              <Text style={styles.demoBadgeDeclinedText}>Rechazada</Text>
            </View>
            <Text style={styles.demoCardNumber}>4000 0000 0000 0002</Text>
            <Text style={styles.demoCardMeta}>Exp: 12/28 · CVV: 123</Text>
          </Pressable>
        </View>
      </View>

      {/* Formulario de tarjeta */}
      <View style={styles.formCard}>
        {/* 2.2 Número de tarjeta */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Número de tarjeta</Text>
          <TextInput
            testID="input-card-number"
            style={[styles.input, errors.cardNumber ? styles.inputError : null]}
            placeholder="4242 4242 4242 4242"
            placeholderTextColor={colors.muted}
            value={cardNumber}
            onChangeText={handleCardNumberChange}
            keyboardType="numeric"
            maxLength={19}
            editable={!loading}
            accessibilityLabel="Número de tarjeta de 16 dígitos"
          />
          <FieldError testID="error-card-number" message={errors.cardNumber} />
        </View>

        {/* 2.3 Vencimiento y Código de seguridad */}
        <View style={styles.rowFields}>
          <View style={[styles.fieldGroup, styles.halfField]}>
            <Text style={styles.label}>Vencimiento</Text>
            <TextInput
              testID="input-card-expiry"
              style={[styles.input, errors.cardExpiry ? styles.inputError : null]}
              placeholder="MM/AA"
              placeholderTextColor={colors.muted}
              value={cardExpiry}
              onChangeText={handleCardExpiryChange}
              keyboardType="numeric"
              maxLength={5}
              editable={!loading}
              accessibilityLabel="Fecha de vencimiento mes y año"
            />
            <FieldError testID="error-card-expiry" message={errors.cardExpiry} />
          </View>

          <View style={[styles.fieldGroup, styles.halfField]}>
            <Text style={styles.label}>Código (CVV)</Text>
            <TextInput
              testID="input-card-cvv"
              style={[styles.input, errors.cardCvv ? styles.inputError : null]}
              placeholder="123"
              placeholderTextColor={colors.muted}
              value={cardCvv}
              onChangeText={handleCardCvvChange}
              keyboardType="numeric"
              maxLength={4}
              editable={!loading}
              accessibilityLabel="Código de seguridad de 3 o 4 dígitos"
            />
            <FieldError testID="error-card-cvv" message={errors.cardCvv} />
          </View>
        </View>
      </View>

      {/* Indicador de carga lenta (5 s) */}
      {loading && <LoadingNotice slow={slow} />}

      {/* 2.5 Botón 'Pagar' (bloqueado durante el procesamiento) */}
      <Pressable
        testID="btn-pay"
        accessibilityRole="button"
        accessibilityLabel={PAY_BUTTON_TEXT}
        accessibilityState={{ disabled: loading }}
        disabled={loading}
        style={({ pressed }) => [
          styles.payButton,
          loading ? styles.payButtonDisabled : null,
          pressed && !loading ? styles.payButtonPressed : null,
        ]}
        onPress={handleSubmit}
      >
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.payButtonText}>Procesando pago...</Text>
          </View>
        ) : (
          <Text style={styles.payButtonText}>{PAY_BUTTON_TEXT}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: spacing.md,
    paddingBottom: spacing.lg * 2,
  },
  summaryCard: {
    backgroundColor: surfaceTokens.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  summarySubtitle: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '500',
  },
  badgeCode: {
    backgroundColor: surfaceTokens.subtleBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeCodeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontSize: font.base,
    color: colors.text,
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  customerNotice: {
    fontSize: 14,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  simulationNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: surfaceTokens.noticeBg,
    borderWidth: 1,
    borderColor: surfaceTokens.noticeBorder,
    borderRadius: 10,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  noticeIconBox: {
    marginRight: spacing.sm,
  },
  simulationNoticeText: {
    flex: 1,
    fontSize: font.base,
    fontWeight: '600',
    color: surfaceTokens.noticeText,
  },
  declinedErrorCard: {
    backgroundColor: surfaceTokens.declinedBg,
    borderWidth: 1,
    borderColor: surfaceTokens.declinedBorder,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  declinedErrorTitle: {
    fontSize: font.base,
    fontWeight: '700',
    color: surfaceTokens.declinedText,
    marginBottom: 2,
  },
  declinedErrorText: {
    fontSize: font.base,
    color: surfaceTokens.declinedText,
    lineHeight: 20,
  },
  genericErrorCard: {
    backgroundColor: surfaceTokens.warningBg,
    borderWidth: 1,
    borderColor: surfaceTokens.warningBorder,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  genericErrorText: {
    fontSize: font.base,
    color: surfaceTokens.warningText,
  },
  networkErrorBox: {
    marginBottom: spacing.md,
  },
  demoSection: {
    marginBottom: spacing.md,
  },
  demoSectionTitle: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  demoSectionSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  demoCardsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  demoCard: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: 10,
    borderWidth: 1,
    padding: spacing.sm,
  },
  demoCardApproved: {
    backgroundColor: surfaceTokens.approvedBg,
    borderColor: surfaceTokens.approvedBorder,
  },
  demoCardDeclined: {
    backgroundColor: surfaceTokens.declinedBg,
    borderColor: surfaceTokens.declinedBorder,
  },
  demoBadgeApproved: {
    alignSelf: 'flex-start',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginBottom: 4,
  },
  demoBadgeApprovedText: {
    fontSize: 12,
    fontWeight: '700',
    color: surfaceTokens.approvedText,
  },
  demoBadgeDeclined: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginBottom: 4,
  },
  demoBadgeDeclinedText: {
    fontSize: 12,
    fontWeight: '700',
    color: surfaceTokens.declinedText,
  },
  demoCardNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  demoCardMeta: {
    fontSize: 11,
    color: colors.muted,
  },
  formCard: {
    backgroundColor: surfaceTokens.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  fieldGroup: {
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  input: {
    minHeight: MIN_TOUCH,
    fontSize: font.base,
    color: colors.text,
    backgroundColor: surfaceTokens.subtleBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  inputError: {
    borderColor: colors.error,
    backgroundColor: '#FFF5F5',
  },
  rowFields: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfField: {
    flex: 1,
    marginBottom: 0,
  },
  payButton: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonPressed: {
    opacity: 0.85,
  },
  payButtonText: {
    fontSize: font.base,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.8,
  },
});
