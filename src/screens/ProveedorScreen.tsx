import { useRoute, type RouteProp } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { ApiError, GENERIC_ERROR, NetworkError } from '../api/client';
import { getProvider } from '../api/endpoints';
import type { CartService, CatalogItem, Category, Provider } from '../api/types';
import { LoadingNotice } from '../components/LoadingNotice';
import { MinimalIcon } from '../components/MinimalIcon';
import { NetworkErrorView } from '../components/NetworkErrorView';
import { RatingStars } from '../components/RatingStars';
import MapView, { Marker } from 'react-native-maps';
import { GUESTS_MAX, GUESTS_MIN } from '../config/limits';
import type { RootStackParamList } from '../navigation/types';
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import {
  CANCEL_REPLACE_TEXT,
  catalogItemToCartService,
  CONFIRM_REPLACE_TEXT,
  fitsGuests,
  REPLACE_CATEGORY_CONFIRMATION_MESSAGE,
} from '../utils/cart';
import { APPROXIMATE_LOCATION_TEXT, isValidCoordinate } from '../utils/map';
import { formatCOP } from '../utils/money';

const CATEGORY_LABELS: Record<Category, string> = {
  espacio: 'Espacio',
  alimentacion: 'Alimentación',
  decoracion: 'Decoración',
  entretenimiento: 'Entretenimiento',
};

/** Mensajes literales de HU_EU_02_08 (criterios 3.3, 5 y 6) y HU_EU_02_16 (criterios 2.4, 3.1 y 6). */
export const INELIGIBLE_GUESTS_MESSAGE = 'Este servicio no admite ese número de invitados.';
export const VERIFICATION_WARNING_MESSAGE =
  'La verificación confirma los datos del proveedor, pero no garantiza el cumplimiento del servicio.';
export const NOT_FOUND_MESSAGE = 'No encontramos este proveedor.';
export const DEMO_REVIEWS_NOTICE = 'Reseñas de ejemplo para la demostración.';
export const NO_REVIEWS_TEXT = 'Sin reseñas';

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
  /**
   * Cuando es true, solicita confirmación previa al sustituir un servicio del mismo rubro (criterio 3.1).
   * Por defecto false para conservar el reemplazo directo documentado en el recorte del analista.
   */
  requireReplaceConfirm?: boolean;
}

/**
 * HU_EU_02_08: Pantalla «Ficha del proveedor» con estado y aviso de verificación,
 * datos de contacto, ubicación, servicios con capacidad y botón «Agregar a mi evento».
 */
export default function ProveedorScreen({
  route,
  requireReplaceConfirm = false,
}: ProveedorScreenProps = {}) {
  const routeHook = useRouteSafe();
  const { flow, update, addToCart: flowAddToCart } = useFlow();

  const providerId = route?.params?.providerId ?? routeHook?.params?.providerId ?? '';

  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);
  const [pendingReplaceItem, setPendingReplaceItem] = useState<CartService | null>(null);

  const autoFetchedRef = useRef(false);

  const { width: windowWidth } = useWindowDimensions();
  const galleryWidth = windowWidth ? Math.max(280, windowWidth - spacing.md * 2) : 320;
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});

  const handleImageError = (index: number) => {
    setFailedImages((prev) => ({ ...prev, [index]: true }));
  };

  const handleGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    if (!provider?.images?.length || galleryWidth <= 0) return;
    const idx = Math.min(
      Math.max(0, Math.round(offsetX / galleryWidth)),
      provider.images.length - 1,
    );
    setActiveImageIndex(idx);
  };

  const reviews = provider?.reviews;
  const sortedReviews = useMemo(() => {
    if (!reviews || reviews.length === 0) return [];
    return [...reviews]
      .sort((a, b) => b.reviewed_on.localeCompare(a.reviewed_on))
      .slice(0, 5);
  }, [reviews]);

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
    const minGuests = svc.min_guests ?? GUESTS_MIN;
    const maxGuests = svc.max_guests ?? GUESTS_MAX;
    if (flow.guests !== null && !fitsGuests({ min_guests: minGuests, max_guests: maxGuests }, flow.guests)) {
      return;
    }
    const cartItem = catalogItemToCartService({
      ...svc,
      provider_id: provider.id,
      provider_name: provider.name,
    });
    const existingSameCat = flow.cart.find((c) => c.category === svc.category);
    if (requireReplaceConfirm && existingSameCat && existingSameCat.service_id !== svc.id) {
      setPendingReplaceItem(cartItem);
      return;
    }
    if (flowAddToCart) {
      flowAddToCart(cartItem);
    } else {
      update({ cart: [...flow.cart.filter((c) => c.category !== cartItem.category), cartItem], cartOrigin: 'personalizado' });
    }
  };

  const handleConfirmReplace = () => {
    if (pendingReplaceItem) {
      if (flowAddToCart) {
        flowAddToCart(pendingReplaceItem);
      } else {
        update({
          cart: [...flow.cart.filter((c) => c.category !== pendingReplaceItem.category), pendingReplaceItem],
          cartOrigin: 'personalizado',
        });
      }
      setPendingReplaceItem(null);
    }
  };

  const handleCancelReplace = () => {
    setPendingReplaceItem(null);
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

      {pendingReplaceItem ? (
        <View
          style={styles.replaceCard}
          accessibilityRole="alert"
          testID="replace-confirmation-dialog"
        >
          <Text style={styles.replacePromptText} testID="replace-confirmation-text">
            {REPLACE_CATEGORY_CONFIRMATION_MESSAGE}
          </Text>
          <View style={styles.replaceActions}>
            <Pressable
              testID="btn-confirm-replace"
              onPress={handleConfirmReplace}
              accessibilityRole="button"
              style={styles.confirmReplaceBtn}
            >
              <Text style={styles.confirmReplaceBtnText}>{CONFIRM_REPLACE_TEXT}</Text>
            </Pressable>
            <Pressable
              testID="btn-cancel-replace"
              onPress={handleCancelReplace}
              accessibilityRole="button"
              style={styles.cancelReplaceBtn}
            >
              <Text style={styles.cancelReplaceBtnText}>{CANCEL_REPLACE_TEXT}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!loading && !networkError && !unexpectedError && provider ? (
        <View style={styles.body}>
          {/* Galería de fotos o placeholder sin fotos (HU_EU_02_16, criterios 2.1, 4, 5 y 6) */}
          {provider.images && provider.images.length > 0 ? (
            <View style={styles.galleryContainer} testID="provider-gallery">
              <ScrollView
                testID="gallery-scroll-view"
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={handleGalleryScroll}
                scrollEventThrottle={16}
                style={styles.galleryScroll}
                contentContainerStyle={styles.galleryScrollContent}
              >
                {provider.images.map((img, idx) => {
                  const hasFailed = Boolean(failedImages[idx]);
                  if (hasFailed) {
                    return (
                      <View
                        key={`fallback-${img.url}-${idx}`}
                        testID={`gallery-placeholder-${idx}`}
                        style={[styles.galleryImageFallback, { width: galleryWidth }]}
                      />
                    );
                  }
                  return (
                    <Image
                      key={`img-${img.url}-${idx}`}
                      testID={`gallery-image-${idx}`}
                      source={{ uri: img.url }}
                      style={[styles.galleryImage, { width: galleryWidth }]}
                      accessibilityLabel={img.alt_text || provider.name}
                      onError={() => handleImageError(idx)}
                    />
                  );
                })}
              </ScrollView>

              {/* Contador de fotos 'n/N' (criterio 2.1) */}
              <View style={styles.galleryCounterBadge}>
                <Text style={styles.galleryCounterText} testID="gallery-counter">
                  {`${activeImageIndex + 1}/${provider.images.length}`}
                </Text>
              </View>
            </View>
          ) : (
            <View
              style={styles.galleryEmptyPlaceholder}
              testID="gallery-empty-placeholder"
              accessibilityLabel={provider.name}
            >
              <MinimalIcon name="decor" size={32} color={colors.muted} />
              <Text style={styles.galleryEmptyPlaceholderName}>
                {provider.name}
              </Text>
            </View>
          )}

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

            {/* Calificación promedio y número de reseñas o 'Sin reseñas' (HU_EU_02_16, criterios 2.2, 3.1 y 6) */}
            <View style={styles.headerRatingRow} testID="provider-rating">
              <RatingStars
                ratingAvg={provider.rating_avg}
                ratingCount={provider.rating_count}
              />
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

            {/* Mapa pequeño en la ficha del proveedor (HU_EU_03_14, Criterio 1 y RN-28) */}
            {provider.latitude !== null &&
            provider.longitude !== null &&
            isValidCoordinate(provider.latitude, provider.longitude) ? (
              <View testID="provider-mini-map-container" style={styles.miniMapContainer}>
                <MapView
                  testID="provider-mini-map"
                  style={styles.miniMap}
                  initialRegion={{
                    latitude: provider.latitude,
                    longitude: provider.longitude,
                    latitudeDelta: 0.015,
                    longitudeDelta: 0.015,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                >
                  <Marker
                    testID="provider-mini-map-marker"
                    coordinate={{
                      latitude: provider.latitude,
                      longitude: provider.longitude,
                    }}
                  />
                </MapView>
                <Text style={styles.miniMapNotice} testID="provider-mini-map-notice">
                  {APPROXIMATE_LOCATION_TEXT}
                </Text>
              </View>
            ) : null}
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

          {/* Sección 'Reseñas' (HU_EU_02_16, criterios 2.2, 2.3, 2.4, 3.1, 3.3, 4 y 6) */}
          <View style={styles.card} testID="reviews-section">
            <View style={styles.reviewsHeaderRow}>
              <Text style={styles.cardSectionTitle} testID="reviews-section-title">
                Reseñas
              </Text>
              {provider.rating_avg !== null && provider.rating_count > 0 ? (
                <View style={styles.reviewsSummaryStars}>
                  <RatingStars
                    ratingAvg={provider.rating_avg}
                    ratingCount={provider.rating_count}
                  />
                </View>
              ) : null}
            </View>

            {/* Aviso obligatorio literal de reseñas de ejemplo (criterio 2.4 y RN-27) */}
            <View style={styles.reviewsNoticeBox}>
              <MinimalIcon name="check" size={14} color={colors.primary} />
              <Text style={styles.reviewsNoticeText} testID="reviews-notice">
                {DEMO_REVIEWS_NOTICE}
              </Text>
            </View>

            {/* Lista de hasta 5 reseñas o texto 'Sin reseñas' */}
            {sortedReviews.length === 0 ? (
              <View style={styles.noReviewsBox} testID="reviews-empty">
                <Text style={styles.noReviewsText}>{NO_REVIEWS_TEXT}</Text>
              </View>
            ) : (
              <View style={styles.reviewsList} testID="reviews-list">
                {sortedReviews.map((rev, idx) => (
                  <View
                    key={`${rev.author_name}-${rev.reviewed_on}-${idx}`}
                    style={styles.reviewCard}
                    testID={`review-item-${idx}`}
                  >
                    <View style={styles.reviewTopRow}>
                      <Text style={styles.reviewAuthor} testID={`review-author-${idx}`}>
                        {rev.author_name}
                      </Text>
                      <Text style={styles.reviewDate} testID={`review-date-${idx}`}>
                        {rev.reviewed_on}
                      </Text>
                    </View>

                    <View style={styles.reviewRatingRow} testID={`review-rating-${idx}`}>
                      <Text style={styles.reviewStars}>
                        {'★'.repeat(Math.max(1, Math.min(5, rev.rating)))}
                        {'☆'.repeat(Math.max(0, 5 - Math.max(1, Math.min(5, rev.rating))))}
                      </Text>
                      <Text style={styles.reviewScoreText}>
                        {rev.rating} de 5
                      </Text>
                    </View>

                    <Text style={styles.reviewComment} testID={`review-comment-${idx}`}>
                      {rev.comment}
                    </Text>
                  </View>
                ))}
              </View>
            )}
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
  replaceCard: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: '#F3F0FF',
    gap: spacing.sm,
  },
  replacePromptText: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
  },
  replaceActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  confirmReplaceBtn: {
    flex: 1,
    minHeight: MIN_TOUCH,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmReplaceBtnText: {
    color: '#FFFFFF',
    fontSize: font.base,
    fontWeight: '700',
  },
  cancelReplaceBtn: {
    flex: 1,
    minHeight: MIN_TOUCH,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelReplaceBtnText: {
    color: colors.text,
    fontSize: font.base,
    fontWeight: '600',
  },
  galleryContainer: {
    position: 'relative',
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#EEEEF4',
    marginBottom: spacing.md,
  },
  galleryScroll: {
    height: 220,
  },
  galleryScrollContent: {
    alignItems: 'center',
  },
  galleryImage: {
    height: 220,
    resizeMode: 'cover',
  },
  galleryImageFallback: {
    height: 220,
    backgroundColor: '#EEEEF4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryCounterBadge: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
  },
  galleryCounterText: {
    color: '#FFFFFF',
    fontSize: font.base - 2,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  galleryEmptyPlaceholder: {
    height: 180,
    backgroundColor: '#EEEEF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  galleryEmptyPlaceholderName: {
    fontSize: font.title - 2,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  headerRatingRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  reviewsSummaryStars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewsNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#F3F0FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    padding: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  reviewsNoticeText: {
    fontSize: font.base - 2,
    color: '#432874',
    fontWeight: '500',
    flex: 1,
  },
  noReviewsBox: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  noReviewsText: {
    fontSize: font.base,
    color: colors.muted,
    fontStyle: 'italic',
  },
  reviewsList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  reviewCard: {
    backgroundColor: '#F7F7FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 4,
  },
  reviewTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewAuthor: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
  },
  reviewDate: {
    fontSize: font.base - 2,
    color: colors.muted,
  },
  reviewRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reviewStars: {
    color: '#F59E0B',
    fontSize: font.base,
    fontWeight: '700',
  },
  reviewScoreText: {
    fontSize: font.base - 2,
    color: colors.muted,
    fontWeight: '500',
  },
  reviewComment: {
    fontSize: font.base,
    color: colors.text,
    lineHeight: 22,
  },
  miniMapContainer: {
    marginTop: spacing.sm,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniMap: {
    width: '100%',
    height: 140,
  },
  miniMapNotice: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    fontSize: 12,
    color: colors.muted,
    backgroundColor: '#F7F7FA',
  },
});
