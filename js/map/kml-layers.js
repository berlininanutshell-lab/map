      // ---- KML layers ----
      // Each entry in state.layers can carry KML data of its own, kept
      // separate per layer id so toggling a layer's On/Off switch also
      // shows/hides only the KML shapes that belong to it. Files are
      // loaded from kml/<layerId>/<file>.kml on the same host as this
      // page, listed in kml/manifest.json — see the README in the kml
      // folder for how to add your own.
      const layerKmlData = {};

      function getLayerById(layerId) {
        return state.layers.find((layer) => layer.id === layerId);
      }

      function kmlGetText(node, tag) {
        const el = node.getElementsByTagName(tag)[0];
        return el ? el.textContent.trim() : '';
      }

      function kmlParseCoordinates(text) {
        return text
          .trim()
          .split(/\s+/)
          .map((triplet) => {
            const parts = triplet.split(',').map(Number);
            return parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])
              ? [parts[0], parts[1]]
              : null;
          })
          .filter(Boolean);
      }

      // getElementsByTagName searches all descendants, so this also picks
      // up geometries nested inside a <MultiGeometry> without any extra
      // handling — each one just becomes its own GeoJSON feature.
      function kmlExtractGeometries(placemark) {
        const geometries = [];

        Array.from(placemark.getElementsByTagName('Point')).forEach((point) => {
          const coords = kmlParseCoordinates(kmlGetText(point, 'coordinates'))[0];
          if (coords) {
            geometries.push({ type: 'Point', coordinates: coords });
          }
        });

        Array.from(placemark.getElementsByTagName('LineString')).forEach((lineString) => {
          const coords = kmlParseCoordinates(kmlGetText(lineString, 'coordinates'));
          if (coords.length > 1) {
            geometries.push({ type: 'LineString', coordinates: coords });
          }
        });

        Array.from(placemark.getElementsByTagName('Polygon')).forEach((polygon) => {
          const outer = polygon.getElementsByTagName('outerBoundaryIs')[0];
          const outerRing = outer ? outer.getElementsByTagName('LinearRing')[0] : null;
          const outerCoords = outerRing ? kmlParseCoordinates(kmlGetText(outerRing, 'coordinates')) : [];
          if (outerCoords.length <= 2) {
            return;
          }

          const rings = [outerCoords];
          Array.from(polygon.getElementsByTagName('innerBoundaryIs')).forEach((inner) => {
            const innerRing = inner.getElementsByTagName('LinearRing')[0];
            const innerCoords = innerRing ? kmlParseCoordinates(kmlGetText(innerRing, 'coordinates')) : [];
            if (innerCoords.length > 2) {
              rings.push(innerCoords);
            }
          });
          geometries.push({ type: 'Polygon', coordinates: rings });
        });

        return geometries;
      }

      function parseKmlToGeoJSON(kmlString) {
        const dom = new DOMParser().parseFromString(kmlString, 'text/xml');
        if (dom.getElementsByTagName('parsererror').length > 0) {
          throw new Error('Could not parse KML file.');
        }

        const features = [];
        Array.from(dom.getElementsByTagName('Placemark')).forEach((placemark) => {
          const name = kmlGetText(placemark, 'name');
          const description = kmlGetText(placemark, 'description');
          kmlExtractGeometries(placemark).forEach((geometry) => {
            features.push({ type: 'Feature', properties: { name, description }, geometry });
          });
        });

        return { type: 'FeatureCollection', features };
      }

      // True when a map click actually landed on a flag/pinpoint marker,
      // a popup, a vertex-edit handle, or a drawn pinpoint dot — things
      // that sit above the territory polygons and must not open the
      // polygon menu.
      function isClickOnMapObject(event) {
        const target = event.originalEvent && event.originalEvent.target;
        if (target && target.closest &&
            target.closest('.maplibregl-marker, .maplibregl-popup, .territory-vertex-handle, .territory-vertex-add')) {
          return true;
        }
        if (map.getLayer('user-drawing-points')) {
          const p = event.point;
          const hits = map.queryRenderedFeatures(
            [[p.x - 9, p.y - 9], [p.x + 9, p.y + 9]],
            { layers: ['user-drawing-points'] }
          );
          if (hits.length) {
            return true;
          }
        }
        return false;
      }

      // Adds (or updates) the geojson source + fill/line/point layers for
      // one layer's KML data, and syncs their visibility to that layer's
      // On/Off state. Safe to call repeatedly, including after a style
      // change wipes custom sources/layers (see 'style.load' below).
      function ensureKmlLayersForLayer(layerId) {
        const layer = getLayerById(layerId);
        // Note: no map.isStyleLoaded() guard here. This function is
        // called from the 'style.load' handler (right after a style
        // switch wipes custom sources/layers), where addSource/addLayer
        // are safe to call even though isStyleLoaded() can still
        // momentarily report false — that mismatch was causing KML
        // polygons to silently fail to re-appear after switching map
        // styles, until something else (like toggling a layer) called
        // this function again a bit later.
        if (!layer || !map.getStyle()) {
          return;
        }

        const sourceId = 'kml-' + layerId;
        const data = layerKmlData[layerId] || { type: 'FeatureCollection', features: [] };
        const visibility = layer.visible ? 'visible' : 'none';
        const color = layer.color;
        const isOutlineOnly = layer.renderMode === 'outline';
        const outlineThickness = Math.max(1, Math.min(12, Number(layer.thickness) || 2));

        // Territory layers (main / the two advances layers) need a
        // stable per-feature id so a single hand-drawn shape can be
        // clicked, edited, deleted, or applied later without touching
        // its neighbours. KML-loaded polygons won't have one yet the
        // first time this runs, so backfill it here.
        if (territoryLayerIds.includes(layerId)) {
          data.features.forEach((feature) => {
            const isPolygon = feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon');
            if (isPolygon) {
              feature.properties = feature.properties || {};
              if (!feature.properties.id) {
                feature.properties.id = genId();
              }
            }
          });
        }

        if (map.getSource(sourceId)) {
          map.getSource(sourceId).setData(data);
        } else {
          map.addSource(sourceId, { type: 'geojson', data });
        }

        const fillId = sourceId + '-fill';
        if (!isOutlineOnly && !map.getLayer(fillId)) {
          map.addLayer({
            id: fillId,
            type: 'fill',
            source: sourceId,
            filter: ['==', ['geometry-type'], 'Polygon'],
            layout: { visibility },
            paint: { 'fill-color': color, 'fill-opacity': 0.25, 'fill-outline-color': color }
          });

          // Wire up click-to-manage for territory polygons. Guarded by
          // wiredTerritoryClickLayers (not just "layer didn't exist
          // yet") because switching map styles wipes and recreates
          // every custom layer — including this fill layer — while
          // MapLibre's layer-id-scoped listeners persist across that,
          // so re-registering here on every style switch would stack
          // up duplicate handlers. Any admin can click a drawn shape
          // to delete it, add/move its points, or — for the two
          // advances layers — apply it into the main layer.
          if (territoryLayerIds.includes(layerId) && !wiredTerritoryClickLayers.has(fillId)) {
            wiredTerritoryClickLayers.add(fillId);
            map.on('click', fillId, (event) => {
              // Every territory polygon is clickable. The popup decides
              // which actions apply to this layer (for example, only pending
              // advances get the "Apply the advance" action).
              if (state.frontlineHistoryMode || state.drawingTool || state.territoryEdit) {
                return;
              }
              // A click on a flag, pinpoint or open popup that happens to
              // sit on top of a polygon belongs to that object, not to the
              // polygon underneath it.
              if (isClickOnMapObject(event)) {
                return;
              }
              const rendered = event.features && event.features[0];
              const featureId = rendered && rendered.properties && rendered.properties.id;
              if (!featureId) {
                return;
              }
              openTerritoryFeaturePopup(layerId, featureId, event.lngLat);
            });
            map.on('mouseenter', fillId, () => {
              if (territoryLayerIds.includes(layerId) && !state.frontlineHistoryMode && !state.drawingTool && !state.territoryEdit) {
                map.getCanvasContainer().style.cursor = 'pointer';
              }
            });
            map.on('mouseleave', fillId, () => {
              if (!state.drawingTool) {
                map.getCanvasContainer().style.cursor = '';
              }
            });
          }
        } else if (!isOutlineOnly) {
          map.setLayoutProperty(fillId, 'visibility', visibility);
          map.setPaintProperty(fillId, 'fill-color', color);
          map.setPaintProperty(fillId, 'fill-outline-color', color);
        } else if (map.getLayer(fillId)) {
          map.setLayoutProperty(fillId, 'visibility', 'none');
        }

        const lineId = sourceId + '-line';
        const lineFilter = isOutlineOnly
          ? ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false]
          : ['==', ['geometry-type'], 'LineString'];
        if (!map.getLayer(lineId)) {
          map.addLayer({
            id: lineId,
            type: 'line',
            source: sourceId,
            filter: lineFilter,
            layout: { visibility, 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': color, 'line-width': isOutlineOnly ? outlineThickness : 3 }
          });
        } else {
          map.setLayoutProperty(lineId, 'visibility', visibility);
          map.setPaintProperty(lineId, 'line-color', color);
          map.setPaintProperty(lineId, 'line-width', isOutlineOnly ? outlineThickness : 3);
        }

        const pointId = sourceId + '-point';
        if (!map.getLayer(pointId)) {
          map.addLayer({
            id: pointId,
            type: 'circle',
            source: sourceId,
            filter: ['==', ['geometry-type'], 'Point'],
            layout: { visibility },
            paint: {
              'circle-radius': 6,
              'circle-color': color,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1.5
            }
          });
        } else {
          map.setLayoutProperty(pointId, 'visibility', visibility);
          map.setPaintProperty(pointId, 'circle-color', color);
        }

        // Recompute the Advances tab whenever a territory layer's data
        // changes, so it always reflects what's actually on the map —
        // not just the moments a Firestore sync or "Apply the advance"
        // click already trigger a re-render.
        if (territoryLayerIds.includes(layerId) && sidebarTab === 'advances') {
          renderAdvancesView();
        }
      }
