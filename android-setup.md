# Converting KanjiWidgets to Android APK

## Option 1: WebView Wrapper (Recommended for quick deployment)

### Requirements
- Android Studio
- Java/Kotlin knowledge
- Android SDK

### Steps:
1. **Create new Android project** in Android Studio
2. **Add WebView to main activity**
3. **Include web files in assets folder**
4. **Configure permissions in AndroidManifest.xml**

### Basic Android WebView Setup

```kotlin
// MainActivity.kt
package com.yourname.kanjiwidgets

import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        val webView: WebView = findViewById(R.id.webview)
        webView.webViewClient = WebViewClient()
        
        // Enable JavaScript
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        
        // Load your web app
        webView.loadUrl("file:///android_asset/index.html")
    }
}
```

```xml
<!-- activity_main.xml -->
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">
    
    <WebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />
        
</LinearLayout>
```

```xml
<!-- AndroidManifest.xml additions -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

## Option 2: Cordova/PhoneGap (Web-to-App Framework)

### Installation
```bash
npm install -g cordova
cordova create KanjiWidgets com.yourname.kanjiwidgets KanjiWidgets
cd KanjiWidgets
cordova platform add android
```

### Configuration
```javascript
// config.xml
<?xml version='1.0' encoding='utf-8'?>
<widget id="com.yourname.kanjiwidgets" version="1.0.0">
    <name>KanjiWidgets</name>
    <description>Japanese Kanji Learning App</description>
    <platform name="android">
        <preference name="loadUrlTimeoutValue" value="700000" />
    </platform>
</widget>
```

### Build Process
```bash
# Copy your web files to www/ folder
cp *.html *.css *.js www/

# Build APK
cordova build android

# Generated APK location:
# platforms/android/app/build/outputs/apk/debug/app-debug.apk
```

## Option 3: Progressive Web App (PWA) - No APK needed

### Add Service Worker
```javascript
// sw.js
const CACHE_NAME = 'kanji-widgets-v1';
const urlsToCache = [
    '/',
    '/styles.css',
    '/script.js',
    '/kanji-data.js',
    '/audio-manager.js',
    '/storage-manager.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});
```

### Add Web App Manifest
```json
// manifest.json
{
    "name": "KanjiWidgets",
    "short_name": "Kanji",
    "description": "Japanese Kanji Learning App",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#6200EE",
    "theme_color": "#6200EE",
    "icons": [
        {
            "src": "icon-192.png",
            "sizes": "192x192",
            "type": "image/png"
        }
    ]
}
```

## Next Steps

1. **Choose your preferred method** (WebView wrapper is simplest)
2. **Test on Android device** using USB debugging
3. **Sign APK** for distribution (if needed)
4. **Upload to Google Play Store** (optional)

## Files needed for Android conversion

- All current web files (HTML, CSS, JS)
- Android Studio project structure
- Icons in various sizes (48dp, 72dp, 96dp, 144dp, 192dp)
- Splash screen images

## Additional Resources

For more detailed implementation examples, see the `android-example/` directory which contains complete project templates for each approach.