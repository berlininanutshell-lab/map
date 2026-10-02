      // ---- Settings modal: nickname + account info (email, role, uid) ----
      const settingsBtn = document.getElementById('settingsBtn');
      const settingsOverlay = document.getElementById('settingsOverlay');
      const settingsCloseBtn = document.getElementById('settingsCloseBtn');
      const nicknameInput = document.getElementById('nicknameInput');
      const settingsSaveBtn = document.getElementById('settingsSaveBtn');
      const settingsStatus = document.getElementById('settingsStatus');
      const settingsEmailValue = document.getElementById('settingsEmailValue');
      const settingsRoleValue = document.getElementById('settingsRoleValue');
      const settingsUidValue = document.getElementById('settingsUidValue');

      function showSettingsOverlay() {
        if (!auth || !auth.currentUser) {
          return;
        }
        nicknameInput.value = state.nickname || '';
        settingsStatus.textContent = '';
        settingsEmailValue.textContent = auth.currentUser.email || '';
        settingsRoleValue.innerHTML = '<span class="role-badge ' + state.role + '">' + state.role + '</span>';
        settingsUidValue.textContent = auth.currentUser.uid;
        settingsOverlay.hidden = false;
        nicknameInput.focus();
      }

      function hideSettingsOverlay() {
        settingsOverlay.hidden = true;
      }

      settingsBtn.addEventListener('click', showSettingsOverlay);
      settingsCloseBtn.addEventListener('click', hideSettingsOverlay);

      settingsOverlay.addEventListener('click', (event) => {
        if (event.target === settingsOverlay) {
          hideSettingsOverlay();
        }
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !settingsOverlay.hidden) {
          hideSettingsOverlay();
        }
      });

      settingsSaveBtn.addEventListener('click', () => {
        const ref = profileDocRef();
        if (!ref) {
          settingsStatus.textContent = 'Not available right now.';
          return;
        }

        const nickname = nicknameInput.value.trim().slice(0, 40);
        settingsSaveBtn.disabled = true;
        ref.set({ nickname, email: auth.currentUser.email || '' }, { merge: true })
          .then(() => {
            state.nickname = nickname;
            renderAccountStatus();
            settingsStatus.textContent = 'Saved.';
          })
          .catch((error) => {
            console.error('Failed to save nickname', error);
            settingsStatus.textContent = 'Could not save — try again.';
          })
          .finally(() => {
            settingsSaveBtn.disabled = false;
          });
      });

      // ---- Welcome modal ----
      // No hidden attribute in the HTML, so this shows on every page
      // load (not just first-time visitors) and stays up until the
      // visitor dismisses it — nothing is remembered between sessions.
      const welcomeOverlay = document.getElementById('welcomeOverlay');
      const welcomeCloseBtn = document.getElementById('welcomeCloseBtn');
      const welcomeDismissBtn = document.getElementById('welcomeDismissBtn');

      function hideWelcomeOverlay() {
        welcomeOverlay.hidden = true;
      }

      welcomeCloseBtn.addEventListener('click', hideWelcomeOverlay);
      welcomeDismissBtn.addEventListener('click', hideWelcomeOverlay);

      welcomeOverlay.addEventListener('click', (event) => {
        if (event.target === welcomeOverlay) {
          hideWelcomeOverlay();
        }
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !welcomeOverlay.hidden) {
          hideWelcomeOverlay();
        }
      });
