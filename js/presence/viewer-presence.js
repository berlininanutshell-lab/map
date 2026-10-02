      // ---- Collapse sidebar (hides the Legend/Casualties panel) ----
      // The map is always full-viewport underneath the sidebar (see
      // #map's CSS), so this only ever slides the sidebar itself away
      // and back — the map's own size/position/camera never changes,
      // and nothing needs to be re-resized.
      // ---- Live viewer presence (admin-only display) ----
      // Realtime Database is used here because it supports connection
      // presence and server-side onDisconnect cleanup. Each browser tab
      // gets its own anonymous Firebase Auth identity and connection node.
      const adminViewerCount = document.getElementById('adminViewerCount');
      const adminViewerCountText = document.getElementById('adminViewerCountText');
      const viewerListOverlay = document.getElementById('viewerListOverlay');
      const viewerList = document.getElementById('viewerList');
      const viewerListTitle = document.getElementById('viewerListTitle');
      const viewerListClose = document.getElementById('viewerListClose');
      let viewerPresenceStarted = false;
      let latestViewerSnapshot = null;
      let viewerPresenceUnsubscribe = null;
      let viewerPresenceConnectionRef = null;
      let viewerPresenceUserUid = null;
      let viewerPresenceId = null;

      // One stable ID per browser profile. localStorage is shared by tabs,
      // so opening the site in several tabs still represents one viewer.
      function getViewerPresenceId() {
        const key = 'frontlineViewerPresenceId';
        try {
          let id = localStorage.getItem(key);
          if (!id) {
            id = 'viewer-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
            localStorage.setItem(key, id);
          }
          return id;
        } catch (error) {
          // Fallback for browsers that block localStorage.
          return 'viewer-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
        }
      }

      function formatViewerCount(count) {
        return `${count} ${count === 1 ? 'viewer' : 'viewers'}`;
      }

      function formatViewerId(viewerKey) {
        // Keep the full stable browser ID in Realtime Database, but show only
        // a short readable identifier in the admin viewer list.
        const raw = String(viewerKey || '').replace(/^viewer-/, '');
        const shortId = raw.split('-')[0].slice(0, 8);
        return shortId ? `ID: ${shortId}` : 'ID: unknown';
      }

      function formatOnlineDuration(connectedAt) {
        const elapsedMs = Math.max(0, Date.now() - Number(connectedAt || 0));
        const totalSeconds = Math.floor(elapsedMs / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
        return `${minutes}m ${seconds}s`;
      }

      function updateViewerOnlineDurations() {
        if (!viewerList) return;
        viewerList.querySelectorAll('[data-connected-at]').forEach((durationEl) => {
          const connectedAt = Number(durationEl.dataset.connectedAt) || 0;
          durationEl.textContent = `Online for ${formatOnlineDuration(connectedAt)}`;
        });
      }

      function renderViewerList(snapshot) {
        if (!viewerList) return;
        viewerList.innerHTML = '';
        const viewers = [];
        snapshot.forEach((viewerSnapshot) => {
          let newest = null;
          viewerSnapshot.forEach((connectionSnapshot) => {
            const data = connectionSnapshot.val() || {};
            const connectedAt = Number(data.connectedAt) || 0;
            if (!newest || connectedAt > newest.connectedAt) {
              newest = {
                id: formatViewerId(viewerSnapshot.key),
                connectedAt
              };
            }
          });
          if (newest) viewers.push(newest);
        });
        viewers.sort((a, b) => a.id.localeCompare(b.id));
        viewerListTitle.textContent = formatViewerCount(viewers.length);
        if (!viewers.length) {
          const empty = document.createElement('div');
          empty.className = 'viewer-list-row';
          empty.textContent = 'No active viewers';
          viewerList.appendChild(empty);
          return;
        }
        viewers.forEach((viewer) => {
          const row = document.createElement('div');
          row.className = 'viewer-list-row';
          const dot = document.createElement('span');
          dot.className = 'viewer-list-dot';
          dot.setAttribute('aria-hidden', 'true');

          const info = document.createElement('div');
          info.className = 'viewer-list-info';

          const name = document.createElement('span');
          name.className = 'viewer-list-name';
          name.textContent = viewer.id;

          const duration = document.createElement('span');
          duration.className = 'viewer-list-duration';
          duration.dataset.connectedAt = String(viewer.connectedAt);
          duration.textContent = `Online for ${formatOnlineDuration(viewer.connectedAt)}`;

          info.append(name, duration);
          row.append(dot, info);
          viewerList.appendChild(row);
        });
      }

      const viewerDurationTimer = setInterval(updateViewerOnlineDurations, 1000);

      function openViewerList() {
        if (currentRole() !== 'admin') return;
        viewerListOverlay.hidden = false;
        viewerListOverlay.setAttribute('aria-hidden', 'false');
        if (latestViewerSnapshot) renderViewerList(latestViewerSnapshot);
      }

      function closeViewerList() {
        viewerListOverlay.hidden = true;
        viewerListOverlay.setAttribute('aria-hidden', 'true');
      }

      adminViewerCount.addEventListener('click', openViewerList);
      viewerListClose.addEventListener('click', closeViewerList);
      viewerListOverlay.addEventListener('click', (event) => {
        if (event.target === viewerListOverlay) closeViewerList();
      });

      function updateAdminViewerVisibility() {
        const isAdmin = currentRole() === 'admin';
        adminViewerCount.setAttribute('aria-hidden', String(!isAdmin));
      }

      function startViewerPresence(user) {
        if (!rtdb || !user || viewerPresenceStarted) return;
        viewerPresenceStarted = true;
        viewerPresenceUserUid = user.uid;
        viewerPresenceId = getViewerPresenceId();

        const connectionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const connectionRef = rtdb.ref(`presence/${viewerPresenceId}/${connectionId}`);
        viewerPresenceConnectionRef = connectionRef;
        const presenceRootRef = rtdb.ref('presence');

        connectionRef.onDisconnect().remove().catch((error) => {
          console.warn('Could not establish viewer disconnect cleanup:', error);
        });

        connectionRef.set({
          state: 'online',
          connectedAt: firebase.database.ServerValue.TIMESTAMP
        }).catch((error) => {
          console.warn('Could not register viewer presence:', error);
        });

        viewerPresenceUnsubscribe = presenceRootRef.on('value', (snapshot) => {
          if (currentRole() !== 'admin') return;
          // Count unique browser IDs, not individual tabs/connections.
          // All tabs in the same browser profile share localStorage and
          // therefore the same viewer ID, so they count as one viewer.
          let count = 0;
          latestViewerSnapshot = snapshot;
          snapshot.forEach((viewerSnapshot) => {
            if (viewerSnapshot.hasChildren()) count += 1;
          });
          adminViewerCountText.textContent = formatViewerCount(count);
          if (!viewerListOverlay.hidden) renderViewerList(snapshot);
        }, (error) => {
          console.warn('Could not read viewer presence:', error);
          adminViewerCountText.textContent = 'Viewers unavailable';
        });
      }

      function stopViewerPresence() {
        if (viewerPresenceConnectionRef) {
          viewerPresenceConnectionRef.remove().catch(() => {});
        }
        viewerPresenceConnectionRef = null;
        viewerPresenceUserUid = null;
        viewerPresenceId = null;
        viewerPresenceStarted = false;
        if (typeof viewerPresenceUnsubscribe === 'function') {
          viewerPresenceUnsubscribe();
        }
        viewerPresenceUnsubscribe = null;
      }

      updateAdminViewerVisibility();
