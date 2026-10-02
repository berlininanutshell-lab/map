      // Layer UI/rendering lives in the separate layers.js module.
      // Keep this bridge so the existing map code can call renderLayers()
      // without being rewritten or coupled to the module's implementation.
      function renderLayers() {
        if (typeof window.__layersModuleRender === 'function') {
          return window.__layersModuleRender();
        }
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
          if ((button.dataset.tool === 'flag' || button.dataset.tool === 'polygon') && (state.role !== 'admin' || state.frontlineHistoryMode)) {
            return;
          }

          state.drawingTool = button.dataset.tool;
          updateThicknessControl();
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
