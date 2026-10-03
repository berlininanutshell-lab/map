      // ---- Roles ----
      // Anyone can browse the map without an account. Logging in (any
      // account) unlocks the draw tools and the layer on/off toggles.
      // An email listed here additionally gets admin-only controls: the
      // flag tool (place + drag flags) and per-layer polygon color
      // pickers. Edit this list to set who's an admin — it's a simple
      // client-side check, not a real access-control boundary, so don't
      // rely on it to keep out a determined visitor with dev tools.
      const ADMIN_EMAILS = ['berlininanutshell@gmail.com'];

      function currentRole() {
        if (!auth || !auth.currentUser || auth.currentUser.isAnonymous) {
          return 'guest';
        }
        const email = (auth.currentUser.email || '').toLowerCase();
        return ADMIN_EMAILS.includes(email) ? 'admin' : 'user';
      }

      // Applies the current role to the page: shows/hides the draw
      // tools, layer toggles and admin-only controls, and updates the
      // account bar. Called on every auth-state change.
      function applyRole() {
        const role = currentRole();
        state.role = role;

        document.body.classList.toggle('logged-in', role !== 'guest');
        document.body.classList.toggle('is-admin', role === 'admin');
        if (typeof renderMaintenanceMode === 'function') renderMaintenanceMode();

        if (role === 'guest') {
          state.nickname = '';
          accountStatus.textContent = 'Browsing as guest';
          openAuthBtn.hidden = false;
          logoutBtn.hidden = true;
          settingsBtn.hidden = true;
          hideSettingsOverlay();
          // Guests can't draw or toggle layers — make sure nothing is
          // left armed/open from a previous session.
          closeToolMenu();
        } else {
          // Render immediately with whatever's in state.nickname (email,
          // most likely, until loadProfile() below resolves), then
          // re-render once the saved nickname comes back from Firestore.
          renderAccountStatus();
          openAuthBtn.hidden = true;
          logoutBtn.hidden = false;
          settingsBtn.hidden = false;
          loadProfile();
        }

        // Non-admins can't have the flag tool armed, and the layer list
        // needs to add/remove its admin-only color pickers.
        if (role !== 'admin' && state.drawingTool === 'flag') {
          deactivateDrawingTool();
        }
        if (role !== 'admin') {
          const frontlineTab = document.getElementById('frontlineTabBtn');
          const legendTab = document.getElementById('legendTabBtn');
          if (frontlineTab && legendTab && frontlineTab.getAttribute('aria-selected') === 'true') {
            legendTab.click();
          }
        }
        renderLayers();
        if (typeof renderFrontlineView === 'function') {
          renderFrontlineView();
        }
        if (typeof renderGeolocationsView === 'function') {
          renderGeolocationsView();
        }
      }

      // Shows "Signed in as <nickname or email>" plus the role badge.
      // Called right away on login (using whatever's already in
      // state.nickname) and again once loadProfile() resolves the saved
      // nickname from Firestore, and again after a settings save.
      function renderAccountStatus() {
        if (!auth || !auth.currentUser) {
          return;
        }
        const email = auth.currentUser.email || '';
        const displayName = state.nickname || email;
        accountStatus.innerHTML =
          'Signed in as <strong>' + escapeHtml(displayName) + '</strong>' +
          '<span class="role-badge ' + state.role + '">' + state.role + '</span>';
      }
