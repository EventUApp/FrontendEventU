import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Reservation } from '../api/types';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import { formatCOP } from '../utils/money';
import { MinimalIcon } from './MinimalIcon';

export const SIMULATED_PAYMENT_NOTICE = 'El pago fue simulado.';
export const GO_HOME_BUTTON_TEXT = 'Volver al inicio';

const surfaceTokens = {
  cardBg: '#FFFFFF',
  subtleBg: '#F7F7FA',
  noticeBg: '#EFF6FF',
  noticeBorder: '#BFDBFE',
  noticeText: '#1E40AF',
  paidBg: '#ECFDF5',
  paidBorder: '#A7F3D0',
  paidText: '#065F46',
  itemDivider: '#F0F0F3',
};

interface ReservationDetailsProps {
  reservation: Reservation;
  onGoHome?: () => void;
  showGoHome?: boolean;
}

export function ReservationDetails({
  reservation,
  onGoHome,
  showGoHome = true,
}: ReservationDetailsProps) {
  const isPaid = reservation.status === 'pagada';

  return (
    <View style={styles.container}>
      {/* 2.4 Estado y 2.1 Número de reserva */}
      <View style={styles.headerCard}>
        <View style={styles.headerTopRow}>
          <View style={[styles.statusBadge, isPaid ? styles.statusBadgePaid : styles.statusBadgeOther]}>
            <Text style={[styles.statusBadgeText, isPaid ? styles.statusBadgeTextPaid : null]}>
              {isPaid ? 'Pagada' : reservation.status}
            </Text>
          </View>
          <Text style={styles.codeLabel}>Número de reserva</Text>
        </View>

        <Text testID="reservation-code" style={styles.codeText}>
          {reservation.code}
        </Text>

        {reservation.payment?.reference ? (
          <Text testID="payment-reference" style={styles.referenceText}>
            Ref. pago: {reservation.payment.reference}
          </Text>
        ) : null}
      </View>

      {/* 2.5 Aviso: 'El pago fue simulado.' */}
      <View testID="simulated-payment-notice" style={styles.noticeBox}>
        <View style={styles.noticeIcon}>
          <MinimalIcon name="check" size={18} color={surfaceTokens.noticeText} />
        </View>
        <Text style={styles.noticeText}>{SIMULATED_PAYMENT_NOTICE}</Text>
      </View>

      {/* 2.3 Datos de contacto y fecha del evento */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Datos del evento</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Fecha del evento</Text>
          <Text testID="event-date" style={styles.metaValue}>
            {reservation.event_date}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Titular</Text>
          <Text testID="customer-name" style={styles.metaValue}>
            {reservation.customer.name}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Correo electrónico</Text>
          <Text testID="customer-email" style={styles.metaValue}>
            {reservation.customer.email}
          </Text>
        </View>

        <View style={[styles.metaRow, styles.lastMetaRow]}>
          <Text style={styles.metaLabel}>Teléfono</Text>
          <Text testID="customer-phone" style={styles.metaValue}>
            {reservation.customer.phone}
          </Text>
        </View>
      </View>

      {/* 2.2 Paquete, servicios con su proveedor y precio, y total */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Servicios reservados</Text>

        {reservation.items.map((item, index) => (
          <View
            key={item.service_id ?? `item-${index}`}
            testID={`reservation-item-${index}`}
            style={[
              styles.itemRow,
              index === reservation.items.length - 1 ? styles.lastItemRow : null,
            ]}
          >
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemProvider}>{item.provider_name}</Text>
            </View>
            <Text style={styles.itemCost}>{formatCOP(item.cost_cop)}</Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total pagado</Text>
          <Text testID="total-amount" style={styles.totalValue}>
            {formatCOP(reservation.total_cop)}
          </Text>
        </View>
      </View>

      {/* 2.7 Acción 'Volver al inicio' */}
      {showGoHome && onGoHome ? (
        <Pressable
          testID="btn-go-home"
          accessibilityRole="button"
          accessibilityLabel={GO_HOME_BUTTON_TEXT}
          style={({ pressed }) => [
            styles.goHomeButton,
            pressed ? styles.goHomeButtonPressed : null,
          ]}
          onPress={onGoHome}
        >
          <Text style={styles.goHomeButtonText}>{GO_HOME_BUTTON_TEXT}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  headerCard: {
    backgroundColor: surfaceTokens.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgePaid: {
    backgroundColor: surfaceTokens.paidBg,
    borderColor: surfaceTokens.paidBorder,
  },
  statusBadgeOther: {
    backgroundColor: surfaceTokens.subtleBg,
    borderColor: colors.border,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  statusBadgeTextPaid: {
    color: surfaceTokens.paidText,
  },
  codeLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  codeText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
    marginVertical: 4,
  },
  referenceText: {
    fontSize: 12,
    color: colors.muted,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: surfaceTokens.noticeBg,
    borderWidth: 1,
    borderColor: surfaceTokens.noticeBorder,
    borderRadius: 10,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  noticeIcon: {
    marginRight: spacing.sm,
  },
  noticeText: {
    flex: 1,
    fontSize: font.base,
    fontWeight: '600',
    color: surfaceTokens.noticeText,
  },
  sectionCard: {
    backgroundColor: surfaceTokens.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: surfaceTokens.itemDivider,
  },
  lastMetaRow: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  metaLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: surfaceTokens.itemDivider,
  },
  lastItemRow: {
    borderBottomWidth: 0,
  },
  itemInfo: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  itemProvider: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  itemCost: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  goHomeButton: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  goHomeButtonPressed: {
    opacity: 0.85,
  },
  goHomeButtonText: {
    fontSize: font.base,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
