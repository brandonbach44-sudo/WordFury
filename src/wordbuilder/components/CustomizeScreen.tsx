import React, { useState, useEffect, useCallback } from 'react';
import { Lock } from 'lucide-react-native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  RefreshControl,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameTile } from './GameTile';
import { TierName, TIERS, TIER_ORDER } from '../utils/tiers';
import {
  PlayerStats,
  PlayerTiles,
  loadStats,
  loadTiles,
  equipTile,
} from '../utils/storage';
import VariantGrid from '../../shared/VariantGrid';

// 50 tile + 10 padding and 2 border on each side (styles.variantCard).
const VARIANT_CARD_WIDTH = 74;

interface CustomizeScreenProps {
  onBack: () => void;
  embedded?: boolean;
  onTileChange?: () => void;
  onPopupChange?: (open: boolean) => void;
  appBg?: string;
}

export const CustomizeScreen: React.FC<CustomizeScreenProps> = ({ onBack, embedded = false, onTileChange, onPopupChange, appBg = '#f5f0e6' }) => {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [tiles, setTiles] = useState<PlayerTiles | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTier, setSelectedTier] = useState<TierName | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<number>(1);

  const loadData = async () => {
    const [loadedStats, loadedTiles] = await Promise.all([
      loadStats(),
      loadTiles(),
    ]);
    setStats(loadedStats);
    setTiles(loadedTiles);
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  const handleEquip = async (tier: TierName, variant: number) => {
    const success = await equipTile(tier, variant);
    if (success) {
      await loadData();
      // Notify parent component that tiles changed
      if (onTileChange) {
        onTileChange();
      }
    }
  };

  const getTierStatus = (tierName: TierName) => {
    if (!tiles || !stats) return { unlocked: false, highestVariant: 0 };
    
    if (tierName === 'default' || tierName === 'classic') {
      return { unlocked: true, highestVariant: tierName === 'classic' ? 6 : 1 };
    }
    
    const progress = tiles.tierProgress[tierName];
    const tier = TIERS[tierName];
    
    return {
      unlocked: stats.totalScore >= tier.baseThreshold,
      highestVariant: Math.min(progress?.highestVariantUnlocked ?? 0, 2),
    };
  };

  const isEquipped = (tierName: TierName, variant?: number) => {
    if (!tiles) return false;
    if (variant !== undefined) {
      return tiles.equippedTier === tierName && tiles.equippedVariant === variant;
    }
    return tiles.equippedTier === tierName;
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(0) + 'K';
    }
    return num.toString();
  };

  const openTierPreview = (tierName: TierName) => {
    const status = getTierStatus(tierName);
    if (status.unlocked) {
      setSelectedTier(tierName);
      if (tiles && tiles.equippedTier === tierName) {
        setSelectedVariant(tiles.equippedVariant);
      } else {
        setSelectedVariant(1);
      }
      onPopupChange?.(true);
    }
  };

  const closeTierPreview = () => {
    setSelectedTier(null);
    onPopupChange?.(false);
  };

  const renderTierCard = (tierName: TierName) => {
    const tier = TIERS[tierName];
    const status = getTierStatus(tierName);
    const equipped = isEquipped(tierName);
    const isDefault = tierName === 'default';
    
    const progressPercent = stats ? Math.min((stats.totalScore / tier.baseThreshold) * 100, 100) : 0;
    
    return (
      <TouchableOpacity
        key={tierName}
        style={[
          styles.tierCard,
          equipped && styles.tierCardEquipped,
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
        {/* Left side - Tile Preview */}
        <Pressable 
          style={styles.tierPreview}
          onPress={() => openTierPreview(tierName)}
          disabled={!status.unlocked}
        >
          <View style={!status.unlocked ? styles.tileLockedOverlay : undefined}>
            <GameTile
              letter="A"
              index={0}
              isSelected={false}
              selectionOrder={null}
              onPress={() => openTierPreview(tierName)}
              tileSize={60}
              tierName={tierName}
              variant={isEquipped(tierName) && tiles ? tiles.equippedVariant : (status.highestVariant || 1)}
              appBg={appBg}
            />
          </View>
        </Pressable>

        {/* Middle - Tier Name and Status */}
        <View style={styles.tierInfo}>
          <Text style={[styles.tierName, !status.unlocked && styles.tierNameLocked]}>
            {tier.displayName}
          </Text>
          
          <Text style={[
            styles.tierStatus, 
            status.unlocked ? styles.tierStatusUnlocked : styles.tierStatusLocked
          ]}>
            {status.unlocked ? 'Unlocked' : 'Locked'}
          </Text>
          
          {equipped && (
            <View style={styles.equippedBadge}>
              <Text style={styles.equippedText}>Equipped</Text>
            </View>
          )}
        </View>

        {/* Right side - Progress bar (only for locked tiers) */}
        {!status.unlocked && stats && !isDefault && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${progressPercent}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>
              {formatNumber(stats.totalScore)} / {formatNumber(tier.baseThreshold)}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderVariantSelector = () => {
    if (!selectedTier || !tiles) return null;
    
    const tier = TIERS[selectedTier];
    const status = getTierStatus(selectedTier);
    const isDefault = selectedTier === 'default';
    const isClassic = selectedTier === 'classic';
    // Default is now a fixed cream look (no variants); Classic has 6 color
    // styles (White was removed); every other tier is V1/V2.
    const maxVariant = isDefault ? 1 : isClassic ? 6 : 2;
    
    // V2 progress data
    const v2Progress = tiles.tierProgress[selectedTier]?.scoreWithTier ?? 0;
    const v2Required = tier.v2ScoreThreshold;
    const v2ProgressPercent = Math.min((v2Progress / v2Required) * 100, 100);
    const v2Unlocked = status.highestVariant >= 2;
    
    return (
      <View style={styles.overlayContainer}>
        <Pressable style={styles.overlayBackdrop} onPress={closeTierPreview} />
        <View style={styles.variantSelector}>
          {/* Header with close button */}
          <View style={styles.variantHeader}>
            <Text style={styles.variantTitle}>
              {tier.displayName}
            </Text>
            <TouchableOpacity onPress={closeTierPreview} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          {/* Main content area */}
          <View style={styles.variantContent}>
            {/* Left side - Large preview */}
            <View style={styles.previewSection}>
              <GameTile
                letter="A"
                index={0}
                isSelected={false}
                selectionOrder={null}
                onPress={() => {}}
                tileSize={80}
                tierName={selectedTier}
                variant={selectedVariant}
              />
            </View>
            
            {/* Right side - V2 Progress (non-default/classic tiers only) */}
            {!isDefault && !isClassic && (
              <View style={styles.v2ProgressSection}>
                {v2Unlocked ? (
                  <Text style={styles.v2UnlockedText}>V2 Unlocked!</Text>
                ) : (
                  <>
                    <Text style={styles.v2ProgressLabel}>V2 Progress</Text>
                    <Text style={styles.v2ProgressSubtext}>
                      Score while equipped
                    </Text>
                    <View style={styles.v2ProgressBar}>
                      <View 
                        style={[
                          styles.v2ProgressFill, 
                          { width: `${v2ProgressPercent}%` }
                        ]} 
                      />
                    </View>
                    <Text style={styles.v2ProgressText}>
                      {formatNumber(v2Progress)} / {formatNumber(v2Required)}
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>
          
          {/* Variant selection */}
          <Text style={styles.selectLabel}>
            Select {isDefault ? 'Style' : 'Variant'}
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
                    isSelected && styles.variantCardSelected,
                    !isUnlocked && styles.variantCardLocked,
                    isCurrentlyEquipped && styles.variantCardEquipped,
                  ]}
                  onPress={() => {
                    if (isUnlocked) {
                      setSelectedVariant(variant);
                    }
                  }}
                  disabled={!isUnlocked}
                >
                  <GameTile
                    letter="A"
                    index={0}
                    isSelected={false}
                    selectionOrder={null}
                    onPress={() => {
                      if (isUnlocked) {
                        setSelectedVariant(variant);
                      }
                    }}
                    tileSize={50}
                    tierName={selectedTier}
                    variant={variant}
                    appBg={appBg}
                  />
                  <Text style={[styles.variantLabel, !isUnlocked && styles.variantLabelLocked]}>
                    {isDefault ? `Style ${variant}` : `V${variant}`}
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

          {/* Equip button */}
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

  const content = (
    <>
      {/* ── BIG LIVE PREVIEW TILE ── */}
      {tiles && (
        <View style={styles.bigPreviewContainer}>
          <GameTile
            letter="A"
            index={0}
            isSelected={false}
            selectionOrder={null}
            onPress={() => {}}
            tileSize={80}
            tierName={tiles.equippedTier}
            variant={tiles.equippedVariant}
            appBg={appBg}
          />
          <Text style={styles.bigPreviewLabel}>
            {TIERS[tiles.equippedTier]?.displayName ?? 'Default'}
            {(tiles.equippedTier === 'classic') ? ` · Style ${tiles.equippedVariant}` : tiles.equippedTier !== 'default' ? ` · V${tiles.equippedVariant}` : ''}
          </Text>
        </View>
      )}

      {stats && (
        <View style={styles.scoreContainer}>
          <Text style={styles.scoreLabel}>Lifetime Score</Text>
          <Text style={styles.scoreValue}>{stats.totalScore.toLocaleString()}</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4ecca3" />
        }
      >
        <Text style={styles.sectionTitle}>
          Unlock tiles by earning lifetime score
        </Text>
        
        {TIER_ORDER.map(renderTierCard)}
        
        <View style={styles.bottomPadding} />
      </ScrollView>

      {renderVariantSelector()}
    </>
  );

  if (embedded) {
    return <View style={styles.embeddedContainer}>{content}</View>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Career Tiles</Text>
        <View style={styles.placeholder} />
      </View>

      {content}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f0e6',
  },
  embeddedContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    zIndex: 10,
  },
  backButton: {
    padding: 5,
  },
  backButtonText: {
    color: '#6b5c4a',
    fontSize: 16,
  },
  title: {
    color: '#2c2416',
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 60,
  },
  bigPreviewContainer: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
    marginBottom: 4,
  },
  bigPreviewLabel: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#6b5c4a',
  },
  scoreContainer: {
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
    marginHorizontal: 20,
    marginBottom: 10,
  },
  scoreLabel: {
    color: '#6b5c4a',
    fontSize: 14,
  },
  scoreValue: {
    color: '#4ecca3',
    fontSize: 28,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sectionTitle: {
    color: '#6b5c4a',
    fontSize: 14,
    marginBottom: 15,
    textAlign: 'center',
  },
  
  // Tier Card (main list)
  tierCard: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e8e0d0',
  },
  tierCardEquipped: {
    borderColor: '#4ecca3',
  },
  tierPreview: {
    marginRight: 15,
  },
  tileLockedOverlay: {
    opacity: 0.5,
  },
  tierInfo: {
    flex: 1,
  },
  tierName: {
    color: '#2c2416',
    fontSize: 18,
    fontWeight: 'bold',
  },
  tierNameLocked: {
    color: '#999',
  },
  tierStatus: {
    fontSize: 13,
    marginTop: 4,
  },
  tierStatusUnlocked: {
    color: '#4ecca3',
  },
  tierStatusLocked: {
    color: '#999',
  },
  equippedBadge: {
    backgroundColor: '#4ecca3',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  equippedText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  
  // Progress bar (right side of locked tiers)
  progressContainer: {
    width: 100,
    alignItems: 'flex-end',
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4ecca3',
    borderRadius: 3,
  },
  progressText: {
    color: '#999',
    fontSize: 10,
    marginTop: 4,
  },
  
  // Overlay
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'flex-end',
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  
  // Variant Selector (preview overlay)
  variantSelector: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  variantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  variantTitle: {
    color: '#2c2416',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f5f0e6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#6b5c4a',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Main content (preview + V2 progress)
  variantContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  previewSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 20,
  },
  v2ProgressSection: {
    flex: 1,
  },
  v2ProgressLabel: {
    color: '#2c2416',
    fontSize: 14,
    fontWeight: '600',
  },
  v2ProgressSubtext: {
    color: '#6b5c4a',
    fontSize: 11,
    marginBottom: 8,
  },
  v2ProgressBar: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  v2ProgressFill: {
    height: '100%',
    backgroundColor: '#4ecca3',
    borderRadius: 4,
  },
  v2ProgressText: {
    color: '#6b5c4a',
    fontSize: 12,
    marginTop: 6,
  },
  v2UnlockedText: {
    color: '#4ecca3',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Select label
  selectLabel: {
    color: '#6b5c4a',
    fontSize: 14,
    marginBottom: 12,
  },
  
  // Variant cards
  variantList: {
    paddingBottom: 5,
  },
  variantCard: {
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#f5f0e6',
    position: 'relative',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  variantCardSelected: {
    borderColor: '#2c2416',
  },
  variantCardLocked: {
    opacity: 0.5,
  },
  variantCardEquipped: {
    backgroundColor: 'rgba(78, 204, 163, 0.2)',
  },
  variantLabel: {
    color: '#2c2416',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
  variantLabelLocked: {
    color: '#999',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockIcon: {
    fontSize: 20,
  },
  equippedCheckmark: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: '#4ecca3',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  // Equip button
  equipButton: {
    backgroundColor: '#4ecca3',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 15,
  },
  equipButtonDisabled: {
    backgroundColor: '#ccc',
  },
  equipButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  bottomPadding: {
    height: 50,
  },
});
