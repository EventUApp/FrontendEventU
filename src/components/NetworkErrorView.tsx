import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, font, MIN_TOUCH, spacing } from '../theme';

/** Error de red con botón 'Reintentar' (RF-GEN-01, RF-GEN-03). */
export function NetworkErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ padding: spacing.md, gap: spacing.md }}>
      <Text style={{ color: colors.text, fontSize: font.base }}>{message}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={{ minHeight: MIN_TOUCH, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary, borderRadius: 8 }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: font.base }}>Reintentar</Text>
      </Pressable>
    </View>
  );
}
