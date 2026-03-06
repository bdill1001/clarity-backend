# Clarity: AI Music Detector

## Project info

This is a native cross-platform mobile app built to detect AI-generated music playing on Spotify.

**Platform**: Native iOS & Android app, exportable to web
**Framework**: Expo Router + React Native

## Getting Started

This project requires Node.js and Bun.

### 1. Installation

```bash
# Install the necessary dependencies
bun install
```

### 2. Running the App

Start the Expo development server:

```bash
bun run start
```

Press `i` in the terminal to open the iOS Simulator, or `a` to open the Android Emulator.

To test on your physical device, download the **Expo Go** app from the App Store or Google Play Store and scan the QR code that appears in your terminal.

## Project Structure

```
├── app/                    # App screens (Expo Router)
│   ├── (tabs)/             # Tab navigation screens
│   │   ├── _layout.tsx     # Tab layout configuration
│   │   └── home/           # Home tab (Spotify detection)
│   ├── _layout.tsx         # Root layout
│   └── onboarding.tsx      # Onboarding flow
├── components/             # Reusable UI components
├── constants/              # App constants, colors, and configuration
├── contexts/               # React Context providers (State management)
├── services/               # API and external service integrations (Spotify API)
├── utils/                  # Helper functions and analysis heuristics
├── app.json                # Expo configuration
└── package.json            # Dependencies and scripts
```

## Technologies Used

- **React Native** - Cross-platform native mobile development framework.
- **Expo** - Framework and platform for universal React applications.
- **Expo Router** - File-based routing system for React Native.
- **TypeScript** - Type-safe JavaScript.
- **React Query** - Server state management.
- **Lucide React Native** - Beautiful icons.
