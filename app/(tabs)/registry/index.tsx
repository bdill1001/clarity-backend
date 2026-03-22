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
  Image,
  Alert,
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
  artist_image?: string;
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
  
  const [isFlagging, setIsFlagging] = useState(false);
  const [flagged, setFlagged] = useState(false);

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
    setIsFlagging(false);
    setFlagged(false);

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

  const handleFlag = async () => {
    if (!scanResult) return;
    setIsFlagging(true);
    try {
      const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
      const res = await fetch(`${backendUrl}/api/registry/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistId: scanResult.artistId,
          artistName: scanResult.artistName,
          trackId: scanResult.trackId
        })
      });
      if (!res.ok) throw new Error("Failed to submit flag");
      
      setFlagged(true);
      Alert.alert("Submitted", "This artist has been flagged for manual verification by a Clarity Admin.");
    } catch (err: any) {
      console.error('[Registry] Flag Error:', err);
      Alert.alert("Error", err.message || "Could not submit flag. Please try again.");
    } finally {
      setIsFlagging(false);
    }
  };

  const renderDirectoryItem = ({ item, index }: { item: RegistryArtist; index: number }) => (
    <View style={styles.wallItem}>
      <Text style={styles.wallItemRankText}>#{index + 1}</Text>
      
      {item.artist_image ? (
        <Image source={{ uri: item.artist_image }} style={styles.artistAvatar} />
      ) : (
        <View style={[styles.artistAvatar, styles.artistAvatarFallback]}>
          <User size={20} color={Colors.textTertiary} />
        </View>
      )}

      <View style={styles.wallItemInfo}>
        <Text style={styles.wallItemName} numberOfLines={1}>{item.artist_name}</Text>
      </View>
      
      <View style={styles.aiBadge}>
         <Bot size={12} color="#FFF" />
         <Text style={styles.aiBadgeText}>Verified AI</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView 
        style={styles.root} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>AI Directory</Text>
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
                <Text style={styles.scannerTitle}>Manual Scan</Text>
                <Text style={styles.scannerSub}>Paste a Spotify link to run an immediate deep scan.</Text>
                
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
                    {scanResult.trackName === "[Tracks Unavailable - Region Locked or Removed]" ? (
                      <Text style={[styles.resultTrackName, { fontStyle: 'italic', opacity: 0.7 }]}>Artist Profile Scan</Text>
                    ) : (
                      <Text style={styles.resultTrackName}>"{scanResult.trackName}"</Text>
                    )}
                    <View style={styles.resultLabelRow}>
                      {scanResult.label === 'Likely AI' && <Bot size={16} color={Colors.ai} style={{marginRight: 6}}/>}
                      {scanResult.label === 'Likely Human' && <User size={16} color={Colors.human} style={{marginRight: 6}}/>}
                      <Text style={[
                        styles.resultLabel,
                        scanResult.label === 'Likely AI' ? {color: Colors.ai} :
                        scanResult.label === 'Likely Human' ? {color: Colors.human} : null
                      ]}>{scanResult.label}</Text>
                    </View>

                    {scanResult.label !== 'Analyzing with Sentinel AI...' && (
                      <TouchableOpacity 
                        style={[styles.flagButton, (isFlagging || flagged || scanResult.label === 'Likely AI') && styles.flagButtonDisabled]}
                        disabled={isFlagging || flagged || scanResult.label === 'Likely AI'}
                        onPress={handleFlag}
                      >
                        {isFlagging ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <Text style={styles.flagButtonText}>
                            {flagged ? "Flagged for Admin Verification" : 
                             scanResult.label === 'Likely AI' ? "Verified AI (Added to Registry)" : 
                             "Flag for Admin Verification"}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {/* Leaderboard Header */}
              <View style={styles.boardHeader}>
                <Text style={styles.boardTitle}>Verified AI Artists</Text>
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
    backgroundColor: Colors.ai,
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
  },
  resultBoxDanger: {
    backgroundColor: 'rgba(168, 85, 247, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.3)',
  },
  resultBoxSafe: {
    backgroundColor: 'rgba(48, 209, 88, 0.05)',
    borderWidth: 1,
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
    paddingLeft: 20,
    borderRadius: 16,
    marginBottom: 12,
  },
  wallItemRankText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    width: 28,
  },
  artistAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: Colors.background,
  },
  artistAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wallItemInfo: {
    flex: 1,
    marginRight: 8,
  },
  wallItemName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.ai,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
  },
  aiBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
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
  },
  flagButton: {
    marginTop: 16,
    backgroundColor: '#333',
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  flagButtonDisabled: {
    opacity: 0.5,
  },
  flagButtonText: {
    color: '#E0E0E0',
    fontSize: 14,
    fontWeight: '600',
  }
});
