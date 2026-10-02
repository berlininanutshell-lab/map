      // ---- Compact storage for territory layers ----
      // Firestore rejects any single field over ~1 MiB and any document over
      // 1 MiB. Layers are therefore rounded (to ~1 m at 5 decimals, or ~10 cm
      // at 6) and gzip+base64 packed ('gz1:' prefix) before saving. Older
      // uncompressed JSON strings are still read as before.
      function roundTerritoryData(data, decimals) {
        const f = Math.pow(10, decimals);
        const rc = (c) => [Math.round(c[0] * f) / f, Math.round(c[1] * f) / f];
        const ringOf = (ring, min) => {
          const out = [];
          ring.forEach((c) => {
            const r = rc(c);
            const last = out[out.length - 1];
            if (!last || last[0] !== r[0] || last[1] !== r[1]) {
              out.push(r);
            }
          });
          return out.length >= min ? out : null;
        };
        const polyOf = (rings) => {
          const outer = ringOf(rings[0], 4);
          if (!outer) {
            return null;
          }
          const holes = rings.slice(1).map((ring) => ringOf(ring, 4)).filter(Boolean);
          return [outer].concat(holes);
        };
        const features = [];
        ((data && data.features) || []).forEach((feature) => {
          const g = feature && feature.geometry;
          if (!g) {
            features.push(feature);
            return;
          }
          let geometry = g;
          if (g.type === 'Polygon') {
            const c = polyOf(g.coordinates);
            geometry = c ? { type: 'Polygon', coordinates: c } : null;
          } else if (g.type === 'MultiPolygon') {
            const c = g.coordinates.map(polyOf).filter(Boolean);
            geometry = c.length ? { type: 'MultiPolygon', coordinates: c } : null;
          } else if (g.type === 'LineString') {
            const c = ringOf(g.coordinates, 2);
            geometry = c ? { type: 'LineString', coordinates: c } : null;
          } else if (g.type === 'Point') {
            geometry = { type: 'Point', coordinates: rc(g.coordinates) };
          }
          if (geometry) {
            features.push({ type: 'Feature', properties: feature.properties || {}, geometry });
          }
        });
        return { type: 'FeatureCollection', features };
      }

      async function packLayerString(json) {
        if (typeof CompressionStream === 'undefined') {
          return json;
        }
        const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
        const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return 'gz1:' + btoa(binary);
      }

      async function unpackLayerString(raw) {
        if (typeof raw !== 'string' || raw.indexOf('gz1:') !== 0) {
          return raw;
        }
        const binary = atob(raw.slice(4));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return await new Response(stream).text();
      }

      // Packs several layers so that their combined size stays safely under
      // the 1 MiB document limit, lowering precision only if needed.
      async function packLayers(layerMap) {
        let result = null;
        for (const decimals of [6, 5, 4]) {
          const packed = {};
          let total = 0;
          for (const [layerId, data] of Object.entries(layerMap)) {
            packed[layerId] = await packLayerString(JSON.stringify(roundTerritoryData(data, decimals)));
            total += packed[layerId].length;
          }
          result = { packed, total, decimals };
          if (total <= 900000) {
            break;
          }
        }
        return result;
      }
