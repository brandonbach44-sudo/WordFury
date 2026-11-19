// src/shared/leaderboards/Segmented.tsx
// Two-option segmented control used by the board screens.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../ThemeContext';
import { withOpacity } from '../ResultsScreen';

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: object;
}) {
  const { background } = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: withOpacity(background.borderColor, 0.12) }, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.option, on && [styles.on, { backgroundColor: background.cardColor }]]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.label, { color: on ? background.textColor : background.secondaryText }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', borderRadius: 999, padding: 3 },
  option: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999 },
  on: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: { fontSize: 13, fontWeight: '800' },
});
