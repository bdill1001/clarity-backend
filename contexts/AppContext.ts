import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { AppSettings, DEFAULT_SETTINGS, AnalyzedTrack, UserFeedback, Track, AnalysisResult } from '@/types';
import { fetchNowPlaying, hasStoredTokens, clearTokens, validateStoredTokens, getStoredTokens } from '@/services/spotify';
import { analyzeTrackWithBackend, registerForPushNotificationsAsync, registerUserWithBackend } from '@/services/backend';

const SETTINGS_KEY = 'clarity_settings';
const HISTORY_KEY = 'clarity_history';
const FEEDBACK_KEY = 'clarity_feedback';

export const [AppProvider, useApp] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<AnalyzedTrack[]>([]);
  const [feedback, setFeedback] = useState<UserFeedback[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);
  
  // We keep isPolling for UI compatibility, but it now means "is registered with backend"
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const lastTrackIdRef = useRef<string | null>(null);

  const settingsLoadedRef = useRef<boolean>(false);

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      return stored ? (JSON.parse(stored) as AppSettings) : DEFAULT_SETTINGS;
    },
  });

  const historyQuery = useQuery({
    queryKey: ['history'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(HISTORY_KEY);
      return stored ? (JSON.parse(stored) as AnalyzedTrack[]) : [];
    },
  });

  const feedbackQuery = useQuery({
    queryKey: ['feedback'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(FEEDBACK_KEY);
      return stored ? (JSON.parse(stored) as UserFeedback[]) : [];
    },
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings(settingsQuery.data);
      settingsLoadedRef.current = true;
      console.log('[App] Settings loaded from storage:', JSON.stringify(settingsQuery.data));
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (historyQuery.data) {
      setHistory(historyQuery.data);
    }
  }, [historyQuery.data]);

  useEffect(() => {
    if (feedbackQuery.data) {
      setFeedback(feedbackQuery.data);
    }
  }, [feedbackQuery.data]);

  const saveSettingsMutation = useMutation({
    mutationFn: async (newSettings: AppSettings) => {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
      return newSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const saveHistoryMutation = useMutation({
    mutationFn: async (newHistory: AnalyzedTrack[]) => {
      const trimmed = newHistory.slice(0, 50);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      return trimmed;
    },
  });

  const saveFeedbackMutation = useMutation({
    mutationFn: async (newFeedback: UserFeedback[]) => {
      await AsyncStorage.setItem(FEEDBACK_KEY, JSON.stringify(newFeedback));
      return newFeedback;
    },
  });

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...partial };
      saveSettingsMutation.mutate(updated);
      return updated;
    });
  }, []);

  const addToHistory = useCallback((entry: AnalyzedTrack) => {
    setHistory((prev) => {
      const exists = prev.some((h) => h.track.id === entry.track.id);
      if (exists) return prev;
      const updated = [entry, ...prev].slice(0, 50);
      saveHistoryMutation.mutate(updated);
      return updated;
    });
  }, []);

  const submitFeedback = useCallback((trackId: string, userLabel: UserFeedback['userLabel']) => {
    const entry: UserFeedback = {
      trackId,
      userLabel,
      createdAt: new Date().toISOString(),
    };
    setFeedback((prev) => {
      const updated = [entry, ...prev.filter((f) => f.trackId !== trackId)];
      saveFeedbackMutation.mutate(updated);
      return updated;
    });
    console.log(`[Feedback] Track ${trackId}: ${userLabel}`);
  }, []);

  const getFeedbackForTrack = useCallback((trackId: string): UserFeedback | undefined => {
    return feedback.find((f) => f.trackId === trackId);
  }, [feedback]);

  const enrichAndAnalyze = useCallback(async (track: Track) => {
    console.log(`[App] Requesting backend analysis for: "${track.name}"`);
    setIsAnalyzing(true);
    try {
      const tokens = await getStoredTokens();
      if (!tokens) throw new Error("No stored tokens");

      const analysis = await analyzeTrackWithBackend(
        track.id,
        track.artistIds[0],
        track.name,
        track.artist,
        tokens.accessToken
      );

      if (analysis) {
        setCurrentAnalysis(analysis);
        addToHistory({ track, analysis });
      } else {
        console.error('[App] Backend analysis returned null');
      }
    } catch (error) {
      console.error('[App] Enrichment/analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [addToHistory]);

  const startPolling = useCallback(async () => {
    console.log('[App] Registering with Backend Worker...');
    setIsPolling(true);
    setSpotifyError(null);

    const tokens = await getStoredTokens();
    if (!tokens) {
      setSpotifyError('No Spotify tokens found. Please connect in Settings.');
      setIsPolling(false);
      return;
    }

    try {
      let spotifyId = 'user_' + Math.random().toString(36).substring(7);
      try {
        const response = await fetch('https://api.spotify.com/v1/me', {
          headers: { Authorization: `Bearer ${tokens.accessToken}` }
        });
        if (response.ok) {
          const profile = await response.json();
          spotifyId = profile.id;
        }
      } catch (err) {
        console.error('[App] Failed to fetch real Spotify ID:', err);
      }

      const pushToken = await registerForPushNotificationsAsync();
      const success = await registerUserWithBackend(
        spotifyId,
        tokens.accessToken,
        tokens.refreshToken,
        pushToken || null
      );

      if (!success) {
        setSpotifyError('Failed to register with backend. Background tracking may not work.');
      }
    } catch (e) {
      console.error('[App] Registration error:', e);
      setSpotifyError('Error registering with backend tracking.');
    }
  }, []);

  const stopPolling = useCallback(() => {
    console.log('[App] Stopping backend worker tracking (client-side mock)');
    setIsPolling(false);
    // TODO: Send a deregister or inactive flag to the backend if needed
  }, []);

  const refreshNowPlaying = useCallback(async () => {
    console.log('[App] Manual refresh triggered');
    setSpotifyError(null);
    setSessionExpired(false);

    try {
      const hasTokens = await hasStoredTokens();
      if (!hasTokens) {
        console.log('[App] Manual refresh: no tokens stored');
        setSessionExpired(true);
        setSpotifyError('No Spotify tokens found. Please connect in Settings.');
        updateSettings({ spotifyConnected: false });
        return;
      }

      console.log('[App] Manual refresh: fetching now playing directly...');
      const result = await fetchNowPlaying();
      console.log(`[App] Manual refresh result: hasTrack=${!!result.track}, error=${result.error ?? 'none'}`);

      if (result.error) {
        if (result.error.includes('token') || result.error.includes('expired') || result.error.includes('reconnect')) {
          console.log('[App] Manual refresh: token issue, validating...');
          const status = await validateStoredTokens();
          console.log(`[App] Manual refresh validation: ${status}`);

          if (status === 'invalid') {
            setSessionExpired(true);
            setSpotifyError('Your Spotify session has expired. Please reconnect in Settings.');
            updateSettings({ spotifyConnected: false });
            return;
          }

          console.log('[App] Manual refresh: token refreshed, retrying fetch...');
          const retryResult = await fetchNowPlaying();
          if (retryResult.track) {
            lastTrackIdRef.current = retryResult.track.id;
            setCurrentTrack(retryResult.track);
            setCurrentAnalysis(null);
            if (!settings.spotifyConnected) updateSettings({ spotifyConnected: true });
            enrichAndAnalyze(retryResult.track);
          } else {
            setSpotifyError(retryResult.error || 'No track playing on Spotify right now.');
          }
        } else {
          setSpotifyError(result.error);
        }
      } else if (result.track) {
        lastTrackIdRef.current = result.track.id;
        setCurrentTrack(result.track);
        setCurrentAnalysis(null);
        if (!settings.spotifyConnected) updateSettings({ spotifyConnected: true });
        enrichAndAnalyze(result.track);
      } else {
        console.log('[App] Manual refresh: no track playing');
        setCurrentTrack(null);
        setCurrentAnalysis(null);
        lastTrackIdRef.current = null;
      }

      if (settings.isOnboarded) {
        console.log('[App] Manual refresh: restarting polling...');
        stopPolling();
        setTimeout(() => startPolling(), 300);
      }
    } catch (error) {
      console.error('[App] Manual refresh error:', error);
      setSpotifyError('Failed to refresh. Please try again.');
    }
  }, [updateSettings, settings.spotifyConnected, settings.isOnboarded, startPolling, stopPolling, enrichAndAnalyze]);

  useEffect(() => {
    if (settings.spotifyConnected && settings.isOnboarded) {
      console.log('[App] Spotify connected & onboarded, starting polling...');
      stopPolling();
      const timer = setTimeout(() => {
        startPolling();
      }, 200);
      return () => {
        clearTimeout(timer);
        stopPolling();
      };
    } else {
      console.log('[App] Not connected or not onboarded, stopping polling');
      stopPolling();
      return () => stopPolling();
    }
  }, [settings.spotifyConnected, settings.isOnboarded, startPolling, stopPolling]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'active' && settings.isOnboarded && settings.spotifyConnected) {
        console.log('[App] App became active, updating current playing track...');
        setSpotifyError(null);
        setSessionExpired(false);
        refreshNowPlaying(); // Do a one-off fetch to show the user what's playing when they open the app


        const hasTokens = await hasStoredTokens();
        if (!hasTokens) {
          console.log('[App] No stored tokens on foreground resume');
          return;
        }

        try {
          const status = await validateStoredTokens();
          console.log(`[App] Foreground token validation: ${status}`);
          if (status === 'invalid') {
            setSessionExpired(true);
            setSpotifyError('Your Spotify session has expired. Please reconnect in Settings.');
            updateSettings({ spotifyConnected: false });
            return;
          }

          if (!settings.spotifyConnected) {
            console.log('[App] Foreground: tokens valid but was disconnected, reconnecting...');
            updateSettings({ spotifyConnected: true });
          }
        } catch (e) {
          console.warn('[App] Foreground validation error:', e);
        }
      }
    });
    return () => subscription.remove();
  }, [settings.spotifyConnected, settings.isOnboarded, startPolling, stopPolling, updateSettings]);

  useEffect(() => {
    if (!settingsLoadedRef.current) {
      console.log('[App] Settings not loaded yet, deferring token check...');
      return;
    }

    const checkTokensOnStartup = async () => {
      console.log('[App] Running startup token check (settings loaded, spotifyConnected=' + settings.spotifyConnected + ', isOnboarded=' + settings.isOnboarded + ')');
      const hasTokens = await hasStoredTokens();
      if (!hasTokens) {
        console.log('[App] No stored tokens on startup');
        if (settings.spotifyConnected) {
          console.log('[App] Settings say connected but no tokens, fixing...');
          updateSettings({ spotifyConnected: false });
        }
        return;
      }

      console.log('[App] Found stored tokens, validating...');
      const status = await validateStoredTokens();
      console.log(`[App] Token validation result: ${status}`);

      if (status === 'valid' || status === 'refreshed') {
        if (!settings.spotifyConnected) {
          console.log('[App] Tokens valid but settings say disconnected, reconnecting...');
          updateSettings({ spotifyConnected: true });
        }
        setSessionExpired(false);
        setSpotifyError(null);
      } else {
        console.warn('[App] Stored tokens are invalid, marking disconnected');
        setSessionExpired(true);
        setSpotifyError('Your Spotify session has expired. Please reconnect in Settings.');
        updateSettings({ spotifyConnected: false });
      }
    };

    checkTokensOnStartup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsQuery.data]);

  const disconnectSpotify = useCallback(async () => {
    await clearTokens();
    stopPolling();
    setCurrentTrack(null);
    setCurrentAnalysis(null);
    lastTrackIdRef.current = null;
    updateSettings({ spotifyConnected: false, autoDetect: false });
    console.log('[App] Spotify disconnected');
  }, [stopPolling, updateSettings]);

  const connectSpotify = useCallback(async () => {
    console.log('[App] connectSpotify called, revalidating tokens...');
    try {
      const status = await validateStoredTokens();
      console.log(`[App] connectSpotify validation: ${status}`);
      if (status === 'valid' || status === 'refreshed') {
        setSessionExpired(false);
        setSpotifyError(null);
        updateSettings({ spotifyConnected: true });
        
        // Immediately trigger backend registration
        startPolling();
      } else {
        setSessionExpired(true);
        setSpotifyError('Could not validate Spotify tokens. Please reconnect.');
        updateSettings({ spotifyConnected: false });
      }
    } catch (error) {
      console.error('[App] connectSpotify error:', error);
      setSpotifyError('Failed to connect. Please try again.');
    }
  }, [updateSettings]);

  const isLoading = settingsQuery.isLoading || historyQuery.isLoading;

  return {
    settings,
    updateSettings,
    currentTrack,
    currentAnalysis,
    history,
    addToHistory,
    feedback,
    submitFeedback,
    getFeedbackForTrack,
    isPolling,
    isAnalyzing,
    spotifyError,
    sessionExpired,
    refreshNowPlaying,
    disconnectSpotify,
    connectSpotify,
    startPolling,
    stopPolling,
    isLoading,
  };
});
