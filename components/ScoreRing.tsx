import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Colors from '@/constants/colors';
import { getScoreColor } from '@/utils/analysis';
import { User, Bot, HelpCircle, ShieldCheck } from 'lucide-react-native';

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label: string;
  showPercentage?: boolean;
  reasonCodes?: string[];
}

export default function ScoreRing({ 
  score, 
  size = 200, 
  strokeWidth = 12, 
  label,
  showPercentage = true,
  reasonCodes = []
}: ScoreRingProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const color = getScoreColor(score);
  const isCommunityVerified = reasonCodes.some(code => code.includes('COMMUNITY_VERIFIED'));

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: score,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [animatedValue, score]);

  const strokeDashoffset = circumference - (circumference * score) / 100;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={Colors.surfaceBorder}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          transform={`rotate(-90, ${center}, ${center})`}
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90, ${center}, ${center})`}
        />
      </Svg>
      <View style={styles.center}>
        <View style={styles.iconContainer}>
          {isCommunityVerified ? (
            <ShieldCheck size={48} color={color} />
          ) : (
            <>
              {label === 'Likely Human' && <User size={48} color={color} />}
              {label === 'Likely AI' && <Bot size={48} color={color} />}
              {label === 'Unsure' && <HelpCircle size={48} color={color} />}
            </>
          )}
        </View>
        <Text style={[styles.labelText, { color, marginTop: 8 }]}>{label}</Text>
      </View>
      <View style={[styles.glow, { backgroundColor: color, opacity: 0.06 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
  },
  svg: {
    position: 'absolute' as const,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 48,
    fontWeight: '700' as const,
    letterSpacing: -1,
  },
  labelText: {
    fontSize: 16,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    marginTop: 8,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute' as const,
    width: '100%',
    height: '100%',
    borderRadius: 200,
  },
});
