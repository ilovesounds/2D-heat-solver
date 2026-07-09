const ThermalEngine = (function() {
  'use strict';
  
  // ==========================================
  // MATERIALS DATABASE
  // ==========================================
  const MATERIALS = {
    aluminum:  { name: 'Aluminum',       alpha: 9.7e-5,   k: 237,  rho: 2700, cp: 900  },
    copper:    { name: 'Copper',          alpha: 1.11e-4,  k: 401,  rho: 8960, cp: 385  },
    steel:     { name: 'Steel (Carbon)',  alpha: 1.172e-5, k: 50.2, rho: 7850, cp: 486  },
    iron:      { name: 'Iron',            alpha: 2.3e-5,   k: 80.2, rho: 7874, cp: 449  },
    titanium:  { name: 'Titanium',        alpha: 9.0e-6,   k: 21.9, rho: 4507, cp: 540  },
    glass:     { name: 'Glass',           alpha: 3.4e-7,   k: 1.0,  rho: 2500, cp: 840  },
  };
  
  function getMaterial(name) {
    const mat = MATERIALS[name.toLowerCase()];
    if (!mat) throw new Error(`Unknown material: ${name}. Available: ${Object.keys(MATERIALS).join(', ')}`);
    return { ...mat, alpha_x: mat.alpha, alpha_y: mat.alpha };
  }
  
  function customMaterial(alpha_x, alpha_y) {
    return { name: 'Custom', alpha: (alpha_x + alpha_y) / 2, alpha_x, alpha_y, k: null, rho: null, cp: null };
  }
  
  function listMaterials() {
    return Object.entries(MATERIALS).map(([key, val]) => ({ key, ...val }));
  }

  // ==========================================
  // GEOMETRY MASK GENERATORS
  // ==========================================
  // All return Float64Array of length ny*nx (row-major)
  
  function makePlate(nx, ny) {
    return new Float64Array(ny * nx).fill(1.0);
  }
  
  function makeDisc(nx, ny, radiusFrac = 0.4, centerX = null, centerY = null) {
    const mask = new Float64Array(ny * nx);
    const cx = centerX !== null ? centerX : (nx - 1) / 2;
    const cy = centerY !== null ? centerY : (ny - 1) / 2;
    const r = radiusFrac * Math.min(nx, ny);
    const r2 = r * r;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const dx = i - cx;
        const dy = j - cy;
        if (dx * dx + dy * dy <= r2) {
          mask[j * nx + i] = 1.0;
        }
      }
    }
    return mask;
  }
  
  function makeBeam(nx, ny, widthFrac = 0.8, heightFrac = 0.3) {
    const mask = new Float64Array(ny * nx);
    const w = widthFrac * nx;
    const h = heightFrac * ny;
    const xLo = Math.round((nx - w) / 2);
    const xHi = Math.round((nx + w) / 2);
    const yLo = Math.round((ny - h) / 2);
    const yHi = Math.round((ny + h) / 2);
    for (let j = yLo; j < yHi; j++) {
      for (let i = xLo; i < xHi; i++) {
        mask[j * nx + i] = 1.0;
      }
    }
    return mask;
  }
  
  function makeRing(nx, ny, outerR = 0.4, innerR = 0.2) {
    const mask = new Float64Array(ny * nx);
    const cx = (nx - 1) / 2;
    const cy = (ny - 1) / 2;
    const scale = Math.min(nx, ny);
    const ro2 = (outerR * scale) ** 2;
    const ri2 = (innerR * scale) ** 2;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const dx = i - cx;
        const dy = j - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 <= ro2 && d2 >= ri2) {
          mask[j * nx + i] = 1.0;
        }
      }
    }
    return mask;
  }
  
  // Create mask from image data (ImageData from canvas)
  // Expects a grayscale-converted Uint8ClampedArray or raw ImageData
  function maskFromImageData(imageData, width, height, nx, ny, threshold = 127, invert = false) {
    // imageData is a Uint8ClampedArray (RGBA), length = width * height * 4
    // First convert to grayscale at source resolution
    const srcGray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = imageData[i * 4];
      const g = imageData[i * 4 + 1];
      const b = imageData[i * 4 + 2];
      srcGray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    
    // Nearest-neighbor resize to (ny, nx) and threshold
    const mask = new Float64Array(ny * nx);
    for (let j = 0; j < ny; j++) {
      const srcJ = Math.min(Math.floor(j * height / ny), height - 1);
      for (let i = 0; i < nx; i++) {
        const srcI = Math.min(Math.floor(i * width / nx), width - 1);
        const val = srcGray[srcJ * width + srcI];
        let bit = val > threshold ? 1.0 : 0.0;
        if (invert) bit = 1.0 - bit;
        mask[j * nx + i] = bit;
      }
    }
    return mask;
  }

  // ==========================================
  // CFL STABILITY
  // ==========================================
  
  function computeMaxDt(alphaX, alphaY, dx, dy, safety = 0.9) {
    const dtMax = 1.0 / (2.0 * (alphaX / (dx * dx) + alphaY / (dy * dy)));
    return safety * dtMax;
  }
  
  function checkStability(alphaX, alphaY, dx, dy, dt) {
    const dtMax = 1.0 / (2.0 * (alphaX / (dx * dx) + alphaY / (dy * dy)));
    return dt <= dtMax;
  }

  // ==========================================
  // BOUNDARY CONDITIONS
  // ==========================================
  
  // bcConfig = { top: {type, fn}, bottom: {type, fn}, left: {type, fn}, right: {type, fn} }
  function applyBoundaryConditions(T, nx, ny, bcConfig, dx, dy, t) {
    // Top edge (row 0, y = 0)
    const top = bcConfig.top;
    for (let i = 0; i < nx; i++) {
      const x = i * dx;
      const v = top.fn(x, 0, t);
      if (top.type === 'dirichlet') T[i] = v;
      else T[i] = T[nx + i] - v * dy;
    }
    
    // Bottom edge (last row, y = (ny-1)*dy)
    const bot = bcConfig.bottom;
    const lastRow = (ny - 1) * nx;
    const prevRow = (ny - 2) * nx;
    const yBot = (ny - 1) * dy;
    for (let i = 0; i < nx; i++) {
      const x = i * dx;
      const v = bot.fn(x, yBot, t);
      if (bot.type === 'dirichlet') T[lastRow + i] = v;
      else T[lastRow + i] = T[prevRow + i] + v * dy;
    }
    
    // Left edge (col 0, x = 0)
    const left = bcConfig.left;
    for (let j = 0; j < ny; j++) {
      const y = j * dy;
      const v = left.fn(0, y, t);
      if (left.type === 'dirichlet') T[j * nx] = v;
      else T[j * nx] = T[j * nx + 1] - v * dx;
    }
    
    // Right edge (last col, x = (nx-1)*dx)
    const right = bcConfig.right;
    const xRight = (nx - 1) * dx;
    for (let j = 0; j < ny; j++) {
      const y = j * dy;
      const v = right.fn(xRight, y, t);
      if (right.type === 'dirichlet') T[j * nx + nx - 1] = v;
      else T[j * nx + nx - 1] = T[j * nx + nx - 2] + v * dx;
    }
  }

  // ==========================================
  // FDM SOLVER STEP
  // ==========================================
  
  function step(T, Tnew, mask, nx, ny, alphaX, alphaY, dx, dy, dt, internalBCMask, internalBCTemps) {
    // T and Tnew are Float64Arrays of length ny*nx (row-major)
    // Copy all values first
    Tnew.set(T);
    
    const rx = alphaX * dt / (dx * dx);
    const ry = alphaY * dt / (dy * dy);
    
    // Update interior cells (j=1..ny-2, i=1..nx-2)
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const idx = j * nx + i;
        Tnew[idx] = T[idx] + 
          rx * (T[idx + 1] - 2 * T[idx] + T[idx - 1]) +   // x-direction: T[j][i+1], T[j][i], T[j][i-1]
          ry * (T[idx + nx] - 2 * T[idx] + T[idx - nx]);   // y-direction: T[j+1][i], T[j][i], T[j-1][i]
      }
    }
    
    // Enforce void cells
    for (let k = 0; k < ny * nx; k++) {
      Tnew[k] *= mask[k];
    }
    
    // Enforce internal painted BCs
    if (internalBCMask && internalBCTemps) {
      for (let k = 0; k < ny * nx; k++) {
        if (internalBCMask[k] === 1) {
          Tnew[k] = internalBCTemps[k];
        }
      }
    }
  }

  // ==========================================
  // SIMULATION RUNNER
  // ==========================================
  
  // Runs the simulation and calls onProgress periodically.
  // Returns a promise that resolves with { snapshots, dt, nSteps }.
  // snapshots is an array of { step, time, T: Float64Array } objects.
  //
  // Uses setTimeout chunking to avoid blocking the UI thread.
  function run(config) {
    const { nx, ny, dx, dy, alphaX, alphaY, dt, nSteps, mask, bcConfig,
            initTemp, snapshotInterval, onProgress, internalBCMask, internalBCTemps } = config;
    
    return new Promise((resolve) => {
      const T = new Float64Array(ny * nx).fill(initTemp);
      const Tnew = new Float64Array(ny * nx);
      const snapshots = [];
      
      // Save initial snapshot
      snapshots.push({ step: 0, time: 0, T: new Float64Array(T) });
      
      let currentStep = 0;
      const CHUNK_SIZE = Math.max(1, Math.min(200, Math.floor(nSteps / 50)));
      
      function doChunk() {
        const end = Math.min(currentStep + CHUNK_SIZE, nSteps);
        for (let n = currentStep; n < end; n++) {
          const t = n * dt;
          applyBoundaryConditions(T, nx, ny, bcConfig, dx, dy, t);
          step(T, Tnew, mask, nx, ny, alphaX, alphaY, dx, dy, dt, internalBCMask, internalBCTemps);
          // Swap T and Tnew
          T.set(Tnew);
          
          const stepNum = n + 1;
          if (stepNum % snapshotInterval === 0 || stepNum === nSteps) {
            snapshots.push({ step: stepNum, time: stepNum * dt, T: new Float64Array(T) });
          }
        }
        currentStep = end;
        
        const progress = currentStep / nSteps;
        if (onProgress) onProgress(progress, currentStep, nSteps);
        
        if (currentStep < nSteps) {
          setTimeout(doChunk, 0);
        } else {
          resolve({ snapshots, dt, nSteps });
        }
      }
      
      doChunk();
    });
  }

  // ==========================================
  // PUBLIC API
  // ==========================================
  return {
    MATERIALS,
    getMaterial,
    customMaterial,
    listMaterials,
    makePlate,
    makeDisc,
    makeBeam,
    makeRing,
    maskFromImageData,
    computeMaxDt,
    checkStability,
    applyBoundaryConditions,
    step,
    run,
  };
})();
