import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GENERIC_ERROR, NetworkError } from '../api/client';
import { getHome } from '../api/endpoints';
import type { Category, EventType, HomeResponse, ProviderSummary } from '../api/types';
import { FieldError } from '../components/FieldError';
import { LoadingNotice } from '../components/LoadingNotice';
import { NetworkErrorView } from '../components/NetworkErrorView';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { useFlow } from '../state/FlowContext';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import { formatCOP } from '../utils/money';
import {
  validateEventDate,
  validateEventType,
  validateGuests,
  type FieldErrors,
} from '../utils/validators';

type InicioNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Inicio'>,
  NativeStackNavigationProp<RootStackParamList>
>;

/** Máximo de proveedores destacados en Inicio (criterio 2.3, Propuesto). */
export const FEATURED_LIMIT = 6;

const surfaceTokens = {
  subtleBg: '#F7F7FA',
  accentSurface: '#F3F0FF',
  accentBorder: '#D4C9FA',
  accentText: '#3A2399',
  verifiedBg: '#EAF6EE',
  verifiedText: '#1B5E37',
  placeholderBg: '#EEEEF4',
};

const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'cumpleanos', label: 'Cumpleaños' },
  { value: 'boda', label: 'Boda' },
  { value: 'xv', label: 'XV años' },
];

const CATEGORY_META: { category: Category; label: string; summary: string }[] = [
  {
    category: 'espacio',
    label: 'Espacio',
    summary: 'Salones, haciendas y jardines',
  },
  {
    category: 'alimentacion',
    label: 'Alimentación',
    summary: 'Banquetes, catering y bebidas',
  },
  {
    category: 'decoracion',
    label: 'Decoración',
    summary: 'Diseño floral y mobiliario',
  },
  {
    category: 'entretenimiento',
    label: 'Entretenimiento',
    summary: 'Música en vivo, DJ y sonido',
  },
];

const CATEGORY_LABELS: Record<Category, string> = {
  espacio: 'Espacio',
  alimentacion: 'Alimentación',
  decoracion: 'Decoración',
  entretenimiento: 'Entretenimiento',
};

function addMonthsISO(monthsAhead: number): string {
  const base = new Date();
  const target = new Date(
    base.getFullYear(),
    base.getMonth() + monthsAhead,
    base.getDate(),
  );
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const QUICK_DATE_PRESETS: { id: string; label: string; months: number }[] = [
  { id: '1m', label: 'En 1 mes', months: 1 },
  { id: '3m', label: 'En 3 meses', months: 3 },
  { id: '6m', label: 'En 6 meses', months: 6 },
];

/** HU_EU_01_12: buscador, categorías, destacados y acceso al atajo por presupuesto. */
export default function InicioScreen() {
  const navigation = useNavigation<InicioNavigationProp>();
  const { flow, update } = useFlow();

  const [eventType, setEventType] = useState<EventType | null>(flow.eventType);
  const [dateText, setDateText] = useState<string>(flow.eventDate ?? '');
  const [guestsText, setGuestsText] = useState<string>(
    flow.guests !== null ? String(flow.guests) : '',
  );
  const [errors, setErrors] = useState<FieldErrors>({});

  const [homeData, setHomeData] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [slow, setSlow] = useState<boolean>(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    getHome({ onSlow: () => active && setSlow(true) })
      .then((data) => {
        if (!active) return;
        setHomeData(data);
        setNetworkError(null);
        setUnexpectedError(null);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof NetworkError) {
          setNetworkError(err.message);
        } else {
          setUnexpectedError(GENERIC_ERROR);
        }
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setSlow(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleRetryHome = async () => {
    if (loading) return;
    setLoading(true);
    setSlow(false);
    setNetworkError(null);
    setUnexpectedError(null);
    try {
      const data = await getHome({ onSlow: () => setSlow(true) });
      setHomeData(data);
      setNetworkError(null);
      setUnexpectedError(null);
    } catch (err) {
      if (err instanceof NetworkError) {
        setNetworkError(err.message);
      } else {
        setUnexpectedError(GENERIC_ERROR);
      }
    } finally {
      setLoading(false);
      setSlow(false);
    }
  };

  const handleEventTypeSelect = (selected: EventType) => {
    setEventType(selected);
    update({ eventType: selected });
    if (errors.event_type) {
      setErrors((prev) => ({ ...prev, event_type: undefined }));
    }
  };

  const handleDateChange = (text: string) => {
    setDateText(text);
    const trimmed = text.trim();
    update({ eventDate: trimmed === '' ? null : trimmed });
    if (errors.event_date) {
      setErrors((prev) => ({ ...prev, event_date: undefined }));
    }
  };

  const handleGuestsChange = (text: string) => {
    setGuestsText(text);
    const parsed = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
    update({ guests: parsed });
    if (errors.guests) {
      setErrors((prev) => ({ ...prev, guests: undefined }));
    }
  };

  const handleSearch = () => {
    const eventTypeError = validateEventType(eventType);
    const guestsError = validateGuests(guestsText);
    const dateError = validateEventDate(dateText, { optional: true });

    const nextErrors: FieldErrors = {};
    if (eventTypeError) nextErrors.event_type = eventTypeError;
    if (guestsError) nextErrors.guests = guestsError;
    if (dateError) nextErrors.event_date = dateError;

    setErrors(nextErrors);

    if (eventTypeError || guestsError || dateError || !eventType) {
      return;
    }

    const guests = Number(guestsText.trim());
    const cleanDate = dateText.trim() || null;

    update({
      eventType,
      guests,
      eventDate: cleanDate,
      filters: {
        ...flow.filters,
        event_type: eventType,
        guests,
      },
    });

    navigation.navigate('Resultados', {
      eventType,
      guests,
      date: cleanDate ?? undefined,
    });
  };

  const handleCategoryPress = (category: Category) => {
    update({
      filters: {
        ...flow.filters,
        category,
      },
    });
    navigation.navigate('Resultados', { category });
  };

  const handleFeaturedPress = (provider: ProviderSummary) => {
    navigation.navigate('Proveedor', { providerId: provider.id });
  };

  const categoryCounts = new Map<Category, number>(
    (homeData?.categories ?? []).map((c) => [c.category, c.count]),
  );
  const featuredProviders = (homeData?.featured ?? []).slice(0, FEATURED_LIMIT);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Cabecera y acceso directo a Mi evento (criterio 2.5) */}
      <View style={styles.topBar}>
        <View style={styles.brandBlock}>
          <Text style={styles.title}>EventU</Text>
          <Text style={styles.subtitle}>
            Servicios verificados para celebraciones en Cali
          </Text>
        </View>
        <Pressable
          testID="btn-my-event"
          onPress={() => navigation.navigate('MiEvento')}
          accessibilityRole="button"
          accessibilityLabel={`Mi evento, ${flow.cart.length} servicios agregados`}
          style={({ pressed }) => [
            styles.myEventButton,
            pressed ? styles.interactivePressed : null,
          ]}
        >
          <Text style={styles.myEventLabel}>Mi evento</Text>
          <View style={styles.myEventBadge}>
            <Text style={styles.myEventBadgeText}>{flow.cart.length}</Text>
          </View>
        </Pressable>
      </View>

      {/* Buscador principal (criterio 2.1 y validaciones 3.1 a 3.3) */}
      <View style={styles.searchPanel}>
        <View style={styles.formGroup}>
          <Text style={styles.label}>Tipo de evento</Text>
          <View style={styles.optionsRow} accessibilityRole="radiogroup">
            {EVENT_TYPE_OPTIONS.map((option) => {
              const selected = eventType === option.value;
              return (
                <Pressable
                  key={option.value}
                  testID={`option-${option.value}`}
                  onPress={() => handleEventTypeSelect(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.optionPill,
                    selected ? styles.optionPillSelected : null,
                    pressed ? styles.interactivePressed : null,
                  ]}
                >
                  <View
                    style={[
                      styles.radioIndicator,
                      selected ? styles.radioIndicatorSelected : null,
                    ]}
                  />
                  <Text
                    style={[styles.optionText, selected ? styles.optionTextSelected : null]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <FieldError message={errors.event_type} />
        </View>

        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Número de invitados</Text>
            <Text style={styles.fieldHint}>1 a 500 personas</Text>
          </View>
          <TextInput
            testID="input-guests"
            style={[styles.input, errors.guests ? styles.inputError : null]}
            value={guestsText}
            onChangeText={handleGuestsChange}
            placeholder="Ej. 100"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            accessibilityLabel="Número de invitados"
          />
          <FieldError message={errors.guests} />
        </View>

        <View style={styles.formGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Fecha del evento</Text>
            <Text style={styles.fieldHint}>Opcional · AAAA-MM-DD</Text>
          </View>
          <TextInput
            testID="input-date"
            style={[styles.input, errors.event_date ? styles.inputError : null]}
            value={dateText}
            onChangeText={handleDateChange}
            placeholder="AAAA-MM-DD (opcional)"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Fecha del evento opcional en formato AAAA-MM-DD"
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
            {dateText.trim() !== '' ? (
              <Pressable
                testID="date-preset-clear"
                onPress={() => handleDateChange('')}
                accessibilityRole="button"
                style={styles.datePresetChip}
              >
                <Text style={styles.datePresetText}>Limpiar</Text>
              </Pressable>
            ) : null}
          </View>
          <FieldError message={errors.event_date} />
        </View>

        <Pressable
          testID="btn-search"
          onPress={handleSearch}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.searchButton,
            pressed ? styles.interactivePressed : null,
          ]}
        >
          <Text style={styles.searchButtonText}>Buscar</Text>
        </Pressable>
      </View>

      {/* Atajo diferenciador por presupuesto (criterio 2.4 — HU_EU_01_01) */}
      <Pressable
        testID="btn-budget-shortcut"
        onPress={() => navigation.navigate('Presupuesto')}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.shortcutBanner,
          pressed ? styles.interactivePressed : null,
        ]}
      >
        <View style={styles.shortcutContent}>
          <Text style={styles.shortcutTitle}>Arma mi evento por presupuesto</Text>
          <Text style={styles.shortcutSubtitle}>
            Compara 3 paquetes completos (Ahorro, Equilibrado y Premium) ajustados a tu tope.
          </Text>
        </View>
        <View style={styles.shortcutCtaPill}>
          <Text style={styles.shortcutCtaText}>Ir</Text>
        </View>
      </Pressable>

      {/* Directorio de categorías (criterio 2.2) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Categorías</Text>
        <View style={styles.categoriesGrid}>
          {CATEGORY_META.map((item) => {
            const count = categoryCounts.get(item.category) ?? 0;
            return (
              <Pressable
                key={item.category}
                testID={`category-${item.category}`}
                onPress={() => handleCategoryPress(item.category)}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}, ${count} proveedores`}
                style={({ pressed }) => [
                  styles.categoryCard,
                  pressed ? styles.interactivePressed : null,
                ]}
              >
                <View style={styles.categoryHeaderRow}>
                  <Text style={styles.categoryLabel}>{item.label}</Text>
                  <View style={styles.categoryCountBadge}>
                    <Text style={styles.categoryCount}>{count} proveedores</Text>
                  </View>
                </View>
                <Text style={styles.categorySummary}>{item.summary}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Estados de carga y fallo de GET /home (criterio 6 y HU_EU_01_04) */}
      {loading ? <LoadingNotice slow={slow} /> : null}

      {networkError ? (
        <NetworkErrorView message={networkError} onRetry={handleRetryHome} />
      ) : null}

      {unexpectedError ? (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Text style={styles.errorBannerText}>{unexpectedError}</Text>
          <Pressable
            testID="btn-retry-home"
            onPress={handleRetryHome}
            accessibilityRole="button"
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Sección Destacados (criterio 2.3: hasta 6 proveedores, orden RN-26) */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Destacados</Text>
          {featuredProviders.length > 0 ? (
            <Text style={styles.sectionCaption}>
              {featuredProviders.length} de {FEATURED_LIMIT} en Cali
            </Text>
          ) : null}
        </View>

        <View style={styles.featuredList}>
          {featuredProviders.map((provider) => {
            const showImage = Boolean(provider.cover_url) && !failedImages[provider.id];
            const hasRating =
              provider.rating_avg !== null && provider.rating_count > 0;
            const ratingText = hasRating
              ? `★ ${provider.rating_avg!.toFixed(1)}`
              : 'Sin reseñas';
            const initials = provider.name
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase() ?? '')
              .join('');

            return (
              <Pressable
                key={provider.id}
                testID={`featured-${provider.id}`}
                onPress={() => handleFeaturedPress(provider)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.featuredCard,
                  pressed ? styles.interactivePressed : null,
                ]}
              >
                {showImage ? (
                  <Image
                    testID={`featured-image-${provider.id}`}
                    source={{ uri: provider.cover_url! }}
                    onError={() =>
                      setFailedImages((prev) => ({ ...prev, [provider.id]: true }))
                    }
                    style={styles.featuredImage}
                    accessibilityLabel={provider.name}
                  />
                ) : (
                  <View
                    testID={`featured-placeholder-${provider.id}`}
                    style={styles.featuredImagePlaceholder}
                  >
                    <Text style={styles.placeholderInitials}>{initials}</Text>
                  </View>
                )}

                <View style={styles.featuredBody}>
                  <View style={styles.featuredTitleRow}>
                    <Text style={styles.featuredName}>{provider.name}</Text>
                    {provider.verification_status === 'verificado' ? (
                      <View style={styles.verifiedBadge}>
                        <Text style={styles.verifiedBadgeText}>Verificado</Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.featuredLocation}>
                    {provider.neighborhood} · {provider.municipality}
                  </Text>

                  {provider.categories.length > 0 ? (
                    <View style={styles.featuredTagsRow}>
                      {provider.categories.map((cat) => (
                        <View key={cat} style={styles.featuredTag}>
                          <Text style={styles.featuredTagText}>
                            {CATEGORY_LABELS[cat] ?? cat}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <View style={styles.featuredFooter}>
                    <View style={styles.ratingGroup}>
                      <Text style={styles.featuredRating}>{ratingText}</Text>
                      {hasRating ? (
                        <Text style={styles.featuredReviewCount}>
                          ({provider.rating_count})
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.featuredPrice}>
                      Desde {formatCOP(provider.price_from_cop)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg * 2,
    gap: spacing.lg,
  },
  interactivePressed: {
    opacity: 0.85,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  brandBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.text,
  },
  subtitle: {
    fontSize: font.base,
    color: colors.muted,
    lineHeight: 22,
  },
  myEventButton: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: surfaceTokens.accentBorder,
    backgroundColor: surfaceTokens.accentSurface,
  },
  myEventLabel: {
    fontSize: font.base,
    fontWeight: '700',
    color: surfaceTokens.accentText,
  },
  myEventBadge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myEventBadgeText: {
    color: colors.background,
    fontSize: font.base,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  searchPanel: {
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: surfaceTokens.subtleBg,
    gap: spacing.md,
  },
  formGroup: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  label: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
  },
  fieldHint: {
    fontSize: font.base,
    color: colors.muted,
  },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: font.base,
    color: colors.text,
    backgroundColor: colors.background,
  },
  inputError: {
    borderColor: colors.error,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionPill: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  optionPillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  radioIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.muted,
  },
  radioIndicatorSelected: {
    borderColor: colors.background,
    backgroundColor: colors.background,
  },
  optionText: {
    fontSize: font.base,
    color: colors.text,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: colors.background,
    fontWeight: '700',
  },
  datePresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingTop: 2,
  },
  datePresetChip: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePresetChipActive: {
    borderColor: colors.primary,
    backgroundColor: surfaceTokens.accentSurface,
  },
  datePresetText: {
    fontSize: font.base,
    color: colors.muted,
    fontWeight: '500',
  },
  datePresetTextActive: {
    color: surfaceTokens.accentText,
    fontWeight: '700',
  },
  searchButton: {
    minHeight: MIN_TOUCH + 4,
    backgroundColor: colors.primary,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchButtonText: {
    color: colors.background,
    fontSize: font.base,
    fontWeight: '700',
  },
  shortcutBanner: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: surfaceTokens.accentBorder,
    backgroundColor: surfaceTokens.accentSurface,
    gap: spacing.md,
  },
  shortcutContent: {
    flex: 1,
    gap: spacing.xs,
  },
  shortcutTitle: {
    fontSize: font.base,
    fontWeight: '700',
    color: surfaceTokens.accentText,
  },
  shortcutSubtitle: {
    fontSize: font.base,
    color: surfaceTokens.accentText,
    lineHeight: 22,
  },
  shortcutCtaPill: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutCtaText: {
    color: colors.background,
    fontSize: font.base,
    fontWeight: '700',
  },
  section: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: font.title,
    fontWeight: '700',
    color: colors.text,
  },
  sectionCaption: {
    fontSize: font.base,
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  categoriesGrid: {
    gap: spacing.sm,
  },
  categoryCard: {
    minHeight: MIN_TOUCH,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.xs,
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryLabel: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
  },
  categoryCountBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: surfaceTokens.subtleBg,
  },
  categoryCount: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  categorySummary: {
    fontSize: font.base,
    color: colors.muted,
    lineHeight: 22,
  },
  errorBanner: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  errorBannerText: {
    color: colors.error,
    fontSize: font.base,
  },
  retryButton: {
    minHeight: MIN_TOUCH,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    color: colors.background,
    fontSize: font.base,
    fontWeight: '600',
  },
  featuredList: {
    gap: spacing.md,
  },
  featuredCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  featuredImage: {
    width: '100%',
    height: 176,
    backgroundColor: surfaceTokens.placeholderBg,
  },
  featuredImagePlaceholder: {
    width: '100%',
    height: 176,
    backgroundColor: surfaceTokens.placeholderBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderInitials: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 1,
  },
  featuredBody: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  featuredTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  featuredName: {
    flex: 1,
    fontSize: font.base + 2,
    fontWeight: '700',
    color: colors.text,
  },
  verifiedBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: surfaceTokens.verifiedBg,
  },
  verifiedBadgeText: {
    fontSize: font.base,
    fontWeight: '600',
    color: surfaceTokens.verifiedText,
  },
  featuredLocation: {
    fontSize: font.base,
    color: colors.muted,
  },
  featuredTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  featuredTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: surfaceTokens.subtleBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featuredTagText: {
    fontSize: font.base,
    color: colors.text,
    fontWeight: '500',
  },
  featuredFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  ratingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  featuredRating: {
    fontSize: font.base,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  featuredReviewCount: {
    fontSize: font.base,
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  featuredPrice: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
});
