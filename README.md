# KanjiWidgets

KanjiWidgets is a high-performance, offline-capable Japanese learning web application designed for comprehensive daily practice. Spanning from basic Hiragana and Katakana through advanced JLPT N1, the application provides instant access to native audio, stroke order animations, and detailed progress tracking.

Built with a focus on speed and offline reliability, the architecture utilizes a local database of over 7,000 native pronunciation audio files and JSON datasets, eliminating API latency and ensuring a seamless user experience.

## Core Features

* Offline Audio Engine: Custom asynchronous audio manager handling local MP3 blobs and fallback logic for zero-latency playback.
* Comprehensive Curriculum: Full progression tracking across Hiragana, Katakana, and JLPT N5-N1.
* Dynamic Stroke Order: Integrated SVG path animations mapping accurate character drawing sequences.
* Advanced Typography & Theming: Extensive UI customization featuring multiple professional Japanese typefaces (Mincho, Gothic, Brush, Handwriting) and custom color themes.
* Data Persistence: Local storage integration for mastery tracking, daily streaks, and JSON state exports/imports.
* Premium API Integration: Optional configuration for the KanjiAlive API to fetch deep etymology, radical breakdowns, and studio-quality human pronunciation.

## Architecture & Technologies

* Frontend: Vanilla HTML5, CSS3, and JavaScript (ES6+). No heavyweight frameworks or external dependencies.
* Storage: Browser LocalStorage for state management and progress data.
* PWA Ready: Configured as a Progressive Web App for native-like mobile installation and offline functionality.

## Installation & Usage

Due to the static nature of the application and its local data architecture, no backend server or Node.js environment is required.

1. Clone the repository:
   ```bash
   git clone https://github.com/brodante/kanji-widget-app.git
   ```

2. Run locally:
   Open `index.html` directly in any modern browser, or serve via a local development server for optimal performance.

## Acknowledgements

This application utilizes open-source data provided by the Japanese learning community:
* KanjiVG: SVG stroke order coordinate data.
* KanjiAlive API: Deep etymology, radical breakdowns, and premium audio data.
* Jisho.org: Dictionary routing and reference integration.

---
Made with 愛 by [d4nte](https://github.com/brodante).
