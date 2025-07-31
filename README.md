# KanjiWidgets - Daily Kanji Learning App

A web-based Japanese kanji learning application with interactive widgets, progress tracking, and customizable study features.

## Features

### 📚 Learning System
- **Interactive Widgets**: Three widget sizes (2x2, 2x3, 3x3) for different display needs
- **JLPT Levels**: Filter kanji by JLPT levels N5-N1
- **Progress Tracking**: Track mastered kanji and study streaks
- **Spaced Repetition**: Smart kanji presentation system

### 🎵 Audio Features
- **Text-to-Speech**: Japanese pronunciation using browser's speech synthesis
- **Customizable Audio**: Choose default reading type (kun'yomi, on'yomi, or first available)
- **Interactive Readings**: Click on specific readings to hear pronunciation

### 🎨 Customization
- **Font Options**: Multiple Japanese font choices (Noto Sans JP, Hiragino Sans, Yu Gothic, etc.)
- **Font Sizes**: Adjustable text sizes (small, medium, large, extra-large)
- **Dark/Light Theme**: Toggle between light and dark modes
- **Responsive Design**: Works on desktop and mobile devices

### 💾 Data Management
- **Local Storage**: All progress saved locally in browser
- **Backup System**: Create and restore local backups
- **Auto Backup**: Scheduled automatic backups (daily, weekly, monthly)
- **Export/Import**: JSON-based data portability

### 📱 Mobile Ready
- **Progressive Web App**: Install as app on mobile devices
- **Service Worker**: Offline functionality
- **Touch Optimized**: Mobile-friendly interface

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Storage**: Browser localStorage with JSON serialization
- **Audio**: Web Speech API for pronunciation
- **APIs**: Jisho.org API for kanji data (with fallback data)
- **Server**: Express.js for development/deployment

## Quick Start

### Web Version
1. Clone the repository
2. Install dependencies: `npm install`
3. Start the server: `npm start` or `node server.js`
4. Open `http://localhost:5000` in your browser

### Static Hosting
Simply serve the files from any static web server - no backend required for basic functionality.

## Android Conversion

The app includes comprehensive documentation for converting to Android APK:

- **WebView Wrapper**: Simple Android app using WebView (recommended)
- **Cordova/PhoneGap**: Cross-platform mobile app framework
- **PWA**: Progressive Web App for app-like mobile experience

See `android-setup.md` and the `android-example/` folder for complete implementation guides.

## Project Structure

```
├── index.html              # Main HTML file
├── styles.css              # CSS styles and themes
├── script.js               # Main application logic
├── kanji-data.js           # Kanji data management and API
├── audio-manager.js        # Audio/speech functionality
├── storage-manager.js      # Local storage management
├── server.js               # Express server for development
├── sw.js                   # Service worker for PWA
├── manifest.json           # Web app manifest
├── android-setup.md        # Android conversion guide
└── android-example/        # Android WebView wrapper code
```

## Usage

1. **Select Widget Size**: Choose between 2x2 (kanji only), 2x3 (kanji + audio), or 3x3 (full details)
2. **Study Kanji**: View kanji character, meanings, and readings
3. **Audio Pronunciation**: Click speaker icon or readings for pronunciation
4. **Mark as Mastered**: Click the green check button when you've learned a kanji
5. **Track Progress**: Monitor your learning stats and recent kanji
6. **Customize Settings**: Adjust fonts, audio preferences, and backup settings

## Settings Options

- **JLPT Level**: Filter kanji by difficulty level
- **Auto-play**: Automatically play pronunciation when loading kanji
- **Font Customization**: Choose font family and size
- **Audio Type**: Set default reading type (kun'yomi/on'yomi)
- **Backup Frequency**: Configure automatic backup schedule
- **Theme**: Toggle between light and dark modes

## Data Sources

- **Primary**: Jisho.org API for real-time kanji data
- **Fallback**: Local JSON data for offline functionality
- **Storage**: Browser localStorage for persistence

## Browser Compatibility

- **Modern browsers** with ES6+ support
- **Speech Synthesis API** for audio (optional)
- **localStorage** for data persistence
- **Service Worker** support for PWA features

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source. Feel free to use, modify, and distribute.

## Development

### Local Development
```bash
npm install
npm start
```

### Building for Production
The app is designed for static hosting - simply copy all files to your web server.

### Android Development
Follow the guides in `android-setup.md` for mobile app conversion.

---

**Happy learning! 頑張って！**