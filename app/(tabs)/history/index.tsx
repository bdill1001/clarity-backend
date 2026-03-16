import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, Filter } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { FilterType, AnalyzedTrack } from '@/types';
import TrackCard from '@/components/TrackCard';
import { getLabelColor } from '@/utils/analysis';

const FILTERS: { key: FilterType; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: Colors.text },
  { key: 'ai', label: 'Likely AI', color: Colors.ai },
  { key: 'unsure', label: 'Unsure', color: Colors.uncertain },
  { key: 'human', label: 'Human', color: Colors.human },
];

export default function HistoryScreen() {
  const { history } = useApp();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [selectedTrack, setSelectedTrack] = useState<AnalyzedTrack | null>(null);

  const filteredHistory = useMemo(() => {
    if (activeFilter === 'all') return history;
    return history.filter((item) => {
      switch (activeFilter) {
        case 'ai':
          return item.analysis.label === 'Likely AI';
        case 'unsure':
          // Support both new "Unsure" and legacy "Uncertain" results
          return (item.analysis.label as string) === 'Unsure' || (item.analysis.label as string) === 'Uncertain';
        case 'human':
          return item.analysis.label === 'Likely Human';
        default:
          return true;
      }
    });
  }, [history, activeFilter]);

  const renderItem = useCallback(({ item }: { item: AnalyzedTrack }) => {
    return <TrackCard item={item} onPress={() => setSelectedTrack(item)} />;
  }, []);

  const keyExtractor = useCallback((item: AnalyzedTrack) => item.track.id + item.analysis.analyzedAt, []);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Clock size={20} color={Colors.accent} />
            <Text style={styles.title}>History</Text>
          </View>
          <Text style={styles.subtitle}>
            {history.length} track{history.length !== 1 ? 's' : ''} analyzed
          </Text>
        </View>

        <View style={styles.filterRow}>
          <Filter size={14} color={Colors.textTertiary} />
          {FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.filterChip,
                activeFilter === filter.key && {
                  backgroundColor: filter.color + '18',
                  borderColor: filter.color + '40',
                },
              ]}
              onPress={() => setActiveFilter(filter.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterText,
                  activeFilter === filter.key && { color: filter.color },
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          data={filteredHistory}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Clock size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyTitle}>No tracks yet</Text>
              <Text style={styles.emptyText}>
                {activeFilter === 'all'
                  ? 'Analyzed tracks will appear here. Start playing music on Spotify!'
                  : `No ${activeFilter === 'ai' ? 'AI-detected' : activeFilter === 'human' ? 'human-detected' : 'unsure'} tracks found.`}
              </Text>
            </View>
          }
        />
      </SafeAreaView>

      {/* Forensic Detail Modal */}
      {selectedTrack && (
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Forensic Profile</Text>
              <TouchableOpacity
                onPress={() => setSelectedTrack(null)}
                style={styles.closeButton}
                activeOpacity={0.7}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView contentContainerStyle={styles.modalScroll}>
              <View style={styles.trackSummary}>
                <Text style={styles.trackName}>{selectedTrack.track.name}</Text>
                <Text style={styles.artistName}>{selectedTrack.track.artist}</Text>
                <View style={[styles.labelBadge, { backgroundColor: getLabelColor(selectedTrack.analysis.label) + '20' }]}>
                  <Text style={[styles.labelText, { color: getLabelColor(selectedTrack.analysis.label) }]}>
                    {selectedTrack.analysis.label}
                  </Text>
                </View>
              </View>

              <View style={styles.forensicContent}>
                <View style={styles.percentageRow}>
                  <Text style={styles.percentageLabel}>Confidence Score</Text>
                  <Text style={[styles.percentageValue, { color: getLabelColor(selectedTrack.analysis.label) }]}>
                    {selectedTrack.analysis.aiLikelihood}%
                  </Text>
                </View>
                
                {selectedTrack.analysis.reasons.length > 0 && (
                  <View style={styles.reasonsSection}>
                    <Text style={styles.forensicSectionTitle}>Forensic Signals</Text>
                    {selectedTrack.analysis.reasons.map((reason, index) => (
                      <View key={index} style={styles.reasonCard}>
                        <View style={[styles.reasonDot, { backgroundColor: getLabelColor(selectedTrack.analysis.label) }]} />
                        <Text style={styles.reasonText}>{reason}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      )}
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginLeft: 30,
  },
  filterRow: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.text,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
    marginTop: 8,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 1000,
  },
  modalContainer: {
    flex: 1,
    marginTop: 60,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
    borderRadius: 8,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.accent,
  },
  modalScroll: {
    padding: 24,
  },
  trackSummary: {
    alignItems: 'center',
    marginBottom: 32,
  },
  trackName: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.text,
    textAlign: 'center' as const,
  },
  artistName: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  labelBadge: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  labelText: {
    fontSize: 12,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
  },
  forensicContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  percentageRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  percentageLabel: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  percentageValue: {
    fontSize: 28,
    fontWeight: '700' as const,
  },
  reasonsSection: {},
  forensicSectionTitle: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 12,
  },
  reasonCard: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  reasonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    marginRight: 10,
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
