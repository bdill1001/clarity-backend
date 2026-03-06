import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shield, Music, Bell, Zap, ChevronRight, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useSpotifyAuthRequest, exchangeCodeForToken } from '@/services/spotify';

const { width } = Dimensions.get('window');

interface OnboardingStep {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  gradient: [string, string];
}

const STEPS: OnboardingStep[] = [
  {
    icon: <Shield size={40} color={Colors.accent} />,
    title: 'Know What\nYou\'re Hearing',
    subtitle: 'AI Detection for Music',
    description: 'Clarity analyzes Spotify tracks and estimates how likely they are to be AI-generated — so you always know what\'s real.',
    gradient: [Colors.accentGlow, 'transparent'],
  },
  {
    icon: <Bell size={40} color={Colors.warning} />,
    title: 'Get Notified\nInstantly',
    subtitle: 'Permissions',
    description: 'Enable notifications to get alerts when AI-generated tracks are detected. We\'ll also need Spotify access to analyze what you\'re playing.',
    gradient: [Colors.warningGlow, 'transparent'],
  },
  {
    icon: <Music size={40} color={Colors.spotifyGreen} />,
    title: 'Connect\nSpotify',
    subtitle: 'Link Your Account',
    description: 'Sign in with Spotify so Clarity can see what\'s playing and analyze track metadata in real time.',
    gradient: ['rgba(29, 185, 84, 0.15)', 'transparent'],
  },
  {
    icon: <Sparkles size={40} color={Colors.accent} />,
    title: 'Start Your\nFree Trial',
    subtitle: '7 Days Free',
    description: 'Try Clarity free for 7 days. After that, it\'s just $1.99/month for unlimited analysis and Auto-Detect alerts.',
    gradient: [Colors.accentGlow, 'transparent'],
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { updateSettings } = useApp();
  const [step, setStep] = useState<number>(0);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [request, response, promptAsync] = useSpotifyAuthRequest();

  useEffect(() => {
    if (response?.type === 'success' && response.params?.code) {
      handleSpotifyCallback(response.params.code);
    } else if (response?.type === 'error') {
      console.error('[Onboarding] Spotify auth error:', response.error);
      setConnectError('Failed to connect Spotify. Please try again.');
      setIsConnecting(false);
    } else if (response?.type === 'dismiss') {
      setIsConnecting(false);
    }
  }, [response, handleSpotifyCallback]);

  const handleSpotifyCallback = useCallback(async (code: string) => {
    if (!request?.codeVerifier) {
      console.error('[Onboarding] No code verifier available');
      setConnectError('Authentication error. Please try again.');
      setIsConnecting(false);
      return;
    }

    console.log('[Onboarding] Exchanging code for token...');
    const result = await exchangeCodeForToken(code, request.codeVerifier);


    if (result) {
      console.log('[Onboarding] Spotify connected successfully!');
      updateSettings({ spotifyConnected: true });
      setIsConnecting(false);
      setConnectError(null);
      animateTransition(step + 1);
    } else {
      setConnectError('Failed to connect Spotify. Please try again.');
      setIsConnecting(false);
    }
  }, [request, updateSettings, router]);

  const animateTransition = useCallback((nextStep: number) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -30, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setStep(nextStep);
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    });
  }, [fadeAnim, slideAnim]);

  const handleNext = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (step === 2) {
      setIsConnecting(true);
      setConnectError(null);
      try {
        await promptAsync();
      } catch (error) {
        console.error('[Onboarding] Prompt error:', error);
        setConnectError('Could not open Spotify login.');
        setIsConnecting(false);
      }
      return;
    }

    if (step < STEPS.length - 1) {
      animateTransition(step + 1);
    } else {
      updateSettings({
        isOnboarded: true,
        subscriptionStatus: 'trial_active',
      });
      router.replace('/' as never);
    }
  }, [step, animateTransition, updateSettings, router, promptAsync]);

  const handleSkip = useCallback(() => {
    updateSettings({ isOnboarded: true });
    router.replace('/' as never);
  }, [updateSettings, router]);

  const currentStep = STEPS[step];

  const getButtonText = () => {
    if (step === 2 && isConnecting) return 'Connecting...';
    switch (step) {
      case 0: return 'Get Started';
      case 1: return 'Enable Notifications';
      case 2: return 'Connect Spotify';
      case 3: return 'Start Free Trial';
      default: return 'Next';
    }
  };

  const getButtonColor = (): string => {
    switch (step) {
      case 2: return Colors.spotifyGreen;
      default: return Colors.accent;
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[Colors.background, '#0D0D1A', Colors.background]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.stepIndicatorRow}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.stepDot,
                  i === step && styles.stepDotActive,
                  i < step && styles.stepDotDone,
                ]}
              />
            ))}
          </View>
          {step < STEPS.length - 1 && (
            <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>

        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <LinearGradient
            colors={currentStep.gradient as [string, string]}
            style={styles.iconGlow}
          />
          <View style={styles.iconContainer}>
            {currentStep.icon}
          </View>

          <Text style={styles.subtitle}>{currentStep.subtitle}</Text>
          <Text style={styles.title}>{currentStep.title}</Text>
          <Text style={styles.description}>{currentStep.description}</Text>

          {step === 2 && connectError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{connectError}</Text>
            </View>
          )}

          {step === 3 && (
            <View style={styles.pricingCard}>
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>7-day free trial</Text>
                <Text style={styles.pricingValue}>$0.00</Text>
              </View>
              <View style={styles.pricingDivider} />
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>Then monthly</Text>
                <Text style={styles.pricingValue}>$1.99</Text>
              </View>
              <Text style={styles.pricingNote}>Cancel anytime. No commitment.</Text>
            </View>
          )}
        </Animated.View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: getButtonColor() },
              (isConnecting || (step === 2 && !request)) && styles.buttonDisabled,
            ]}
            onPress={handleNext}
            activeOpacity={0.8}
            disabled={isConnecting || (step === 2 && !request)}
            testID="onboarding-next-button"
          >
            {isConnecting ? (
              <ActivityIndicator color={Colors.black} size="small" />
            ) : (
              <>
                <Text style={styles.buttonText}>{getButtonText()}</Text>
                <ChevronRight size={20} color={Colors.black} />
              </>
            )}
          </TouchableOpacity>

          {step === 3 && (
            <TouchableOpacity onPress={handleSkip} style={styles.restoreButton}>
              <Text style={styles.restoreText}>Restore Purchase</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.disclaimer}>
            {step === 3
              ? 'Payment will be charged at end of trial. Recurring billing. Cancel in Settings.'
              : 'Clarity provides estimates based on metadata analysis, not definitive proof.'}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 16,
  },
  stepIndicatorRow: {
    flexDirection: 'row' as const,
    gap: 6,
  },
  stepDot: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.surfaceBorder,
  },
  stepDotActive: {
    backgroundColor: Colors.accent,
    width: 32,
  },
  stepDotDone: {
    backgroundColor: Colors.accentDim,
  },
  skipText: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '500' as const,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  iconGlow: {
    position: 'absolute' as const,
    top: '20%',
    left: -40,
    right: -40,
    height: 200,
    borderRadius: 100,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  title: {
    fontSize: 36,
    fontWeight: '800' as const,
    color: Colors.text,
    lineHeight: 42,
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  errorBox: {
    backgroundColor: Colors.dangerGlow,
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  errorText: {
    fontSize: 14,
    color: Colors.danger,
    textAlign: 'center' as const,
  },
  pricingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
    padding: 20,
    marginTop: 28,
  },
  pricingRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  pricingLabel: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
  pricingValue: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  pricingDivider: {
    height: 1,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 12,
  },
  pricingNote: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: 12,
  },
  footer: {
    paddingBottom: 12,
  },
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 16,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.black,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  restoreText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textDecorationLine: 'underline' as const,
  },
  disclaimer: {
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center' as const,
    lineHeight: 16,
    paddingHorizontal: 16,
    marginTop: 4,
  },
});
