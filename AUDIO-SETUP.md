# Japanese Audio Setup Guide

This application now supports **three-tier audio playback** for authentic Japanese kanji pronunciation:

## Audio Priority (Best to Fallback)

1. **Kanji Alive API** - Professional, studio-quality audio for kanji readings
2. **Google Translate TTS** - Free, reliable Japanese text-to-speech
3. **Web Speech API** - Browser built-in speech synthesis (fallback)

---

## Setting Up Kanji Alive API (Optional but Recommended)

### Why Use Kanji Alive API?
- **Professional Quality**: Native speaker pronunciation recordings
- **Example Audio**: Real-world usage examples with audio
- **Complete Data**: Includes onyomi, kunyomi, stroke order videos, and more
- **No Rate Limiting**: Unlike TTS services

### Step 1: Get Free RapidAPI Key

1. Go to: https://rapidapi.com/KanjiAlive/api/learn-to-read-and-write-japanese-kanji
2. Click **"Subscribe"** (free tier available)
3. Create a RapidAPI account if needed
4. Go to your dashboard and copy your **API Key**

### Step 2: Set the API Key in Your App

**Option A: Via Developer Console (Quick Test)**
```javascript
// Open browser console (F12) and run:
AudioManager.setApiKey("your-rapidapi-key-here")
```

**Option B: In HTML (Persistent)**
Add this to your `index.html` before loading scripts:
```html
<script>
    // Set your Kanji Alive API key
    window.kanjiAliveApiKey = "your-rapidapi-key-here";
</script>
<script src="audio-manager.js"></script>
<script src="script.js"></script>
```

Then in `audio-manager.js`, the init function will pick it up.

**Option C: Via localStorage (Permanent)**
```javascript
// Run once in console:
localStorage.setItem('kanjiAliveApiKey', 'your-rapidapi-key-here');
```

---

## Using the Enhanced API Features

### Play Kanji Audio with Full Data
```javascript
// Get all kanji data including audio
const readings = await AudioManager.getKanjiReadingsFromAPI('訪');
console.log(readings);
// {
//   onyomi: "ホウ",
//   kunyomi: "おとずれる、たずねる、おとず、たず",
//   meaning: "visit",
//   examples: [...]
// }

// Play professional audio for the kanji
await AudioManager.speakKanjiWithAPI('訪', 'onyomi');
```

### Regular Text-to-Speech (Works Without API)
```javascript
// Will use Google TTS or Web Speech API
AudioManager.speak('こんにちは');
```

---

## Troubleshooting

### "Kanji Alive API key not set" message?
- This is normal and not an error
- The app automatically falls back to Google Translate
- To enable full features, get and set an API key (see Step 2 above)

### CORS Error when using API?
- This should not happen as we're using RapidAPI's proxy
- Check that your API key is correct
- Ensure you have an active RapidAPI subscription

### Audio not playing?
1. Check browser console for errors (F12)
2. Verify speaker volume and browser audio permissions
3. Try the fallback methods (they should work without API key)

---

## API Documentation

Full API documentation: https://app.kanjialive.com/api/docs

Key endpoints available:
- **Search**: Find kanji by reading, meaning, stroke count, etc.
- **Details**: Get complete kanji information including audio
- **Examples**: Get usage examples with native speaker audio

---

## Notes

- The API cache stores results locally to minimize API calls
- Audio files are cached in memory for instant playback
- Free RapidAPI tier has rate limits but sufficient for learning use
- All API keys are stored only in localStorage (client-side, no server)
