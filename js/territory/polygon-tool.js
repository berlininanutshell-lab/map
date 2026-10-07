      // ---- Territory polygon tool ----
      // Lets an admin draw a pending advance or a hand-marked Contested
      // area by choosing a layer and drawing a closed shape.
      //
      //  - Drawing on "main" adds the shape straight into main as its
      //    own new feature (own id), sitting alongside whatever main
      //    already has.
      //  - Drawing on "russian-advances" or "ukrainian-advances" does
      //    NOT touch main yet. The shape is clipped against main (a
      //    Russian advance can't re-claim ground main already shows as
      //    taken; a Ukrainian advance only "counts" through ground
      //    main currently shows as taken) and added to the advances
      //    layer as its own pending shape, visible to everyone. An
      //    admin then clicks that shape on the map and chooses "Apply
      //    the advance" (see openTerritoryFeaturePopup /
      //    applyAdvanceFeature below) to fold it into main and remove
      //    it from the advances layer, or "Delete" to discard it, or
      //    "Edit shape" to add/move points first.
      //
      // Every shape keeps its own id (never merged into its
      // neighbours) specifically so it stays individually selectable,
      // editable, and deletable. Territory shapes are synced to every
      // visitor through territoriesDocRef.

      // All Polygon/MultiPolygon features currently held by a layer
      // (from its loaded KML plus any earlier territory edits).
      function layerPolygonFeatures(layerId) {
        const data = layerKmlData[layerId];
        if (!data) {
          return [];
        }
        return data.features.filter(
          (feature) => feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')
        );
      }

      // Merges a layer's separate polygon features into one
      // Polygon/MultiPolygon geometry (or null if the layer has none).
      // Used only as a throwaway shape to clip new draws/edits against
      // — never written back as storage, so existing features keep
      // their own identity.
      function unionPolygonFeatures(features) {
        if (!features.length) {
          return null;
        }
        return features.reduce((merged, feature) => (merged ? turf.union(merged, feature) : feature), null);
      }

      function findTerritoryFeature(layerId, featureId) {
        const data = layerKmlData[layerId];
        if (!data) {
          return null;
        }
        return data.features.find((feature) => feature.properties && feature.properties.id === featureId) || null;
      }

      // Serializes the territory layers for Firestore. Each
      // layer is JSON.stringify'd into a single string field because
      // Firestore rejects arrays nested directly inside arrays, which
      // polygon coordinate rings always are.
      function pushTerritoriesToFirestore() {
        if (!territoriesDocRef) {
          return;
        }
        // Safety: a historical snapshot must never be written over the
        // live territories.
        if (state.frontlineHistoryMode) {
          return;
        }
        // Copy the current state right now; packing happens asynchronously
        // and pushes are queued so an older save can never land after a
        // newer one.
        const layerMap = {};
        sharedLayerIds.forEach((layerId) => {
          layerMap[layerId] = JSON.parse(JSON.stringify(layerKmlData[layerId] || { type: 'FeatureCollection', features: [] }));
        });
        territoryPushesInFlight++;
        territoryPushChain = territoryPushChain.then(async () => {
          let total = 0;
          try {
            const result = await packLayers(layerMap);
            total = result.total;
            if (total > 1000000) {
              const err = new Error('Territories are too large to store (' + total + ' bytes packed).');
              err.code = 'too-large';
              throw err;
            }
            await territoriesDocRef.set(result.packed);
            territorySyncBlocked = false;
          } catch (error) {
            console.error('Failed to save shared territories', error);
            territorySyncBlocked = true;
            const code = (error && error.code) || 'unknown-error';
            let hint = '';
            if (code === 'permission-denied') {
              hint = ' Check the Firestore rules for mapState/territories.';
            } else if (code === 'too-large' || code === 'invalid-argument') {
              hint = ' The map data is too large even after compression.';
            }
            adminNotice('Could not save to the shared map (' + code + '). Your drawing is only kept on this screen.' + hint);
          } finally {
            territoryPushesInFlight--;
          }
        });
      }

      // Adds `geometry` (Polygon, MultiPolygon, Feature, or
      // FeatureCollection) to a layer as one or more brand-new
      // features, each with its own id — flattening a MultiPolygon so
      // every disjoint part stays independently selectable. Re-renders
      // the layer and pushes the change to every visitor.
      function addTerritoryFeature(layerId, geometry, options) {
        if (!geometry) {
          return;
        }
        if (!layerKmlData[layerId]) {
          layerKmlData[layerId] = { type: 'FeatureCollection', features: [] };
        }
        const data = layerKmlData[layerId];
        turf.flatten(geometry).features.forEach((part) => {
          data.features.push({
            type: 'Feature',
            properties: { id: genId(), name: '', description: '', source: '' },
            geometry: part.geometry
          });
        });
        ensureKmlLayersForLayer(layerId);
        if (!options || options.push !== false) {
          pushTerritoriesToFirestore();
        }
      }

      // Removes one specific feature from a layer by id, leaving every
      // other shape on that layer untouched.
      function removeTerritoryFeature(layerId, featureId, options) {
        const data = layerKmlData[layerId];
        if (!data) {
          return;
        }
        const before = data.features.length;
        data.features = data.features.filter((feature) => !(feature.properties && feature.properties.id === featureId));
        if (data.features.length === before) {
          return;
        }
        ensureKmlLayersForLayer(layerId);
        if (!options || options.push !== false) {
          pushTerritoriesToFirestore();
        }
      }

      // Cuts `geometryToRemove` out of every main polygon it overlaps,
      // replacing just the affected main feature(s) with the
      // difference (split back into individual features if cutting a
      // piece out leaves it in several parts). Used when a Ukrainian
      // advance is applied. Main features that don't overlap at all
      // are left completely untouched, including their id.
      function subtractFromMain(geometryToRemove) {
        subtractFromLayer('main', geometryToRemove);
      }

      function robustTerritoryDifference(minuend, subtrahend) {
        try {
          return turf.difference(minuend, subtrahend);
        } catch (originalError) {
          for (const precision of [6, 5, 4]) {
            try {
              const cleanMinuend = turf.truncate(turf.cleanCoords(minuend), {
                precision,
                coordinates: 2,
                mutate: false
              });
              const cleanSubtrahend = turf.truncate(turf.cleanCoords(subtrahend), {
                precision,
                coordinates: 2,
                mutate: false
              });
              return turf.difference(cleanMinuend, cleanSubtrahend);
            } catch (retryError) {
              // Retry at lower precision when edges nearly coincide.
            }
          }

          try {
            return turf.difference(turf.buffer(minuend, 0), turf.buffer(subtrahend, 0));
          } catch (repairError) {
            throw originalError;
          }
        }
      }

      // Same as subtractFromMain, but for any territory layer (used to
      // keep Russian Control and Ukrainian Control from overlapping
      // when an advance is applied).
      function subtractFromLayer(layerId, geometryToRemove) {
        const data = layerKmlData[layerId] || { type: 'FeatureCollection', features: [] };
        const removalFeature = turf.feature(geometryToRemove);
        const kept = [];

        for (const feature of data.features) {
          const isPolygon = feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon');
          if (!isPolygon) {
            kept.push(feature);
            continue;
          }
          const diff = robustTerritoryDifference(feature, removalFeature);
          if (!diff) {
            // Entire feature was inside the removed area — drop it.
            continue;
          }
          turf.flatten(diff).features.forEach((part) => {
            kept.push({
              type: 'Feature',
              properties: { id: genId(), name: '', description: '', source: '' },
              geometry: part.geometry
            });
          });
        }

        layerKmlData[layerId] = { type: 'FeatureCollection', features: kept };
        ensureKmlLayersForLayer(layerId);
      }

      // Applies a hand-drawn ring (an array of [lng, lat] positions,
      // first === last) to whichever layer was selected in the
      // territory-layer picker. See the comment above this section for
      // what happens on each layer.
      function applyTerritoryPolygon(ring, layerId) {
        let drawnPolygon;
        try {
          drawnPolygon = turf.polygon([ring]);
        } catch (error) {
          console.error('Invalid territory polygon shape', error);
          drawHint.textContent = 'That shape was too small or self-crossing — try again.';
          return;
        }

        if (layerId === 'contested') {
          if (!ukraineLandMask) {
            drawHint.textContent = 'The Ukraine land mask is not ready yet — try again in a moment.';
            return;
          }
          const clipped = turf.intersect(drawnPolygon, ukraineLandMask);
          if (!clipped) {
            drawHint.textContent = 'That area is outside Ukrainian land — nothing added.';
            return;
          }
          addTerritoryFeature('contested', clipped.geometry || clipped);
          drawHint.textContent = 'Added a rounded manual Contested area. Click it to edit or delete.';
          return;
        }

        if (layerId === 'main') {
          addTerritoryFeature('main', drawnPolygon.geometry);
          drawHint.textContent = 'Added to Russian Control. Click it to edit or delete.';
          return;
        }

        if (layerId === 'ukrainian-control') {
          addTerritoryFeature('ukrainian-control', drawnPolygon.geometry);
          drawHint.textContent = 'Added to Ukrainian Control. Click it to edit or delete.';
          return;
        }

        const mainGeometry = unionPolygonFeatures(layerPolygonFeatures('main'));

        if (layerId === 'russian-advances') {
          const clipped = mainGeometry ? turf.difference(drawnPolygon, mainGeometry) : drawnPolygon;
          if (!clipped) {
            drawHint.textContent = 'That area is already inside Russian Control — nothing added.';
            return;
          }
          addTerritoryFeature('russian-advances', clipped.geometry || clipped);
          drawHint.textContent = 'Drawn as a pending Russian advance. Click it and choose "Apply the advance" to add it to Russian Control.';
          return;
        }

        if (layerId === 'ukrainian-advances') {
          if (!mainGeometry) {
            drawHint.textContent = 'Nothing to draw — Russian Control has no territory yet.';
            return;
          }

          const clipped = turf.intersect(drawnPolygon, mainGeometry);
          if (!clipped) {
            drawHint.textContent = 'That area is outside Russian Control — nothing drawn.';
            return;
          }

          addTerritoryFeature('ukrainian-advances', clipped.geometry || clipped);
          drawHint.textContent = 'Drawn as a pending Ukrainian advance. Click it and choose "Apply the advance" to move it from Russian Control to Ukrainian Control.';
          return;
        }
      }

      // Small toast for layer-list actions (KMZ / import), since the
      // drawing hint line is hidden while the tool menu is closed.
      let adminNoticeTimer = null;
      function adminNotice(message) {
        let el = document.getElementById('adminNotice');
        if (!el) {
          el = document.createElement('div');
          el.id = 'adminNotice';
          el.setAttribute('role', 'status');
          el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2000;' +
            'max-width:min(90vw,520px);padding:10px 14px;border-radius:8px;background:rgba(10,10,10,0.96);' +
            'border:1px solid rgba(255,255,255,0.15);color:#edf5ff;font-size:13px;line-height:1.4;' +
            'box-shadow:0 8px 24px rgba(0,0,0,0.4);pointer-events:none;';
          document.body.appendChild(el);
        }
        el.textContent = message;
        el.style.display = 'block';
        clearTimeout(adminNoticeTimer);
        adminNoticeTimer = setTimeout(() => { el.style.display = 'none'; }, 5000);
      }
