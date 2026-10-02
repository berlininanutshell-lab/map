      // ---- Site-wide maintenance mode (Firestore-backed) ----
      // Public clients read this flag; only an authenticated admin should be
      // permitted to write it in Firestore security rules.
      const maintenanceOverlay = document.getElementById('maintenanceOverlay');
      const maintenanceStatus = document.getElementById('maintenanceStatus');
      const maintenanceToggleBtn = document.getElementById('maintenanceToggleBtn');
      const maintenanceAdminNote = document.getElementById('maintenanceAdminNote');
      const maintenanceLoginBtn = document.getElementById('maintenanceLoginBtn');
      const maintenanceDocRef = db ? db.collection('siteSettings').doc('maintenance') : null;
      let maintenanceEnabled = false;
      let maintenanceUnsubscribe = null;

      function renderMaintenanceMode() {
        // Keep the site accessible to the administrator while maintenance is on.
        // Keep the maintenance screen visible behind the login dialog so the
        // underlying map/site is never exposed during maintenance.
        // The auth dialog has a higher z-index and remains usable.
        maintenanceOverlay.hidden = !maintenanceEnabled || isAdmin();
        if (maintenanceStatus) {
          maintenanceStatus.textContent = 'Maintenance mode: ' + (maintenanceEnabled ? 'ON' : 'OFF');
        }
        if (maintenanceToggleBtn) {
          maintenanceToggleBtn.disabled = !isAdmin() || !maintenanceDocRef;
          maintenanceToggleBtn.textContent = maintenanceEnabled ? 'Disable' : 'Enable';
        }
      }

      if (maintenanceLoginBtn) {
        maintenanceLoginBtn.addEventListener('click', () => {
          // Do not hide maintenance: the auth dialog appears above it.
          showAuthOverlay();
        });
      }

      if (maintenanceDocRef) {
        maintenanceUnsubscribe = maintenanceDocRef.onSnapshot((snap) => {
          maintenanceEnabled = !!(snap.exists && snap.data() && snap.data().enabled === true);
          renderMaintenanceMode();
          if (maintenanceAdminNote) maintenanceAdminNote.textContent = '';
        }, (error) => {
          console.error('Could not read maintenance setting', error);
          if (maintenanceAdminNote) {
            maintenanceAdminNote.textContent = 'Could not sync maintenance mode. Check Firestore rules.';
          }
          if (maintenanceToggleBtn) {
            maintenanceToggleBtn.disabled = true;
            maintenanceToggleBtn.textContent = 'Unavailable';
          }
        });
      } else if (maintenanceAdminNote) {
        maintenanceAdminNote.textContent = 'Firestore is not configured; site-wide maintenance mode is unavailable.';
      }

      if (maintenanceToggleBtn) {
        maintenanceToggleBtn.addEventListener('click', async () => {
          if (!isAdmin() || !maintenanceDocRef) return;
          maintenanceToggleBtn.disabled = true;
          try {
            const nextEnabled = !maintenanceEnabled;
            await maintenanceDocRef.set({
              enabled: nextEnabled,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            if (maintenanceAdminNote) {
              maintenanceAdminNote.textContent = nextEnabled
                ? 'Maintenance mode enabled for all visitors.'
                : 'Maintenance mode disabled.';
            }
          } catch (error) {
            console.error('Could not update maintenance mode', error);
            if (maintenanceAdminNote) {
              maintenanceAdminNote.textContent = 'Could not update. Check Firestore security rules.';
            }
          } finally {
            renderMaintenanceMode();
          }
        });
      }
