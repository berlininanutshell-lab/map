      // ---- KMZ export (admin only) ----
      // Builds a KML document from a layer's polygons and zips it into
      // a .kmz (doc.kml inside a zip) that opens in Google Earth, QGIS,
      // etc. Guarded by isAdmin() as well as hidden via CSS.
      function kmlEscape(text) {
        return String(text == null ? '' : text)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      // KML colors are aaBBGGRR, not #RRGGBB.
      function hexToKmlColor(hex, alphaHex) {
        const clean = String(hex || '#ff0000').replace('#', '');
        const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
        const r = full.slice(0, 2);
        const g = full.slice(2, 4);
        const b = full.slice(4, 6);
        return (alphaHex + b + g + r).toLowerCase();
      }

      function kmlRing(ring) {
        return ring.map((pos) => pos[0] + ',' + pos[1] + ',0').join(' ');
      }

      function kmlPolygon(rings) {
        let out = '<Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>' +
          kmlRing(rings[0]) + '</coordinates></LinearRing></outerBoundaryIs>';
        for (let i = 1; i < rings.length; i++) {
          out += '<innerBoundaryIs><LinearRing><coordinates>' + kmlRing(rings[i]) +
            '</coordinates></LinearRing></innerBoundaryIs>';
        }
        return out + '</Polygon>';
      }

      function kmlGeometry(geometry) {
        if (geometry.type === 'Polygon') {
          return kmlPolygon(geometry.coordinates);
        }
        if (geometry.type === 'MultiPolygon') {
          return '<MultiGeometry>' + geometry.coordinates.map(kmlPolygon).join('') + '</MultiGeometry>';
        }
        return '';
      }

      function buildLayerKml(layer, features) {
        const line = hexToKmlColor(layer.color, 'ff');
        const fill = hexToKmlColor(layer.color, '40');
        let kml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>' +
          '<name>' + kmlEscape(layer.name) + '</name>' +
          '<Style id="s"><LineStyle><color>' + line + '</color><width>2</width></LineStyle>' +
          '<PolyStyle><color>' + fill + '</color></PolyStyle></Style>';
        features.forEach((feature, index) => {
          const props = feature.properties || {};
          kml += '<Placemark><name>' + kmlEscape(props.name || (layer.name + ' ' + (index + 1))) + '</name>' +
            (props.description ? '<description>' + kmlEscape(props.description) + '</description>' : '') +
            '<styleUrl>#s</styleUrl>' + kmlGeometry(feature.geometry) + '</Placemark>';
        });
        return kml + '</Document></kml>';
      }

      async function downloadTerritoryKmz(layerId, featureId) {
        if (!isAdmin()) {
          return;
        }
        const layer = getLayerById(layerId);
        if (!layer) {
          return;
        }
        if (typeof JSZip === 'undefined') {
          adminNotice('KMZ export is unavailable (the zip library failed to load).');
          return;
        }

        let features;
        if (featureId) {
          const one = findTerritoryFeature(layerId, featureId);
          features = one ? [one] : [];
        } else {
          features = layerPolygonFeatures(layerId);
        }
        features = features.filter((f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'));
        if (!features.length) {
          adminNotice('No polygons in ' + layer.name + ' to download.');
          return;
        }

        try {
          const zip = new JSZip();
          zip.file('doc.kml', buildLayerKml(layer, features));
          const blob = await zip.generateAsync({
            type: 'blob',
            mimeType: 'application/vnd.google-earth.kmz',
            compression: 'DEFLATE'
          });
          const slug = layer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = slug + (featureId ? '-shape' : '') + '-' + todayDateKey() + '.kmz';
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
          adminNotice('Downloaded ' + features.length + ' polygon' + (features.length === 1 ? '' : 's') + ' from ' + layer.name + '.');
        } catch (error) {
          console.error('KMZ export failed', error);
          adminNotice('Could not create the KMZ file.');
        }
      }
