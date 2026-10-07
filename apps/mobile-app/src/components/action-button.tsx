import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/lib/theme';

interface IActionButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}

export function ActionButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: IActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        (disabled || pressed) && styles.dimmed,
      ]}
    >
      <Text style={[styles.label, secondary && styles.secondaryLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  secondary: { backgroundColor: colors.primaryLight },
  dimmed: { opacity: 0.45 },
  label: { color: colors.surface, fontSize: 14, fontWeight: '600' },
  secondaryLabel: { color: colors.primary },
});
