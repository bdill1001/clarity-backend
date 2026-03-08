import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Set your deployed backend URL here
export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('Failed to get push token for push notification!');
      return null;
    }
    
    // Get the Expo push token
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        
      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;
      console.log('[BackendService] Expo push token:', token);
    } catch (e: any) {
      console.log('[BackendService] Push token skipped (Firebase not configured):', e.message);
    }
  } else {
    console.log('[BackendService] Must use physical device for Push Notifications');
  }

  return token;
}

export async function registerUserWithBackend(
  spotifyId: string, 
  accessToken: string, 
  refreshToken: string, 
  pushToken: string | null
) {
  try {
    console.log(`[BackendService] Registering user ${spotifyId} with backend...`);
    const response = await fetch(`${BACKEND_URL}/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        spotifyId,
        accessToken,
        refreshToken,
        expoPushToken: pushToken,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[BackendService] Failed to register with backend:', text);
      return false;
    }

    const data = await response.json();
    console.log('[BackendService] Successfully registered with backend:', data);
    return true;
  } catch (error) {
    console.error('[BackendService] Error connecting to backend:', error);
    return false;
  }
}

export async function analyzeTrackWithBackend(
  trackId: string,
  artistId: string,
  trackName: string,
  artistName: string,
  accessToken: string
) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trackId,
        artistId,
        trackName,
        artistName,
        accessToken,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[BackendService] /api/analyze failed:', text);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[BackendService] Error calling /api/analyze:', error);
    return null;
  }
}
