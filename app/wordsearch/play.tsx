// app/wordsearch/play.tsx

import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../src/shared/ThemeContext';
import { WORD_SEARCH_THEMES, type WordSearchThemeId } from '../../src/wordsearch/data/themes';
import { DIFFICULTY_CONFIG, type Difficulty, type DifficultyConfig } from '../../src/wordsearch/utils/difficultyConfig';

type Screen = 'categories' | 'difficulty';

const WordSearchPlayScreen: React.FC = () => {
  const { background } = useTheme();

  const [currentScreen, setCurrentScreen] = useState<Screen>('categories');
  const [selectedCategory, setSelectedCategory] = useState<WordSearchThemeId | null>(null);

  const handleSelectCategory = (themeId: WordSearchThemeId) => {
    setSelectedCategory(themeId);
    setCurrentScreen('difficulty');
  };

  const handleSelectDifficulty = (difficulty: Difficulty) => {
    if (!selectedCategory) return;
    // Puzzle is generated in game.tsx — just pass themeId + difficulty
    router.push({
      pathname: '/wordsearch/game',
      params: { themeId: selectedCategory, difficulty },
    });
  };

  const handleBackToCategories = () => {
    setCurrentScreen('categories');
    setSelectedCategory(null);
  };

  const handleBack = () => {
    if (currentScreen === 'difficulty') {
      handleBackToCategories();
    } else {
      router.back();
    }
  };

  const categoryTheme = selectedCategory
    ? WORD_SEARCH_THEMES.find(t => t.id === selectedCategory)
    : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background.backgroundColor }]}>
      <StatusBar barStyle={background.statusBar === 'light' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={[styles.backText, { color: background.secondaryText }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: background.textColor }]}>
          {currentScreen === 'categories' ? 'Choose Category' : 'Choose Difficulty'}
        </Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {currentScreen === 'categories' ? (
          <View style={styles.categoriesGrid}>
            {WORD_SEARCH_THEMES.map(theme => (
              <TouchableOpacity
                key={theme.id}
                style={[
                  styles.categoryCard,
                  { backgroundColor: background.cardColor, borderColor: background.borderColor },
                ]}
                onPress={() => handleSelectCategory(theme.id)}
              >
                <Text style={[styles.categoryName, { color: background.textColor }]}>
                  {theme.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <>
            <View style={[styles.selectedCard, { backgroundColor: background.cardColor, borderColor: background.accentColor }]}>
              <Text style={[styles.selectedName, { color: background.textColor }]}>
                {categoryTheme?.name}
              </Text>
            </View>

            <Text style={[styles.difficultyTitle, { color: background.textColor }]}>
              Select Difficulty
            </Text>

            <View style={styles.difficultiesContainer}>
              {(Object.entries(DIFFICULTY_CONFIG) as [Difficulty, DifficultyConfig][]).map(
                ([diffKey, config]) => (
                  <TouchableOpacity
                    key={diffKey}
                    style={[
                      styles.difficultyButton,
                      { backgroundColor: background.cardColor, borderColor: background.borderColor },
                    ]}
                    onPress={() => handleSelectDifficulty(diffKey)}
                  >
                    <Text style={[styles.difficultyLabel, { color: background.textColor }]}>
                      {config.label}
                    </Text>
                    <Text style={[styles.boardSize, { color: background.secondaryText }]}>
                      {config.description}
                    </Text>
                    <Text style={[styles.pointsMultiplier, { color: background.accentColor }]}>
                      {config.multiplier}x Points
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backButton: { padding: 8 },
  backText: { fontSize: 16, fontWeight: '500' },
  headerPlaceholder: { width: 60 },
  title: { fontSize: 22, fontWeight: 'bold' },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  categoryCard: {
    width: '48%',
    borderRadius: 15,
    padding: 20,
    marginBottom: 12,
    borderWidth: 2,
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: 80,
  },
  categoryName: { fontSize: 16, fontWeight: 'bold', textAlign: 'left' },
  selectedCard: {
    borderRadius: 15,
    borderWidth: 2,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  selectedName: { fontSize: 20, fontWeight: 'bold' },
  difficultyTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  difficultiesContainer: { gap: 12, width: '100%' },
  difficultyButton: {
    borderRadius: 15,
    borderWidth: 2,
    padding: 20,
  },
  difficultyLabel: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  boardSize: { fontSize: 14, marginBottom: 2 },
  pointsMultiplier: { fontSize: 13, fontWeight: '600' },
});

export default WordSearchPlayScreen;
