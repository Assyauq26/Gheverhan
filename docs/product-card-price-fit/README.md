# Measured largest-fitting price revision

PR #116, same branch. No merge/deploy authorized.

The character estimates product-price-units/space/size have been removed from application code. A small client wrapper measures the real price track and both rendered text boxes at their normal font caps. Binary search finds the largest scale that fits; the existing main/struck ratio is preserved. ResizeObserver watches the price track width; font completion and store theme attribute changes trigger a refit. All listeners/observers/animation frames are cleaned up. Server and first client markup match; fitting happens after hydration. No amounts or business rules change.

Price gap and price-to-cart track gap are both 2px. Discount pairs are right-aligned within the price track so the struck amount remains 2px from the cart touch area when normal caps are reached. Single prices retain left alignment. Cart remains 44px; grid/carousel/image sizes and PR116 vertical spacing are untouched.

## Evidence

Node22 lint/typecheck passed. Build exited successfully, with missing local database diagnostics; isolated CI is authoritative. Fitter/ProductCard unit tests 11/11 passed. Read-only browser preview passed 40 price cases: at each required width, all five requested pairs fit without clipping/overlap/overflow; a +0.1px probe overflows unless normal type cap is already reached. Main fonts increased compared with b44c57b. These previews use public card markup and inject the exact fitter locally, not a candidate deployment. Actual component lifecycle, hydration and commerce flows are checked in isolated CI.

At 320px, available track width is only 72px. Rp8.999.000/Rp9.999.000 increases from 4.49px to 6.56px (main) and 4.92px (struck). The result is maximally fitted, but remains difficult to read at that geometric limit. This limitation is not declared solved merely because it fits.

[All raw metrics](evidence/measurements.json). [Before 320px](evidence/before-320.png) / [after](evidence/after-320.png). [Home before](pages/before-home-390.png) / [after](pages/after-home-390.png). [Shop before](pages/before-shop-390.png) / [after](pages/after-shop-390.png).

## All 40 cases (px)

| Viewport | Main / original | Card | Price area | Text widths main/original | Main font before→after | Original font | Price gap | Cart gap | Geometry |
|---|---|---:|---:|---|---|---:|---:|---:|---|
| 320 | Rp 5.000 / Rp 20.000 | 136.00 | 72.00 | 39.78 / 30.22 | 6.39 → 9.22 | 6.91 | 2.00 | 2.00 | PASS, maximal |
| 320 | Rp 17.000 / Rp 20.000 | 136.00 | 72.00 | 41.59 / 28.38 | 5.99 → 8.66 | 6.50 | 2.00 | 2.00 | PASS, maximal |
| 320 | Rp 249.000 / Rp 299.000 | 136.00 | 72.00 | 42.05 / 27.95 | 5.39 → 7.60 | 5.70 | 2.00 | 2.00 | PASS, maximal |
| 320 | Rp 1.499.000 / Rp 1.999.000 | 136.00 | 72.00 | 41.92 / 28.00 | 4.49 → 6.61 | 4.96 | 2.00 | 2.00 | PASS, maximal |
| 320 | Rp 8.999.000 / Rp 9.999.000 | 136.00 | 72.00 | 42.16 / 27.83 | 4.49 → 6.56 | 4.92 | 2.00 | 2.00 | PASS, maximal |
| 360 | Rp 5.000 / Rp 20.000 | 156.00 | 92.00 | 51.14 / 38.83 | 8.32 → 11.85 | 8.89 | 2.00 | 2.00 | PASS, maximal |
| 360 | Rp 17.000 / Rp 20.000 | 156.00 | 92.00 | 53.45 / 36.47 | 7.81 → 11.13 | 8.35 | 2.00 | 2.00 | PASS, maximal |
| 360 | Rp 249.000 / Rp 299.000 | 156.00 | 92.00 | 54.00 / 35.91 | 7.03 → 9.76 | 7.32 | 2.00 | 2.00 | PASS, maximal |
| 360 | Rp 1.499.000 / Rp 1.999.000 | 156.00 | 92.00 | 53.84 / 36.11 | 5.86 → 8.50 | 6.37 | 2.00 | 2.00 | PASS, maximal |
| 360 | Rp 8.999.000 / Rp 9.999.000 | 156.00 | 92.00 | 54.19 / 35.77 | 5.86 → 8.43 | 6.32 | 2.00 | 2.00 | PASS, maximal |
| 375 | Rp 5.000 / Rp 20.000 | 163.50 | 99.50 | 55.41 / 42.06 | 9.05 → 12.84 | 9.63 | 2.00 | 2.00 | PASS, maximal |
| 375 | Rp 17.000 / Rp 20.000 | 163.50 | 99.50 | 57.92 / 39.53 | 8.49 → 12.07 | 9.05 | 2.00 | 2.00 | PASS, maximal |
| 375 | Rp 249.000 / Rp 299.000 | 163.50 | 99.50 | 58.55 / 38.95 | 7.64 → 10.58 | 7.93 | 2.00 | 2.00 | PASS, maximal |
| 375 | Rp 1.499.000 / Rp 1.999.000 | 163.50 | 99.50 | 58.34 / 39.11 | 6.37 → 9.21 | 6.91 | 2.00 | 2.00 | PASS, maximal |
| 375 | Rp 8.999.000 / Rp 9.999.000 | 163.50 | 99.50 | 58.70 / 38.77 | 6.37 → 9.13 | 6.85 | 2.00 | 2.00 | PASS, maximal |
| 390 | Rp 5.000 / Rp 20.000 | 171.00 | 107.00 | 59.69 / 45.30 | 9.77 → 13.82 | 10.37 | 2.00 | 2.00 | PASS, maximal |
| 390 | Rp 17.000 / Rp 20.000 | 171.00 | 107.00 | 62.38 / 42.59 | 9.17 → 13.00 | 9.75 | 2.00 | 2.00 | PASS, maximal |
| 390 | Rp 249.000 / Rp 299.000 | 171.00 | 107.00 | 63.03 / 41.95 | 8.25 → 11.39 | 8.54 | 2.00 | 2.00 | PASS, maximal |
| 390 | Rp 1.499.000 / Rp 1.999.000 | 171.00 | 107.00 | 62.84 / 42.11 | 6.88 → 9.92 | 7.44 | 2.00 | 2.00 | PASS, maximal |
| 390 | Rp 8.999.000 / Rp 9.999.000 | 171.00 | 107.00 | 63.20 / 41.78 | 6.88 → 9.83 | 7.37 | 2.00 | 2.00 | PASS, maximal |
| 430 | Rp 5.000 / Rp 20.000 | 191.00 | 127.00 | 69.09 / 52.47 | 11.71 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 430 | Rp 17.000 / Rp 20.000 | 191.00 | 127.00 | 74.25 / 50.72 | 10.98 → 15.47 | 11.60 | 2.00 | 2.00 | PASS, maximal |
| 430 | Rp 249.000 / Rp 299.000 | 191.00 | 127.00 | 75.05 / 49.91 | 9.89 → 13.56 | 10.17 | 2.00 | 2.00 | PASS, maximal |
| 430 | Rp 1.499.000 / Rp 1.999.000 | 191.00 | 127.00 | 74.83 / 50.16 | 8.24 → 11.81 | 8.86 | 2.00 | 2.00 | PASS, maximal |
| 430 | Rp 8.999.000 / Rp 9.999.000 | 191.00 | 127.00 | 75.30 / 49.70 | 8.24 → 11.70 | 8.78 | 2.00 | 2.00 | PASS, maximal |
| 768 | Rp 5.000 / Rp 20.000 | 360.00 | 296.00 | 69.09 / 52.47 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 768 | Rp 17.000 / Rp 20.000 | 360.00 | 296.00 | 76.83 / 52.47 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 768 | Rp 249.000 / Rp 299.000 | 360.00 | 296.00 | 88.61 / 58.94 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 768 | Rp 1.499.000 / Rp 1.999.000 | 360.00 | 296.00 | 101.47 / 68.02 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 768 | Rp 8.999.000 / Rp 9.999.000 | 360.00 | 296.00 | 102.97 / 68.02 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 1024 | Rp 5.000 / Rp 20.000 | 320.00 | 256.00 | 69.09 / 52.47 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 1024 | Rp 17.000 / Rp 20.000 | 320.00 | 256.00 | 76.83 / 52.47 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 1024 | Rp 249.000 / Rp 299.000 | 320.00 | 256.00 | 88.61 / 58.94 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 1024 | Rp 1.499.000 / Rp 1.999.000 | 320.00 | 256.00 | 101.47 / 68.02 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 1024 | Rp 8.999.000 / Rp 9.999.000 | 320.00 | 256.00 | 102.97 / 68.02 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 1440 | Rp 5.000 / Rp 20.000 | 330.00 | 266.00 | 69.09 / 52.47 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 1440 | Rp 17.000 / Rp 20.000 | 330.00 | 266.00 | 76.83 / 52.47 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 1440 | Rp 249.000 / Rp 299.000 | 330.00 | 266.00 | 88.61 / 58.94 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 1440 | Rp 1.499.000 / Rp 1.999.000 | 330.00 | 266.00 | 101.47 / 68.02 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
| 1440 | Rp 8.999.000 / Rp 9.999.000 | 330.00 | 266.00 | 102.97 / 68.02 | 16.00 → 16.00 | 12.00 | 2.00 | 2.00 | PASS, maximal |
