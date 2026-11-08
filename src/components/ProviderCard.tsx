import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Category, ProviderSummary } from '../api/types';
import { colors, font, MIN_TOUCH, spacing } from '../theme';
import { formatCOP } from '../utils/money';
import { MinimalIcon } from './MinimalIcon';
import { RatingStars } from './RatingStars';

const CATEGORY_LABELS: Record<Category, string> = {
  espacio: 'Espacio',
  alimentacion: 'Alimentación',
  decoracion: 'Decoración',
  entretenimiento: 'Entretenimiento',
};

const cardTokens = {
  subtleBg: '#F7F7FA',
  placeholderBg: '#EEEEF4',
  verifiedBg: '#EAF6EE',
  verifiedText: '#1B5E37',
};

interface ProviderCardProps {
  provider: ProviderSummary;
  onPress: (provider: ProviderSummary) => void;
}

/**
 * HU_EU_02_05 (criterio 2.1): tarjeta de proveedor con foto principal (o recuadro
 * neutro sin error si no carga), nombre, rubros, barrio y municipio, calificación,
 * insignia 'Verificado' si aplica y precio 'Desde' en COP.
 */
export function ProviderCard({ provider, onPress }: ProviderCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(provider.cover_url) && !imageFailed;

  const initials = provider.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <Pressable
      testID={`provider-card-${provider.id}`}
      onPress={() => onPress(provider)}
      accessibilityRole="button"
      accessibilityLabel={`${provider.name}, Desde ${formatCOP(provider.price_from_cop)}`}
      style={({ pressed }) => [
        styles.card,
        pressed ? styles.cardPressed : null,
      ]}
    >
      {showImage ? (
        <Image
          testID={`provider-image-${provider.id}`}
          source={{ uri: provider.cover_url! }}
          onError={() => setImageFailed(true)}
          style={styles.coverImage}
          accessibilityLabel={provider.name}
        />
      ) : (
        <View
          testID={`provider-placeholder-${provider.id}`}
          style={styles.coverPlaceholder}
        >
          <Text style={styles.placeholderInitials}>{initials}</Text>
        </View>
      )}

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{provider.name}</Text>
          {provider.verification_status === 'verificado' ? (
            <View
              testID={`provider-verified-${provider.id}`}
              style={styles.verifiedBadge}
            >
              <MinimalIcon name="check" size={14} color={cardTokens.verifiedText} />
              <Text style={styles.verifiedText}>Verificado</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.locationRow}>
          <MinimalIcon name="pin" size={15} color={colors.muted} />
          <Text style={styles.locationText}>
            {provider.neighborhood} · {provider.municipality}
          </Text>
        </View>

        {provider.categories.length > 0 ? (
          <View style={styles.categoriesRow}>
            {provider.categories.map((cat) => (
              <View key={cat} style={styles.categoryChip}>
                <Text style={styles.categoryChipText}>
                  {CATEGORY_LABELS[cat] ?? cat}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footerRow}>
          <RatingStars
            ratingAvg={provider.rating_avg}
            ratingCount={provider.rating_count}
          />
          <Text style={styles.priceText}>
            Desde {formatCOP(provider.price_from_cop)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: MIN_TOUCH,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.86,
  },
  coverImage: {
    width: '100%',
    height: 180,
    backgroundColor: cardTokens.placeholderBg,
  },
  coverPlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: cardTokens.placeholderBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderInitials: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 1,
  },
  body: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: font.base + 2,
    fontWeight: '700',
    color: colors.text,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: cardTokens.verifiedBg,
  },
  verifiedText: {
    fontSize: font.base,
    fontWeight: '600',
    color: cardTokens.verifiedText,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  locationText: {
    fontSize: font.base,
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
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: cardTokens.subtleBg,
  },
  categoryChipText: {
    fontSize: font.base,
    fontWeight: '500',
    color: colors.text,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  priceText: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
});
