import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { colors, font, spacing } from '../theme';

/** Indicador de carga; muestra el aviso de arranque en frío cuando `slow` es true (RF-GEN-02). */
export function LoadingNotice({ slow }: { slow?: boolean }) {
  return (
    <View style={{ padding: spacing.md, alignItems: 'center', gap: spacing.sm }}>
      <ActivityIndicator color={colors.primary} />
      {slow ? (
        <Text style={{ color: colors.muted, fontSize: font.base }}>
          Estamos conectando con el servidor. Esto puede tardar un momento.
        </Text>
      ) : null}
    </View>
  );
}
