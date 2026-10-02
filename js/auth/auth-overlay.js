      let authMode = 'login';

      function setAuthMode(mode) {
        authMode = mode;
        authError.hidden = true;
        authForm.reset();
        if (mode === 'register') {
          authTitle.textContent = 'Register';
          authSubmitBtn.textContent = 'Create account';
          authToggleModeBtn.textContent = 'Already have an account? Log in';
        } else {
          authTitle.textContent = 'Log in';
          authSubmitBtn.textContent = 'Log in';
          authToggleModeBtn.textContent = 'Need an account? Register';
        }
        authUsername.focus();
      }

      function showAuthError(message) {
        authError.textContent = message;
        authError.hidden = false;
      }

      function showAuthOverlay() {
        authOverlay.hidden = false;
        setAuthMode('login');
      }

      function hideAuthOverlay() {
        authOverlay.hidden = true;
        if (typeof renderMaintenanceMode === 'function') renderMaintenanceMode();
      }

      // Firebase's own errors are already reasonably readable
      // (e.g. "The email address is already in use by another
      // account."), so most just get passed straight through.
      function describeAuthError(error) {
        if (error.code === 'auth/invalid-email') {
          return 'Enter a valid email address.';
        }
        if (error.code === 'auth/weak-password') {
          return 'Password must be at least 6 characters.';
        }
        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
          return 'Incorrect email or password.';
        }
        if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
          return '';
        }
        if (error.code === 'auth/account-exists-with-different-credential') {
          return 'That email is already registered with a password — log in with your password instead.';
        }
        return error.message;
      }

      if (auth) {
        const googleProvider = typeof firebase !== 'undefined' ? new firebase.auth.GoogleAuthProvider() : null;

        openAuthBtn.addEventListener('click', () => {
          showAuthOverlay();
        });

        authCloseBtn.addEventListener('click', () => {
          hideAuthOverlay();
        });

        if (googleProvider) {
          googleAuthBtn.addEventListener('click', async () => {
            googleAuthBtn.disabled = true;
            try {
              await auth.signInWithPopup(googleProvider);
              // onAuthStateChanged (below) handles hiding the overlay.
            } catch (error) {
              const message = describeAuthError(error);
              if (message) {
                showAuthError(message);
              }
            } finally {
              googleAuthBtn.disabled = false;
            }
          });
        } else {
          googleAuthBtn.hidden = true;
        }

        // Clicking the dimmed backdrop dismisses it too, same as the ×
        // — login is optional now, so nothing should trap the visitor.
        authOverlay.addEventListener('click', (event) => {
          if (event.target === authOverlay) {
            hideAuthOverlay();
          }
        });

        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && !authOverlay.hidden) {
            hideAuthOverlay();
          }
        });

        authToggleModeBtn.addEventListener('click', () => {
          setAuthMode(authMode === 'login' ? 'register' : 'login');
        });

        authForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const email = authUsername.value.trim();
          const password = authPassword.value;

          if (!email || !password) {
            showAuthError('Enter an email and password.');
            return;
          }

          authSubmitBtn.disabled = true;
          try {
            if (authMode === 'register') {
              await auth.createUserWithEmailAndPassword(email, password);
            } else {
              await auth.signInWithEmailAndPassword(email, password);
            }
            // onAuthStateChanged (below) handles hiding the overlay.
          } catch (error) {
            showAuthError(describeAuthError(error));
          } finally {
            authSubmitBtn.disabled = false;
          }
        });

        logoutBtn.addEventListener('click', () => {
          auth.signOut();
        });

        auth.onAuthStateChanged((user) => {
          if (user) {
            hideAuthOverlay();
          }
          applyRole();
          updateAdminViewerVisibility();

          if (user && viewerPresenceUserUid !== user.uid) {
            stopViewerPresence();
          }
          if (user) {
            startViewerPresence(user);
          }

          // Guests need an anonymous Firebase identity solely for presence.
          // It remains a guest in the app and does not unlock drawing tools.
          if (!user && rtdb) {
            auth.signInAnonymously().catch((error) => {
              console.warn('Anonymous presence sign-in unavailable:', error);
            });
          }
        });
      } else {
        // Firebase didn't load (SDK blocked, offline, or the config
        // above is still the placeholder) — the map stays fully usable
        // as a guest; logging in just won't be available.
        console.warn('Firebase Authentication unavailable — continuing as guest only.');
        openAuthBtn.hidden = true;
      }
