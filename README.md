# ThermalFlux Web App 🔥

A stunning, fully browser-based high-precision 2D transient heat conduction solver for anisotropic media.

This application runs **entirely in the browser** using highly optimized JavaScript (`Float64Array`) and requires no backend, Python, or build step. It's ready to be deployed directly to GitHub Pages!

## Features
- **Pure JavaScript FDM Engine:** Vectorized-style calculations mirroring the speed of NumPy, running directly in the browser.
- **Custom Shape Handling:** Simulate heat in Discs, Rings, Beams, or Plates.
- **Image-to-Mask Uploads:** Upload any PNG or JPG to create a custom computational domain instantly.
- **Anisotropic Materials:** Built-in engineering materials + custom inputs.
- **Stunning UI:** Premium dark theme with an Inferno colormap visualization and playback controls.

## How to Deploy to GitHub Pages

Since this is a static website (HTML/CSS/JS), deploying to GitHub is incredibly easy:

1. **Create a new repository** on GitHub (e.g., named `ThermalFlux`).
2. **Push your code** to the repository using these commands in your terminal:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of ThermalFlux Web App"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/ThermalFlux.git
   git push -u origin main
   ```
3. **Enable GitHub Pages:**
   - Go to your repository settings on GitHub.
   - Click on **Pages** in the left sidebar.
   - Under **Build and deployment** -> **Source**, select `Deploy from a branch`.
   - Under **Branch**, select `main` and `/ (root)` folder, then click **Save**.

Your website will be live in a few minutes at `https://YOUR_USERNAME.github.io/ThermalFlux/`!

## File Structure
- `index.html` - The main UI layout.
- `style.css` - Premium dark-theme styling.
- `thermal-engine.js` - The pure JavaScript FDM computation engine.
- `app.js` - DOM controller and visualization renderer.
