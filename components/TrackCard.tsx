import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import Colors from '@/constants/colors';
import { AnalyzedTrack } from '@/types';
import { getLabelColor } from '@/utils/analysis';

interface TrackCardProps {
  item: AnalyzedTrack;
  onPress?: () => void;
}

export default React.memo(function TrackCard({ item, onPress }: TrackCardProps) {
  const { track, analysis } = item;
  const color = getLabelColor(analysis.label);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      testID={`track-card-${track.id}`}
    >
      <Image
        source={{ uri: track.albumArt }}
        style={styles.artwork}
        contentFit="cover"
        transition={200}
      />
      <View style={styles.info}>
        <Text style={styles.trackName} numberOfLines={1}>{track.name}</Text>
        <Text style={styles.artistName} numberOfLines={1}>{track.artist}</Text>
      </View>
      <View style={styles.scoreContainer}>
        <Text style={[styles.score, { color }]}>{analysis.aiLikelihood}%</Text>
        <View style={[styles.labelBadge, { backgroundColor: color + '18' }]}>
          <Text style={[styles.labelText, { color }]}>
            {analysis.label === 'Likely Human' ? 'Human' : analysis.label === 'Likely AI' ? 'AI' : '???'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
  },
  info: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  trackName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  artistName: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  scoreContainer: {
    alignItems: 'flex-end',
  },
  score: {
    fontSize: 18,
    fontWeight: '700' as const,
  },
  labelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 3,
  },
  labelText: {
    fontSize: 10,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
});
