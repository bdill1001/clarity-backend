import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, Filter } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { FilterType, AnalyzedTrack } from '@/types';
import TrackCard from '@/components/TrackCard';

const FILTERS: { key: FilterType; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: Colors.text },
  { key: 'ai', label: 'Likely AI', color: Colors.ai },
  { key: 'uncertain', label: 'Uncertain', color: Colors.uncertain },
  { key: 'human', label: 'Human', color: Colors.human },
];

export default function HistoryScreen() {
  const { history } = useApp();
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const filteredHistory = useMemo(() => {
    if (activeFilter === 'all') return history;
    return history.filter((item) => {
      switch (activeFilter) {
        case 'ai':
          return item.analysis.label === 'Likely AI';
        case 'uncertain':
          return item.analysis.label === 'Uncertain';
        case 'human':
          return item.analysis.label === 'Likely Human';
        default:
          return true;
      }
    });
  }, [history, activeFilter]);

  const renderItem = useCallback(({ item }: { item: AnalyzedTrack }) => {
    return <TrackCard item={item} />;
  }, []);

  const keyExtractor = useCallback((item: AnalyzedTrack) => item.track.id, []);

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
                  : `No ${activeFilter === 'ai' ? 'AI-detected' : activeFilter === 'human' ? 'human-detected' : 'uncertain'} tracks found.`}
              </Text>
            </View>
          }
        />
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
});
