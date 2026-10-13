      // Layer UI/rendering lives in the separate layers.js module.
      // Keep this bridge so the existing map code can call renderLayers()
      // without being rewritten or coupled to the module's implementation.
      function renderLayers() {
        if (typeof window.__layersModuleRender === 'function') {
          return window.__layersModuleRender();
        }
      }

      let russianFrontlinePushChain = Promise.resolve();
      let russianFrontlinePushesInFlight = 0;
      let russianFrontlineSnapshotSeq = 0;
      let russianFrontlineSyncBlocked = false;
      let russianFrontlinePopup = null;
      let russianFrontlineEditControlsEl = null;

      function closeRussianFrontlinePopup() {
        if (russianFrontlinePopup) {
          russianFrontlinePopup.remove();
          russianFrontlinePopup = null;
        }
      }

      function refreshRussianFrontlineEdit(edit) {
        const data = layerKmlData['russian-frontline'];
        const feature = data && data.features.find((entry) =>
          entry.properties && entry.properties.id === edit.featureId
        );
        if (!feature) {
          return;
        }
        feature.geometry = { type: 'LineString', coordinates: edit.coordinates.map((coord) => coord.slice()) };
        ensureKmlLayersForLayer('russian-frontline');
      }

      function rebuildRussianFrontlineEditMarkers(edit) {
        edit.vertexMarkers.forEach((marker) => marker.remove());
        edit.midMarkers.forEach((marker) => marker.remove());
        edit.vertexMarkers = [];
        edit.midMarkers = [];

        edit.coordinates.forEach((coord, index) => {
          const el = document.createElement('div');
          el.className = 'russian-frontline-vertex-handle';
          el.title = 'Drag to move · right-click to remove';
          const marker = new maplibregl.Marker({ element: el, draggable: true })
            .setLngLat(coord)
            .addTo(map);
          marker.on('drag', () => {
            const lngLat = marker.getLngLat();
            edit.coordinates[index] = [lngLat.lng, lngLat.lat];
            refreshRussianFrontlineEdit(edit);
            edit.midMarkers.forEach((midMarker, midIndex) => {
              const a = edit.coordinates[midIndex];
              const b = edit.coordinates[midIndex + 1];
              midMarker.setLngLat([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
            });
          });
          el.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            if (edit.coordinates.length <= 2) {
              return;
            }
            edit.coordinates.splice(index, 1);
            refreshRussianFrontlineEdit(edit);
            rebuildRussianFrontlineEditMarkers(edit);
          });
          edit.vertexMarkers.push(marker);
        });

        for (let i = 0; i < edit.coordinates.length - 1; i++) {
          const a = edit.coordinates[i];
          const b = edit.coordinates[i + 1];
          const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const el = document.createElement('div');
          el.className = 'russian-frontline-vertex-add';
          el.title = 'Click to add a point here';
          const marker = new maplibregl.Marker({ element: el }).setLngLat(midpoint).addTo(map);
          el.addEventListener('click', (event) => {
            event.stopPropagation();
            edit.coordinates.splice(i + 1, 0, midpoint);
            refreshRussianFrontlineEdit(edit);
            rebuildRussianFrontlineEditMarkers(edit);
          });
          edit.midMarkers.push(marker);
        }
      }

      function finishRussianFrontlineEdit(commit) {
        const edit = state.russianFrontlineEdit;
        if (!edit) {
          return;
        }
        edit.vertexMarkers.forEach((marker) => marker.remove());
        edit.midMarkers.forEach((marker) => marker.remove());
        if (russianFrontlineEditControlsEl) {
          russianFrontlineEditControlsEl.remove();
          russianFrontlineEditControlsEl = null;
        }
        state.russianFrontlineEdit = null;

        const data = layerKmlData['russian-frontline'];
        const feature = data && data.features.find((entry) =>
          entry.properties && entry.properties.id === edit.featureId
        );
        if (!feature) {
          return;
        }
        if (!commit) {
          feature.geometry = edit.originalGeometry;
          ensureKmlLayersForLayer('russian-frontline');
          return;
        }
        feature.geometry = { type: 'LineString', coordinates: edit.coordinates.map((coord) => coord.slice()) };
        ensureKmlLayersForLayer('russian-frontline');
        pushRussianFrontlineToFirestore();
        adminNotice('Frontline line updated.');
      }

      function enterRussianFrontlineEdit(featureId) {
        const data = layerKmlData['russian-frontline'];
        const feature = data && data.features.find((entry) =>
          entry.properties && entry.properties.id === featureId
        );
        if (state.role !== 'admin' || state.frontlineHistoryMode || state.drawingTool ||
            !feature || feature.geometry.type !== 'LineString') {
          return;
        }
        closeRussianFrontlinePopup();
        state.russianFrontlineEdit = {
          featureId,
          coordinates: feature.geometry.coordinates.map((coord) => coord.slice()),
          originalGeometry: JSON.parse(JSON.stringify(feature.geometry)),
          vertexMarkers: [],
          midMarkers: []
        };
        rebuildRussianFrontlineEditMarkers(state.russianFrontlineEdit);
        russianFrontlineEditControlsEl = document.createElement('div');
        russianFrontlineEditControlsEl.className = 'territory-edit-controls russian-frontline-edit-controls';
        russianFrontlineEditControlsEl.innerHTML =
          '<span>Drag points to move · click + to add · right-click a point to remove</span>' +
          '<button type="button" class="territory-edit-done">Done</button>' +
          '<button type="button" class="territory-edit-cancel">Cancel</button>';
        document.body.appendChild(russianFrontlineEditControlsEl);
        russianFrontlineEditControlsEl.querySelector('.territory-edit-done').addEventListener('click', () => {
          finishRussianFrontlineEdit(true);
        });
        russianFrontlineEditControlsEl.querySelector('.territory-edit-cancel').addEventListener('click', () => {
          finishRussianFrontlineEdit(false);
        });
      }

      function openRussianFrontlineFeaturePopup(featureId, lngLat) {
        if (state.role !== 'admin' || state.frontlineHistoryMode || state.drawingTool || state.russianFrontlineEdit) {
          return;
        }
        const data = layerKmlData['russian-frontline'];
        const feature = data && data.features.find((entry) =>
          entry.properties && entry.properties.id === featureId
        );
        if (!feature) {
          return;
        }

        closeRussianFrontlinePopup();
        const content = document.createElement('div');
        content.className = 'marker-popup';
        const title = document.createElement('div');
        title.className = 'marker-popup-title';
        title.textContent = 'Pro-Russian sources frontline';
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'marker-popup-apply';
        editButton.textContent = 'Edit line';
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'marker-popup-delete';
        removeButton.textContent = 'Delete line';
        content.append(title, editButton, removeButton);

        const popup = new maplibregl.Popup({ offset: 14, closeButton: true, closeOnClick: false })
          .setLngLat(lngLat)
          .setDOMContent(content)
          .addTo(map);
        russianFrontlinePopup = popup;
        popup.on('close', () => {
          if (russianFrontlinePopup === popup) {
            russianFrontlinePopup = null;
          }
        });
        editButton.addEventListener('click', () => {
          enterRussianFrontlineEdit(featureId);
        });
        removeButton.addEventListener('click', () => {
          if (state.role !== 'admin' || state.frontlineHistoryMode) {
            closeRussianFrontlinePopup();
            return;
          }
          const currentData = layerKmlData['russian-frontline'];
          if (!currentData) {
            closeRussianFrontlinePopup();
            return;
          }
          const before = currentData.features.length;
          currentData.features = currentData.features.filter((entry) =>
            !entry.properties || entry.properties.id !== featureId
          );
          if (currentData.features.length === before) {
            closeRussianFrontlinePopup();
            return;
          }
          ensureKmlLayersForLayer('russian-frontline');
          pushRussianFrontlineToFirestore();
          closeRussianFrontlinePopup();
          adminNotice('Frontline line deleted.');
        });
      }

      function clearRussianFrontline() {
        if (state.role !== 'admin' || state.frontlineHistoryMode) {
          return;
        }
        layerKmlData['russian-frontline'] = { type: 'FeatureCollection', features: [] };
        ensureKmlLayersForLayer('russian-frontline');
        pushRussianFrontlineToFirestore();
      }

      function pushRussianFrontlineToFirestore() {
        if (state.role !== 'admin' || state.frontlineHistoryMode) {
          return;
        }
        if (!russianFrontlineDocRef) {
          adminNotice('The shared frontline cannot be saved because Firebase is unavailable.');
          return;
        }

        const data = layerKmlData['russian-frontline'] || { type: 'FeatureCollection', features: [] };
        const json = JSON.stringify(data);
        russianFrontlinePushesInFlight++;
        russianFrontlinePushChain = russianFrontlinePushChain.then(async () => {
          try {
            const packed = await packLayerString(json);
            await russianFrontlineDocRef.set({ geojson: packed });
            russianFrontlineSyncBlocked = false;
          } catch (error) {
            console.error('Failed to save shared pro-Russian-sources frontline', error);
            russianFrontlineSyncBlocked = true;
            const code = error && error.code || 'unknown-error';
            const hint = code === 'permission-denied' ? ' Check the Firestore rules for mapState/russianFrontline.' : '';
            adminNotice('Could not save the shared frontline (' + code + '). It is only kept on this screen.' + hint);
          } finally {
            russianFrontlinePushesInFlight--;
          }
        });
      }

      if (russianFrontlineDocRef) {
        russianFrontlineDocRef.onSnapshot(async (doc) => {
          if (russianFrontlineSyncBlocked && !doc.metadata.hasPendingWrites) {
            return;
          }
          if (russianFrontlinePushesInFlight > 0 && !doc.metadata.hasPendingWrites) {
            return;
          }

          const seq = ++russianFrontlineSnapshotSeq;
          try {
            let parsed = { type: 'FeatureCollection', features: [] };
            if (doc.exists) {
              const raw = doc.data() && doc.data().geojson;
              if (typeof raw !== 'string') {
                console.error('Shared pro-Russian-sources frontline document has no GeoJSON data.');
                return;
              }
              parsed = JSON.parse(await unpackLayerString(raw));
              if (!parsed || !Array.isArray(parsed.features) || parsed.type !== 'FeatureCollection') {
                throw new Error('Stored frontline is not a GeoJSON FeatureCollection.');
              }
              parsed.features = parsed.features.filter((feature) =>
                feature && feature.geometry && feature.geometry.type === 'LineString' &&
                Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length >= 2
              );
              parsed.features.forEach((feature) => {
                feature.properties = feature.properties || {};
                if (!feature.properties.id) {
                  feature.properties.id = genId();
                }
              });
            }
            if (seq !== russianFrontlineSnapshotSeq) {
              return;
            }
            layerKmlData['russian-frontline'] = parsed;
            closeRussianFrontlinePopup();
            ensureKmlLayersForLayer('russian-frontline');
          } catch (error) {
            console.error('Could not read shared pro-Russian-sources frontline', error);
          }
        }, (error) => {
          console.error('Failed to sync shared pro-Russian-sources frontline', error);
          adminNotice('The shared pro-Russian-sources frontline could not be loaded. Check the Firestore rules.');
        });
      }

      // Keeps every visitor's flags in sync with whatever an admin last
      // placed/moved/deleted, in real time — including on first page
      // load, so a fresh guest sees the admin's flags, not an empty
      // map. Reconciles by flagId: moves markers that already exist
      // locally, creates ones that are new, and removes ones no longer
      // in the remote list.
      if (flagsDocRef) {
        flagsDocRef.onSnapshot((doc) => {
          if (!doc.exists) {
            return;
          }
          const remoteList = Array.isArray(doc.data().list) ? doc.data().list : [];
          const remoteIds = new Set(remoteList.map((entry) => entry && entry.id));

          flagMarkers = flagMarkers.filter((marker) => {
            if (remoteIds.has(marker.flagId)) {
              return true;
            }
            marker.remove();
            return false;
          });

          const localById = new Map(flagMarkers.map((marker) => [marker.flagId, marker]));

          remoteList.forEach((entry) => {
            if (!entry || typeof entry.lng !== 'number' || typeof entry.lat !== 'number') {
              return;
            }
            const existing = localById.get(entry.id);
            if (existing) {
              const current = existing.getLngLat();
              if (current.lng !== entry.lng || current.lat !== entry.lat) {
                existing.setLngLat([entry.lng, entry.lat]);
                refreshFlagPopup(existing);
              }
            } else {
              placeFlag(entry.lng, entry.lat, entry.nation, entry.id);
            }
          });
        }, (error) => {
          console.error('Failed to sync shared flags', error);
        });
      }

      // Keeps every visitor's territory polygons (main, Russian
      // advances, Ukrainian advances) in sync with whatever an admin
      // last drew, edited, deleted, or applied, in real time —
      // including on first page load, so a fresh guest sees the
      // shared territory, not just the static kml/ baseline. Each
      // layer is stored as a JSON string (see pushTerritoriesToFirestore)
      // and simply replaces the local copy of that layer wholesale;
      // while a shape on a given layer is being vertex-edited locally,
      // updates to that specific layer are skipped so the in-progress
      // drag isn't yanked out from under the admin doing it.
      if (territoriesDocRef) {
        territoriesDocRef.onSnapshot(async (doc) => {
          if (state.frontlineHistoryMode) {
            return;
          }
          if (!doc.exists) {
            return;
          }
          // A failed save makes Firestore roll back to the last server
          // copy, which would silently erase the just-drawn shapes.
          // Keep the local shapes until a save succeeds again.
          if (territorySyncBlocked && !doc.metadata.hasPendingWrites) {
            return;
          }
          // A save is still being packed: a server copy arriving now is
          // stale and would overwrite the shape that was just drawn.
          if (territoryPushesInFlight > 0 && !doc.metadata.hasPendingWrites) {
            return;
          }
          const seq = ++territorySnapshotSeq;
          const remote = doc.data() || {};
          const decoded = {};
          for (const layerId of sharedLayerIds) {
            const raw = remote[layerId];
            if (typeof raw !== 'string') {
              continue;
            }
            try {
              const parsed = JSON.parse(await unpackLayerString(raw));
              if (parsed && Array.isArray(parsed.features)) {
                decoded[layerId] = parsed;
              }
            } catch (error) {
              console.error('Could not read stored layer', layerId, error);
            }
          }
          if (seq !== territorySnapshotSeq || state.frontlineHistoryMode) {
            return;
          }
          let changed = false;

          sharedLayerIds.forEach((layerId) => {
            if (state.territoryEdit && state.territoryEdit.layerId === layerId) {
              return;
            }
            const parsed = decoded[layerId];
            if (!parsed) {
              return;
            }
            if (['main', 'russian-advances', 'ukrainian-advances'].includes(layerId)) {
              invalidateContestedCache();
            }
            layerKmlData[layerId] = parsed;

            territoryLoadedFromFirestore.add(layerId);
            changed = true;

            ensureKmlLayersForLayer(layerId);
          });

          if (changed) {
            // A shape the open popup refers to may have just been
            // applied/deleted/edited by someone else — close it rather
            // than risk acting on a feature id that no longer exists.
            closeTerritoryPopup();
            if (sidebarTab === 'advances') {
              renderAdvancesView();
            }
          }
        }, (error) => {
          console.error('Failed to sync shared territories', error);
        });
      }

      drawToolsBtn.addEventListener('click', () => {
        const isOpen = !toolMenu.hidden;
        if (isOpen) {
          closeToolMenu();
        } else {
          toolMenu.hidden = false;
          drawToolsBtn.setAttribute('aria-expanded', 'true');
        }
      });

      // Scoped to the main tool list (not the line-variant flyout,
      // which has its own click handler below) so the dashed-line
      // option doesn't end up wired to both.
      toolMenu.querySelectorAll('.tool-option').forEach((button) => {
        button.addEventListener('click', () => {
          // The flag tool is only ever meant to be reachable by admins —
          // it's hidden via CSS for everyone else, but this guard covers
          // it too in case the role changed after the menu was opened.
          if (
            ['flag', 'polygon', 'russian-frontline', 'contested-circle'].includes(button.dataset.tool) &&
            (state.role !== 'admin' || state.frontlineHistoryMode)
          ) {
            return;
          }
          if (state.territorySmoothing && button.dataset.tool !== 'polygon') {
            drawHint.textContent = 'Finish or cancel the pending territory polygon before choosing another drawing tool.';
            return;
          }

          if (state.drawingTool === 'contested-circle' && button.dataset.tool !== 'contested-circle') {
            state.circleCenter = null;
            state.circleRadiusGuide = null;
            state.circleRadiusLabel = null;
            state.draft = null;
            updateDrawings();
          }
          if (button.dataset.tool === 'contested-circle') {
            state.circleCenter = null;
            state.circleRadiusGuide = null;
            state.circleRadiusLabel = null;
            state.draft = null;
            const contestedLayer = getLayerById('contested');
            contestedLayer.visible = true;
            renderLayers();
            ensureKmlLayersForLayer('contested');
            updateDrawings();
          }

          state.drawingTool = button.dataset.tool;
          updateThicknessControl();
          if (button.dataset.tool === 'russian-frontline') {
            const frontlineLayer = getLayerById('russian-frontline');
            frontlineLayer.visible = true;
            renderLayers();
            ensureKmlLayersForLayer('russian-frontline');
          }
          if (button.dataset.tool === 'flag') {
            state.flagType = button.dataset.flagNation === 'russia' ? 'russia' : 'ukraine';
          }
          document.querySelectorAll('.tool-option').forEach((option) => {
            option.setAttribute('aria-pressed', String(option === button));
          });
          territoryLayerPicker.hidden = button.dataset.tool !== 'polygon';

          drawHint.textContent = state.drawingTool === 'flag'
            ? 'Click the map to place a ' + (state.flagType === 'russia' ? 'Russian' : 'Ukrainian') + ' flag. Drag a flag to move it.'
            : toolHints[state.drawingTool];
          map.getCanvasContainer().style.cursor = 'crosshair';
          closeLineVariantMenu();
        });
      });
