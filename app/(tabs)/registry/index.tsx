import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Database, Search, Globe, ExternalLink, Bot, User, CheckCircle2 } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { getStoredTokens } from '@/services/spotify';
import { useFocusEffect } from 'expo-router';

// Types
interface RegistryArtist {
  artist_id: string;
  artist_name: string;
  trust_score: number;
}

interface ScanResult {
  trackId: string;
  artistId: string;
  trackName: string;
  artistName: string;
  aiLikelihood?: number;
  label?: string;
}

export default function RegistryScreen() {
  const [url, setUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [aiDirectory, setAiDirectory] = useState<RegistryArtist[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(true);

  const fetchDirectory = useCallback(async () => {
    setIsLoadingDirectory(true);
    try {
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
      const res = await fetch(`${backendUrl}/api/registry/list`);
      if (res.ok) {
        const data = await res.json();
        setAiDirectory(data);
      }
    } catch (err) {
      console.error('[Registry] Failed to fetch Verified Directory:', err);
    } finally {
      setIsLoadingDirectory(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDirectory();
    }, [fetchDirectory])
  );

  const handleScan = async () => {
    if (!url.trim() || !url.includes('spotify.com')) {
      setScanError('Please enter a valid Spotify Track or Artist URL.');
      return;
    }

    setIsScanning(true);
    setScanResult(null);
    setScanError(null);

    try {
      const tokens = await getStoredTokens();
      if (!tokens) {
        setScanError('Please connect your Spotify account in Settings first.');
        setIsScanning(false);
        return;
      }

      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
      
      // 1. Submit to Registry to parse URL and fetch Track Data
      const submitRes = await fetch(`${backendUrl}/api/registry/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, accessToken: tokens.accessToken })
      });
      
      const sessionData = await submitRes.json();
      if (!submitRes.ok) throw new Error(sessionData.error || 'Failed to parse URL.');
      
      // We explicitly inform the user that it's being analyzed
      setScanResult({
        ...sessionData,
        label: 'Analyzing with Sentinel AI...',
      });

      // 2. Trigger standard assessment
      const analyzeRes = await fetch(`${backendUrl}/api/analyze`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           trackId: sessionData.trackId,
           artistId: sessionData.artistId,
           trackName: sessionData.trackName,
           artistName: sessionData.artistName,
           accessToken: tokens.accessToken
         })
      });

      const analysisData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analysisData.error);
      
      setScanResult({
         ...sessionData,
         aiLikelihood: analysisData.aiLikelihood,
         label: analysisData.label,
      });

      // Refresh the directory in case this new scan triggered a confirmation!
      fetchDirectory();

    } catch (err: any) {
      console.error('[Registry] Scan Error:', err);
      setScanError(err.message || 'An error occurred during scanning.');
    } finally {
      setIsScanning(false);
      setUrl('');
    }
  };

  const renderDirectoryItem = ({ item, index }: { item: RegistryArtist; index: number }) => (
    <View style={styles.wallItem}>
      <View style={styles.wallItemRank}>
        <Text style={styles.wallItemRankText}>#{index + 1}</Text>
      </View>
      <View style={styles.wallItemInfo}>
        <Text style={styles.wallItemName} numberOfLines={1}>{item.artist_name}</Text>
        <Text style={styles.wallItemScore}>Trust Score: {item.trust_score} (Verified AI)</Text>
      </View>
      <Bot size={20} color={Colors.accent} />
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView 
        style={styles.root} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Database size={20} color={Colors.accent} />
          <Text style={styles.headerTitle}>Global Registry</Text>
        </View>

        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={aiDirectory}
          keyExtractor={(item) => item.artist_id}
          renderItem={renderDirectoryItem}
          refreshControl={
            <RefreshControl
              refreshing={isLoadingDirectory}
              onRefresh={fetchDirectory}
              tintColor={Colors.accent}
              colors={[Colors.accent]}
            />
          }
          ListHeaderComponent={
            <>
              {/* Scanner Section */}
              <View style={styles.scannerCard}>
                <Text style={styles.scannerTitle}>URL Scanner</Text>
                <Text style={styles.scannerSub}>Submit a Spotify Artist or Track link to force a deep analysis and update the global registry.</Text>
                
                <View style={styles.inputRow}>
                  <View style={styles.inputContainer}>
                    <Search size={16} color={Colors.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Paste Spotify Link (https://...)"
                      placeholderTextColor={Colors.textTertiary}
                      value={url}
                      onChangeText={setUrl}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <TouchableOpacity 
                    style={[styles.scanButton, (!url || isScanning) && styles.scanButtonDisabled]}
                    onPress={handleScan}
                    disabled={!url || isScanning}
                  >
                    {isScanning ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.scanButtonText}>Scan</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {scanError && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{scanError}</Text>
                  </View>
                )}

                {scanResult && (
                  <View style={[
                    styles.resultBox, 
                    scanResult.label === 'Likely AI' ? styles.resultBoxDanger : 
                    scanResult.label === 'Likely Human' ? styles.resultBoxSafe : null
                  ]}>
                    <Text style={styles.resultArtistName}>{scanResult.artistName}</Text>
                    <Text style={styles.resultTrackName}>"{scanResult.trackName}"</Text>
                    <View style={styles.resultLabelRow}>
                      {scanResult.label === 'Likely AI' && <Bot size={16} color={Colors.accent} style={{marginRight: 6}}/>}
                      {scanResult.label === 'Likely Human' && <User size={16} color={Colors.human} style={{marginRight: 6}}/>}
                      <Text style={[
                        styles.resultLabel,
                        scanResult.label === 'Likely AI' ? {color: Colors.accent} :
                        scanResult.label === 'Likely Human' ? {color: Colors.human} : null
                      ]}>{scanResult.label}</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Leaderboard Header */}
              <View style={styles.boardHeader}>
                <Text style={styles.boardTitle}>Verified AI Directory</Text>
                <Text style={styles.boardSub}>Artists verified as utilizing AI generation through community consensus and AI analysis.</Text>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyBoard}>
              {!isLoadingDirectory && (
                <>
                  <CheckCircle2 size={48} color={Colors.surfaceBorder} style={{ marginBottom: 16 }} />
                  <Text style={styles.emptyBoardTitle}>Directory is Empty</Text>
                  <Text style={styles.emptyBoardSub}>No artists have been verified yet. Check back later or start scanning!</Text>
                </>
              )}
            </View>
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
    marginLeft: 12,
    letterSpacing: 0.5,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  scannerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 32,
  },
  scannerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  scannerSub: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: '#FFF',
    fontSize: 15,
  },
  scanButton: {
    backgroundColor: Colors.accent,
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanButtonDisabled: {
    opacity: 0.5,
  },
  scanButtonText: {
    color: '#121212',
    fontWeight: '600',
    fontSize: 15,
  },
  errorBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
  },
  errorText: {
    color: Colors.danger,
    fontSize: 13,
  },
  resultBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  resultBoxDanger: {
    backgroundColor: 'rgba(216, 180, 254, 0.05)',
    borderColor: 'rgba(216, 180, 254, 0.3)',
  },
  resultBoxSafe: {
    backgroundColor: 'rgba(48, 209, 88, 0.05)',
    borderColor: 'rgba(48, 209, 88, 0.3)',
  },
  resultArtistName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  resultTrackName: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
    marginBottom: 8,
  },
  resultLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  resultLabel: {
    color: Colors.accent,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  boardHeader: {
    marginBottom: 16,
  },
  boardTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  boardSub: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  wallItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: 12,
  },
  wallItemRank: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  wallItemRankText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  wallItemInfo: {
    flex: 1,
  },
  wallItemName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  wallItemScore: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '500',
  },
  emptyBoard: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyBoardTitle: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyBoardSub: {
    color: Colors.textTertiary,
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  }
});
