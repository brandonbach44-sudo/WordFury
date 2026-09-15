// src/shared/AchievementPopup.tsx
// Canonical achievement-unlocked popup, shared by every game so the
// slide-in toast looks and behaves identically everywhere. Accepts any
// achievement-shaped object ({ emoji, name, description }) so each game's
// own Achievement type works without adaptation.
//
// Takes the whole batch of achievements unlocked by a round, not one at a
// time. One achievement renders exactly as it always has. Two or more
// collapse into a single "N Achievements Unlocked" card that expands on tap
// and dismisses as one group, rather than making the player wait through a
// serial toast per achievement.
import React, { useEffect, useRef, useState } from 'react';
import { AchievementIcon } from './AchievementIcon';
import { useTheme } from './ThemeContext';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');

const AUTO_DISMISS_MS = 3000;
// Caps the expanded list so it scrolls internally instead of growing the
// toast tall enough to push page content -- see the results-screen
// one-screen-fit constraint in ResultsScreen.tsx.
const EXPANDED_LIST_MAX_HEIGHT = 260;

export type AchievementLike = {
  /** Drives the icon — see AchievementIcon.tsx. */
  category?: string;
  name: string;
  description: string;
};

interface AchievementPopupProps {
  achievements: AchievementLike[];
  onDismiss: () => void;
  backgroundColor?: string;
  textColor?: string;
}

export const AchievementPopup: React.FC<AchievementPopupProps> = ({
  achievements,
  onDismiss,
  backgroundColor = '#ffffff',
  textColor = '#2c2416',
}) => {
  const { background } = useTheme();
  const slideAnim = useRef(new Animated.Value(-150)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(false);
  const prevCountRef = useRef(0);

  const count = achievements.length;
  const isGroup = count > 1;

  // Slide in only on the 0 -> nonzero transition, not on every re-render
  // while the toast is already showing.
  useEffect(() => {
    if (count > 0 && prevCountRef.current === 0) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
    if (count === 0) {
      setExpanded(false);
    }
    prevCountRef.current = count;
  }, [count]);

  // Auto dismiss while collapsed, same as the original single-achievement
  // toast. Suspended while expanded, since the player is reading the list;
  // collapsing again resumes the countdown.
  useEffect(() => {
    if (count === 0 || expanded) return;
    const timer = setTimeout(() => dismissPopup(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, expanded]);

  const dismissPopup = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -150,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setExpanded(false);
      onDismiss();
    });
  };

  if (count === 0) return null;

  const primary = achievements[0];

  // Plain absolutely-positioned toast rather than a native <Modal>. Native
  // Modals always render in their own top-level layer above every regular
  // view, which meant this toast could pop up on top of (and swallow taps
  // on) a results screen that's already open — e.g. finishing the Daily
  // Ladder shows both the results overlay and a newly-unlocked achievement
  // at nearly the same time, and the achievement Modal would win, blocking
  // the results screen's close button until the toast auto-dismissed.
  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
      pointerEvents="box-none"
    >
      {!isGroup ? (
        <TouchableOpacity
          style={[styles.popup, { backgroundColor, borderColor: background.accentColor }]}
          onPress={dismissPopup}
          activeOpacity={0.9}
        >
          <View style={styles.header}>
            <Text style={[styles.unlockLabel, { color: background.accentColor }]}>Achievement Unlocked!</Text>
          </View>

          <View style={styles.content}>
            <View style={styles.iconWrap}>
              <AchievementIcon category={primary.category} size={26} color={textColor} />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.name, { color: textColor }]}>{primary.name}</Text>
              <Text style={[styles.description, { color: textColor, opacity: 0.7 }]}>
                {primary.description}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={[styles.popup, { backgroundColor, borderColor: background.accentColor }]}>
          <TouchableOpacity onPress={() => setExpanded((e) => !e)} activeOpacity={0.9}>
            <View style={styles.groupHeaderRow}>
              <View style={styles.header}>
                <Text style={[styles.unlockLabel, { color: background.accentColor }]}>
                  {expanded ? 'Achievements Unlocked!' : `${count} Achievements Unlocked`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={dismissPopup}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={[styles.closeX, { color: textColor }]}>×</Text>
              </TouchableOpacity>
            </View>

            {!expanded && (
              <View style={styles.content}>
                <View style={styles.iconWrap}>
                  <AchievementIcon category={primary.category} size={26} color={textColor} />
                </View>
                <View style={styles.textContainer}>
                  <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>
                    {primary.name}
                  </Text>
                  <Text style={[styles.description, { color: textColor, opacity: 0.7 }]}>
                    +{count - 1} more, tap to view all
                  </Text>
                </View>
              </View>
            )}
          </TouchableOpacity>

          {expanded && (
            <ScrollView
              style={styles.expandedList}
              showsVerticalScrollIndicator={false}
            >
              {achievements.map((a, i) => (
                <View
                  key={`${a.name}-${i}`}
                  style={[styles.content, i > 0 && styles.expandedItemSpacing]}
                >
                  <View style={styles.iconWrap}>
                    <AchievementIcon category={a.category} size={22} color={textColor} />
                  </View>
                  <View style={styles.textContainer}>
                    <Text style={[styles.name, { color: textColor }]}>{a.name}</Text>
                    <Text style={[styles.description, { color: textColor, opacity: 0.7 }]}>
                      {a.description}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 20,
  },
  popup: {
    width: width - 40,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#4ecca3',
  },
  header: {
    marginBottom: 8,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  closeX: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 20,
    paddingHorizontal: 4,
    opacity: 0.6,
  },
  expandedList: {
    maxHeight: EXPANDED_LIST_MAX_HEIGHT,
  },
  expandedItemSpacing: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.08)',
  },
  unlockLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  textContainer: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  description: {
    fontSize: 14,
  },
});

export default AchievementPopup;
