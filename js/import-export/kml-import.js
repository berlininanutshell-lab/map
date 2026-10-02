      // ---- KML / KMZ import (admin only) ----
      // Reads a .kml or .kmz file, keeps its polygons, and adds them to
      // the chosen territory layer as new shapes (existing shapes are
      // kept). Points and lines in the file are skipped. Polygons are
      // added exactly as drawn in the file — they are not clipped
      // against the other layers.
      const territoryImportInput = document.createElement('input');
      territoryImportInput.type = 'file';
      territoryImportInput.accept = '.kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz';
      territoryImportInput.hidden = true;
      document.body.appendChild(territoryImportInput);
      let territoryImportLayerId = null;

      function startTerritoryImport(layerId) {
        if (!isAdmin()) {
          return;
        }
        if (state.frontlineHistoryMode) {
          adminNotice('Return to the current frontline before importing.');
          return;
        }
        territoryImportLayerId = layerId;
        territoryImportInput.value = '';
        territoryImportInput.click();
      }

      function closeImportedRing(ring) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          return ring.concat([[first[0], first[1]]]);
        }
        return ring;
      }

      async function readKmlTextFromFile(file) {
        const isKmz = /\.kmz$/i.test(file.name);
        if (!isKmz) {
          return await file.text();
        }
        if (typeof JSZip === 'undefined') {
          throw new Error('The zip library failed to load, so KMZ files cannot be read.');
        }
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        const kmlEntries = Object.values(zip.files).filter((entry) => !entry.dir && /\.kml$/i.test(entry.name));
        if (!kmlEntries.length) {
          throw new Error('That KMZ has no KML file inside.');
        }
        const preferred = kmlEntries.find((entry) => /(^|\/)doc\.kml$/i.test(entry.name)) || kmlEntries[0];
        return await preferred.async('string');
      }

      territoryImportInput.addEventListener('change', async () => {
        const file = territoryImportInput.files && territoryImportInput.files[0];
        const layerId = territoryImportLayerId;
        territoryImportLayerId = null;
        if (!file || !layerId || !isAdmin() || state.frontlineHistoryMode) {
          return;
        }
        const layer = getLayerById(layerId);

        try {
          const kmlText = await readKmlTextFromFile(file);
          const parsed = parseKmlToGeoJSON(kmlText);
          const polygons = [];
          let skipped = 0;

          parsed.features.forEach((feature) => {
            if (feature.geometry.type !== 'Polygon') {
              skipped++;
              return;
            }
            const rings = feature.geometry.coordinates.map(closeImportedRing);
            if (rings.every((ring) => ring.length >= 4)) {
              polygons.push({ properties: feature.properties, geometry: { type: 'Polygon', coordinates: rings } });
            } else {
              skipped++;
            }
          });

          if (!polygons.length) {
            adminNotice('No polygons found in ' + file.name + '.');
            return;
          }

          if (!layerKmlData[layerId]) {
            layerKmlData[layerId] = { type: 'FeatureCollection', features: [] };
          }
          polygons.forEach((polygon) => {
            layerKmlData[layerId].features.push({
              type: 'Feature',
              properties: {
                id: genId(),
                name: (polygon.properties && polygon.properties.name) || '',
                description: (polygon.properties && polygon.properties.description) || '',
                source: (polygon.properties && (polygon.properties.source || polygon.properties.url || polygon.properties.link)) || ''
              },
              geometry: polygon.geometry
            });
          });

          ensureKmlLayersForLayer(layerId);
          pushTerritoriesToFirestore();
          drawHint.textContent = 'Imported ' + polygons.length + ' polygon' + (polygons.length === 1 ? '' : 's') +
            ' into ' + layer.name + (skipped ? ' (' + skipped + ' non-polygon item' + (skipped === 1 ? '' : 's') + ' skipped).' : '.');
        } catch (error) {
          console.error('KML import failed', error);
          adminNotice('Could not import ' + file.name + ': ' + (error.message || 'unknown error'));
        }
      });
