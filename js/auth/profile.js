      // ---- Per-user profile (nickname) ----
      // Stored per Firebase uid in its own Firestore document, separate
      // from the shared mapState docs above — this is per-account data,
      // not something every visitor should be able to edit. (If you add
      // Firestore security rules, restrict read/write on userProfiles/{uid}
      // to that same uid.) Falls back to showing the email if Firestore
      // isn't configured or no nickname has been saved yet.
      function profileDocRef() {
        if (!db || !auth || !auth.currentUser) {
          return null;
        }
        return db.collection('userProfiles').doc(auth.currentUser.uid);
      }

      function loadProfile() {
        const ref = profileDocRef();
        if (!ref) {
          return;
        }
        const uidAtRequest = auth.currentUser.uid;
        ref.get().then((doc) => {
          // The user may have logged out, or switched accounts, while
          // this was in flight — don't overwrite newer state with a
          // stale response.
          if (!auth.currentUser || auth.currentUser.uid !== uidAtRequest) {
            return;
          }
          const data = doc.exists ? doc.data() : {};
          state.nickname = (data && data.nickname) || '';
          renderAccountStatus();
        }).catch((error) => {
          console.error('Failed to load profile', error);
        });
      }
