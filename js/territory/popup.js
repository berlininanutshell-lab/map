      // ---- Territory polygon management popup ----
      // Clicking a drawn shape (admins only — wired in
      // ensureKmlLayersForLayer) opens this small popup with Apply
      // (advances layers only), Edit shape, and Delete.
      let territoryPopup = null;

      function closeTerritoryPopup() {
        if (territoryPopup) {
          territoryPopup.remove();
          territoryPopup = null;
        }
      }

      // Formats a feature's area in km² for display — advances-only,
      // per the request that main not carry this (main is usually one
      // big contiguous shape where a per-piece area isn't meaningful
      // the way a single advance's footprint is).
      function formatAreaKm2(feature) {
        let squareMeters;
        try {
          squareMeters = turf.area(feature);
        } catch (error) {
          return null;
        }
        const km2 = squareMeters / 1e6;
        const decimals = km2 < 10 ? 2 : km2 < 100 ? 1 : 0;
        return km2.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: 0 }) + ' km²';
      }

      function normalizeTerritorySource(value) {
        const raw = String(value || '').trim();
        if (!raw) {
          return '';
        }
        try {
          const url = new URL(raw);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return null;
          }
          return url.href;
        } catch (error) {
          return null;
        }
      }

      function saveTerritorySource(layerId, featureId, source, lngLat) {
        const feature = findTerritoryFeature(layerId, featureId);
        if (!feature) {
          return;
        }
        const normalized = normalizeTerritorySource(source);
        if (normalized === null) {
          adminNotice('Source must be a valid http:// or https:// URL.');
          return;
        }
        feature.properties = feature.properties || {};
        feature.properties.source = normalized;
        ensureKmlLayersForLayer(layerId);
        pushTerritoriesToFirestore();
        openTerritoryFeaturePopup(layerId, featureId, lngLat);
      }
