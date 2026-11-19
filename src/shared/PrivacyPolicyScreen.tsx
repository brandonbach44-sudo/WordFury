import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from './ThemeContext';

const SUPPORT_EMAIL = 'bbach35@icloud.com';

type Section = {
  heading: string;
  body?: string;
  bullets?: string[];
};

const SECTIONS: Section[] = [
  {
    heading: 'Summary',
    body: 'Word Fury is a word game app. It works entirely on your device. We do not collect, store, transmit, or sell any personal data, and we do not use analytics, advertising, or tracking software of any kind. There is no account to create, and no data leaves your phone unless you choose to send it yourself: feedback you send us (see "Feedback" below), or scores you post to Game Center leaderboards (see "Leaderboards" below).',
  },
  {
    heading: 'What the app stores, and where',
    body: 'Word Fury saves your game progress, statistics, achievements, and settings (like Dark Mode or Color Blind Mode) directly on your device using standard iOS local storage. This information:',
    bullets: [
      'Never leaves your device',
      'Is not visible to us or to any third party',
      'Is deleted automatically if you delete the app',
    ],
  },
  {
    heading: "What we don't do",
    bullets: [
      'No Word Fury account, sign-in, or login (Game Center sign-in belongs to Apple and is optional)',
      'No analytics or usage tracking',
      'No advertising or ad networks',
      'No third-party SDKs that collect data (Game Center, used for the optional leaderboards, is part of iOS)',
      'No cookies',
      'No location data',
      'No access to contacts, photos, camera, or microphone',
      'No selling or sharing of data, because none is collected',
    ],
  },
  {
    heading: 'Feedback',
    body: 'If you use the in-app "Send Feedback" option, the rating, category, and message you write are sent directly to us through a form service (Formspree) so we can read and respond to it. No other data leaves your device as part of this: no device identifiers, no diagnostics, no location. We use this information solely to read and respond to your feedback, and we don\'t share it with anyone else.',
  },
  {
    heading: 'Leaderboards',
    body: "Word Fury's leaderboards use Apple Game Center. If you're signed in to Game Center, your daily results and weekly Fury points are sent to Apple, and other players can see them next to your Game Center nickname. If you allow it, Word Fury also shows where your Game Center friends place. Word Fury doesn't store your scores or nickname on servers of its own; Apple handles them under Apple's privacy policy. If you're not signed in to Game Center, nothing is sent and every game works the same.",
  },
  {
    heading: "Children's privacy",
    body: 'Word Fury does not knowingly collect any information from anyone, including children under 13, because it does not collect information from anyone at all.',
  },
  {
    heading: 'Changes to this policy',
    body: 'If this policy ever changes (for example, if a future update adds an optional feature that involves data), we\'ll update this page and change the "Last updated" date above before that feature ships.',
  },
];

export const PrivacyPolicyScreen: React.FC = () => {
  const { background } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background.backgroundColor }]}>
      <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: background.secondaryText }]}>
            ← Back
          </Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: background.textColor }]}>Privacy Policy</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.updated, { color: background.secondaryText }]}>
          Last updated: November 18, 2026
        </Text>

        <View style={styles.pill}>
          <Text style={styles.pillText}>We collect nothing. Full stop.</Text>
        </View>

        {SECTIONS.map((section) => (
          <View
            key={section.heading}
            style={[styles.card, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}
          >
            <Text style={[styles.cardHeading, { color: background.textColor }]}>
              {section.heading}
            </Text>
            {section.body && (
              <Text style={[styles.cardBody, { color: background.secondaryText }]}>
                {section.body}
              </Text>
            )}
            {section.bullets && (
              <View style={styles.bulletList}>
                {section.bullets.map((bullet) => (
                  <View key={bullet} style={styles.bulletRow}>
                    <Text style={[styles.bulletDot, { color: background.secondaryText }]}>•</Text>
                    <Text style={[styles.bulletText, { color: background.secondaryText }]}>
                      {bullet}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <View style={[styles.card, { backgroundColor: background.cardColor, borderColor: background.borderColor }]}>
          <Text style={[styles.cardHeading, { color: background.textColor }]}>
            Support / Contact
          </Text>
          <Text style={[styles.cardBody, { color: background.secondaryText }]}>
            Questions, bug reports, or feature requests? Email us at{' '}
            <Text
              style={[styles.link, { color: background.textColor }]}
              onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            >
              {SUPPORT_EMAIL}
            </Text>
            {' '}and we'll get back to you.
          </Text>
        </View>

        <Text style={[styles.footer, { color: background.secondaryText }]}>
          Word Fury · Developed by Brandon Bach
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  updated: {
    fontSize: 13,
    marginBottom: 12,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEEDFE',
    borderWidth: 1,
    borderColor: '#AFA9EC',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 20,
  },
  pillText: {
    color: '#7F77DD',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  link: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  bulletList: {
    gap: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bulletDot: {
    fontSize: 14,
    marginRight: 10,
    marginTop: 1,
  },
  bulletText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  footer: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },
});

export default PrivacyPolicyScreen;
