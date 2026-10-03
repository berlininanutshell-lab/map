      // ---- Register / log in (Firebase Authentication) ----
      // Real accounts, held by Firebase — not this browser.
      const firebaseConfig = {
        apiKey: 'AIzaSyBfb7AK_uGlVoLhgIOWlzjFswNCs0MO5_I',
        authDomain: 'register-82697.firebaseapp.com',
        databaseURL: 'https://register-82697-default-rtdb.europe-west1.firebasedatabase.app',
        projectId: 'register-82697',
        storageBucket: 'register-82697.firebasestorage.app',
        messagingSenderId: '517884260174',
        appId: '1:517884260174:web:b254ab7f4915d10853b81f'
      };
      let auth = null;
      let db = null;
      let rtdb = null;
      if (typeof firebase !== 'undefined') {
        try {
          firebase.initializeApp(firebaseConfig);
          auth = firebase.auth();
          db = firebase.firestore();
          if (firebase.database) {
            rtdb = firebase.database();
          }
        } catch (error) {
          console.error('Firebase init failed', error);
        }
      }

      // Shared layer colors live in this one Firestore document so every
      // visitor's browser sees the same colors — not just the admin who
      // set them. Requires Cloud Firestore to be enabled on the Firebase
      // project (Build → Firestore Database → Create database) and a
      // rule allowing public read / admin-only write — see the rules
      // block noted alongside ADMIN_EMAILS below.
      const layerColorsDocRef = db ? db.collection('mapState').doc('layerColors') : null;

      // Same idea as layerColorsDocRef, but for the Casualties tab: when
      // an admin edits a total or adds/edits/removes a daily dot, the
      // change is pushed here so every visitor's browser (not just the
      // admin's own tab) sees the update in real time. Falls back to
      // local-only editing (lost on refresh) if Firestore isn't set up.
      const casualtyDataDocRef = db ? db.collection('mapState').doc('casualtyData') : null;

      // Same idea again, but for flags: whenever an admin places, moves,
      // or deletes a flag, the full current list of flags is pushed
      // here so every visitor's browser sees it too — not just the
      // admin's own tab. Falls back to local-only flags (lost on
      // refresh, not seen by anyone else) if Firestore isn't set up.
      const flagsDocRef = db ? db.collection('mapState').doc('flags') : null;

      // Shared territory polygons (main / russian-advances /
      // ukrainian-advances): whenever an admin draws, edits, deletes,
      // or applies a shape, the full FeatureCollection for the
      // affected layer(s) is pushed here so every visitor's browser
      // shows the same territory — not just the admin's own tab. Each
      // layer is stored as a JSON *string* field (rather than a raw
      // GeoJSON object) because Firestore doesn't support arrays
      // nested directly inside arrays, which polygon coordinate rings
      // always are. Falls back to local-only edits (lost on refresh,
      // not seen by anyone else) if Firestore isn't set up.
      const territoriesDocRef = db ? db.collection('mapState').doc('territories') : null;

      // Daily frontline snapshots live in a subcollection so history can grow
      // without turning one Firestore document into a giant payload.
      const frontlineHistoryCollectionRef = db
        ? db.collection('mapState').doc('frontlineHistory').collection('days')
        : null;

      // Geolocation records are stored separately so the collection can grow
      // without approaching Firestore's per-document size limit.
      const geolocationCollectionRef = db
        ? db.collection('mapState').doc('geolocations').collection('locations')
        : null;

      const authOverlay = document.getElementById('authOverlay');
      const authCard = document.getElementById('authCard');
      const authCloseBtn = document.getElementById('authCloseBtn');
      const googleAuthBtn = document.getElementById('googleAuthBtn');
      const authTitle = document.getElementById('authTitle');
      const authForm = document.getElementById('authForm');
      const authUsername = document.getElementById('authUsername');
      const authPassword = document.getElementById('authPassword');
      const authError = document.getElementById('authError');
      const authSubmitBtn = document.getElementById('authSubmitBtn');
      const authToggleModeBtn = document.getElementById('authToggleModeBtn');
      const accountStatus = document.getElementById('accountStatus');
      const openAuthBtn = document.getElementById('openAuthBtn');
      const logoutBtn = document.getElementById('logoutBtn');
