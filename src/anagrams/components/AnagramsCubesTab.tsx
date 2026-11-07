// src/anagrams/components/AnagramsCubesTab.tsx
// Anagrams' cube/tile customization panel — same mechanic as Word Builder's
// Career Tiles (unlock a skin at a lifetime-score threshold, then unlock a
// glowing V2 by scoring more while it's equipped), but keyed off **Daily
// Anagrams-only** lifetime score. See anagramsTiers.ts for why the
// thresholds are much smaller than Word Builder's.

import React, { useCallback, useEffect, useState } from 'react';
import { Lock } from 'lucide-react-native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { GameTile } from '../../shared/GameTile';
import { TierName } from '../../shared/tileTiers';
import { ANAGRAMS_TIER_ORDER, ANAGRAMS_TIERS, DEBUG_UNLOCK_ALL_ANAGRAMS_TILES } from '../utils/anagramsTiers';
import {
  AnagramsPlayerTiles,
  loadAnagramsStats,
  loadAnagramsTiles,
  equipAnagramsTile,
} from '../utils/anagramsStorage';
import { useTheme } from '../../shared/ThemeContext';
import VariantGrid from '../../shared/VariantGrid';

// 48 tile + 10 padding and 2 border on each side (styles.variantCard).
const VARIANT_CARD_WIDTH = 72;

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
  return num.toString();
}

export const AnagramsCubesTab: React.FC = () => {
  const { background } = useTheme();
  const [dailyLifetimeScore, setDailyLifetimeScore] = useState(0);
  const [tiles, setTiles] = useState<AnagramsPlayerTiles | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTier, setSelectedTier] = useState<TierName | null>(null);
  const [selectedVariant, setSelectedVariant] = useState(1);

  const loadData = useCallback(async () => {
    const [stats, loadedTiles] = await Promise.all([loadAnagramsStats(), loadAnagramsTiles()]);
    setDailyLifetimeScore(stats.daily.totalScore);
    setTiles(loadedTiles);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const handleEquip = async (tier: TierName, variant: number) => {
    const success = await equipAnagramsTile(tier, variant, dailyLifetimeScore);
    if (success) await loadData();
  };

  const getTierStatus = (tierName: TierName) => {
    // Match Word Builder's check ordering exactly: bail out on missing data
    // first, before special-casing the free tiers, so there's no first-mount
    // flicker where default/classic briefly read as unlocked ahead of tiles
    // actually loading.
    if (!tiles) return { unlocked: false, highestVariant: 0 };
    if (tierName === 'default' || tierName === 'classic') {
      return { unlocked: true, highestVariant: tierName === 'classic' ? 6 : 1 };
    }
    if (DEBUG_UNLOCK_ALL_ANAGRAMS_TILES) return { unlocked: true, highestVariant: 2 };

    const progress = tiles.tierProgress[tierName];
    const tier = ANAGRAMS_TIERS[tierName];
    return {
      unlocked: tier ? dailyLifetimeScore >= tier.baseThreshold : false,
      highestVariant: Math.min(progress?.highestVariantUnlocked ?? 0, 2),
    };
  };

  const isEquipped = (tierName: TierName, variant?: number) => {
    if (!tiles) return false;
    if (variant !== undefined) return tiles.equippedTier === tierName && tiles.equippedVariant === variant;
    return tiles.equippedTier === tierName;
  };

  const openTierPreview = (tierName: TierName) => {
    const status = getTierStatus(tierName);
    if (!status.unlocked) return;
    setSelectedTier(tierName);
    setSelectedVariant(tiles && tiles.equippedTier === tierName ? tiles.equippedVariant : 1);
  };

  const closeTierPreview = () => setSelectedTier(null);

  const renderTierCard = (tierName: TierName) => {
    const tier = ANAGRAMS_TIERS[tierName];
    const status = getTierStatus(tierName);
    const equipped = isEquipped(tierName);
    const isFree = tierName === 'default' || tierName === 'classic';
    const progressPercent = tier ? Math.min((dailyLifetimeScore / tier.baseThreshold) * 100, 100) : 0;

    return (
      <TouchableOpacity
        key={tierName}
        style={[
          styles.tierCard,
          { backgroundColor: background.cardColor, borderColor: equipped ? '#22c55e' : background.borderColor },
        ]}
        onPress={async () => {
          if (!status.unlocked) return;
          if (tierName === 'default') {
            await handleEquip('default', 1);
            return;
          }
          openTierPreview(tierName);
        }}
        disabled={!status.unlocked}
        activeOpacity={0.7}
      >
        <Pressable style={styles.tierPreview} onPress={() => openTierPreview(tierName)} disabled={!status.unlocked}>
          <View style={!status.unlocked ? styles.tileLockedOverlay : undefined}>
            <GameTile
              letter="A"
              index={0}
              isSelected={false}
              selectionOrder={null}
              onPress={() => openTierPreview(tierName)}
              tileSize={56}
              tierName={tierName}
              variant={isEquipped(tierName) && tiles ? tiles.equippedVariant : status.highestVariant || 1}
              appBg={background.backgroundColor}
            />
          </View>
        </Pressable>

        <View style={styles.tierInfo}>
          <Text style={[styles.tierName, { color: status.unlocked ? background.textColor : background.secondaryText }]}>
            {tier?.displayName ?? (tierName === 'default' ? 'Default' : 'Classic')}
          </Text>
          <Text style={[styles.tierStatus, { color: status.unlocked ? '#22c55e' : background.secondaryText }]}>
            {status.unlocked ? 'Unlocked' : 'Locked'}
          </Text>
          {equipped && (
            <View style={styles.equippedBadge}>
              <Text style={styles.equippedText}>Equipped</Text>
            </View>
          )}
        </View>

        {!status.unlocked && !isFree && tier && (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: background.borderColor }]}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={[styles.progressText, { color: background.secondaryText }]}>
              {formatNumber(dailyLifetimeScore)} / {formatNumber(tier.baseThreshold)}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderVariantSelector = () => {
    if (!selectedTier || !tiles) return null;
    const tier = ANAGRAMS_TIERS[selectedTier];
    const status = getTierStatus(selectedTier);
    const isFree = selectedTier === 'default' || selectedTier === 'classic';
    // Default is now a fixed cream look (no variants); Classic has 6 color
    // styles (White was removed); every other tier is V1/V2.
    const maxVariant = selectedTier === 'default' ? 1 : selectedTier === 'classic' ? 6 : 2;

    const v2Progress = tiles.tierProgress[selectedTier]?.scoreWithTier ?? 0;
    const v2Required = tier?.v2ScoreThreshold ?? 0;
    const v2ProgressPercent = v2Required > 0 ? Math.min((v2Progress / v2Required) * 100, 100) : 0;
    const v2Unlocked = status.highestVariant >= 2;

    return (
      <View style={styles.overlayContainer}>
        <Pressable style={styles.overlayBackdrop} onPress={closeTierPreview} />
        <View style={[styles.variantSelector, { backgroundColor: background.cardColor }]}>
          <View style={styles.variantHeader}>
            <Text style={[styles.variantTitle, { color: background.textColor }]}>
              {tier?.displayName ?? 'Classic'}
            </Text>
            <TouchableOpacity onPress={closeTierPreview} style={[styles.closeButton, { backgroundColor: background.backgroundColor }]}>
              <Text style={[styles.closeButtonText, { color: background.secondaryText }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.variantContent, { borderBottomColor: background.borderColor }]}>
            <View style={styles.previewSection}>
              <GameTile
                letter="A"
                index={0}
                isSelected={false}
                selectionOrder={null}
                onPress={() => {}}
                tileSize={72}
                tierName={selectedTier}
                variant={selectedVariant}
                appBg={background.backgroundColor}
              />
            </View>

            {!isFree && (
              <View style={styles.v2ProgressSection}>
                {v2Unlocked ? (
                  <Text style={styles.v2UnlockedText}>V2 Unlocked!</Text>
                ) : (
                  <>
                    <Text style={[styles.v2ProgressLabel, { color: background.textColor }]}>V2 Progress</Text>
                    <Text style={[styles.v2ProgressSubtext, { color: background.secondaryText }]}>
                      Daily score earned while equipped
                    </Text>
                    <View style={[styles.v2ProgressBar, { backgroundColor: background.borderColor }]}>
                      <View style={[styles.v2ProgressFill, { width: `${v2ProgressPercent}%` }]} />
                    </View>
                    <Text style={[styles.v2ProgressText, { color: background.secondaryText }]}>
                      {formatNumber(v2Progress)} / {formatNumber(v2Required)}
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>

          <Text style={[styles.selectLabel, { color: background.secondaryText }]}>
            Select {isFree ? 'Style' : 'Variant'}
          </Text>

          <VariantGrid itemWidth={VARIANT_CARD_WIDTH} itemCount={maxVariant} style={styles.variantList}>
            {Array.from({ length: maxVariant }, (_, i) => i + 1).map((variant) => {
              const isUnlocked = variant <= status.highestVariant;
              const isSelected = selectedVariant === variant;
              const isCurrentlyEquipped = isEquipped(selectedTier, variant);
              return (
                <TouchableOpacity
                  key={variant}
                  style={[
                    styles.variantCard,
                    { backgroundColor: background.backgroundColor, borderColor: 'transparent' },
                    isSelected && { borderColor: background.textColor },
                    !isUnlocked && { opacity: 0.5 },
                    isCurrentlyEquipped && { backgroundColor: 'rgba(34, 197, 94, 0.15)' },
                  ]}
                  onPress={() => isUnlocked && setSelectedVariant(variant)}
                  disabled={!isUnlocked}
                >
                  <GameTile
                    letter="A"
                    index={0}
                    isSelected={false}
                    selectionOrder={null}
                    onPress={() => isUnlocked && setSelectedVariant(variant)}
                    tileSize={48}
                    tierName={selectedTier}
                    variant={variant}
                    appBg={background.backgroundColor}
                  />
                  <Text style={[styles.variantLabel, { color: isUnlocked ? background.textColor : background.secondaryText }]}>
                    {isFree ? `Style ${variant}` : `V${variant}`}
                  </Text>
                  {!isUnlocked && (
                    <View style={styles.lockOverlay}>
                      <Lock size={18} color="#6b7280" />
                    </View>
                  )}
                  {isCurrentlyEquipped && (
                    <View style={styles.equippedCheckmark}>
                      <Text style={styles.checkmark}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </VariantGrid>

          <TouchableOpacity
            style={[
              styles.equipButton,
              isEquipped(selectedTier, selectedVariant) && styles.equipButtonDisabled,
            ]}
            onPress={async () => {
              await handleEquip(selectedTier, selectedVariant);
              closeTierPreview();
            }}
            disabled={isEquipped(selectedTier, selectedVariant)}
          >
            <Text style={styles.equipButtonText}>
              {isEquipped(selectedTier, selectedVariant) ? 'Currently Equipped' : 'Equip'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {tiles && (
        <View style={[styles.bigPreviewContainer, { borderBottomColor: background.borderColor }]}>
          <GameTile
            letter="A"
            index={0}
            isSelected={false}
            selectionOrder={null}
            onPress={() => {}}
            tileSize={72}
            tierName={tiles.equippedTier}
            variant={tiles.equippedVariant}
            appBg={background.backgroundColor}
          />
          <Text style={[styles.bigPreviewLabel, { color: background.secondaryText }]}>
            {ANAGRAMS_TIERS[tiles.equippedTier]?.displayName ?? (tiles.equippedTier === 'classic' ? 'Classic' : 'Default')}
            {tiles.equippedTier === 'default' || tiles.equippedTier === 'classic'
              ? ` · Style ${tiles.equippedVariant}`
              : ` · V${tiles.equippedVariant}`}
          </Text>
        </View>
      )}

      <View style={[styles.scoreContainer, { borderBottomColor: background.borderColor }]}>
        <Text style={[styles.scoreLabel, { color: background.secondaryText }]}>Daily Anagrams Lifetime Score</Text>
        <Text style={styles.scoreValue}>{dailyLifetimeScore.toLocaleString()}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />}
      >
        <Text style={[styles.sectionTitle, { color: background.secondaryText }]}>
          Unlock cubes by playing the Daily
        </Text>
        {ANAGRAMS_TIER_ORDER.map(renderTierCard)}
        <View style={{ height: 50 }} />
      </ScrollView>

      {renderVariantSelector()}
    </View>
  );
};

const styles = StyleSheet.create({
  bigPreviewContainer: { alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
  bigPreviewLabel: { marginTop: 10, fontSize: 14, fontWeight: '600' },
  scoreContainer: { alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, marginBottom: 10 },
  scoreLabel: { fontSize: 12 },
  scoreValue: { color: '#22c55e', fontSize: 24, fontWeight: 'bold' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 6 },
  sectionTitle: { fontSize: 13, marginBottom: 14, textAlign: 'center' },

  tierCard: { flexDirection: 'row', borderRadius: 12, padding: 14, marginBottom: 12, alignItems: 'center', borderWidth: 2 },
  tierPreview: { marginRight: 14 },
  tileLockedOverlay: { opacity: 0.5 },
  tierInfo: { flex: 1 },
  tierName: { fontSize: 17, fontWeight: 'bold' },
  tierStatus: { fontSize: 12, marginTop: 3 },
  equippedBadge: { backgroundColor: '#22c55e', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 5, alignSelf: 'flex-start' },
  equippedText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  progressContainer: { width: 90, alignItems: 'flex-end' },
  progressBar: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#22c55e', borderRadius: 3 },
  progressText: { fontSize: 10, marginTop: 4 },

  overlayContainer: { ...StyleSheet.absoluteFillObject, zIndex: 100, justifyContent: 'flex-end' },
  overlayBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },

  variantSelector: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
  },
  variantHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  variantTitle: { fontSize: 20, fontWeight: 'bold' },
  closeButton: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  closeButtonText: { fontSize: 16, fontWeight: 'bold' },

  variantContent: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1 },
  previewSection: { alignItems: 'center', justifyContent: 'center', marginRight: 20 },
  v2ProgressSection: { flex: 1 },
  v2ProgressLabel: { fontSize: 14, fontWeight: '600' },
  v2ProgressSubtext: { fontSize: 11, marginBottom: 8 },
  v2ProgressBar: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden' },
  v2ProgressFill: { height: '100%', backgroundColor: '#22c55e', borderRadius: 4 },
  v2ProgressText: { fontSize: 12, marginTop: 6 },
  v2UnlockedText: { color: '#22c55e', fontSize: 16, fontWeight: 'bold' },

  selectLabel: { fontSize: 14, marginBottom: 12 },
  variantList: { paddingBottom: 5 },
  variantCard: { alignItems: 'center', padding: 10, borderRadius: 12, position: 'relative', borderWidth: 2 },
  variantLabel: { fontSize: 12, marginTop: 6, fontWeight: '500' },
  lockOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  lockIcon: { fontSize: 20 },
  equippedCheckmark: { position: 'absolute', top: 5, right: 5, backgroundColor: '#22c55e', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  equipButton: { backgroundColor: '#22c55e', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  equipButtonDisabled: { backgroundColor: '#ccc' },
  equipButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
