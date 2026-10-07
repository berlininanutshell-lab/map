      // ---- Frontline chronology ----
      // A snapshot is an immutable copy of all territory layers plus
      // the live advances-area totals at the exact moment the admin locks it.
      // Historical views never write back to the live territories document.
      const frontlineHistoryListEl = document.getElementById('frontlineHistoryList');
      const frontlineAdminDateEl = document.getElementById('frontlineAdminDate');
      const frontlineAdminStatusEl = document.getElementById('frontlineAdminStatus');
      const frontlineLockBtn = document.getElementById('frontlineLockBtn');
      const frontlineLockDateInput = document.getElementById('frontlineLockDateInput');
      const frontlineMissedDaysEl = document.getElementById('frontlineMissedDays');
      // Date the admin is about to lock; null means "today".
      let frontlineLockDate = null;
      const frontlineCurrentBanner = document.getElementById('frontlineCurrentBanner');
      const frontlineCurrentBannerDate = document.getElementById('frontlineCurrentBannerDate');
      const frontlineReturnCurrentBtn = document.getElementById('frontlineReturnCurrentBtn');
      const frontlineHistoryEntries = new Map();

      function cloneTerritoryData() {
        const result = {};
        territoryLayerIds.forEach((layerId) => {
          result[layerId] = JSON.parse(JSON.stringify(
            layerKmlData[layerId] || { type: 'FeatureCollection', features: [] }
          ));
        });
        return result;
      }

      function isAdmin() {
        return state.role === 'admin';
      }

      function setFrontlineHistoryStatus(message) {
        if (frontlineAdminStatusEl) {
          frontlineAdminStatusEl.textContent = message || '';
        }
      }

      function shiftDateKey(dateKey, days) {
        const d = new Date(dateKey + 'T12:00:00');
        d.setDate(d.getDate() + days);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      }

      function shortDateKeyLabel(dateKey) {
        return new Date(dateKey + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }

      // Unlocked days between the earliest locked day and yesterday (newest first, max 14).
      function missedDateKeys(todayKey) {
        const locked = Array.from(frontlineHistoryEntries.keys()).sort();
        if (!locked.length) {
          return [];
        }
        const missed = [];
        let key = shiftDateKey(todayKey, -1);
        while (key >= locked[0] && missed.length < 14) {
          if (!frontlineHistoryEntries.has(key)) {
            missed.push(key);
          }
          key = shiftDateKey(key, -1);
        }
        return missed;
      }

      function renderFrontlineView() {
        const todayKey = todayDateKey();
        if (!frontlineLockDate || frontlineLockDate > todayKey) {
          frontlineLockDate = todayKey;
        }
        const selectedKey = frontlineLockDate;
        const isToday = selectedKey === todayKey;
        frontlineAdminDateEl.textContent = dateKeyLabel(selectedKey);
        if (frontlineLockDateInput) {
          frontlineLockDateInput.max = todayKey;
          frontlineLockDateInput.value = selectedKey;
        }

        if (frontlineMissedDaysEl) {
          const missed = isAdmin() ? missedDateKeys(todayKey) : [];
          frontlineMissedDaysEl.innerHTML = '';
          frontlineMissedDaysEl.hidden = !missed.length;
          if (missed.length) {
            const label = document.createElement('span');
            label.textContent = 'Not locked:';
            frontlineMissedDaysEl.appendChild(label);
            missed.forEach((key) => {
              const chip = document.createElement('button');
              chip.type = 'button';
              chip.className = 'frontline-missed-chip' + (key === selectedKey ? ' active' : '');
              chip.textContent = shortDateKeyLabel(key);
              chip.addEventListener('click', () => {
                frontlineLockDate = key;
                renderFrontlineView();
              });
              frontlineMissedDaysEl.appendChild(chip);
            });
          }
        }

        const selectedEntry = frontlineHistoryEntries.get(selectedKey);
        if (isAdmin()) {
          const dayWord = isToday ? 'today' : shortDateKeyLabel(selectedKey);
          if (selectedEntry) {
            frontlineAdminStatusEl.textContent = (isToday ? 'Today' : 'This date') + ' is already locked. The saved snapshot cannot be overwritten.';
            frontlineLockBtn.disabled = true;
            frontlineLockBtn.textContent = 'Locked for ' + dayWord;
          } else if (state.frontlineHistoryMode) {
            frontlineAdminStatusEl.textContent = 'Switch the timeline back to LIVE before locking a date.';
            frontlineLockBtn.disabled = true;
            frontlineLockBtn.textContent = 'Go to LIVE first';
          } else {
            frontlineAdminStatusEl.textContent = isToday
              ? 'The current map and current Advances areas will be saved exactly as they are.'
              : 'Missed day: the CURRENT map and current Advances areas will be saved under this date. Make sure the map matches that day first.';
            frontlineLockBtn.disabled = false;
            frontlineLockBtn.textContent = 'Lock frontline for ' + dayWord;
          }
        }

        renderFrontlineHistoryList();
        renderFrontlineTimeline();
        if (frontlineCurrentBanner) {
          frontlineCurrentBanner.hidden = !state.frontlineHistoryMode;
        }
        if (state.frontlineHistoryMode && frontlineCurrentBannerDate) {
          frontlineCurrentBannerDate.textContent = dateKeyLabel(state.frontlineHistoryDate) + ' — read-only historical map';
        }
      }

      function renderFrontlineHistoryList() {
        if (!frontlineHistoryListEl) {
          return;
        }
        const entries = Array.from(frontlineHistoryEntries.values()).sort((a, b) => b.date.localeCompare(a.date));
        frontlineHistoryListEl.innerHTML = '';
        if (!entries.length) {
          frontlineHistoryListEl.innerHTML = '<div class="frontline-empty">No daily frontline snapshots yet.</div>';
          return;
        }

        entries.forEach((entry) => {
          const card = document.createElement('div');
          card.className = 'frontline-history-day';

          const head = document.createElement('div');
          head.className = 'frontline-history-day-head';
          const date = document.createElement('div');
          date.className = 'frontline-history-date';
          date.textContent = dateKeyLabel(entry.date);
          const locked = document.createElement('div');
          locked.className = 'frontline-history-locked';
          locked.textContent = entry.lockedLate ? 'Locked late' : 'Locked';
          head.appendChild(date);
          head.appendChild(locked);

          const stats = document.createElement('div');
          stats.className = 'frontline-history-stats';
          stats.appendChild(makeFrontlineStat('Russian advances', entry.russianAdvanceKm2));
          stats.appendChild(makeFrontlineStat('Ukrainian advances', entry.ukrainianAdvanceKm2));

          const open = document.createElement('button');
          open.type = 'button';
          open.className = 'frontline-history-open';
          open.textContent = state.frontlineHistoryMode && state.frontlineHistoryDate === entry.date ? 'Viewing this date' : 'View this date';
          open.disabled = state.frontlineHistoryMode && state.frontlineHistoryDate === entry.date;
          open.addEventListener('click', () => showFrontlineHistory(entry.date));

          card.appendChild(head);
          card.appendChild(stats);
          card.appendChild(open);
          frontlineHistoryListEl.appendChild(card);
        });
      }

      function makeFrontlineStat(label, value) {
        const wrap = document.createElement('div');
        wrap.className = 'frontline-history-stat';
        const labelEl = document.createElement('div');
        labelEl.className = 'frontline-history-stat-label';
        labelEl.textContent = label;
        const valueEl = document.createElement('div');
        valueEl.className = 'frontline-history-stat-value';
        valueEl.textContent = formatAdvancesKm2(Number(value || 0)) + ' km²';
        wrap.appendChild(labelEl);
        wrap.appendChild(valueEl);
        return wrap;
      }

      async function lockFrontlineForToday() {
        if (!isAdmin() || !frontlineHistoryCollectionRef || state.frontlineHistoryMode) {
          return;
        }

        const todayKey = todayDateKey();
        const date = (frontlineLockDate && frontlineLockDate <= todayKey) ? frontlineLockDate : todayKey;
        const lateLock = date !== todayKey;
        frontlineLockBtn.disabled = true;
        setFrontlineHistoryStatus('Saving snapshot for ' + dateKeyLabel(date) + '…');

        try {
          const docRef = frontlineHistoryCollectionRef.doc(date);
          const existing = await docRef.get();
          if (existing.exists) {
            setFrontlineHistoryStatus('This date was already locked by an admin.');
            renderFrontlineView();
            return;
          }

          const snapshot = cloneTerritoryData();
          const packedSnapshot = await packLayers(snapshot);
          const russian = sumLayerAreaKm2('russian-advances');
          const ukrainian = sumLayerAreaKm2('ukrainian-advances');
          const user = auth && auth.currentUser;

          await docRef.set({
            date,
            main: packedSnapshot.packed.main,
            ukrainianControl: packedSnapshot.packed['ukrainian-control'],
            russianAdvances: packedSnapshot.packed['russian-advances'],
            ukrainianAdvances: packedSnapshot.packed['ukrainian-advances'],
            contested: packedSnapshot.packed.contested,
            russianAdvanceKm2: russian.km2,
            ukrainianAdvanceKm2: ukrainian.km2,
            russianAdvanceShapeCount: russian.count,
            ukrainianAdvanceShapeCount: ukrainian.count,
            lockedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lockedBy: user ? (user.email || user.uid) : 'admin',
            lockedLate: lateLock
          });

          setFrontlineHistoryStatus('Locked successfully for ' + dateKeyLabel(date) + '.');
          renderFrontlineView();
        } catch (error) {
          console.error('Failed to lock frontline snapshot', error);
          setFrontlineHistoryStatus('Could not save the snapshot. Check Firestore permissions and try again.');
          renderFrontlineView();
        }
      }

      async function readSnapshotFeatureCollection(raw) {
        if (typeof raw !== 'string') {
          return { type: 'FeatureCollection', features: [] };
        }
        try {
          const parsed = JSON.parse(await unpackLayerString(raw));
          return parsed && Array.isArray(parsed.features)
            ? parsed
            : { type: 'FeatureCollection', features: [] };
        } catch (error) {
          return { type: 'FeatureCollection', features: [] };
        }
      }

      // Unpacked snapshots are cached so stepping back and forth (and the
      // play animation) does not re-decode the same day again and again.
      const frontlineSnapshotCache = new Map();

      async function loadFrontlineSnapshot(date) {
        const entry = frontlineHistoryEntries.get(date);
        if (!entry) {
          return null;
        }
        if (!frontlineSnapshotCache.has(date)) {
          frontlineSnapshotCache.set(date, {
            main: await readSnapshotFeatureCollection(entry.main),
            'ukrainian-control': await readSnapshotFeatureCollection(entry.ukrainianControl),
            'russian-advances': await readSnapshotFeatureCollection(entry.russianAdvances),
            'ukrainian-advances': await readSnapshotFeatureCollection(entry.ukrainianAdvances),
            contested: await readSnapshotFeatureCollection(entry.contested)
          });
        }
        return frontlineSnapshotCache.get(date);
      }

      async function showFrontlineHistory(date) {
        const loaded = await loadFrontlineSnapshot(date);
        if (!loaded) {
          return;
        }

        if (!state.frontlineHistoryMode) {
          state.frontlineLiveBackup = cloneTerritoryData();
        }
        deactivateDrawingTool();
        closeTerritoryPopup();
        state.frontlineHistoryMode = true;
        state.frontlineHistoryDate = date;
        setFlagInteractivity(false);

        layerKmlData.main = loaded.main;
        layerKmlData['ukrainian-control'] = loaded['ukrainian-control'];
        layerKmlData['russian-advances'] = loaded['russian-advances'];
        layerKmlData['ukrainian-advances'] = loaded['ukrainian-advances'];
        territoryLayerIds.forEach((layerId) => ensureKmlLayersForLayer(layerId));

        renderFrontlineView();
      }

      async function returnToCurrentFrontline() {
        if (!state.frontlineHistoryMode) {
          return;
        }
        state.frontlineHistoryMode = false;
        state.frontlineHistoryDate = null;
        setFlagInteractivity(false);

        let restored = false;
        if (territoriesDocRef) {
          try {
            const doc = await territoriesDocRef.get();
            if (doc.exists) {
              const remote = doc.data() || {};
              for (const layerId of territoryLayerIds) {
                const raw = remote[layerId];
                if (typeof raw === 'string') {
                  layerKmlData[layerId] = JSON.parse(await unpackLayerString(raw));
                  territoryLoadedFromFirestore.add(layerId);
                } else if (state.frontlineLiveBackup && state.frontlineLiveBackup[layerId]) {
                  layerKmlData[layerId] = state.frontlineLiveBackup[layerId];
                }
              }
              restored = true;
            }
          } catch (error) {
            console.error('Failed to reload current territories', error);
          }
        }

        if (!restored && state.frontlineLiveBackup) {
          territoryLayerIds.forEach((layerId) => {
            layerKmlData[layerId] = state.frontlineLiveBackup[layerId];
          });
        }
        state.frontlineLiveBackup = null;
        territoryLayerIds.forEach((layerId) => ensureKmlLayersForLayer(layerId));
        setFlagInteractivity(state.role === 'admin');
        renderAdvancesView();
        renderFrontlineView();
      }
