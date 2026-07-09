# context.md

## Project Identity

**Project Name:** ThermalFlux

**Type:** 2D Transient Heat Conduction Solver

**Objective:** Provide a high-precision, numerically stable environment to simulate heat dissipation in anisotropic media.

## Technical Stack & Constraints

* **Language:** Python 3.x
* **Numerical Core:** NumPy (Vectorized array operations; **strictly avoid `for` loops** over grid cells).
* **Physics Model:** Finite Difference Method (FDM) using a central difference scheme for spatial derivatives and explicit forward difference for time integration.
* **Governing Equation:**

$$\rho c_p \frac{\partial T}{\partial t} = \nabla \cdot (k \nabla T)$$

*(Where $k$ is treated as a diagonal tensor $[k_x, k_y]$ for anisotropy).*

## Key Implementation Rules

1. **Stability (CFL):** Any proposed changes to `dt`, `dx`, or `dy` must be validated against the stability criterion:

$$\Delta t \le \frac{1}{2 \left( \frac{\alpha_x}{\Delta x^2} + \frac{\alpha_y}{\Delta y^2} \right)}$$

2. **Boundary Conditions:** The solver must support both Dirichlet (fixed temp) and Neumann (fixed flux) boundary conditions.
3. **Geometry:** Shapes (beam, plate, disc) are defined via binary masks. A cell value of `1` indicates physical media; `0` indicates vacuum/void.
4. **Data Handling:**
   * `alpha` values for materials (Al, Steel, Iron) are fetched via standard physical constants.
   * Custom materials allow user-defined `alpha_x` and `alpha_y`.

## Custom Shape Handling

The solver accepts geometry from three sources. All produce a binary mask array of shape `(ny, nx)` where `1` = physical media and `0` = void.

### Source 1: Parametric Shapes (Built-in)

Generated via pure NumPy coordinate math. No external dependencies.

| Shape | Function | Key Parameters |
|---|---|---|
| Rectangular beam | `geometry.make_beam()` | `width_frac`, `height_frac` |
| Full plate | `geometry.make_plate()` | — |
| Circular disc | `geometry.make_disc()` | `radius_frac`, `center` |
| Annular ring | `geometry.make_ring()` | `outer_r`, `inner_r` |

### Source 2: Image File (PNG / JPG / BMP)

Workflow: Load → Grayscale → Threshold → Resize to `(ny, nx)` via nearest-neighbor.

**Rules:**
- Use nearest-neighbor interpolation to avoid anti-aliasing artifacts that create fractional mask values.
- Default threshold is `127`; an `invert` flag swaps foreground/background.
- Optional morphological cleanup via `scipy.ndimage.binary_dilation/erosion`.
- The `cv2` (opencv-python) dependency is **optional**; falls back to `PIL` (Pillow).

### Source 3: 2D CAD File (DXF)

Workflow: Parse DXF → Extract closed polylines/circles/arcs → Rasterize to `(ny, nx)` grid.

**Rules:**
- Uses `ezdxf` for DXF parsing.
- Only the `MODELSPACE` entities are processed.
- Supported entity types: `LINE`, `LWPOLYLINE`, `POLYLINE`, `CIRCLE`, `ARC`, `ELLIPSE`, `SPLINE`.
- Closed shapes are filled; open polylines are treated as boundaries with configurable stroke width.
- The DXF world-coordinate bounding box is mapped to the simulation grid `(ny, nx)` preserving aspect ratio, with optional padding.
- If `ezdxf` is not installed, the function raises `ImportError` with installation instructions.

### Mask Enforcement During Simulation

Every timestep, after the finite-difference update, the solver enforces:

```python
T_new *= mask  # zero out void cells
```

This prevents heat from leaking into vacuum regions.

## Current Workflow for Agents

When assisting with this project, follow this hierarchy:

1. **Validation:** Check if the physical parameters (materials/geometry) are physically sound.
2. **Implementation:** Use NumPy vectorization for performance.
3. **Verification:** Always report the numerical stability status of the suggested code.
4. **Documentation:** Maintain adherence to the `README.md` conventions for consistency.

## Mathematical Notations for Consistency

* `T`: Temperature grid ($N \times M$ matrix).
* `alpha_x`, `alpha_y`: Thermal diffusivity in m²/s.
* `dt`: Time step in seconds.
* `dx`, `dy`: Spatial discretization in meters.

---

### Tips for using this with AI

* **How to use it:** Whenever you start a new chat with an AI to work on this, copy this text and say: *"I am working on the ThermalFlux project. Please use the following `context.md` to guide your code suggestions and logic:"*
* **Why this works:** It prevents the AI from suggesting slow, nested `for` loops and ensures it always accounts for the CFL stability condition, which is the most common reason thermal simulations fail.
