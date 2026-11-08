import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font, spacing } from '../theme';
import { MinimalIcon } from './MinimalIcon';

interface RatingStarsProps {
  ratingAvg: number | null;
  ratingCount: number;
}

/**
 * HU_EU_02_05 / RN-24: muestra el promedio de las reseñas con un decimal
 * y el número de reseñas; sin reseñas muestra literalmente 'Sin reseñas'.
 */
export function RatingStars({ ratingAvg, ratingCount }: RatingStarsProps) {
  const hasRating = ratingAvg !== null && ratingCount > 0;

  if (!hasRating) {
    return (
      <View style={styles.row} accessibilityLabel="Sin reseñas">
        <Text style={styles.noReviews}>Sin reseñas</Text>
      </View>
    );
  }

  const formatted = ratingAvg.toFixed(1);

  return (
    <View
      style={styles.row}
      accessibilityLabel={`Calificación ${formatted} de 5 basada en ${ratingCount} reseñas`}
    >
      <MinimalIcon name="star" size={15} color={colors.primary} />
      <Text style={styles.ratingValue}>★ {formatted}</Text>
      <Text style={styles.ratingCount}>({ratingCount})</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratingValue: {
    fontSize: font.base,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  ratingCount: {
    fontSize: font.base,
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  noReviews: {
    fontSize: font.base,
    color: colors.muted,
  },
});
