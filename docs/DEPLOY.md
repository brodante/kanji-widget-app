# GitHub Pages Deployment Guide

## Quick Deploy to GitHub Pages

### Method 1: Automatic GitHub Pages Setup

1. **Push your repository to GitHub**:
   ```bash
   git add .
   git commit -m "Deploy KanjiWidgets to GitHub Pages"
   git push origin main
   ```

2. **Enable GitHub Pages**:
   - Go to your repository on GitHub
   - Click **Settings** tab
   - Scroll down to **Pages** section (left sidebar)
   - Under **Source**, select "Deploy from a branch"
   - Choose **main** branch and **/ (root)** folder
   - Click **Save**

3. **Access your app**:
   - Your app will be available at: `https://[username].github.io/[repository-name]`
   - Example: `https://brodante.github.io/kanji-widgets-app`

### Method 2: GitHub Actions (Recommended)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Checkout
      uses: actions/checkout@v3
      
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: npm install
      
    - name: Deploy to GitHub Pages
      uses: peaceiris/actions-gh-pages@v3
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        publish_dir: .
        exclude_assets: 'node_modules,.*'
```

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