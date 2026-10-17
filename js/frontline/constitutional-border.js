(function () {
  'use strict';

  const LAYER_ID = 'constitutional-border';
  const emptyData = () => ({ type: 'FeatureCollection', features: [] });
  const docRef = typeof db !== 'undefined' && db
    ? db.collection('mapState').doc('constitutionalBorder')
    : null;

  let pushChain = Promise.resolve();
  let pushesInFlight = 0;
  let snapshotSeq = 0;
  let syncBlocked = false;

  // Rejestracja warstwy (kolor i grubość może potem zmieniać admin w panelu warstw)
  if (!getLayerById(LAYER_ID)) {
    state.layers.push({
      id: LAYER_ID,
      name: 'Constitutional border of the Russian Federation',
      color: '#b388ff',
      visible: true,
      renderMode: 'line',
      thickness: 3
    });
  }
  layerKmlData[LAYER_ID] = layerKmlData[LAYER_ID] || emptyData();

  function safeEnsure() {
    try {
      ensureKmlLayersForLayer(LAYER_ID);
    } catch (error) {
      // styl mapy jeszcze niezaładowany; 'style.load' dorysuje warstwę
    }
  }

  function pushConstitutionalBorderToFirestore() {
    if (state.role !== 'admin' || state.frontlineHistoryMode) return;
    if (!docRef) {
      adminNotice('The constitutional border cannot be saved because Firebase is unavailable.');
      return;
    }
    const json = JSON.stringify(layerKmlData[LAYER_ID] || emptyData());
    pushesInFlight++;
    pushChain = pushChain.then(async () => {
      try {
        const packed = await packLayerString(json);
        await docRef.set({ geojson: packed });
        syncBlocked = false;
      } catch (error) {
        console.error('Failed to save the constitutional border', error);
        syncBlocked = true;
        const code = (error && error.code) || 'unknown-error';
        const hint = code === 'permission-denied'
          ? ' Check the Firestore rules for mapState/constitutionalBorder.' : '';
        adminNotice('Could not save the constitutional border (' + code + '). It is only kept on this screen.' + hint);
      } finally {
        pushesInFlight--;
      }
    });
  }

  function clearConstitutionalBorder() {
    if (state.role !== 'admin' || state.frontlineHistoryMode) return;
    layerKmlData[LAYER_ID] = emptyData();
    safeEnsure();
    pushConstitutionalBorderToFirestore();
  }

  window.pushConstitutionalBorderToFirestore = pushConstitutionalBorderToFirestore;
  window.clearConstitutionalBorder = clearConstitutionalBorder;

  if (docRef) {
    docRef.onSnapshot(async (doc) => {
      if (syncBlocked && !doc.metadata.hasPendingWrites) return;
      if (pushesInFlight > 0 && !doc.metadata.hasPendingWrites) return;
      const seq = ++snapshotSeq;
      try {
        let parsed = emptyData();
        if (doc.exists) {
          const raw = doc.data() && doc.data().geojson;
          if (typeof raw !== 'string') return;
          parsed = JSON.parse(await unpackLayerString(raw));
          if (!parsed || parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
            throw new Error('Stored border is not a GeoJSON FeatureCollection.');
          }
          parsed.features = parsed.features.filter((f) =>
            f && f.geometry && f.geometry.type === 'LineString' &&
            Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2
          );
          parsed.features.forEach((f) => {
            f.properties = f.properties || {};
            if (!f.properties.id) f.properties.id = genId();
          });
        }
        if (seq !== snapshotSeq) return;
        layerKmlData[LAYER_ID] = parsed;
        safeEnsure();
      } catch (error) {
        console.error('Could not read the constitutional border', error);
      }
    }, (error) => {
      console.error('Failed to sync the constitutional border', error);
    });
  }

  renderLayers();
  safeEnsure();
})();