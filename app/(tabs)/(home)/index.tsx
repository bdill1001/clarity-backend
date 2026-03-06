import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Info,
  Radio,
  Disc3,
  Music,
  WifiOff,
  RefreshCw,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import ScoreRing from '@/components/ScoreRing';
import { getLabelColor } from '@/utils/analysis';

export default function NowPlayingScreen() {
  const router = useRouter();
  const {
    currentTrack,
    currentAnalysis,
    settings,
    submitFeedback,
    getFeedbackForTrack,
    refreshNowPlaying,
    isPolling,
    isAnalyzing,
    spotifyError,
    sessionExpired,
  } = useApp();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshNowPlaying();
    } catch (error) {
      console.error('[NowPlaying] Refresh error:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshNowPlaying]);

  const handleFeedback = useCallback((label: 'HUMAN' | 'AI' | 'UNSURE') => {
    if (!currentTrack) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    submitFeedback(currentTrack.id, label);

    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
  }, [currentTrack, submitFeedback, pulseAnim]);

  const existingFeedback = currentTrack ? getFeedbackForTrack(currentTrack.id) : undefined;
  const scoreColor = currentAnalysis ? getLabelColor(currentAnalysis.label) : Colors.textTertiary;

  if (!settings.spotifyConnected) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Music size={48} color={Colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>Connect Spotify</Text>
            <Text style={styles.emptyText}>
              Connect your Spotify account in Settings to start analyzing tracks.
            </Text>
            <TouchableOpacity
              style={styles.connectButton}
              onPress={() => router.push('/(tabs)/settings' as never)}
              activeOpacity={0.8}
            >
              <Text style={styles.connectButtonText}>Go to Settings</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!currentTrack) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <ScrollView
            contentContainerStyle={styles.emptyScrollContent}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={Colors.accent}
                colors={[Colors.accent]}
              />
            }
          >
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Radio size={16} color={Colors.accent} />
                <Text style={styles.headerLabel}>Now Playing</Text>
              </View>
              {isPolling && (
                <View style={styles.pollingBadge}>
                  <View style={styles.pollingDot} />
                  <Text style={styles.pollingText}>Listening</Text>
                </View>
              )}
            </View>

            <View style={styles.emptyContainer}>
              {spotifyError ? (
                <>
                  <View style={styles.emptyIconWrap}>
                    <WifiOff size={48} color={sessionExpired ? Colors.warning : Colors.danger} />
                  </View>
                  <Text style={styles.emptyTitle}>{sessionExpired ? 'Session Expired' : 'Connection Issue'}</Text>
                  <Text style={styles.emptyText}>{spotifyError}</Text>
                  {sessionExpired && (
                    <TouchableOpacity
                      style={styles.connectButton}
                      onPress={() => router.push('/(tabs)/settings' as never)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.connectButtonText}>Reconnect Spotify</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.emptyIconWrap}>
                    <Music size={48} color={Colors.textTertiary} />
                  </View>
                  <Text style={styles.emptyTitle}>Nothing Playing</Text>
                  <Text style={styles.emptyText}>
                    Open Spotify and start playing a track. Clarity will analyze it automatically.
                  </Text>
                </>
              )}
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={handleRefresh}
                activeOpacity={0.7}
              >
                <RefreshCw size={16} color={Colors.accent} />
                <Text style={styles.refreshButtonText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[scoreColor + '12', Colors.background, Colors.background]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.accent}
              colors={[Colors.accent]}
            />
          }
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Radio size={16} color={Colors.accent} />
              <Text style={styles.headerLabel}>Now Playing</Text>
            </View>
            {isPolling && (
              <View style={styles.pollingBadge}>
                <View style={styles.pollingDot} />
                <Text style={styles.pollingText}>Live</Text>
              </View>
            )}
          </View>

          <Animated.View style={[styles.artworkSection, { opacity: fadeIn }]}>
            <View style={styles.artworkContainer}>
              {currentTrack.albumArt ? (
                <Image
                  source={{ uri: currentTrack.albumArt }}
                  style={styles.artwork}
                  contentFit="cover"
                  transition={300}
                />
              ) : (
                <View style={[styles.artwork, styles.artworkPlaceholder]}>
                  <Disc3 size={64} color={Colors.textTertiary} />
                </View>
              )}
              <LinearGradient
                colors={['transparent', Colors.background + 'CC']}
                style={styles.artworkOverlay}
              />
            </View>
            <View style={styles.trackInfo}>
              <Text style={styles.trackName} numberOfLines={2}>{currentTrack.name}</Text>
              <View style={styles.artistRow}>
                <Disc3 size={14} color={Colors.textSecondary} />
                <Text style={styles.artistName}>{currentTrack.artist}</Text>
              </View>
              <Text style={styles.albumName}>{currentTrack.album}</Text>
            </View>
          </Animated.View>

          {isAnalyzing || !currentAnalysis ? (
            <View style={styles.analyzingSection}>
              <ActivityIndicator size="large" color={Colors.accent} />
              <Text style={styles.analyzingText}>Analyzing with AI...</Text>
              <Text style={styles.analyzingSubtext}>Evaluating track metadata</Text>
            </View>
          ) : (
            <>
              <Animated.View style={[styles.scoreSection, { transform: [{ scale: pulseAnim }] }]}>
                <ScoreRing
                  score={currentAnalysis.aiLikelihood}
                  label={currentAnalysis.label}
                  size={190}
                  strokeWidth={10}
                />
              </Animated.View>

              {currentAnalysis.reasons.length > 0 && (
                <View style={styles.reasonsSection}>
                  <Text style={styles.sectionTitle}>Analysis Signals</Text>
                  {currentAnalysis.reasons.map((reason, index) => (
                    <View key={index} style={styles.reasonCard}>
                      <View style={[styles.reasonDot, { backgroundColor: scoreColor }]} />
                      <Text style={styles.reasonText}>{reason}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {currentAnalysis && <View style={styles.feedbackSection}>
            <Text style={styles.sectionTitle}>Disagree with this?</Text>
            <View style={styles.feedbackRow}>
              <TouchableOpacity
                style={[
                  styles.feedbackButton,
                  existingFeedback?.userLabel === 'HUMAN' && styles.feedbackActive,
                  existingFeedback?.userLabel === 'HUMAN' && { borderColor: Colors.human },
                ]}
                onPress={() => handleFeedback('HUMAN')}
                activeOpacity={0.7}
              >
                <ThumbsUp
                  size={18}
                  color={existingFeedback?.userLabel === 'HUMAN' ? Colors.human : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.feedbackLabel,
                    existingFeedback?.userLabel === 'HUMAN' && { color: Colors.human },
                  ]}
                >
                  Human
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.feedbackButton,
                  existingFeedback?.userLabel === 'AI' && styles.feedbackActive,
                  existingFeedback?.userLabel === 'AI' && { borderColor: Colors.ai },
                ]}
                onPress={() => handleFeedback('AI')}
                activeOpacity={0.7}
              >
                <ThumbsDown
                  size={18}
                  color={existingFeedback?.userLabel === 'AI' ? Colors.ai : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.feedbackLabel,
                    existingFeedback?.userLabel === 'AI' && { color: Colors.ai },
                  ]}
                >
                  AI
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.feedbackButton,
                  existingFeedback?.userLabel === 'UNSURE' && styles.feedbackActive,
                  existingFeedback?.userLabel === 'UNSURE' && { borderColor: Colors.uncertain },
                ]}
                onPress={() => handleFeedback('UNSURE')}
                activeOpacity={0.7}
              >
                <HelpCircle
                  size={18}
                  color={existingFeedback?.userLabel === 'UNSURE' ? Colors.uncertain : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.feedbackLabel,
                    existingFeedback?.userLabel === 'UNSURE' && { color: Colors.uncertain },
                  ]}
                >
                  Unsure
                </Text>
              </TouchableOpacity>
            </View>
          </View>}

          <TouchableOpacity
            style={styles.howItWorks}
            onPress={() => router.push('/how-it-works' as never)}
            activeOpacity={0.7}
          >
            <Info size={14} color={Colors.textTertiary} />
            <Text style={styles.howItWorksText}>How this works</Text>
          </TouchableOpacity>

          <View style={styles.disclaimerBox}>
            <Text style={styles.disclaimerText}>
              Clarity provides a likelihood estimate based on metadata, not definitive proof.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safe: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  emptyScrollContent: {
    paddingHorizontal: 20,
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  headerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 8,
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  pollingBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accentGlow,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  pollingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  pollingText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.accent,
  },
  artworkSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  artworkContainer: {
    width: '100%',
    aspectRatio: 1.4,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    marginBottom: 16,
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  artworkPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
  },
  artworkOverlay: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
  },
  trackInfo: {
    alignItems: 'center',
  },
  trackName: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.text,
    textAlign: 'center' as const,
    marginBottom: 6,
  },
  artistRow: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 6,
  },
  artistName: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  albumName: {
    fontSize: 13,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  scoreSection: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  analyzingSection: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  analyzingText: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.accent,
    marginTop: 8,
  },
  analyzingSubtext: {
    fontSize: 13,
    color: Colors.textTertiary,
  },
  reasonsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 12,
  },
  reasonCard: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  reasonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    marginRight: 12,
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  feedbackSection: {
    marginBottom: 24,
  },
  feedbackRow: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  feedbackButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  feedbackActive: {
    backgroundColor: Colors.surfaceLight,
  },
  feedbackLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  howItWorks: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 12,
  },
  howItWorksText: {
    fontSize: 13,
    color: Colors.textTertiary,
    textDecorationLine: 'underline' as const,
  },
  disclaimerBox: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  disclaimerText: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center' as const,
    lineHeight: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 22,
    marginBottom: 24,
  },
  connectButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  connectButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.black,
  },
  refreshButton: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  refreshButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.accent,
  },
});
