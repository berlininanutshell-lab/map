      // Reads kml/manifest.json — an object like
      // { "main": ["occupation.kmz"], "russian-advances": ["push-1.kmz"] }
      // or a mixture of .kml and .kmz files.
      // — and loads every listed file from kml/<layerId>/<file>. Silently
      // does nothing if the manifest or a file isn't there (e.g. while
      // previewing this page without the kml/ folder alongside it).
      //
      // IMPORTANT: for the three territory layers (main /
      // russian-advances / ukrainian-advances), the Firestore-synced
      // territoriesDocRef listener above is the authoritative source
      // once it has reported in — it's what "Apply the advance" and
      // vertex-editing actually write to, and it's what makes a drawn
      // advance visible to every visitor. This KML manifest load fires
      // on the map's 'load' event, independently of (and often *after*)
      // that Firestore listener's first callback, and used to
      // unconditionally overwrite layerKmlData[layerId] for every layer
      // named in the manifest — including the three territory layers —
      // clobbering whatever Firestore had just synced in (typically
      // with an empty baseline, since pending advances have no KML
      // file of their own). That's why a drawn-but-not-yet-applied
      // advance would flash in from Firestore and then vanish shortly
      // after the map finished loading, and why it was gone again on
      // every reload. Skip a territory layer here if Firestore has
      // already provided (or later provides) its data for this page
      // load — KML for those layers is only ever a fallback baseline
      // for when Firestore isn't configured or hasn't returned yet.
      async function loadKml(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load KML: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

      async function loadKmlManifestAndData() {
        let manifest;
        try {
          const manifestResponse = await fetch('kml/manifest.json');
          if (!manifestResponse.ok) {
            return;
          }
          manifest = await manifestResponse.json();
        } catch (error) {
          console.error('Failed to load kml/manifest.json', error);
          return;
        }

        for (const [layerId, fileNames] of Object.entries(manifest)) {
          if (sharedLayerIds.includes(layerId) && territoryLoadedFromFirestore.has(layerId)) {
            // Firestore already gave us (or will give us) this layer's
            // authoritative data — don't stomp on it with the static
            // KML baseline.
            continue;
          }

          const features = [];

          for (const fileName of fileNames) {
            try {
              const url = 'kml/' + layerId + '/' + fileName;
              const kmlText = await loadKml(url);
              features.push(...parseKmlToGeoJSON(kmlText).features);
            } catch (error) {
              console.error('Failed to load KML file', layerId, fileName, error);
            }
          }

          // A territory layer's Firestore data may have arrived while
          // the KML files above were still being fetched (they're
          // awaited one at a time) — re-check before writing, so a
          // late-arriving sync still wins over this stale KML read.
          if (sharedLayerIds.includes(layerId) && territoryLoadedFromFirestore.has(layerId)) {
            continue;
          }

          layerKmlData[layerId] = {
            type: 'FeatureCollection',
            features
          };

          ensureKmlLayersForLayer(layerId);
        }
      }

      map.on('load', loadKmlManifestAndData);

      // Hovering a KML polygon used to show its name in a small floating
      // label. That behavior is disabled below — the label element and
      // its lookup logic are kept but the mousemove handler now returns
      // immediately, so hovering a polygon never displays anything.
      const kmlHoverLabel = document.getElementById('kmlHoverLabel');
      kmlHoverLabel.hidden = true;

      function kmlFillLayerIds() {
        return state.layers
          .map((layer) => 'kml-' + layer.id + '-fill')
          .filter((id) => map.getLayer(id));
      }

      map.on('mousemove', () => {
        return;
      });

      map.on('mouseout', () => {
        kmlHoverLabel.hidden = true;
      });
