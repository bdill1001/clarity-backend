import React, { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';

export default function CallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    // AuthSession automatically captures the URL to process the token exchange 
    // in the component that initiated the request.
    // We just need to wait a moment and then return the user to that screen.
    const timer = setTimeout(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.accent} />
      <Text style={styles.text}>Connecting to Spotify...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: Colors.textSecondary,
    marginTop: 20,
    fontSize: 16,
    fontFamily: 'SF Pro Display',
  },
});
