      // ---- Territory polygon vertex editing ----
      // "Edit shape" drops draggable handles on every point of the
      // shape's outer ring, plus faint "+" handles at each edge's
      // midpoint that insert a new point when clicked. Right-click a
      // point to remove it (minimum 3 points). Done commits and syncs
      // to Firestore; Cancel restores the original geometry.
      let territoryEditControlsEl = null;

      function polygonOuterRingFromFeature(feature) {
        if (!feature.geometry) {
          return null;
        }
        if (feature.geometry.type === 'Polygon') {
          return feature.geometry.coordinates;
        }
        if (feature.geometry.type === 'MultiPolygon' && feature.geometry.coordinates.length) {
          // Editing only ever operates on single-Polygon features (see
          // addTerritoryFeature, which always flattens), but this is a
          // safe fallback if one ever slips through.
          return feature.geometry.coordinates[0];
        }
        return null;
      }

      function rebuildEditGeometry(edit) {
        const outerClosed = edit.outerRing.concat([edit.outerRing[0]]);
        return { type: 'Polygon', coordinates: [outerClosed].concat(edit.holes || []) };
      }

      function refreshEditPreview(edit) {
        const feature = findTerritoryFeature(edit.layerId, edit.featureId);
        if (!feature || edit.outerRing.length < 3) {
          return;
        }
        feature.geometry = rebuildEditGeometry(edit);
        ensureKmlLayersForLayer(edit.layerId);
      }

      function repositionMidMarkers(edit) {
        for (let i = 0; i < edit.outerRing.length; i++) {
          const a = edit.outerRing[i];
          const b = edit.outerRing[(i + 1) % edit.outerRing.length];
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          if (edit.midMarkers[i]) {
            edit.midMarkers[i].setLngLat(mid);
          }
        }
      }

      function rebuildEditMarkers(edit) {
        edit.vertexMarkers.forEach((marker) => marker.remove());
        edit.midMarkers.forEach((marker) => marker.remove());
        edit.vertexMarkers = [];
        edit.midMarkers = [];

        edit.outerRing.forEach((coord, index) => {
          const el = document.createElement('div');
          el.className = 'territory-vertex-handle';
          el.title = 'Drag to move · right-click to remove';
          const marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat(coord).addTo(map);

          marker.on('drag', () => {
            const lngLat = marker.getLngLat();
            edit.outerRing[index] = [lngLat.lng, lngLat.lat];
            refreshEditPreview(edit);
            repositionMidMarkers(edit);
          });

          el.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            if (edit.outerRing.length <= 3) {
              return;
            }
            edit.outerRing.splice(index, 1);
            refreshEditPreview(edit);
            rebuildEditMarkers(edit);
          });

          edit.vertexMarkers.push(marker);
        });

        for (let i = 0; i < edit.outerRing.length; i++) {
          const a = edit.outerRing[i];
          const b = edit.outerRing[(i + 1) % edit.outerRing.length];
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const el = document.createElement('div');
          el.className = 'territory-vertex-add';
          el.title = 'Click to add a point here';
          const marker = new maplibregl.Marker({ element: el }).setLngLat(mid).addTo(map);

          el.addEventListener('click', (event) => {
            event.stopPropagation();
            edit.outerRing.splice(i + 1, 0, mid);
            refreshEditPreview(edit);
            rebuildEditMarkers(edit);
          });

          edit.midMarkers.push(marker);
        }
      }

      function showTerritoryEditControls() {
        territoryEditControlsEl = document.createElement('div');
        territoryEditControlsEl.className = 'territory-edit-controls';
        territoryEditControlsEl.innerHTML =
          '<span>Drag points to move · click + to add a point · right-click a point to remove it</span>' +
          '<button type="button" class="territory-edit-done">Done</button>' +
          '<button type="button" class="territory-edit-cancel">Cancel</button>';
        document.body.appendChild(territoryEditControlsEl);

        territoryEditControlsEl.querySelector('.territory-edit-done').addEventListener('click', () => {
          finishVertexEditMode(true);
        });
        territoryEditControlsEl.querySelector('.territory-edit-cancel').addEventListener('click', () => {
          finishVertexEditMode(false);
        });
      }

      function enterVertexEditMode(layerId, featureId) {
        const feature = findTerritoryFeature(layerId, featureId);
        const rings = feature && polygonOuterRingFromFeature(feature);
        if (!rings) {
          return;
        }

        deactivateDrawingTool();
        closeTerritoryPopup();

        state.territoryEdit = {
          layerId,
          featureId,
          outerRing: rings[0].slice(0, -1).map((coord) => [coord[0], coord[1]]),
          holes: rings.slice(1).map((ring) => ring.map((coord) => [coord[0], coord[1]])),
          originalGeometry: JSON.parse(JSON.stringify(feature.geometry)),
          vertexMarkers: [],
          midMarkers: []
        };

        rebuildEditMarkers(state.territoryEdit);
        showTerritoryEditControls();
      }

      function finishVertexEditMode(commit) {
        const edit = state.territoryEdit;
        if (!edit) {
          return;
        }

        edit.vertexMarkers.forEach((marker) => marker.remove());
        edit.midMarkers.forEach((marker) => marker.remove());
        if (territoryEditControlsEl) {
          territoryEditControlsEl.remove();
          territoryEditControlsEl = null;
        }

        const feature = findTerritoryFeature(edit.layerId, edit.featureId);
        state.territoryEdit = null;

        if (!feature) {
          return;
        }

        if (!commit) {
          feature.geometry = edit.originalGeometry;
          ensureKmlLayersForLayer(edit.layerId);
          return;
        }

        feature.geometry = edit.outerRing.length >= 3 ? rebuildEditGeometry(edit) : edit.originalGeometry;
        ensureKmlLayersForLayer(edit.layerId);
        pushTerritoriesToFirestore();
      }
