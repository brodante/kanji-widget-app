# Contributing to KanjiWidgets

Thank you for your interest in contributing to KanjiWidgets! This document explains how to set up the development environment and contribute code.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Getting Started](#getting-started)
- [Code Style](#code-style)
- [Submitting Changes](#submitting-changes)
- [Testing](#testing)
- [Documentation](#documentation)

---

## Code of Conduct

- Be respectful and inclusive
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy toward other community members

---

## Development Setup

### Prerequisites

- Node.js 16+ installed
- npm or yarn package manager
- Git installed
- Code editor (VS Code recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/brodante/kanji-widget-app.git
cd kanji-widget-app

# Install dependencies
npm install

# Start development server
npm start
```

### Project Structure

```
kanji-widget-app/
├── index.html              # Main HTML file
├── script.js               # Core application logic
├── styles.css              # All theme styles
├── storage-manager.js      # LocalStorage abstraction
├── audio-manager.js        # Audio playback system
├── kanji-data.js           # Database loader
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── server.js               # Dev server
├── package.json            # Dependencies
├── database/               # JSON data files
├── assets/                 # Static assets
│   ├── audio/              # MP3 files
│   ├── icons/              # SVG icons
│   └── dev-themes/         # Preset backgrounds
└── docs/                   # Documentation
```

---

## Getting Started

### Creating a New Feature

1. **Checkout a new branch:**

    ```bash
    git checkout cline-dev
    git checkout -b feature/your-feature-name
    ```

2. **Implement your feature:**
    - Follow the code style guidelines
    - Add tests if applicable
    - Update documentation

3. **Test locally:**

    ```bash
    npm start
    # Open http://localhost:3000 in your browser
    ```

4. **Commit your changes:**

    ```bash
    git commit -m "feat: add your feature description"
    ```

5. **Push to GitHub:**

    ```bash
    git push origin feature/your-feature-name
    ```

6. **Create a Pull Request:**
    - Go to GitHub
    - Create a PR from your branch to `cline-dev`
    - Fill in the PR template

---

## Code Style

### JavaScript

We use **ESLint** and **Prettier** to enforce consistent code style.

**Key Rules:**

- Use 2 spaces for indentation
- Use single quotes (`'`), not double quotes (`"`)
- Always use `const` or `let`, never `var`
- Use arrow functions for callbacks
- Use template literals for string interpolation
- Use semicolons
- Avoid `console.log` in production code

**Example:**

```javascript
// ✅ Good
const kanji = data.find((item) => item.id === id);
const message = `Loaded ${kanji.length} kanji`;
return message;

// ❌ Bad
var kanji = data.find(function (item) {
    return item.id == id;
});
console.log('Loaded ' + kanji.length + ' kanji');
```

### CSS

- Use CSS custom properties (`:root { --primary-color: ... }`)
- Use kebab-case for class names
- Add comments for large sections
- Document all custom properties

### HTML

- Use semantic HTML5 elements
- Add proper ARIA labels for accessibility
- Keep line length reasonable (< 100 chars)
- Use proper indentation

### Git Commit Messages

Use the Conventional Commits format:

```
type(scope): description

body (optional)

footer (optional)
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples:**

```
feat(srs): add spaced repetition algorithm
fix(widget): correct kanji display issue
docs: update contributing guide
refactor(audio): modularize audio system
```

---

## Submitting Changes

### Pull Request Template

```markdown
## Description

[Describe your changes]

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

- [ ] Tested locally
- [ ] Added/updated tests
- [ ] Verified on multiple browsers

## Screenshots (if applicable)

[Add screenshots for UI changes]

## Issues Fixed

Fixes #[issue number]
```

### PR Checklist

Before submitting, ensure:

- [ ] Code follows project style
- [ ] Tests pass (if applicable)
- [ ] Documentation updated
- [ ] No console errors
- [ ] No ESLint errors (`npm run lint`)

---

## Testing

### Running Tests

```bash
npm test
```

### Writing Tests

- Test each new feature
- Test edge cases
- Test error handling
- Aim for 70%+ coverage

### Manual Testing Checklist

- [ ] Works on Chrome/Edge
- [ ] Works on Firefox
- [ ] Works on Safari
- [ ] Works on mobile browsers
- [ ] No console errors
- [ ] Performance is acceptable

---

## Documentation

### Updating Documentation

- Update README.md if user-facing changes
- Update TODO-CLINE-DEV.md if features change
- Add inline comments for complex logic
- Document new APIs

### API Documentation

For new public functions, add JSDoc comments:

```javascript
/**
 * Load kanji data for a specific level
 * @param {string} level - JLPT level (N5, N4, N3, N2, N1, Hiragana, Katakana)
 * @returns {Promise<Array>} Array of kanji objects
 */
async function loadKanjiData(level) {
    // implementation
}
```

---

## Questions?

- Open an issue on GitHub
- Check existing documentation
- Review example PRs for style guidance

---

**Thank you for contributing! 🎉**
