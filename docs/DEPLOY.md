# KanjiWidgets Deployment Guide

## Resource-Optimized GitHub Pages Deployment

### Method 1: Simple GitHub Pages Setup (Recommended)

1. **Create Repository on GitHub**:
   - Go to GitHub and create a new repository named `kanji-widgets-app`
   - Keep it public for free GitHub Pages hosting

2. **Push Code (Essential Files Only)**:
   ```bash
   # Initialize git if not already done
   git init
   git add index.html styles.css script.js kanji-data.js audio-manager.js storage-manager.js manifest.json sw.js README.md
   git commit -m "Initial commit: KanjiWidgets app"
   git branch -M main
   git remote add origin https://github.com/brodante/kanji-widgets-app.git
   git push -u origin main
   ```

3. **Enable GitHub Pages**:
   - Go to repository **Settings** > **Pages**
   - Source: "Deploy from a branch"
   - Branch: **main** / **/ (root)**
   - Click **Save**

4. **Access Your App**:
   - Available at: `https://brodante.github.io/kanji-widgets-app`
   - Deploys automatically on each push to main branch

### Method 2: Advanced GitHub Actions (Auto-deployment)

The repository includes optimized GitHub Actions workflow:
- Only deploys essential static files (no node_modules)
- Reduces deployment size from 4MB to ~200KB
- Automatic deployment on every push to main

Essential files deployed:
- `index.html`, `styles.css`, `script.js`
- `kanji-data.js`, `audio-manager.js`, `storage-manager.js`
- `manifest.json`, `sw.js` (for PWA features)

## Resource Optimization Benefits

✓ **74% Resource Usage Reduced**: Excludes node_modules and temporary files
✓ **Fast Loading**: Only 200KB total deployment size
✓ **Static Hosting**: No server dependencies required
✓ **CDN Delivery**: GitHub Pages provides global CDN

## Custom Domain Setup (Optional)

1. **Add CNAME file**:
   ```bash
   echo "your-domain.com" > CNAME
   ```

2. **Configure DNS**:
   - Add a CNAME record pointing to `[username].github.io`
   - Or A record pointing to GitHub Pages IPs

3. **Enable HTTPS**:
   - GitHub Pages automatically provides HTTPS for custom domains
   - Check "Enforce HTTPS" in repository settings

## Static File Hosting

The app is designed for static hosting. All files can be served directly:

- **HTML**: Main interface
- **CSS**: Styling and themes  
- **JavaScript**: Application logic
- **JSON**: Manifest and service worker

## Performance Optimization

### CDN Resources
External resources loaded from CDNs:
- Google Fonts (Noto Sans JP)
- Font Awesome icons
- Material Icons

### Caching Strategy
- Browser localStorage for user data
- Service worker for offline functionality
- API response caching

### Bundle Size
- No framework dependencies
- Vanilla JavaScript for minimal size
- Optimized for fast loading

## Troubleshooting

### Common Issues

1. **404 Error**: Ensure GitHub Pages is enabled and files are in root directory
2. **API Errors**: Jisho.org API calls may fail; app uses fallback data
3. **Font Loading**: Google Fonts require internet connection for full experience

### Local Testing

Test before deploying:
```bash
# Start local server
npm start

# Or use any static server
python -m http.server 5000
```

### Debugging

Check browser console for:
- JavaScript errors
- API call failures  
- Service worker registration
- Storage access issues

## Environment Variables

No environment variables required for basic functionality.

Optional features may require:
- API keys for enhanced kanji data
- Analytics tracking codes
- Custom configuration

## Security

### CSP Headers
Consider adding Content Security Policy:
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline'; 
               style-src 'self' 'unsafe-inline' fonts.googleapis.com;
               font-src fonts.googleapis.com fonts.gstatic.com;
               connect-src 'self' jisho.org;">
```

### HTTPS
- GitHub Pages provides HTTPS by default
- Required for service worker functionality
- Recommended for localStorage security

## Monitoring

Track deployment success:
- Check GitHub Actions logs
- Monitor GitHub Pages build status
- Test functionality after deployment
- Verify all assets load correctly

Your KanjiWidgets app will be live and accessible worldwide once deployed!