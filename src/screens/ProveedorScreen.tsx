import { useRoute, type RouteProp } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError, GENERIC_ERROR, NetworkError } from '../api/client';
import { getProvider } from '../api/endpoints';
import type { CatalogItem, Category, Provider } from '../api/types';
import { LoadingNotice } from '../components/LoadingNotice';
import { MinimalIcon } from '../components/MinimalIcon';
import { NetworkErrorView } from '../components/NetworkErrorView';
import { GUESTS_MAX, GUESTS_MIN } from '../config/limits';
import type { RootStackParamList } from '../navigation/types';
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import { addToCart, catalogItemToCartService, fitsGuests } from '../utils/cart';
import { formatCOP } from '../utils/money';

const CATEGORY_LABELS: Record<Category, string> = {
  espacio: 'Espacio',
  alimentacion: 'Alimentación',
  decoracion: 'Decoración',
  entretenimiento: 'Entretenimiento',
};

/** Mensajes literales de HU_EU_02_08 (criterios 3.3, 5 y 6). */
export const INELIGIBLE_GUESTS_MESSAGE = 'Este servicio no admite ese número de invitados.';
export const VERIFICATION_WARNING_MESSAGE =
  'La verificación confirma los datos del proveedor, pero no garantiza el cumplimiento del servicio.';
export const NOT_FOUND_MESSAGE = 'No encontramos este proveedor.';

function useRouteSafe(): RouteProp<RootStackParamList, 'Proveedor'> | null {
  try {
    return useRoute<RouteProp<RootStackParamList, 'Proveedor'>>();
  } catch {
    return null;
  }
}

export interface ProveedorScreenProps {
  route?: {
    params?: {
      providerId?: string;
    };
  };
}

/**
 * HU_EU_02_08: Pantalla «Ficha del proveedor» con estado y aviso de verificación,
 * datos de contacto, ubicación, servicios con capacidad y botón «Agregar a mi evento».
 */
export default function ProveedorScreen({ route }: ProveedorScreenProps = {}) {
  const routeHook = useRouteSafe();
  const { flow, update } = useFlow();

  const providerId = route?.params?.providerId ?? routeHook?.params?.providerId ?? '';

  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);

  const autoFetchedRef = useRef(false);

  const loadProvider = useCallback(async () => {
    if (!providerId) {
      setNotFound(true);
      return;
    }
    setLoading(true);
    setSlow(false);
    setNetworkError(null);
    setNotFound(false);
    setUnexpectedError(null);

    try {
      const data = await getProvider(providerId, { onSlow: () => setSlow(true) });
      setProvider(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else if (err instanceof NetworkError) {
        setNetworkError(err.message);
      } else {
        setUnexpectedError(GENERIC_ERROR);
      }
    } finally {
      setLoading(false);
      setSlow(false);
    }
  }, [providerId]);

  useEffect(() => {
    if (!autoFetchedRef.current) {
      autoFetchedRef.current = true;
      void loadProvider();
    }
  }, [loadProvider]);

  // Restricción 3.1 & 4: solo se muestra 'Verificado' si existe al menos una comprobación documentada registrada
  const isVerified = useMemo(() => {
    return Boolean(
      provider?.verification?.status === 'verificado' &&
        Array.isArray(provider?.verification?.checks) &&
        provider.verification.checks.length > 0,
    );
  }, [provider]);

  const handleAddService = (svc: CatalogItem) => {
    if (!provider) return;
    const cartItem = catalogItemToCartService({
      ...svc,
      provider_id: provider.id,
      provider_name: provider.name,
    });
    const result = addToCart(flow.cart, cartItem);
    update({ cart: result.cart, cartOrigin: 'personalizado' });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {loading ? <LoadingNotice slow={slow} /> : null}

      {networkError ? (
        <NetworkErrorView message={networkError} onRetry={loadProvider} />
      ) : null}

      {unexpectedError ? (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Text style={styles.errorBannerText}>{unexpectedError}</Text>
          <Pressable
            testID="btn-retry-unexpected"
            onPress={loadProvider}
            accessibilityRole="button"
            style={styles.retryInlineButton}
          >
            <Text style={styles.retryInlineButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {notFound ? (
        <View style={styles.notFoundCard} accessibilityRole="alert">
          <Text style={styles.notFoundText} testID="provider-not-found">
            {NOT_FOUND_MESSAGE}
          </Text>
        </View>
      ) : null}

      {!loading && !networkError && !unexpectedError && provider ? (
        <View style={styles.body}>
          {/* Encabezado: Nombre, rubros y estado de verificación (Criterios 2.1, 2.2, 2.5) */}
          <View style={styles.headerBlock}>
            <View style={styles.titleRow}>
              <Text style={styles.title} testID="provider-name">
                {provider.name}
              </Text>
              <View
                style={[
                  styles.badge,
                  isVerified ? styles.badgeVerified : styles.badgeReview,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    isVerified ? styles.badgeTextVerified : styles.badgeTextReview,
                  ]}
                  testID="verification-badge"
                >
                  {isVerified ? 'Verificado' : 'En revisión'}
                </Text>
              </View>
            </View>

            {/* Rubros del proveedor */}
            <View style={styles.categoriesRow} testID="provider-categories">
              {provider.categories.map((cat) => (
                <View key={cat} style={styles.categoryChip}>
                  <Text style={styles.categoryChipText}>{CATEGORY_LABELS[cat] ?? cat}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Aviso legal obligatorio en proveedores verificados (Criterio 5 & RN-07) */}
          {isVerified ? (
            <View
              style={styles.verificationNoticeCard}
              accessibilityRole="alert"
              testID="verification-notice"
            >
              <View style={styles.noticeIconBox}>
                <MinimalIcon name="check" size={16} color={colors.primary} />
              </View>
              <Text style={styles.verificationNoticeText}>
                {VERIFICATION_WARNING_MESSAGE}
              </Text>
            </View>
          ) : null}

          {/* Comprobaciones registradas con tipo y fecha (Criterio 2.6) */}
          {isVerified && provider.verification.checks.length > 0 ? (
            <View style={styles.card} testID="checks-section">
              <Text style={styles.cardSectionTitle}>Comprobaciones registradas</Text>
              <View style={styles.checksList}>
                {provider.verification.checks.map((check, idx) => (
                  <View
                    key={`${check.type}-${check.date}-${idx}`}
                    style={styles.checkRow}
                    testID={`check-item-${idx}`}
                  >
                    <View style={styles.checkGlyph}>
                      <MinimalIcon name="check" size={14} color={colors.primary} />
                    </View>
                    <View style={styles.checkTextCol}>
                      <Text style={styles.checkType}>{check.type}</Text>
                      <Text style={styles.checkDate}>{check.date}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Alcance del servicio y ubicación (Criterios 2.2 y 2.3) */}
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Acerca del proveedor</Text>
            <Text style={styles.descriptionText} testID="provider-description">
              {provider.description}
            </Text>

            <View style={styles.locationRow} testID="provider-location">
              <MinimalIcon name="pin" size={18} color={colors.primary} />
              <Text style={styles.locationText}>
                {provider.neighborhood}, {provider.municipality}
              </Text>
            </View>
          </View>

          {/* Datos de contacto (Criterio 2.4) */}
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Contacto</Text>
            <View style={styles.contactList}>
              <View style={styles.contactLine}>
                <Text style={styles.contactLabel}>Teléfono:</Text>
                <Text style={styles.contactValue} testID="provider-phone">
                  {provider.phone}
                </Text>
              </View>
              <View style={styles.contactLine}>
                <Text style={styles.contactLabel}>Correo:</Text>
                <Text style={styles.contactValue} testID="provider-email">
                  {provider.email}
                </Text>
              </View>
            </View>
          </View>

          {/* Servicios del proveedor (Criterios 2.7 y 2.8) */}
          <View style={styles.servicesSection} testID="services-section">
            <Text style={styles.mainSectionTitle}>Servicios disponibles</Text>

            {provider.services.length === 0 ? (
              <Text style={styles.mutedText}>Este proveedor no tiene servicios registrados.</Text>
            ) : (
              provider.services.map((svc) => {
                const minGuests = svc.min_guests ?? GUESTS_MIN;
                const maxGuests = svc.max_guests ?? GUESTS_MAX;
                const admitsGuests =
                  flow.guests === null ||
                  fitsGuests({ min_guests: minGuests, max_guests: maxGuests }, flow.guests);

                const isInCart = flow.cart.some((c) => c.service_id === svc.id);

                return (
                  <View
                    key={svc.id}
                    style={[styles.serviceCard, !admitsGuests ? styles.serviceCardDisabled : null]}
                    testID={`service-card-${svc.id}`}
                  >
                    <View style={styles.serviceHeader}>
                      <View style={styles.serviceTitleCol}>
                        <Text style={styles.serviceName} testID={`service-name-${svc.id}`}>
                          {svc.name}
                        </Text>
                        <Text style={styles.serviceCategory}>
                          {CATEGORY_LABELS[svc.category] ?? svc.category}
                        </Text>
                      </View>
                      <Text
                        style={styles.servicePrice}
                        testID={`service-price-${svc.id}`}
                      >
                        {formatCOP(svc.price_cop ?? 0)}
                      </Text>
                    </View>

                    {svc.description ? (
                      <Text style={styles.serviceDescription}>{svc.description}</Text>
                    ) : null}

                    <View style={styles.capacityRow}>
                      <MinimalIcon name="users" size={16} color={colors.muted} />
                      <Text
                        style={styles.capacityText}
                        testID={`service-capacity-${svc.id}`}
                      >
                        Capacidad: {minGuests} a {maxGuests} personas
                      </Text>
                    </View>

                    {/* Validación de invitados (Criterio 3.3) */}
                    {!admitsGuests ? (
                      <View
                        style={styles.ineligibleBox}
                        accessibilityRole="alert"
                        testID={`ineligible-notice-${svc.id}`}
                      >
                        <Text style={styles.ineligibleText}>{INELIGIBLE_GUESTS_MESSAGE}</Text>
                      </View>
                    ) : null}

                    {/* Botón Agregar a mi evento (Criterio 2.8) */}
                    <Pressable
                      testID={`btn-add-service-${svc.id}`}
                      onPress={() => handleAddService(svc)}
                      disabled={!admitsGuests}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !admitsGuests }}
                      style={[
                        styles.addButton,
                        !admitsGuests ? styles.addButtonDisabled : null,
                        isInCart ? styles.addButtonInCart : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.addButtonText,
                          !admitsGuests ? styles.addButtonTextDisabled : null,
                          isInCart ? styles.addButtonTextInCart : null,
                        ]}
                      >
                        {isInCart ? 'Agregado a Mi evento' : 'Agregar a mi evento'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        </View>
      ) : null}
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
    gap: spacing.md,
  },
  body: {
    gap: spacing.md,
  },
  headerBlock: {
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  title: {
    flex: 1,
    fontSize: font.title,
    fontWeight: '700',
    color: colors.text,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeVerified: {
    borderColor: '#D4C9FA',
    backgroundColor: '#F3F0FF',
  },
  badgeReview: {
    borderColor: colors.border,
    backgroundColor: '#F7F7FA',
  },
  badgeText: {
    fontSize: font.base - 2,
    fontWeight: '600',
  },
  badgeTextVerified: {
    color: '#3A2399',
  },
  badgeTextReview: {
    color: colors.muted,
  },
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categoryChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F7F7FA',
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipText: {
    fontSize: font.base - 2,
    color: colors.muted,
    fontWeight: '500',
  },
  verificationNoticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D4C9FA',
    backgroundColor: '#F3F0FF',
  },
  noticeIconBox: {
    paddingTop: 2,
  },
  verificationNoticeText: {
    flex: 1,
    fontSize: font.base - 1,
    color: '#3A2399',
    lineHeight: 22,
    fontWeight: '500',
  },
  card: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  cardSectionTitle: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
  },
  checksList: {
    gap: spacing.sm,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkGlyph: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F3F0FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkTextCol: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkType: {
    fontSize: font.base - 1,
    fontWeight: '600',
    color: colors.text,
  },
  checkDate: {
    fontSize: font.base - 2,
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  descriptionText: {
    fontSize: font.base,
    color: colors.text,
    lineHeight: 22,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  locationText: {
    fontSize: font.base - 1,
    color: colors.muted,
  },
  contactList: {
    gap: spacing.xs,
  },
  contactLine: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  contactLabel: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
    width: 80,
  },
  contactValue: {
    flex: 1,
    fontSize: font.base,
    color: colors.text,
  },
  servicesSection: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  mainSectionTitle: {
    fontSize: font.title - 2,
    fontWeight: '700',
    color: colors.text,
  },
  mutedText: {
    fontSize: font.base,
    color: colors.muted,
  },
  serviceCard: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  serviceCardDisabled: {
    opacity: 0.75,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  serviceTitleCol: {
    flex: 1,
    gap: 2,
  },
  serviceName: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
  },
  serviceCategory: {
    fontSize: font.base - 2,
    color: colors.muted,
    fontWeight: '500',
  },
  servicePrice: {
    fontSize: font.base + 2,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  serviceDescription: {
    fontSize: font.base - 1,
    color: colors.text,
    lineHeight: 20,
  },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  capacityText: {
    fontSize: font.base - 1,
    color: colors.muted,
  },
  ineligibleBox: {
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: '#FDF2F2',
  },
  ineligibleText: {
    fontSize: font.base - 1,
    color: colors.error,
    fontWeight: '500',
  },
  addButton: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addButtonDisabled: {
    backgroundColor: '#E0E0E6',
  },
  addButtonInCart: {
    backgroundColor: '#F3F0FF',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: font.base,
    fontWeight: '600',
  },
  addButtonTextDisabled: {
    color: colors.muted,
  },
  addButtonTextInCart: {
    color: colors.primary,
  },
  errorBanner: {
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: '#FDF2F2',
    gap: spacing.sm,
  },
  errorBannerText: {
    fontSize: font.base,
    color: colors.error,
    fontWeight: '500',
  },
  retryInlineButton: {
    minHeight: MIN_TOUCH,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryInlineButtonText: {
    color: '#FFFFFF',
    fontSize: font.base,
    fontWeight: '600',
  },
  notFoundCard: {
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F7F7FA',
    alignItems: 'center',
    gap: spacing.xs,
  },
  notFoundTitle: {
    fontSize: font.title - 2,
    fontWeight: '700',
    color: colors.text,
  },
  notFoundText: {
    fontSize: font.base,
    color: colors.muted,
  },
});
