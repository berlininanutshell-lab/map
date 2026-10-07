      // ---- New territory polygon smoothing workflow ----
      // A newly drawn polygon is not committed immediately. RMB finishes
      // the raw shape, then this small control lets the admin choose how
      // many smoothing passes to apply. The preview updates live; Done
      // finally creates the selected pending advance or manual Contested area.
      let territorySmoothingControlsEl = null;

      function clearTerritorySmoothingPreview() {
        const source = map.getSource('territory-smoothing-preview');
        if (source) {
          source.setData({ type: 'FeatureCollection', features: [] });
        }
      }

      function destroyTerritorySmoothingControls() {
        if (territorySmoothingControlsEl) {
          territorySmoothingControlsEl.remove();
          territorySmoothingControlsEl = null;
        }
      }

      function cancelTerritorySmoothing() {
        state.territorySmoothing = null;
        clearTerritorySmoothingPreview();
        destroyTerritorySmoothingControls();
        if (state.drawingTool === 'polygon') {
          map.dragPan.enable();
        }
      }

      function smoothTerritoryRing(ring, iterations) {
        const passes = Math.max(0, Math.min(6, Number(iterations) || 0));
        if (passes === 0) {
          return ring.map((coord) => [coord[0], coord[1]]);
        }

        let feature = turf.polygon([ring]);
        for (let i = 0; i < passes; i++) {
          const result = turf.polygonSmooth(feature, { iterations: 1 });
          const next = result && result.features && result.features[0];
          if (!next || !next.geometry || next.geometry.type !== 'Polygon') {
            throw new Error('Smoothing did not return a polygon');
          }
          feature = next;
        }
        return feature.geometry.coordinates[0];
      }

      function updateTerritorySmoothingPreview() {
        const smoothing = state.territorySmoothing;
        if (!smoothing) {
          clearTerritorySmoothingPreview();
          return null;
        }

        let ring;
        try {
          ring = smoothTerritoryRing(smoothing.rawRing, smoothing.iterations);
        } catch (error) {
          console.error('Failed to preview smoothed polygon', error);
          drawHint.textContent = 'Could not smooth that polygon. Try fewer iterations.';
          return null;
        }

        smoothing.previewRing = ring;
        const source = map.getSource('territory-smoothing-preview');
        if (source) {
          source.setData({
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: { color: state.drawingColor },
              geometry: { type: 'Polygon', coordinates: [ring] }
            }]
          });
        }
        return ring;
      }

      function finishTerritorySmoothing() {
        const smoothing = state.territorySmoothing;
        if (!smoothing) {
          return;
        }
        const ring = updateTerritorySmoothingPreview() || smoothing.previewRing || smoothing.rawRing;
        if (!ring || ring.length < 4) {
          drawHint.textContent = 'That polygon could not be completed.';
          return;
        }

        const layerId = smoothing.layerId;
        cancelTerritorySmoothing();
        applyTerritoryPolygon(ring, layerId);
      }

      function beginTerritorySmoothing(ring, layerId) {
        state.territorySmoothing = {
          rawRing: ring.map((coord) => [coord[0], coord[1]]),
          previewRing: ring.map((coord) => [coord[0], coord[1]]),
          iterations: 1,
          layerId
        };

        state.draft = null;
        map.dragPan.disable();
        clearTerritorySmoothingPreview();

        territorySmoothingControlsEl = document.createElement('div');
        territorySmoothingControlsEl.className = 'territory-smoothing-controls';
        territorySmoothingControlsEl.innerHTML =
          '<span class="territory-smoothing-title">Smooth ' + (layerId === 'contested' ? 'Contested area' : 'advance') + '</span>' +
          '<label>Iterations <input class="territory-smoothing-range" type="range" min="0" max="6" step="1" value="1" /></label>' +
          '<span class="territory-smoothing-value">1×</span>' +
          '<button type="button" class="territory-smoothing-done">Done</button>' +
          '<button type="button" class="territory-smoothing-cancel">Cancel</button>';
        document.body.appendChild(territorySmoothingControlsEl);

        const range = territorySmoothingControlsEl.querySelector('.territory-smoothing-range');
        const value = territorySmoothingControlsEl.querySelector('.territory-smoothing-value');

        range.addEventListener('input', () => {
          state.territorySmoothing.iterations = Number(range.value) || 0;
          value.textContent = state.territorySmoothing.iterations + '×';
          updateTerritorySmoothingPreview();
        });

        territorySmoothingControlsEl.querySelector('.territory-smoothing-done').addEventListener('click', finishTerritorySmoothing);
        territorySmoothingControlsEl.querySelector('.territory-smoothing-cancel').addEventListener('click', () => {
          cancelTerritorySmoothing();
          drawHint.textContent = 'Polygon cancelled. Draw another ' +
            (layerId === 'contested' ? 'Contested area.' : 'advance.');
        });

        updateTerritorySmoothingPreview();
        drawHint.textContent = layerId === 'contested'
          ? 'Choose the smoothing amount, then click Done to add this manual Contested area.'
          : 'Choose the smoothing amount, then click Done to create the ' +
            (layerId === 'russian-advances' ? 'Russian' : 'Ukrainian') + ' advance.';
      }

      // Dissolves all polygon features in a territory layer into the
      // smallest possible set of geometry pieces. If neighbouring
      // polygons touch/overlap, Turf unions them into one continuous
      // polygon, so the shared edge is no longer rendered as an outline.
      // Disconnected areas remain separate parts, because they cannot
      // physically be represented as one Polygon without changing the
      // territory itself.
      function mergeTerritoryLayerPolygons(layerId) {
        const data = layerKmlData[layerId] || { type: 'FeatureCollection', features: [] };
        const polygons = data.features.filter((feature) =>
          feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')
        );
        if (polygons.length <= 1) {
          return;
        }

        let merged = null;
        for (const polygon of polygons) {
          try {
            merged = merged ? turf.union(merged, polygon) : polygon;
          } catch (error) {
            console.error('Failed to merge territory polygons', error);
            return;
          }
        }

        if (!merged || !merged.geometry) {
          return;
        }

        // Keep non-polygon features untouched, but replace all polygon
        // features with the dissolved result. Flattening preserves the
        // existing rendering model, which stores each disconnected part
        // as its own selectable Polygon feature.
        const nonPolygons = data.features.filter((feature) =>
          !feature.geometry || (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon')
        );
        const mergedFeatures = turf.flatten(merged).features.map((part) => ({
          type: 'Feature',
          properties: { id: genId(), name: '', description: '', source: '' },
          geometry: part.geometry
        }));

        layerKmlData[layerId] = {
          type: 'FeatureCollection',
          features: nonPolygons.concat(mergedFeatures)
        };
        ensureKmlLayersForLayer(layerId);
      }

      // Folds a pending advance shape into the appropriate control layer,
      // dissolving the result afterwards. This is important when an
      // advance was smoothed before applying: without the dissolve, the
      // old control polygon and the newly applied polygon remain as two
      // separate features and their shared boundary gets drawn visibly.
      function applyAdvanceFeature(layerId, featureId) {
        const feature = findTerritoryFeature(layerId, featureId);
        if (!feature) {
          closeTerritoryPopup();
          return;
        }

        if (layerId !== 'russian-advances' && layerId !== 'ukrainian-advances') {
          closeTerritoryPopup();
          return;
        }

        try {
          if (layerId === 'russian-advances') {
            // Calculate the cut before changing either control layer. If it
            // fails, keep the advance pending rather than leave overlapping
            // or partially updated control polygons.
            subtractFromLayer('ukrainian-control', feature.geometry);
            addTerritoryFeature('main', feature.geometry, { push: false });
            mergeTerritoryLayerPolygons('main');
          } else {
            // Russian Control loses the ground; Ukrainian Control gains it.
            subtractFromMain(feature.geometry);
            addTerritoryFeature('ukrainian-control', feature.geometry, { push: false });
            mergeTerritoryLayerPolygons('ukrainian-control');
          }
        } catch (error) {
          console.error('Failed to subtract an applied advance from existing control', error);
          adminNotice('Could not apply this advance: the existing control boundary could not be cut. The pending advance was kept. Check the browser console for details.');
          closeTerritoryPopup();
          return;
        }

        removeTerritoryFeature(layerId, featureId, { push: false });
        pushTerritoriesToFirestore();
        closeTerritoryPopup();
        drawHint.textContent = layerId === 'russian-advances' ? 'Advance applied to Russian Control.' : 'Advance applied to Ukrainian Control.';
      }

      function restoreRussianAdvanceFeature(featureId) {
        const feature = findTerritoryFeature('main', featureId);
        if (!isAdmin() || !feature || !feature.geometry ||
            (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon')) {
          closeTerritoryPopup();
          return;
        }

        const advances = layerKmlData['russian-advances'] ||
          { type: 'FeatureCollection', features: [] };
        const restoredFeatures = turf.flatten(feature).features.map((part) => {
          const properties = Object.assign({}, feature.properties || {});
          const idExists = advances.features.some((advance) =>
            advance.properties && advance.properties.id === properties.id
          );
          properties.id = properties.id && !idExists ? properties.id : genId();
          return {
            type: 'Feature',
            properties,
            geometry: part.geometry
          };
        });

        removeTerritoryFeature('main', featureId, { push: false });
        advances.features.push(...restoredFeatures);
        layerKmlData['russian-advances'] = advances;
        ensureKmlLayersForLayer('russian-advances');
        pushTerritoriesToFirestore();
        closeTerritoryPopup();
        drawHint.textContent = 'Shape moved from Russian Control back to pending Russian advances.';
      }
