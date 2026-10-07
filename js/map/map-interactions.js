      // Line, dashed line, and arrow are all "open" multi-point tools:
      // left-click adds a point and keeps going, right-click ends the
      // drawing. They share this helper.
      function isOpenLineTool(tool) {
        return tool === 'line' || tool === 'lineDashed' || tool === 'arrow' || tool === 'polygon';
      }

      // Right-click ends an in-progress line/dashed-line/arrow: drop
      // the trailing point that was only ever a rubber-band preview
      // (never confirmed with a left-click), then commit whatever's
      // left as a finished drawing. The tool stays armed afterwards so
      // another one can be started right away.
      function finishOpenLineDraft() {
        if (!state.draft) {
          return;
        }
        const coords = state.draft.geometry.coordinates;
        coords.pop();
        if (coords.length >= 2) {
          state.drawings.push(state.draft);
        }
        state.draft = null;
        updateDrawings();
      }

      // Right-click ends an in-progress Territory polygon the same way
      // finishOpenLineDraft ends a line/arrow — drop the trailing
      // rubber-band point, then, if enough vertices are left, close the
      // ring and hand it off to applyTerritoryPolygon instead of pushing
      // it into state.drawings (a territory polygon is never a plain
      // drawing: it edits its selected territory layer directly).
      function finishPolygonDraft() {
        if (!state.draft) {
          return;
        }
        const coords = state.draft.geometry.coordinates;
        coords.pop();
        state.draft = null;
        updateDrawings();

        if (coords.length < 3) {
          drawHint.textContent = 'Need at least 3 points for a polygon — try again.';
          return;
        }

        const ring = coords.concat([coords[0]]);
        beginTerritorySmoothing(ring, state.territoryLayerId);
      }

      copyCoordinatesBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(currentCoordinates);
          copyCoordinatesBtn.textContent = 'Copied';
        } catch (error) {
          copyCoordinatesBtn.textContent = 'Copy unavailable';
        }
      });

      // A pinpoint added from the coordinates popup gets its own menu:
      // coordinates, a Copy button, the popup's own × (which only closes
      // the menu), and a separate Delete button that actually removes
      // the pinpoint.
      function attachCoordinatePinpointPopup(marker, lat, lng) {
        const coordsText = lat.toFixed(11) + ', ' + lng.toFixed(11);
        const html =
          '<div class="marker-popup">' +
          '<div class="marker-popup-title">Pinpoint</div>' +
          '<div class="marker-popup-coords">' + escapeHtml(coordsText) + '</div>' +
          '<div class="marker-popup-actions">' +
          '<button type="button" class="marker-popup-copy" data-coords="' + escapeHtml(coordsText) + '">Copy coordinates</button>' +
          '<button type="button" class="marker-popup-delete">Delete pinpoint</button>' +
          '</div>' +
          '</div>';

        const popup = new maplibregl.Popup({ offset: 28, closeButton: true, closeOnClick: false }).setHTML(html);

        popup.on('open', () => {
          const container = popup.getElement();
          if (!container) {
            return;
          }

          const copyBtn = container.querySelector('.marker-popup-copy');
          if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
              try {
                await navigator.clipboard.writeText(copyBtn.dataset.coords);
                copyBtn.textContent = 'Copied';
                setTimeout(() => {
                  copyBtn.textContent = 'Copy coordinates';
                }, 1500);
              } catch (error) {
                copyBtn.textContent = 'Copy unavailable';
              }
            });
          }

          const deleteBtn = container.querySelector('.marker-popup-delete');
          if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
              marker.remove();
            });
          }
          // The built-in × close button is left as-is here (unlike the
          // search-result marker popup) — it only closes the menu, it
          // does not delete the pinpoint.
        });

        marker.setPopup(popup);
      }

      addPinpointBtn.addEventListener('click', () => {
        if (!currentCoordinateLatLng) {
          return;
        }

        const { lat, lng } = currentCoordinateLatLng;
        const marker = new maplibregl.Marker({ color: '#3fd0ff' }).setLngLat([lng, lat]).addTo(map);
        attachCoordinatePinpointPopup(marker, lat, lng);
        marker.togglePopup();
        closeCoordinatePopup();
      });

      map.on('mousedown', (event) => {
        if (state.drawingTool !== 'brush') {
          return;
        }

        event.preventDefault();
        state.isBrushing = true;
        state.draft = makeLineFeature([[event.lngLat.lng, event.lngLat.lat]], 'brush');
        map.dragPan.disable();
        updateDrawings();
      });

      map.on('mousemove', (event) => {
        if (state.isBrushing && state.draft) {
          state.draft.geometry.coordinates.push([event.lngLat.lng, event.lngLat.lat]);
          updateDrawings();
          return;
        }

        if (isOpenLineTool(state.drawingTool) && state.draft) {
          const coords = state.draft.geometry.coordinates;
          coords[coords.length - 1] = [event.lngLat.lng, event.lngLat.lat];
          updateDrawings();
        }
      });

      map.on('mouseup', () => {
        if (!state.isBrushing) {
          return;
        }

        state.isBrushing = false;
        map.dragPan.enable();
        if (state.draft && state.draft.geometry.coordinates.length > 1) {
          state.drawings.push(state.draft);
        }
        state.draft = null;
        updateDrawings();
      });

      map.on('click', (event) => {
        if (state.territorySmoothing) {
          return;
        }
        if (!state.drawingTool || state.drawingTool === 'brush' || state.isBrushing) {
          return;
        }

        event.preventDefault();
        const coordinate = [event.lngLat.lng, event.lngLat.lat];
        if (state.drawingTool === 'pinpoint') {
          state.drawings.push({
            type: 'Feature',
            properties: { color: state.drawingColor },
            geometry: { type: 'Point', coordinates: coordinate }
          });
          updateDrawings();
          return;
        }

        if (state.drawingTool === 'flag') {
          if (state.role !== 'admin' || state.frontlineHistoryMode) {
            return;
          }
          placeFlag(event.lngLat.lng, event.lngLat.lat, state.flagType);
          pushFlagsToFirestore();
          return;
        }

        if (isOpenLineTool(state.drawingTool)) {
          if (state.drawingTool === 'polygon' && (state.role !== 'admin' || state.frontlineHistoryMode)) {
            return;
          }
          if (!state.draft) {
            state.draft = makeLineFeature([coordinate, coordinate], state.drawingTool);
          } else {
            // Lock in the point the cursor was rubber-banding to, then
            // start rubber-banding a new segment from it — this is what
            // lets left-click keep extending the line/arrow instead of
            // finishing it.
            const coords = state.draft.geometry.coordinates;
            coords[coords.length - 1] = coordinate;
            coords.push(coordinate);
          }
          updateDrawings();
          return;
        }
      });

      map.on('style.load', () => {
        const styleLayers = map.getStyle().layers || [];

        if (mapStyleSelect.value === 'terrain') {
          map.addSource('mapzen-global-terrain', {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 15,
            encoding: 'terrarium',
            attribution: 'Elevation data © Mapzen, hosted by AWS'
          });

          const builtInHillshade = styleLayers.find((layer) => layer.id === 'Hillshade');
          if (builtInHillshade) {
            map.setLayoutProperty(builtInHillshade.id, 'visibility', 'none');
          }

          const hillshadePosition = builtInHillshade?.id || styleLayers.find((layer) => layer.type !== 'background')?.id;
          map.addLayer({
            id: 'mapzen-global-terrain-hillshade',
            type: 'hillshade',
            source: 'mapzen-global-terrain',
            paint: {
              'hillshade-exaggeration': 0.85,
              'hillshade-illumination-direction': 315,
              'hillshade-illumination-anchor': 'viewport',
              'hillshade-shadow-color': '#07090c',
              'hillshade-highlight-color': '#68747e',
              'hillshade-accent-color': '#35414a'
            }
          }, hillshadePosition);
        }

        map.addSource('user-drawings', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
        map.addSource('territory-smoothing-preview', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });
        map.addLayer({
          id: 'territory-smoothing-preview-fill',
          type: 'fill',
          source: 'territory-smoothing-preview',
          paint: {
            'fill-color': ['coalesce', ['get', 'color'], '#FF9400'],
            'fill-opacity': 0.18
          }
        });
        map.addLayer({
          id: 'territory-smoothing-preview-outline',
          type: 'line',
          source: 'territory-smoothing-preview',
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': ['coalesce', ['get', 'color'], '#FF9400'],
            'line-width': 2.5,
            'line-opacity': 0.9
          }
        });
        map.addLayer({
          id: 'user-drawing-lines',
          type: 'line',
          source: 'user-drawings',
          filter: [
            'all',
            ['==', ['geometry-type'], 'LineString'],
            ['!=', ['get', 'tool'], 'arrow'],
            ['!=', ['get', 'tool'], 'lineDashed']
          ],
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['coalesce', ['get', 'thickness'], 3]
          }
        });
        // The dashed-line variant gets its own layer so it can use
        // line-dasharray, which isn't data-driven — a shared layer
        // can't switch per feature between solid and dashed.
        map.addLayer({
          id: 'user-drawing-dashed-lines',
          type: 'line',
          source: 'user-drawings',
          filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'tool'], 'lineDashed']],
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['coalesce', ['get', 'thickness'], 3],
            'line-dasharray': [2, 2]
          }
        });
        // Arrow strokes get their own layer so they can be dashed —
        // line-dasharray isn't data-driven, so a shared layer can't
        // switch per feature between solid and dashed.
        map.addLayer({
          id: 'user-drawing-arrow-lines',
          type: 'line',
          source: 'user-drawings',
          filter: [
            'all',
            ['==', ['geometry-type'], 'LineString'],
            ['==', ['get', 'tool'], 'arrow'],
            ['!=', ['get', 'arrowHead'], true]
          ],
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['coalesce', ['get', 'thickness'], 3],
            'line-dasharray': [2, 2]
          }
        });
        // The little solid chevron at an arrow's tip.
        map.addLayer({
          id: 'user-drawing-arrow-heads',
          type: 'line',
          source: 'user-drawings',
          filter: ['==', ['get', 'arrowHead'], true],
          layout: {
            'line-cap': 'round',
            'line-join': 'round'
          },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['coalesce', ['get', 'thickness'], 3]
          }
        });
        map.addLayer({
          id: 'user-drawing-points',
          type: 'circle',
          source: 'user-drawings',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-radius': 7,
            'circle-color': ['get', 'color'],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2
          }
        });
        updateDrawings();

        const safeSet = (layerId, prop, value) => {
          if (styleLayers.some((layer) => layer.id === layerId)) {
            map.setPaintProperty(layerId, prop, value);
          }
        };

        safeSet('background', 'background-color', '#0b0f14');
        safeSet('countries-fill', 'fill-color', '#171d25');
        safeSet('countries-boundary', 'line-color', '#394958');
        safeSet('countries-boundary', 'line-width', 1);
        safeSet('geolines', 'line-color', '#1d7bb8');
        safeSet('countries-label', 'text-color', '#dfe7ee');
        safeSet('countries-label', 'text-halo-color', '#0b0f14');

        // Changing the base style (via the dropdown) wipes every custom
        // source/layer, so re-create each layer's KML shapes from the
        // data already loaded in memory.
        state.layers.forEach((layer) => ensureKmlLayersForLayer(layer.id));
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: true }));
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right');

      // The popup already fades out via its CSS transition (see
      // #coordinatePopup.visible) — closeCoordinatePopup() just removes
      // the class, so panning/zooming/rotating away from a pinned
      // coordinate dismisses it smoothly instead of leaving it stuck
      // over the wrong spot.
      map.on('movestart', closeCoordinatePopup);

      map.on('error', (err) => {
        console.error('map error', err);
        const e = document.getElementById('error');
        e.textContent = 'Map error: ' + (err && err.error ? err.error.message || err.error : err);
        e.style.display = 'block';
      });
