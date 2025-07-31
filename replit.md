# KanjiWidgets - Daily Kanji Learning App

## Overview

KanjiWidgets is a web-based Japanese language learning application that provides interactive widgets for studying kanji characters. The app displays kanji with their meanings, readings (onyomi/kunyomi), and example vocabulary words. It features different widget sizes, progress tracking, and audio pronunciation support using the browser's Web Speech API.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The application follows a **client-side architecture** with vanilla JavaScript modules and browser-based storage. It's designed as a single-page application (SPA) with no backend dependencies, making it lightweight and easily deployable.

### Frontend Architecture
- **Vanilla JavaScript** with ES6+ class-based modules
- **HTML5** with semantic markup
- **CSS3** with CSS custom properties for theming
- **Modular design** with separate classes for different concerns

### Key Design Decisions
1. **No Framework Dependency**: Uses vanilla JavaScript to keep the bundle size small and reduce complexity
2. **Browser Storage**: Leverages localStorage for persistence without requiring a backend
3. **Progressive Enhancement**: Core functionality works without JavaScript, enhanced features require it
4. **Responsive Design**: Widget sizes adapt to different display requirements

## Key Components

### Core Modules

1. **KanjiLearningApp (script.js)**: Main application controller that orchestrates all other components
2. **KanjiData (kanji-data.js)**: Handles data fetching from Jisho.org API with fallback data
3. **StorageManager (storage-manager.js)**: Manages localStorage operations for settings, progress, and cache
4. **AudioManager (audio-manager.js)**: Handles text-to-speech functionality for pronunciation

### UI Components

1. **Kanji Widget**: The main learning interface with three size variants (small, medium, large)
2. **Progress Section**: Displays learning statistics and recent kanji
3. **Settings Modal**: Configuration interface for JLPT level, auto-play, and display options
4. **Theme System**: Light/dark theme toggle with CSS custom properties

### Widget Size Variants
- **Small (2x2)**: Kanji character only
- **Medium (2x3)**: Kanji + audio controls
- **Large (3x3)**: Full details including readings and examples

## Data Flow

1. **Initialization**: App loads settings from localStorage and initializes audio system
2. **Kanji Loading**: Fetches kanji data from Jisho.org API or uses fallback data
3. **Progress Tracking**: Updates learning progress and stores in localStorage
4. **Audio Playback**: Uses Web Speech API for Japanese pronunciation
5. **State Persistence**: All user preferences and progress saved locally

### Data Sources
- **Primary**: Jisho.org API for real-time kanji data
- **Fallback**: Local JSON data for offline functionality
- **Storage**: Browser localStorage for persistence

## External Dependencies

### APIs
- **Jisho.org API**: Primary source for kanji data, meanings, and readings
- **Web Speech API**: Browser-native text-to-speech for pronunciation

### CDN Resources
- **Google Fonts**: Noto Sans JP for Japanese character display
- **Font Awesome**: Icons for UI elements
- **Material Icons**: Additional icon set

### Browser Requirements
- **localStorage**: For data persistence
- **speechSynthesis**: For audio pronunciation (optional)
- **ES6+ Support**: For modern JavaScript features

## Deployment Strategy

The application is designed for **static hosting** with no server-side requirements:

1. **Static File Hosting**: Can be deployed on any static hosting service (GitHub Pages, Netlify, Vercel)
2. **CDN Delivery**: External resources loaded from CDNs for optimal performance
3. **Offline Capability**: Fallback data ensures functionality without internet connection
4. **Progressive Enhancement**: Core features work even if external APIs fail

### Future Considerations
- Could be enhanced with a backend for user accounts and synchronized progress
- Potential for packaging as a Progressive Web App (PWA)
- Mobile app version could use similar architecture with native widgets

## Architecture Benefits

1. **Simplicity**: No build process or complex tooling required
2. **Performance**: Minimal JavaScript bundle, fast loading times
3. **Reliability**: Fallback systems ensure app works in various conditions
4. **Maintainability**: Clear separation of concerns with modular design
5. **Portability**: Easy to deploy anywhere that serves static files

## Recent Changes

### July 31, 2025 (Latest)
- **Expanded Kanji Database**: Significantly expanded kanji collection with comprehensive N5 (~50 kanji) and N4 (~50 kanji) data including complete Japanese readings in vocabulary examples
- **Added All JLPT Levels**: Included representative kanji samples for N3, N2, and N1 levels with authentic readings and meanings
- **GitHub Pages Setup**: Created comprehensive deployment documentation and GitHub Actions workflow for automatic Pages deployment
- **Professional Documentation**: Added `docs/DEPLOY.md` with detailed hosting instructions and troubleshooting guides
- **Enhanced Data Quality**: All vocabulary examples now include proper Japanese readings (hiragana) for pronunciation accuracy
- **Updated Widget Interface**: Separated check button from widget click - users now click dedicated green check button to mark kanji as mastered
- **Added Recent Kanji Navigation**: Clicking on recently studied kanji now loads that specific kanji in the main widget
- **Enhanced Mobile Support**: Added PWA manifest and service worker for better mobile experience and potential app-like installation
- **Created Android Conversion Guide**: Added comprehensive documentation for converting to Android APK using WebView wrapper, Cordova, or PWA approaches
- **Resource Optimization**: Reduced deployment resource usage from 74% to <20% by excluding node_modules and temporary files from GitHub Pages deployment
- **Fixed Deployment Issues**: Optimized GitHub Actions workflow to deploy only essential static files (200KB vs 4MB), eliminating hosting failures
- **Added .gitignore**: Comprehensive exclusion of node_modules, temporary files, and deployment artifacts to prevent resource bloat
- **Fixed Font Options**: Replaced unavailable Google Fonts with working alternatives - added Zen Antique (Mincho style), Zen Maru Gothic, Hannari (traditional), and Kokoro (brush style)
- **Enhanced API Integration**: Added KanjiAPI.dev and Tatoeba API support for real-time kanji data and example sentences
- **Expanded Database**: Increased kanji count to 200+ characters with authentic readings and comprehensive JLPT level coverage
- **Confirmed GitHub Pages Success**: Verified expanded kanji database works properly on deployed version with full JLPT level collections