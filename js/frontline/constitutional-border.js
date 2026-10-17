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

  // Wspólny punkt zapisu linii warstw. Definiuje się tylko, gdy żaden
  // wcześniej załadowany plik jej nie dostarcza.
  if (typeof pushFrontlineToFirestore !== 'function') {
    window.pushFrontlineToFirestore = function (layerId) {
      if (layerId === 'constitutional-border') {
        return pushConstitutionalBorderToFirestore();
      }
      if (layerId === 'russian-frontline' && typeof pushRussianFrontlineToFirestore === 'function') {
        return pushRussianFrontlineToFirestore(layerId);
      }
      if (layerId === 'ukrainian-frontline' && typeof pushUkrainianFrontlineToFirestore === 'function') {
        return pushUkrainianFrontlineToFirestore(layerId);
      }
      console.warn('No Firestore save function for layer', layerId);
      adminNotice('This line could not be saved: no save function for ' + layerId + '.');
    };
  }
  
  // ---- Kliknięcie w linię granicy: popup z Edit line / Delete line ----
  let borderPopup = null;

  function closeBorderPopup() {
    if (borderPopup) {
      borderPopup.remove();
      borderPopup = null;
    }
  }

  function openBorderFeaturePopup(featureId, lngLat) {
    if (state.role !== 'admin' || state.frontlineHistoryMode || state.drawingTool ||
        state.russianFrontlineEdit || state.ukrainianFrontlineEdit) {
      return;
    }
    const data = layerKmlData[LAYER_ID];
    const feature = data && data.features.find((f) => f.properties && f.properties.id === featureId);
    if (!feature) return;

    closeBorderPopup();
    const content = document.createElement('div');
    content.className = 'marker-popup';
    const title = document.createElement('div');
    title.className = 'marker-popup-title';
    title.textContent = 'Constitutional border of RF';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'marker-popup-apply';
    editButton.textContent = 'Edit line';
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'marker-popup-delete';
    removeButton.textContent = 'Delete line';
    content.append(title, editButton, removeButton);

    const popup = new maplibregl.Popup({ offset: 14, closeButton: true, closeOnClick: false })
      .setLngLat(lngLat)
      .setDOMContent(content)
      .addTo(map);
    borderPopup = popup;
    popup.on('close', () => { if (borderPopup === popup) borderPopup = null; });

    editButton.addEventListener('click', () => {
      closeBorderPopup();
      enterRussianFrontlineEdit(featureId, LAYER_ID);
    });
    removeButton.addEventListener('click', () => {
      if (state.role !== 'admin' || state.frontlineHistoryMode) {
        closeBorderPopup();
        return;
      }
      const current = layerKmlData[LAYER_ID];
      if (!current) {
        closeBorderPopup();
        return;
      }
      const before = current.features.length;
      current.features = current.features.filter((f) => !f.properties || f.properties.id !== featureId);
      if (current.features.length !== before) {
        safeEnsure();
        pushConstitutionalBorderToFirestore();
        adminNotice('Border line deleted.');
      }
      closeBorderPopup();
    });
  }

  const borderLineLayerId = 'kml-' + LAYER_ID + '-line';

  map.on('click', borderLineLayerId, (event) => {
    if (state.role !== 'admin' || state.frontlineHistoryMode || state.drawingTool ||
        state.territoryEdit || state.russianFrontlineEdit || state.ukrainianFrontlineEdit) {
      return;
    }
    const rendered = (event.features || []).find((f) => f.properties && f.properties.id);
    if (rendered) {
      openBorderFeaturePopup(rendered.properties.id, event.lngLat);
    }
  });
  map.on('mouseenter', borderLineLayerId, () => {
    if (state.role === 'admin' && !state.frontlineHistoryMode && !state.drawingTool &&
        !state.russianFrontlineEdit && !state.ukrainianFrontlineEdit) {
      map.getCanvasContainer().style.cursor = 'pointer';
    }
  });
  map.on('mouseleave', borderLineLayerId, () => {
    if (!state.drawingTool) map.getCanvasContainer().style.cursor = '';
  });

  // Zakończenie edycji punktów woła pushRussianFrontlineToFirestore(layerId),
  // które zapisuje tylko linię prorosyjską. Przekierowujemy zapis granicy.
  const originalRussianPush = window.pushRussianFrontlineToFirestore;
  window.pushRussianFrontlineToFirestore = function (layerId) {
    if (layerId === LAYER_ID) {
      return pushConstitutionalBorderToFirestore();
    }
    return typeof originalRussianPush === 'function'
      ? originalRussianPush.apply(this, arguments)
      : undefined;
  };
  
  renderLayers();
  safeEnsure();
})();