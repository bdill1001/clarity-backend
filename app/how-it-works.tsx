import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Shield, Search, Binary, ShieldCheck } from 'lucide-react-native';
import Colors from '@/constants/colors';

export default function HowItWorksScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Deep Analysis Engine</Text>
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
              <Binary size={24} color={Colors.accent} />
              <Text style={styles.sectionTitle}>The Multi-Layered Engine</Text>
            </View>
            <Text style={styles.text}>
              Clarity does not "listen" to audio. Instead, it acts as a digital presence scanner, analyzing the digital footprint of artists and tracks to distinguish between human creativity and synthetic generation.
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.iconRow}>
              <Search size={24} color={Colors.warning} />
              <Text style={styles.sectionTitle}>Verification Pillars</Text>
            </View>
            <Text style={styles.text}>
              Our engine cross-references dozens of signals across 4 key analysis pillars to reach a high-confidence assessment:
            </Text>
            <View style={styles.signalList}>
              <SignalItem 
                label="Artist Identity" 
                description="Analysis of 'Nuclear Innocence' — checking related artists, genre richness, and historical catalog data." 
              />
              <SignalItem 
                label="Synthetic Patterns" 
                description="Scanning for known AI-generated compound naming conventions and metadata templates." 
              />
              <SignalItem 
                label="Release Velocity" 
                description="Identifying 'farm' behaviors like inhuman release frequencies and singles-only distribution." 
              />
              <SignalItem 
                label="External Grounding" 
                description="Corroborating data against community intelligence and known AI-generation platforms." 
              />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.iconRow}>
              <ShieldCheck size={24} color={Colors.human} />
              <Text style={styles.sectionTitle}>The Innocence Protocol</Text>
            </View>
            <Text style={styles.text}>
              Clarity is designed to protect human artists first. If an artist's digital footprint is small but potentially human, the engine defaults to 'Unsure' or 'Human' rather than 'Likely AI'.
            </Text>
            <Text style={[styles.text, { marginTop: 8 }]}>
              A 'Likely AI' result requires multiple independent analysis corroborations to clear our high-confidence gate.
            </Text>
          </View>

          <View style={styles.disclaimerBox}>
            <Text style={styles.disclaimerText}>
              Analysis tools provide likelihood based on patterns, not definitive proof. False positives can occur, especially with new independent human artists.
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
