import React from 'react';
import { Text, View } from 'react-native';
import { colors, font, spacing } from '../theme';

/** Marcador de pantalla pendiente. Cada HU lo sustituye por la pantalla adaptada del prototipo. */
export function Placeholder({ title, hu }: { title: string; hu: string }) {
  return (
    <View style={{ flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.sm }}>
      <Text style={{ fontSize: font.title, color: colors.text }}>{title}</Text>
      <Text style={{ fontSize: font.base, color: colors.muted }}>Pendiente: {hu}</Text>
    </View>
  );
}
