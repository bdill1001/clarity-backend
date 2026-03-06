import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Cpu, BarChart3, AlertCircle } from 'lucide-react-native';
import Colors from '@/constants/colors';

export default function HowItWorksScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>How Clarity Works</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.closeButton}
            activeOpacity={0.7}
          >
            <X size={20} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <View style={styles.iconRow}>
              <Cpu size={24} color={Colors.accent} />
              <Text style={styles.sectionTitle}>Metadata Analysis</Text>
            </View>
            <Text style={styles.text}>
              Clarity analyzes publicly available Spotify metadata for each track — including release patterns, artist catalog data, naming conventions, popularity metrics, and label information.
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.iconRow}>
              <BarChart3 size={24} color={Colors.warning} />
              <Text style={styles.sectionTitle}>Heuristic Scoring</Text>
            </View>
            <Text style={styles.text}>
              We use a deterministic scoring system that evaluates multiple signals simultaneously. Each signal contributes to an overall AI-likelihood score from 0 to 100%.
            </Text>
            <View style={styles.signalList}>
              <SignalItem label="Release frequency" description="Unusually high volume of releases" />
              <SignalItem label="Naming patterns" description="Repetitive or templated track/album names" />
              <SignalItem label="Listener metrics" description="Low engagement relative to catalog size" />
              <SignalItem label="Label signals" description="Distribution through known AI pipelines" />
              <SignalItem label="Catalog growth" description="Abnormal growth rate patterns" />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.iconRow}>
              <AlertCircle size={24} color={Colors.ai} />
              <Text style={styles.sectionTitle}>Important Disclaimers</Text>
            </View>
            <Text style={styles.text}>
              Clarity provides a likelihood estimate — not definitive proof. Our analysis is based solely on metadata patterns and cannot detect AI-generated audio directly.
            </Text>
            <Text style={[styles.text, { marginTop: 8 }]}>
              False positives can occur with independent artists, new releases, or niche genres. Your feedback helps us improve accuracy over time.
            </Text>
          </View>

          <View style={styles.disclaimerBox}>
            <Text style={styles.disclaimerText}>
              This tool is for informational purposes only. AI-likelihood scores should not be used as the sole basis for any decision about music or artists.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function SignalItem({ label, description }: { label: string; description: string }) {
  return (
    <View style={styles.signalItem}>
      <View style={styles.signalDot} />
      <View style={styles.signalContent}>
        <Text style={styles.signalLabel}>{label}</Text>
        <Text style={styles.signalDescription}>{description}</Text>
      </View>
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
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  iconRow: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  text: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  signalList: {
    marginTop: 14,
    gap: 10,
  },
  signalItem: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start',
    gap: 10,
  },
  signalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
    marginTop: 7,
  },
  signalContent: {
    flex: 1,
  },
  signalLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  signalDescription: {
    fontSize: 13,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  disclaimerBox: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  disclaimerText: {
    fontSize: 12,
    color: Colors.textTertiary,
    lineHeight: 18,
    textAlign: 'center' as const,
  },
});
