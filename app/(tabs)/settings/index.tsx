import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Settings,
  Zap,
  Bell,
  SlidersHorizontal,
  Shield,
  Mail,
  FileText,
  CreditCard,
  ChevronRight,
  Smartphone,
  Music,
  LogOut,
  Unlink,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
const SPOTIFY_CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID || '';
import { useApp } from '@/contexts/AppContext';
import { useSpotifyAuthRequest, exchangeCodeForToken } from '@/services/spotify';

export default function SettingsScreen() {
  const { settings, updateSettings, disconnectSpotify } = useApp();
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  const [request, response, promptAsync] = useSpotifyAuthRequest();

  const handleSpotifyCallback = useCallback(async (code: string) => {
    if (!request?.codeVerifier) {
      setIsConnecting(false);
      return;
    }

    const result = await exchangeCodeForToken(code, request.codeVerifier);
    if (result) {
      updateSettings({ spotifyConnected: true, isOnboarded: true });
      console.log('[Settings] Spotify connected successfully');
    } else {
      Alert.alert('Connection Failed', 'Could not connect to Spotify. Please try again.');
    }
    setIsConnecting(false);
  }, [request, updateSettings]);

  useEffect(() => {
    if (response?.type === 'success' && response.params?.code) {
      handleSpotifyCallback(response.params.code);
    } else if (response?.type === 'error' || response?.type === 'dismiss') {
      setIsConnecting(false);
    }
  }, [response, handleSpotifyCallback]);

  const handleConnectSpotify = useCallback(async () => {
    setIsConnecting(true);
    try {
      await promptAsync();
    } catch (error) {
      console.error('[Settings] Spotify connect error:', error);
      setIsConnecting(false);
    }
  }, [promptAsync]);

  const handleDisconnectSpotify = useCallback(() => {
    Alert.alert(
      'Disconnect Spotify',
      'This will stop all track monitoring and analysis. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => disconnectSpotify(),
        },
      ]
    );
  }, [disconnectSpotify]);

  const handleToggle = useCallback((key: 'autoDetect' | 'notificationSound', value: boolean) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    updateSettings({ [key]: value });
    console.log(`[Settings] ${key} toggled to ${value}`);
  }, [updateSettings]);

  const showAlert = useCallback((title: string, message: string) => {
    Alert.alert(title, message, [{ text: 'OK' }]);
  }, []);

  const subscriptionLabel = settings.subscriptionStatus === 'trial_active'
    ? 'Free Trial (Active)'
    : settings.subscriptionStatus === 'subscribed'
      ? 'Subscribed'
      : 'Free Plan';

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Settings size={20} color={Colors.accent} />
              <Text style={styles.title}>Settings</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Subscription</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => showAlert('Subscription', 'RevenueCat subscription management will be integrated here.')}
                activeOpacity={0.7}
              >
                <CreditCard size={20} color={Colors.accent} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Plan</Text>
                  <Text style={styles.rowValue}>{subscriptionLabel}</Text>
                </View>
                <ChevronRight size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
              <View style={styles.rowDivider} />
              <TouchableOpacity
                style={styles.row}
                onPress={() => showAlert('Restore', 'Purchases restored successfully.')}
                activeOpacity={0.7}
              >
                <CreditCard size={20} color={Colors.textSecondary} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Restore Purchases</Text>
                </View>
                <ChevronRight size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Detection</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <Zap size={20} color={Colors.accent} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Auto-Detect</Text>
                  <Text style={styles.rowHint}>
                    {Platform.OS === 'ios'
                      ? 'Best-effort on iOS. Full support on Android.'
                      : 'Monitor Spotify playback for AI tracks'}
                  </Text>
                </View>
                <Switch
                  value={settings.autoDetect}
                  onValueChange={(val) => handleToggle('autoDetect', val)}
                  trackColor={{ false: Colors.surfaceBorder, true: Colors.accentDim }}
                  thumbColor={settings.autoDetect ? Colors.accent : Colors.textTertiary}
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notifications</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <Bell size={20} color={Colors.accent} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Notification Sound</Text>
                  <Text style={styles.rowHint}>Play sound for AI alerts</Text>
                </View>
                <Switch
                  value={settings.notificationSound}
                  onValueChange={(val) => handleToggle('notificationSound', val)}
                  trackColor={{ false: Colors.surfaceBorder, true: Colors.accentDim }}
                  thumbColor={settings.notificationSound ? Colors.accent : Colors.textTertiary}
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.card}>
              {settings.spotifyConnected ? (
                <>
                  <View style={styles.row}>
                    <Music size={20} color={Colors.spotifyGreen} />
                    <View style={styles.rowContent}>
                      <Text style={styles.rowLabel}>Spotify</Text>
                      <Text style={[styles.rowValue, { color: Colors.spotifyGreen }]}>Connected</Text>
                    </View>
                    <View style={styles.connectedDot} />
                  </View>
                  <View style={styles.rowDivider} />
                  <TouchableOpacity
                    style={styles.row}
                    onPress={handleDisconnectSpotify}
                    activeOpacity={0.7}
                  >
                    <Unlink size={20} color={Colors.danger} />
                    <View style={styles.rowContent}>
                      <Text style={[styles.rowLabel, { color: Colors.danger }]}>Disconnect Spotify</Text>
                    </View>
                    <ChevronRight size={18} color={Colors.textTertiary} />
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.row}
                  onPress={handleConnectSpotify}
                  activeOpacity={0.7}
                  disabled={isConnecting || !request}
                >
                  <Music size={20} color={Colors.spotifyGreen} />
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>Spotify</Text>
                    <Text style={styles.rowValue}>Not connected</Text>
                  </View>
                  {isConnecting ? (
                    <ActivityIndicator size="small" color={Colors.spotifyGreen} />
                  ) : (
                    <View style={styles.connectChip}>
                      <Text style={styles.connectChipText}>Connect</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.row}
                onPress={() => showAlert('Privacy', 'Clarity stores only anonymized track metadata and your analysis history locally. We never share your listening data.')}
                activeOpacity={0.7}
              >
                <Shield size={20} color={Colors.textSecondary} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Privacy Policy</Text>
                </View>
                <ChevronRight size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
              <View style={styles.rowDivider} />
              <TouchableOpacity
                style={styles.row}
                onPress={() => showAlert('Terms of Service', 'Terms of Service placeholder. This will link to your full terms.')}
                activeOpacity={0.7}
              >
                <FileText size={20} color={Colors.textSecondary} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Terms of Service</Text>
                </View>
                <ChevronRight size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
              <View style={styles.rowDivider} />
              <TouchableOpacity
                style={styles.row}
                onPress={() => showAlert('Contact', 'Email: support@claritymusicapp.com')}
                activeOpacity={0.7}
              >
                <Mail size={20} color={Colors.textSecondary} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Contact Support</Text>
                </View>
                <ChevronRight size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
              <View style={styles.rowDivider} />
              <View style={styles.row}>
                <Smartphone size={20} color={Colors.textTertiary} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Version</Text>
                  <Text style={styles.rowValue}>1.0.0</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.bottomPadding} />
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
    paddingBottom: 100,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.text,
  },
  rowHint: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  rowValue: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginLeft: 50,
  },
  thresholdControls: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 8,
  },
  thresholdButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thresholdButtonText: {
    fontSize: 18,
    color: Colors.text,
    fontWeight: '600' as const,
  },
  thresholdValue: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.warning,
    minWidth: 40,
    textAlign: 'center' as const,
  },
  iosNotice: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start',
    backgroundColor: Colors.warningGlow,
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  iosNoticeText: {
    flex: 1,
    fontSize: 12,
    color: Colors.warning,
    lineHeight: 17,
  },
  connectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.spotifyGreen,
  },
  connectChip: {
    backgroundColor: Colors.spotifyGreen + '20',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.spotifyGreen + '40',
  },
  connectChipText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.spotifyGreen,
  },
  debugText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  bottomPadding: {
    height: 20,
  },
});
