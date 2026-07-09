document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. INFERNO COLORMAP
  // ==========================================
  function buildInfernoColormap() {
    const stops = [
      [0,    [0, 0, 4]],
      [0.13, [40, 11, 84]],
      [0.25, [101, 21, 110]],
      [0.38, [159, 42, 99]],
      [0.5,  [212, 72, 66]],
      [0.63, [245, 125, 21]],
      [0.75, [250, 193, 39]],
      [0.88, [252, 253, 95]],
      [1.0,  [252, 255, 164]],
    ];
    const cmap = new Array(256);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let lo = 0;
      for (let s = 0; s < stops.length - 1; s++) {
        if (t >= stops[s][0] && t <= stops[s + 1][0]) { lo = s; break; }
      }
      const [t0, c0] = stops[lo];
      const [t1, c1] = stops[lo + 1];
      const f = (t - t0) / (t1 - t0);
      cmap[i] = [
        Math.round(c0[0] + f * (c1[0] - c0[0])),
        Math.round(c0[1] + f * (c1[1] - c0[1])),
        Math.round(c0[2] + f * (c1[2] - c0[2])),
      ];
    }
    return cmap;
  }
  const infernoMap = buildInfernoColormap();

  // ==========================================
  // 2. CANVAS RENDERER
  // ==========================================
  const Renderer = {
    renderHeatmap(canvas, T, nx, ny, mask, vmin, vmax, colormap) {
      const ctx = canvas.getContext('2d', { alpha: false });
      
      // We size the canvas exactly to nx*ny, CSS handles scaling
      if (canvas.width !== nx) canvas.width = nx;
      if (canvas.height !== ny) canvas.height = ny;
      
      const imgData = ctx.createImageData(nx, ny);
      const data = imgData.data;
      
      const range = vmax - vmin;
      const safeRange = range > 0 ? range : 1;
      
      for (let k = 0; k < nx * ny; k++) {
        const idx = k * 4;
        if (mask[k] === 0) {
          // Void cell
          data[idx] = 40;     // R
          data[idx+1] = 40;   // G
          data[idx+2] = 60;   // B
          data[idx+3] = 255;  // A
        } else {
          // Heat cell
          let norm = (T[k] - vmin) / safeRange;
          if (norm < 0) norm = 0;
          if (norm > 1) norm = 1;
          const cIdx = Math.floor(norm * 255);
          const color = colormap[cIdx];
          
          data[idx] = color[0];
          data[idx+1] = color[1];
          data[idx+2] = color[2];
          data[idx+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    },
    
    renderColorbar(canvas, vmin, vmax, colormap) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;
      
      const imgData = ctx.createImageData(w, h);
      const data = imgData.data;
      
      for (let y = 0; y < h; y++) {
        // y=0 is vmax, y=h-1 is vmin
        const norm = 1.0 - (y / (h - 1));
        const cIdx = Math.floor(norm * 255);
        const color = colormap[cIdx];
        
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          data[idx] = color[0];
          data[idx+1] = color[1];
          data[idx+2] = color[2];
          data[idx+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      
      // Update labels
      document.getElementById('colorbar-max').textContent = vmax.toFixed(1);
      document.getElementById('colorbar-mid').textContent = ((vmin + vmax) / 2).toFixed(1);
      document.getElementById('colorbar-min').textContent = vmin.toFixed(1);
    },
    
    renderGeometryPreview(canvas, mask, nx, ny, internalBCMask, internalBCTemps) {
      const ctx = canvas.getContext('2d');
      // Set to domain size, scale up via CSS
      if (canvas.width !== nx) canvas.width = nx;
      if (canvas.height !== ny) canvas.height = ny;
      
      const imgData = ctx.createImageData(nx, ny);
      const data = imgData.data;
      
      for (let k = 0; k < nx * ny; k++) {
        const idx = k * 4;
        if (mask[k] === 1) {
          if (internalBCMask && internalBCMask[k] === 1) {
            const temp = internalBCTemps[k];
            // Simple coloring: > 50 is warm/hot (red), < 50 is cool (blue)
            if (temp > 50) {
              data[idx] = 255; data[idx+1] = 50; data[idx+2] = 50; data[idx+3] = 255;
            } else {
              data[idx] = 50; data[idx+1] = 150; data[idx+2] = 255; data[idx+3] = 255;
            }
          } else {
            // Default active region
            data[idx] = 0;      // R
            data[idx+1] = 180;  // G
            data[idx+2] = 255;  // B
            data[idx+3] = 255;
          }
        } else {
          // Void region
          data[idx] = 30;
          data[idx+1] = 30;
          data[idx+2] = 50;
          data[idx+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }
  };

  // ==========================================
  // 3. APP STATE
  // ==========================================
  let appState = {
    nx: 100, ny: 100,
    lx: 0.1, ly: 0.1,
    alphaX: 9.7e-5, alphaY: 9.7e-5,
    mask: null,
    bcConfig: null,
    simTime: 0.5,
    initTemp: 25,
    dt: 0,
    nSteps: 0,
    snapshots: [],
    currentFrame: 0,
    isPlaying: false,
    playbackSpeed: 1,
    isRunning: false,
    imageData: null,
    imageWidth: 0,
    imageHeight: 0,
    vmin: 0,
    vmax: 100,
    internalBCMask: null,
    internalBCTemps: null
  };

  let playbackReqId = null;
  let lastFrameTime = 0;

  // ==========================================
  // 4. UI ELEMENT CACHE
  // ==========================================
  const els = {
    matSelect: document.getElementById('material-select'),
    matInfo: document.getElementById('material-info'),
    matAlpha: document.getElementById('mat-alpha'),
    matK: document.getElementById('mat-k'),
    matRho: document.getElementById('mat-rho'),
    matCp: document.getElementById('mat-cp'),
    customMatInputs: document.getElementById('custom-material-inputs'),
    customAlphaX: document.getElementById('custom-alpha-x'),
    customAlphaY: document.getElementById('custom-alpha-y'),
    
    gridNx: document.getElementById('grid-nx'),
    gridNy: document.getElementById('grid-ny'),
    domainLx: document.getElementById('domain-lx'),
    domainLy: document.getElementById('domain-ly'),
    
    shapeSelect: document.getElementById('shape-select'),
    shapeParams: document.getElementById('shape-params'),
    paramRadius: document.getElementById('param-radius'),
    paramRadiusVal: document.getElementById('param-radius-val'),
    paramRadiusGroup: document.getElementById('param-radius-group'),
    paramWidth: document.getElementById('param-width'),
    paramWidthVal: document.getElementById('param-width-val'),
    paramWidthGroup: document.getElementById('param-width-group'),
    paramHeight: document.getElementById('param-height'),
    paramHeightVal: document.getElementById('param-height-val'),
    paramHeightGroup: document.getElementById('param-height-group'),
    paramOuterR: document.getElementById('param-outer-r'),
    paramOuterRVal: document.getElementById('param-outer-r-val'),
    paramOuterRGroup: document.getElementById('param-outer-r-group'),
    paramInnerR: document.getElementById('param-inner-r'),
    paramInnerRVal: document.getElementById('param-inner-r-val'),
    paramInnerRGroup: document.getElementById('param-inner-r-group'),
    imageUploadGroup: document.getElementById('image-upload-group'),
    imageUpload: document.getElementById('image-upload'),
    imageFilename: document.getElementById('image-filename'),
    imageThreshold: document.getElementById('image-threshold'),
    imageThresholdVal: document.getElementById('image-threshold-val'),
    imageInvert: document.getElementById('image-invert'),
    geoPreview: document.getElementById('geometry-preview'),
    brushTemp: document.getElementById('brush-temp'),
    brushSize: document.getElementById('brush-size'),
    clearPaintBtn: document.getElementById('clear-paint-btn'),
    
    bc: {
      top: { type: document.getElementById('bc-top-type'), val: document.getElementById('bc-top-value'), unit: document.getElementById('bc-top-unit') },
      bot: { type: document.getElementById('bc-bottom-type'), val: document.getElementById('bc-bottom-value'), unit: document.getElementById('bc-bottom-unit') },
      left: { type: document.getElementById('bc-left-type'), val: document.getElementById('bc-left-value'), unit: document.getElementById('bc-left-unit') },
      right: { type: document.getElementById('bc-right-type'), val: document.getElementById('bc-right-value'), unit: document.getElementById('bc-right-unit') },
    },
    
    simTime: document.getElementById('sim-time'),
    initTemp: document.getElementById('init-temp'),
    runBtn: document.getElementById('run-btn'),
    resetBtn: document.getElementById('reset-btn'),
    progContainer: document.getElementById('progress-container'),
    progFill: document.getElementById('progress-fill'),
    progText: document.getElementById('progress-text'),
    
    heatmapCanvas: document.getElementById('heatmap-canvas'),
    colorbarCanvas: document.getElementById('colorbar-canvas'),
    
    playback: document.getElementById('playback-controls'),
    playBtn: document.getElementById('play-btn'),
    playIcon: document.getElementById('play-icon'),
    stepBackBtn: document.getElementById('step-back-btn'),
    stepFwdBtn: document.getElementById('step-fwd-btn'),
    frameSlider: document.getElementById('frame-slider'),
    speedSelect: document.getElementById('playback-speed'),
    
    statStep: document.getElementById('stat-step'),
    statTime: document.getElementById('stat-time'),
    statDt: document.getElementById('stat-dt'),
    statTmin: document.getElementById('stat-tmin'),
    statTmax: document.getElementById('stat-tmax'),
    statStatus: document.getElementById('stat-status'),
    cflBadge: document.getElementById('cfl-badge'),
    cflText: document.getElementById('cfl-text'),
  };

  // ==========================================
  // 5. EVENT HANDLERS & LOGIC
  // ==========================================

  function updateMaterial() {
    const val = els.matSelect.value;
    if (val === 'custom') {
      els.customMatInputs.style.display = 'block';
      els.matInfo.style.display = 'none';
      appState.alphaX = parseFloat(els.customAlphaX.value);
      appState.alphaY = parseFloat(els.customAlphaY.value);
    } else {
      els.customMatInputs.style.display = 'none';
      els.matInfo.style.display = 'flex';
      const mat = ThermalEngine.getMaterial(val);
      els.matAlpha.textContent = mat.alpha.toExponential(2) + ' m²/s';
      els.matK.textContent = mat.k + ' W/(m·K)';
      els.matRho.textContent = mat.rho + ' kg/m³';
      els.matCp.textContent = mat.cp + ' J/(kg·K)';
      appState.alphaX = mat.alpha;
      appState.alphaY = mat.alpha;
    }
    checkCFL();
  }

  function updateShapeUI() {
    const shape = els.shapeSelect.value;
    els.paramRadiusGroup.style.display = 'none';
    els.paramWidthGroup.style.display = 'none';
    els.paramHeightGroup.style.display = 'none';
    els.paramOuterRGroup.style.display = 'none';
    els.paramInnerRGroup.style.display = 'none';
    els.imageUploadGroup.style.display = 'none';
    els.shapeParams.style.display = 'block';

    switch(shape) {
      case 'plate':
        els.shapeParams.style.display = 'none';
        break;
      case 'disc':
        els.paramRadiusGroup.style.display = 'flex';
        break;
      case 'beam':
        els.paramWidthGroup.style.display = 'flex';
        els.paramHeightGroup.style.display = 'flex';
        break;
      case 'ring':
        els.paramOuterRGroup.style.display = 'flex';
        els.paramInnerRGroup.style.display = 'flex';
        break;
      case 'image':
        els.shapeParams.style.display = 'none';
        els.imageUploadGroup.style.display = 'block';
        break;
    }
    generateMask();
  }

  function generateMask() {
    const shape = els.shapeSelect.value;
    const nx = appState.nx;
    const ny = appState.ny;

    if (shape === 'plate') {
      appState.mask = ThermalEngine.makePlate(nx, ny);
    } else if (shape === 'disc') {
      const r = parseFloat(els.paramRadius.value);
      appState.mask = ThermalEngine.makeDisc(nx, ny, r);
    } else if (shape === 'beam') {
      const w = parseFloat(els.paramWidth.value);
      const h = parseFloat(els.paramHeight.value);
      appState.mask = ThermalEngine.makeBeam(nx, ny, w, h);
    } else if (shape === 'ring') {
      const or = parseFloat(els.paramOuterR.value);
      const ir = parseFloat(els.paramInnerR.value);
      appState.mask = ThermalEngine.makeRing(nx, ny, or, ir);
    } else if (shape === 'image') {
      if (appState.imageData) {
        const thresh = parseInt(els.imageThreshold.value);
        const invert = els.imageInvert.checked;
        appState.mask = ThermalEngine.maskFromImageData(appState.imageData, appState.imageWidth, appState.imageHeight, nx, ny, thresh, invert);
      } else {
        // Fallback plate if no image
        appState.mask = ThermalEngine.makePlate(nx, ny);
      }
    }
    
    // Reset paint arrays
    appState.internalBCMask = new Uint8Array(nx * ny);
    appState.internalBCTemps = new Float64Array(nx * ny);
    
    Renderer.renderGeometryPreview(els.geoPreview, appState.mask, nx, ny, appState.internalBCMask, appState.internalBCTemps);
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    els.imageFilename.textContent = file.name;
    
    const reader = new FileReader();
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        // Draw to offscreen canvas to get data
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        appState.imageData = ctx.getImageData(0, 0, img.width, img.height).data;
        appState.imageWidth = img.width;
        appState.imageHeight = img.height;
        generateMask();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  function updateBCUnits() {
    ['top', 'bot', 'left', 'right'].forEach(key => {
      const bc = els.bc[key];
      bc.unit.textContent = bc.type.value === 'dirichlet' ? '°C' : 'W/m²';
    });
  }

  function compileBCFunction(str) {
    let expr = String(str).replace(/Math\./g, '')
                          .replace(/sin/g, 'Math.sin')
                          .replace(/cos/g, 'Math.cos')
                          .replace(/PI/g, 'Math.PI')
                          .replace(/exp/g, 'Math.exp');
    try {
      const fn = new Function("x", "y", "t", "return Number(" + expr + ");");
      fn(0, 0, 0); // test eval
      return fn;
    } catch (e) {
      console.warn("Invalid math expression:", str);
      return new Function("x", "y", "t", "return 0;");
    }
  }

  function getBCConfig() {
    return {
      top: { type: els.bc.top.type.value, fn: compileBCFunction(els.bc.top.val.value) },
      bottom: { type: els.bc.bot.type.value, fn: compileBCFunction(els.bc.bot.val.value) },
      left: { type: els.bc.left.type.value, fn: compileBCFunction(els.bc.left.val.value) },
      right: { type: els.bc.right.type.value, fn: compileBCFunction(els.bc.right.val.value) },
    };
  }

  function checkCFL() {
    const dx = appState.lx / (appState.nx - 1);
    const dy = appState.ly / (appState.ny - 1);
    const maxDt = ThermalEngine.computeMaxDt(appState.alphaX, appState.alphaY, dx, dy, 0.9);
    
    els.cflBadge.classList.remove('unstable');
    els.cflText.textContent = `CFL: max Δt = ${maxDt.toExponential(2)}s`;
    return maxDt;
  }

  function updateGridDomain() {
    appState.nx = parseInt(els.gridNx.value);
    appState.ny = parseInt(els.gridNy.value);
    appState.lx = parseFloat(els.domainLx.value);
    appState.ly = parseFloat(els.domainLy.value);
    checkCFL();
    generateMask();
  }

  function toggleInputs(disabled) {
    const inputs = document.querySelectorAll('.sidebar input, .sidebar select, .sidebar button');
    inputs.forEach(el => {
      // Don't disable the reset button if we just want to reset while running
      if (el.id !== 'reset-btn') el.disabled = disabled;
    });
  }

  async function runSimulation() {
    toggleInputs(true);
    els.runBtn.disabled = true;
    els.progContainer.style.display = 'flex';
    els.progFill.style.width = '0%';
    els.progText.textContent = '0%';
    els.statStatus.textContent = 'Running...';
    els.playback.style.display = 'none';
    stopPlayback();

    appState.bcConfig = getBCConfig();
    appState.simTime = parseFloat(els.simTime.value);
    appState.initTemp = parseFloat(els.initTemp.value);
    
    const dx = appState.lx / (appState.nx - 1);
    const dy = appState.ly / (appState.ny - 1);
    const dt = ThermalEngine.computeMaxDt(appState.alphaX, appState.alphaY, dx, dy, 0.9);
    const nSteps = Math.ceil(appState.simTime / dt);
    const snapshotInterval = Math.max(1, Math.floor(nSteps / 50));

    appState.dt = dt;
    els.statDt.textContent = dt.toExponential(2) + ' s';

    const config = {
      nx: appState.nx,
      ny: appState.ny,
      dx, dy,
      alphaX: appState.alphaX,
      alphaY: appState.alphaY,
      dt,
      nSteps,
      mask: appState.mask,
      internalBCMask: appState.internalBCMask,
      internalBCTemps: appState.internalBCTemps,
      bcConfig: appState.bcConfig,
      initTemp: appState.initTemp,
      snapshotInterval,
      onProgress: (p) => {
        const pct = Math.round(p * 100);
        els.progFill.style.width = `${pct}%`;
        els.progText.textContent = `${pct}%`;
      }
    };

    const results = await ThermalEngine.run(config);
    
    appState.snapshots = results.snapshots;
    appState.nSteps = results.nSteps;
    
    // Find global vmin/vmax across all snapshots
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let s of appState.snapshots) {
      for (let k = 0; k < s.T.length; k++) {
        if (appState.mask[k] === 1) { // Only check active cells
          const v = s.T[k];
          if (v < vmin) vmin = v;
          if (v > vmax) vmax = v;
        }
      }
    }
    // Pad slightly if they are equal
    if (Math.abs(vmax - vmin) < 1e-6) {
      vmin -= 1;
      vmax += 1;
    }
    appState.vmin = vmin;
    appState.vmax = vmax;

    els.statStatus.textContent = 'Complete';
    els.progFill.style.width = '100%';
    els.progText.textContent = '100%';
    
    els.playback.style.display = 'flex';
    els.frameSlider.max = appState.snapshots.length - 1;
    els.frameSlider.value = 0;
    
    toggleInputs(false);
    
    renderFrame(0);
  }

  function resetApp() {
    stopPlayback();
    appState.snapshots = [];
    els.playback.style.display = 'none';
    els.progContainer.style.display = 'none';
    els.statStatus.textContent = 'Idle';
    els.statStep.textContent = '0';
    els.statTime.textContent = '0.000 s';
    els.statTmin.textContent = '—';
    els.statTmax.textContent = '—';
    
    // Clear canvas
    const ctx = els.heatmapCanvas.getContext('2d');
    ctx.clearRect(0, 0, els.heatmapCanvas.width, els.heatmapCanvas.height);
    
    toggleInputs(false);
  }

  function renderFrame(index) {
    if (appState.snapshots.length === 0) return;
    if (index < 0) index = 0;
    if (index >= appState.snapshots.length) index = appState.snapshots.length - 1;
    
    appState.currentFrame = index;
    els.frameSlider.value = index;
    
    const snap = appState.snapshots[index];
    
    Renderer.renderHeatmap(els.heatmapCanvas, snap.T, appState.nx, appState.ny, appState.mask, appState.vmin, appState.vmax, infernoMap);
    Renderer.renderColorbar(els.colorbarCanvas, appState.vmin, appState.vmax, infernoMap);
    
    // Calculate local min/max for stats
    let lmin = Infinity, lmax = -Infinity;
    for (let k = 0; k < snap.T.length; k++) {
      if (appState.mask[k] === 1) {
        if (snap.T[k] < lmin) lmin = snap.T[k];
        if (snap.T[k] > lmax) lmax = snap.T[k];
      }
    }
    
    els.statStep.textContent = snap.step;
    els.statTime.textContent = snap.time.toFixed(4) + ' s';
    els.statTmin.textContent = lmin !== Infinity ? lmin.toFixed(1) + ' °C' : '—';
    els.statTmax.textContent = lmax !== -Infinity ? lmax.toFixed(1) + ' °C' : '—';
  }

  function stepBack() {
    stopPlayback();
    renderFrame(appState.currentFrame - 1);
  }

  function stepFwd() {
    stopPlayback();
    renderFrame(appState.currentFrame + 1);
  }

  function onSliderInput() {
    stopPlayback();
    renderFrame(parseInt(els.frameSlider.value));
  }

  function togglePlayback() {
    if (appState.isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  function startPlayback() {
    if (appState.snapshots.length === 0) return;
    if (appState.currentFrame >= appState.snapshots.length - 1) {
      appState.currentFrame = 0; // Loop back to start if at end
    }
    appState.isPlaying = true;
    els.playIcon.textContent = '⏸';
    lastFrameTime = performance.now();
    playbackReqId = requestAnimationFrame(playbackLoop);
  }

  function stopPlayback() {
    appState.isPlaying = false;
    els.playIcon.textContent = '▶';
    if (playbackReqId) {
      cancelAnimationFrame(playbackReqId);
      playbackReqId = null;
    }
  }

  function playbackLoop(time) {
    if (!appState.isPlaying) return;
    
    const speed = parseFloat(els.speedSelect.value);
    // Base speed: 10 frames per second at 1x
    const frameInterval = 100 / speed; 
    
    if (time - lastFrameTime > frameInterval) {
      let nextFrame = appState.currentFrame + 1;
      if (nextFrame >= appState.snapshots.length) {
        stopPlayback();
        return;
      }
      renderFrame(nextFrame);
      lastFrameTime = time;
    }
    
    playbackReqId = requestAnimationFrame(playbackLoop);
  }

  // ==========================================
  // 6. EVENT LISTENER BINDINGS
  // ==========================================
  
  let isPainting = false;
  
  function paintOnCanvas(e) {
    if (!isPainting) return;
    const rect = els.geoPreview.getBoundingClientRect();
    const scaleX = els.geoPreview.width / rect.width;
    const scaleY = els.geoPreview.height / rect.height;
    
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    
    const nx = appState.nx;
    const ny = appState.ny;
    const size = parseInt(els.brushSize.value);
    const temp = parseFloat(els.brushTemp.value);
    
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    
    let changed = false;
    for (let dy = -size; dy <= size; dy++) {
      for (let dx = -size; dx <= size; dx++) {
        if (dx * dx + dy * dy <= size * size) {
          const ix = cx + dx;
          const iy = cy + dy;
          if (ix >= 0 && ix < nx && iy >= 0 && iy < ny) {
            const idx = iy * nx + ix;
            if (appState.mask[idx] === 1) { // Only paint on active mask
              appState.internalBCMask[idx] = 1;
              appState.internalBCTemps[idx] = temp;
              changed = true;
            }
          }
        }
      }
    }
    
    if (changed) {
      Renderer.renderGeometryPreview(els.geoPreview, appState.mask, nx, ny, appState.internalBCMask, appState.internalBCTemps);
    }
  }

  els.geoPreview.addEventListener('mousedown', (e) => { isPainting = true; paintOnCanvas(e); });
  els.geoPreview.addEventListener('mousemove', paintOnCanvas);
  window.addEventListener('mouseup', () => { isPainting = false; });
  
  els.clearPaintBtn.addEventListener('click', () => {
    appState.internalBCMask.fill(0);
    Renderer.renderGeometryPreview(els.geoPreview, appState.mask, appState.nx, appState.ny, appState.internalBCMask, appState.internalBCTemps);
  });

  els.matSelect.addEventListener('change', updateMaterial);
  els.customAlphaX.addEventListener('input', updateMaterial);
  els.customAlphaY.addEventListener('input', updateMaterial);
  
  els.shapeSelect.addEventListener('change', updateShapeUI);
  
  // Range inputs update label & regenerate mask
  [ 
    [els.paramRadius, els.paramRadiusVal],
    [els.paramWidth, els.paramWidthVal],
    [els.paramHeight, els.paramHeightVal],
    [els.paramOuterR, els.paramOuterRVal],
    [els.paramInnerR, els.paramInnerRVal],
    [els.imageThreshold, els.imageThresholdVal]
  ].forEach(([input, label]) => {
    input.addEventListener('input', () => {
      // format to 2 decimal places except threshold which is int
      if(input.id === 'image-threshold') {
        label.textContent = input.value;
      } else {
        label.textContent = parseFloat(input.value).toFixed(2);
      }
      generateMask();
    });
  });

  els.imageUpload.addEventListener('change', handleImageUpload);
  els.imageInvert.addEventListener('change', generateMask);
  
  ['top', 'bot', 'left', 'right'].forEach(key => {
    els.bc[key].type.addEventListener('change', updateBCUnits);
  });
  
  els.gridNx.addEventListener('change', updateGridDomain);
  els.gridNy.addEventListener('change', updateGridDomain);
  els.domainLx.addEventListener('change', updateGridDomain);
  els.domainLy.addEventListener('change', updateGridDomain);
  
  els.runBtn.addEventListener('click', runSimulation);
  els.resetBtn.addEventListener('click', resetApp);
  
  els.playBtn.addEventListener('click', togglePlayback);
  els.stepBackBtn.addEventListener('click', stepBack);
  els.stepFwdBtn.addEventListener('click', stepFwd);
  els.frameSlider.addEventListener('input', onSliderInput);

  // ==========================================
  // 7. INIT
  // ==========================================
  updateMaterial();
  updateBCUnits();
  updateShapeUI(); // This also generates the mask
  
});
