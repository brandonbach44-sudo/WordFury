import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Switch,
  ImageBackground,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme } from './ThemeContext';
import { HapticManager } from './HapticManager';
import { MotionPreference } from './motionPreference';
import { BackgroundOption, COLORS, getLightBackgrounds } from './theme';
import FeedbackForm from '../../FeedbackForm';
import {
  Newspaper,
  Palette,
  Mail,
  Info,
  Shield,
  ChevronRight,
  Bell,
  Check,
} from 'lucide-react-native';
import {
  ALL_GAME_IDS,
  GAME_LABELS,
  GameId,
  ReminderPrefs,
  loadReminderPrefs,
  saveReminderPrefs,
  requestReminderPermission,
  disableReminders,
  syncDailyReminder,
} from './dailyReminders';

// Pulled from app.json so this can't drift out of sync with the real
// build version like it did before (screen said 0.1.0, app.json said 1.0.0).
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

// What's New data - update this with each release
const WHATS_NEW = [
  {
    version: '1.0.0',
    date: 'August 2026',
    changes: [
      'Launch of Word Fury with 8 games: Wordsmith, Furdle, Hangman, Word Grid, Word Search, Word Ladder, Hex Hive, and Anagrams',
      'Daily challenges and streaks across every game',
      'Achievement system with unlockable badges',
      'Multiple themes, dark mode, and color blind mode',
    ],
  },
];

export const SettingsScreen: React.FC = () => {
  const {
    background,
    selectedBackgroundId,
    darkModeEnabled,
    colorBlindMode,
    setBackgroundId,
    setDarkMode,
    setColorBlindMode,
  } = useTheme();

  const [showWhatsNew, setShowWhatsNew] = React.useState(false);
  const [showFeedback, setShowFeedback] = React.useState(false);
  const [reminderPrefs, setReminderPrefs] = React.useState<ReminderPrefs | null>(null);
  const [hapticsEnabled, setHapticsEnabled] = React.useState<boolean>(HapticManager.isEnabled());
  const [motionEnabled, setMotionEnabled] = React.useState<boolean>(MotionPreference.isUserEnabled());
  const [reduceMotionActive, setReduceMotionActive] = React.useState<boolean>(MotionPreference.isReduceMotionActive());

  React.useEffect(() => {
    HapticManager.init().then(() => setHapticsEnabled(HapticManager.isEnabled()));
  }, []);

  React.useEffect(() => {
    return MotionPreference.subscribe((state) => {
      setMotionEnabled(state.userEnabled);
      setReduceMotionActive(state.reduceMotionEnabled);
    });
  }, []);

  React.useEffect(() => {
    loadReminderPrefs().then(setReminderPrefs);
  }, []);

  const handleReminderMasterToggle = async (enabled: boolean) => {
    if (!enabled) {
      await disableReminders();
      setReminderPrefs((prev) => (prev ? { ...prev, enabled: false } : prev));
      return;
    }
    // Optimistically flip on, then correct back to off if the OS permission
    // prompt gets declined — requestReminderPermission only persists
    // enabled:true when permission is actually granted.
    setReminderPrefs((prev) => (prev ? { ...prev, enabled: true } : prev));
    const result = await requestReminderPermission();
    if (result !== 'granted') {
      const latest = await loadReminderPrefs();
      setReminderPrefs(latest);
    }
    if (result === 'blocked') {
      // iOS won't show its own dialog a second time — the only way back in
      // is the Settings app, so say so instead of just silently failing.
      Alert.alert(
        'Notifications Are Off',
        'You previously turned off notifications for Word Fury. Enable them in iOS Settings to get daily reminders.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    }
  };

  const handleReminderGameToggle = async (id: GameId, value: boolean) => {
    if (!reminderPrefs) return;
    const updated: ReminderPrefs = { ...reminderPrefs, games: { ...reminderPrefs.games, [id]: value } };
    setReminderPrefs(updated);
    await saveReminderPrefs(updated);
    syncDailyReminder();
  };

  // Only show light backgrounds in picker (dark mode is separate toggle)
  const lightBackgrounds = getLightBackgrounds();

  const renderBackgroundOption = (option: BackgroundOption) => {
    const isSelected = option.id === selectedBackgroundId && !darkModeEnabled;
    
    return (
      <TouchableOpacity
        key={option.id}
        style={[
          styles.backgroundOption,
          isSelected && styles.backgroundOptionSelected,
        ]}
        onPress={() => {
          setBackgroundId(option.id);
          // Turn off dark mode when selecting a light background
          if (darkModeEnabled) {
            setDarkMode(false);
          }
        }}
        activeOpacity={0.7}
        disabled={darkModeEnabled}
      >
        {option.type === 'color' ? (
          <View 
            style={[
              styles.backgroundPreview, 
              { backgroundColor: option.backgroundColor },
              darkModeEnabled && styles.backgroundPreviewDisabled,
            ]} 
          />
        ) : (
          <ImageBackground
            source={option.backgroundImage}
            style={[
              styles.backgroundPreview,
              darkModeEnabled && styles.backgroundPreviewDisabled,
            ]}
            imageStyle={styles.backgroundPreviewImage}
          />
        )}
        <Text 
          style={[
            styles.backgroundName, 
            { color: background.textColor },
            darkModeEnabled && styles.textDisabled,
          ]}
        >
          {option.name}
        </Text>
        {isSelected && (
          <View style={styles.checkmark}>
            <Text style={styles.checkmarkText}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // What's New Modal/Section
  if (showWhatsNew) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: background.backgroundColor }]}>
        <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowWhatsNew(false)} style={styles.backButton}>
            <Text style={[styles.backButtonText, { color: background.secondaryText }]}>
              ← Back
            </Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: background.textColor }]}>What's New</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {WHATS_NEW.map((release, index) => (
            <View 
              key={release.version} 
              style={[
                styles.releaseCard, 
                { backgroundColor: background.cardColor, borderColor: background.borderColor }
              ]}
            >
              <View style={styles.releaseHeader}>
                <Text style={[styles.releaseVersion, { color: background.textColor }]}>
                  Version {release.version}
                </Text>
                <Text style={[styles.releaseDate, { color: background.secondaryText }]}>
                  {release.date}
                </Text>
              </View>
              <View style={styles.changesList}>
                {release.changes.map((change, changeIndex) => (
                  <View key={changeIndex} style={styles.changeItem}>
                    <Text style={[styles.changeBullet, { color: background.secondaryText }]}>•</Text>
                    <Text style={[styles.changeText, { color: background.textColor }]}>
                      {change}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background.backgroundColor }]}>
      <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: background.secondaryText }]}>
            ← Back
          </Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: background.textColor }]}>Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ==================== WHAT'S NEW SECTION ==================== */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Newspaper size={20} color={background.secondaryText} style={styles.sectionIcon} />
            <Text style={[styles.sectionTitle, { color: background.textColor }]}>
              What's New
            </Text>
          </View>
          
          <TouchableOpacity 
            style={[styles.linkRow, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}
            onPress={() => setShowWhatsNew(true)}
            activeOpacity={0.7}
          >
            <View style={styles.linkInfo}>
              <Text style={[styles.linkLabel, { color: background.textColor }]}>
                See Latest Updates
              </Text>
              <Text style={[styles.linkDescription, { color: background.secondaryText }]}>
                New features and improvements
              </Text>
            </View>
            <ChevronRight size={20} color={background.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* ==================== APPEARANCE SECTION ==================== */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Palette size={20} color={background.secondaryText} style={styles.sectionIcon} />
            <Text style={[styles.sectionTitle, { color: background.textColor }]}>
              Appearance
            </Text>
          </View>
          
          {/* Dark Mode Toggle */}
          <View style={[styles.settingRow, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: background.textColor }]}>
                Dark Mode
              </Text>
              <Text style={[styles.settingDescription, { color: background.secondaryText }]}>
                Use dark theme across all games
              </Text>
            </View>
            <Switch
              value={darkModeEnabled}
              onValueChange={setDarkMode}
              trackColor={{ false: '#9CA3AF', true: COLORS.accent }}
              ios_backgroundColor="#9CA3AF"
              thumbColor={darkModeEnabled ? '#ffffff' : '#f4f3f4'}
            />
          </View>
          
          {/* Haptics Toggle */}
          <View style={[styles.settingRow, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: background.textColor }]}>
                Haptics
              </Text>
              <Text style={[styles.settingDescription, { color: background.secondaryText }]}>
                Vibration feedback while playing
              </Text>
            </View>
            <Switch
              value={hapticsEnabled}
              onValueChange={(next) => {
                setHapticsEnabled(next);
                HapticManager.setEnabled(next).then(() => {
                  // Fire one tick when switching ON so the player immediately
                  // feels what they just enabled.
                  if (next) HapticManager.light();
                });
              }}
              trackColor={{ false: '#9CA3AF', true: COLORS.accent }}
              ios_backgroundColor="#9CA3AF"
              thumbColor={hapticsEnabled ? '#ffffff' : '#f4f3f4'}
            />
          </View>

          {/* Background Motion Toggle */}
          <View style={[styles.settingRow, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: background.textColor }]}>
                Background Motion
              </Text>
              <Text style={[styles.settingDescription, { color: background.secondaryText }]}>
                {reduceMotionActive
                  ? 'Falling letters on menu screens — off because Reduce Motion is on in iOS Settings'
                  : 'Falling letters on menu screens'}
              </Text>
            </View>
            <Switch
              value={motionEnabled}
              onValueChange={(next) => {
                setMotionEnabled(next);
                MotionPreference.setEnabled(next);
              }}
              disabled={reduceMotionActive}
              trackColor={{ false: '#9CA3AF', true: COLORS.accent }}
              ios_backgroundColor="#9CA3AF"
              thumbColor={motionEnabled ? '#ffffff' : '#f4f3f4'}
            />
          </View>

          {/* Color Blind Mode Toggle */}
          <View style={[styles.settingRow, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: background.textColor }]}>
                Color Blind Mode
              </Text>
              <Text style={[styles.settingDescription, { color: background.secondaryText }]}>
                Uses orange & blue instead of green & yellow in all games
              </Text>
            </View>
            <Switch
              value={colorBlindMode}
              onValueChange={setColorBlindMode}
              trackColor={{ false: '#9CA3AF', true: COLORS.accent }}
              ios_backgroundColor="#9CA3AF"
              thumbColor={colorBlindMode ? '#ffffff' : '#f4f3f4'}
            />
          </View>

          {/* Background Selection */}
          <Text style={[styles.subsectionTitle, { color: background.secondaryText }]}>
            Background {darkModeEnabled ? '(disabled in dark mode)' : ''}
          </Text>
          <View style={[
            styles.backgroundGrid,
            darkModeEnabled && styles.backgroundGridDisabled,
          ]}>
            {lightBackgrounds.map(renderBackgroundOption)}
          </View>
        </View>

        {/* ==================== REMINDERS SECTION ==================== */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Bell size={20} color={background.secondaryText} style={styles.sectionIcon} />
            <Text style={[styles.sectionTitle, { color: background.textColor }]}>
              Daily Reminders
            </Text>
          </View>

          <View style={[styles.settingRow, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: background.textColor }]}>
                Evening Reminder
              </Text>
              <Text style={[styles.settingDescription, { color: background.secondaryText }]}>
                One notification around 9 PM if you've got an unplayed daily
              </Text>
            </View>
            <Switch
              value={reminderPrefs?.enabled ?? false}
              onValueChange={handleReminderMasterToggle}
              trackColor={{ false: '#9CA3AF', true: COLORS.accent }}
              ios_backgroundColor="#9CA3AF"
              thumbColor={reminderPrefs?.enabled ? '#ffffff' : '#f4f3f4'}
            />
          </View>

          {reminderPrefs?.enabled && (
            <>
              <Text style={[styles.subsectionTitle, { color: background.secondaryText }]}>
                Remind me for
              </Text>
              <View style={[styles.gameChecklistCard, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
                {ALL_GAME_IDS.map((id, index) => {
                  const checked = reminderPrefs.games[id];
                  return (
                    <TouchableOpacity
                      key={id}
                      style={[
                        styles.gameChecklistRow,
                        index < ALL_GAME_IDS.length - 1 && { borderBottomWidth: 1, borderBottomColor: background.borderColor },
                      ]}
                      onPress={() => handleReminderGameToggle(id, !checked)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.gameChecklistLabel, { color: background.textColor }]}>
                        {GAME_LABELS[id]}
                      </Text>
                      <View
                        style={[
                          styles.checklistBox,
                          { borderColor: background.borderColor },
                          checked && { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
                        ]}
                      >
                        {checked && <Check size={14} color="#ffffff" strokeWidth={3} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* ==================== CONTACT SECTION ==================== */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Mail size={20} color={background.secondaryText} style={styles.sectionIcon} />
            <Text style={[styles.sectionTitle, { color: background.textColor }]}>
              Contact Developer
            </Text>
          </View>
          
          <TouchableOpacity
            style={[styles.linkRow, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}
            onPress={() => setShowFeedback(true)}
            activeOpacity={0.7}
          >
            <View style={styles.linkInfo}>
              <Text style={[styles.linkLabel, { color: background.textColor }]}>
                Send Feedback
              </Text>
              <Text style={[styles.linkDescription, { color: background.secondaryText }]}>
                Suggestions, bugs, or just say hi
              </Text>
            </View>
            <ChevronRight size={20} color={background.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* ==================== LEGAL SECTION ==================== */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Shield size={20} color={background.secondaryText} style={styles.sectionIcon} />
            <Text style={[styles.sectionTitle, { color: background.textColor }]}>
              Legal
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.linkRow, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}
            onPress={() => router.push('/privacy-policy' as any)}
            activeOpacity={0.7}
          >
            <View style={styles.linkInfo}>
              <Text style={[styles.linkLabel, { color: background.textColor }]}>
                Privacy Policy
              </Text>
              <Text style={[styles.linkDescription, { color: background.secondaryText }]}>
                What we collect (nothing) and how feedback works
              </Text>
            </View>
            <ChevronRight size={20} color={background.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* ==================== ABOUT SECTION ==================== */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Info size={20} color={background.secondaryText} style={styles.sectionIcon} />
            <Text style={[styles.sectionTitle, { color: background.textColor }]}>
              About
            </Text>
          </View>
          
          <View style={[styles.aboutCard, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
            <Text style={[styles.appName, { color: background.textColor }]}>
              Word Fury
            </Text>
            <Text style={[styles.versionText, { color: background.secondaryText }]}>
              Version {APP_VERSION}
            </Text>
            <View style={styles.divider} />
            <Text style={[styles.aboutDescription, { color: background.secondaryText }]}>
              A collection of fun word games to challenge your vocabulary and keep your mind sharp.
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <FeedbackForm
        visible={showFeedback}
        onClose={() => setShowFeedback(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  backButton: {
    padding: 5,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 60,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  
  // Sections
  section: {
    marginBottom: 30,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionIcon: {
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  subsectionTitle: {
    fontSize: 14,
    marginTop: 20,
    marginBottom: 12,
  },
  
  // Setting Row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  settingInfo: {
    flex: 1,
    marginRight: 15,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
  },
  
  // Reminders — per-game checklist
  gameChecklistCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  gameChecklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  gameChecklistLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  checklistBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Link Row (for What's New and Contact)
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  linkInfo: {
    flex: 1,
    marginRight: 15,
  },
  linkLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  linkDescription: {
    fontSize: 13,
  },
  
  // Background Grid
  backgroundGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  backgroundGridDisabled: {
    opacity: 0.5,
  },
  backgroundOption: {
    alignItems: 'center',
    width: '30%',
    position: 'relative',
  },
  backgroundOptionSelected: {
    // Handled by checkmark
  },
  backgroundPreview: {
    width: 70,
    height: 70,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.1)',
    marginBottom: 6,
  },
  backgroundPreviewDisabled: {
    opacity: 0.5,
  },
  backgroundPreviewImage: {
    borderRadius: 12,
  },
  backgroundName: {
    fontSize: 12,
    textAlign: 'center',
  },
  textDisabled: {
    opacity: 0.5,
  },
  checkmark: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  
  // About Card
  aboutCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  appName: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  versionText: {
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    width: '100%',
    marginVertical: 15,
  },
  aboutDescription: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  
  // What's New Screen
  releaseCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 15,
  },
  releaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  releaseVersion: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  releaseDate: {
    fontSize: 14,
  },
  changesList: {
    gap: 8,
  },
  changeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  changeBullet: {
    fontSize: 14,
    marginRight: 10,
    marginTop: 1,
  },
  changeText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
});

export default SettingsScreen;
