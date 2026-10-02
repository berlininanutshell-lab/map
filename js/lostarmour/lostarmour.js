      // ---- LostArmour overlay + area comparison ----
      // Separate from the territory layers: nothing here is saved to
      // Firestore or touches the Russian Control / advances data. The
      // polygons are embedded (snapshot 2026-09-30) only as a fallback.
      // Normally they are read from the lostarmour/ folder next to this
      // page (see lostarmour/README.txt): drop a .kml in there, no code
      // changes needed.
      (function () {
        'use strict';
        // Master switch: set to true to bring the LostArmour panel and
        // overlay back. While false, nothing is shown, loaded or fetched
        // (the lostarmour/ folder and its files are left alone).
        var ENABLED = true;
        if (!ENABLED) {
          var offPanel = document.getElementById('laPanel');
          if (offPanel) { offPanel.style.display = 'none'; }
          return;
        }
        var T = {
          groups: {
            since2022: 'Captured since 2022',
            pre2022: 'DNR / LNR before 2022',
            crimea: 'Crimea & Sevastopol (2014)'
          },
          calculating: 'Calculating…',
          compare: 'Compare with Russian Control',
          site: 'Russian Control (this map, inside Ukraine)',
          outside: 'Outside Ukraine (ignored)',
          ignored: 'Ignored: Dnipro / reservoir zone',
          la: 'LostArmour (selected)',
          overlap: 'Overlap',
          onlySite: 'Only on this map',
          onlyLa: 'Only on LostArmour',
          diff: 'Difference',
          noSite: 'The Russian Control layer has no polygons to compare.',
          gapFail: 'Gap filling between the layers failed, so slivers between Ukrainian Control and LostArmour are not counted.',
          noUk: 'The Ukrainian Control layer is empty, so Ukraine\'s territory can\'t be determined to clip Russian Control.',
          noLa: 'Select at least one LostArmour area first.',
          fail: 'Comparison failed (invalid geometry): ',
          histNote: 'Note: a historical frontline snapshot is currently displayed, so it is the one being compared.',
          sourceNote: 'Claims published by LostArmour.info; not independently verified. Areas are geodesic (km²). Only Russian Control inside Ukraine is counted (Russia and the sea are cut off). Slivers thinner than 300 m are ignored, and so are small pieces far from the front.'
        };
        var LA_DATA = window.LA_EMBEDDED_DATA; // js/lostarmour/embedded-data.js
        // Russia's side of the Ukraine-Russia border (from the border lines in the KML);
        // Russian Control is cut with it so Russia proper is never counted.
        var RU_RING = window.LA_EMBEDDED_RU_RING; // js/lostarmour/embedded-data.js
        var LA_COLOR = '#b76cff', SITE_ONLY_COLOR = '#ffd400', LA_ONLY_COLOR = '#00e5ff';
        var SRC = 'lostarmour-src';
        var GROUP_IDS = ['since2022', 'pre2022', 'crimea'];
        var data = LA_DATA, dataLabel = 'snapshot 2026-09-30';
        var shown = false, sel = { since2022: true, pre2022: true, crimea: true };
        var diffSite = null, diffLa = null;
        // Gaps narrower than 2 x CRACK_KM between Ukrainian Control and the
        // LostArmour areas still count as Ukrainian land (see compare()).
        var CRACK_KM = 5;
        // Optional exact outline of Ukraine: lostarmour/ukraine.geojson.
        var uaMask = null;
        // Optional lostarmour/seas.geojson: sea polygons cut out of both
        // LostArmour areas and Russian Control (so no sliver of a coastal
        // town or the water in front of it is ever counted as land).
        var seaMask = null, clipped = null;
        // Differences inside this zone are ignored (neither "only on this map"
        // nor "only on LostArmour"): the Kakhovka reservoir and the Dnipro with
        // its estuary west of the dam, where the two sources just draw the
        // water differently. Replace it by putting polygons into
        // lostarmour/ignore.geojson.
        var IGNORE_ENABLED = true;
        var IGNORE_BOX = [[31.3, 46.3], [33.5, 46.3], [33.5, 47.05], [31.3, 47.05], [31.3, 46.3]];
        // Reservoir part: the right-bank line from the dam up to Vasylivka,
        // widened by IGNORE_KM on both sides.
        var IGNORE_LINE = [[33.37, 46.75], [33.63, 46.94], [33.71, 47.05], [33.86, 47.17], [34.02, 47.27],
          [34.04, 47.44], [34.14, 47.49], [34.4, 47.56], [34.76, 47.54], [35.13, 47.49],
          [35.33135, 47.55143], [35.32264, 47.57208], [35.29794, 47.58262], [35.25252, 47.64956]];
        // The zone starts at this line (lon, lat) and extends west from it.
        var ZONE_EAST_EDGE = [[35.33135, 47.55143], [35.32264, 47.57208], [35.29794, 47.58262], [35.25252, 47.64956]];
        var IGNORE_KM = 14;
        var ignoreMask = null, defaultZone = null;
        function getDefaultZone() {
          if (defaultZone) { return defaultZone; }
          var box = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [IGNORE_BOX] } };
          try {
            var corridor = turf.buffer({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: IGNORE_LINE } },
              IGNORE_KM, { units: 'kilometers', steps: 6 });
            defaultZone = gUnion(box, corridor) || box;
            // keep only what lies west of ZONE_EAST_EDGE
            var e = ZONE_EAST_EDGE, first = e[0], last = e[e.length - 1];
            var west = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
              [[30, 45.5], [first[0], 45.5]].concat(e, [[last[0], 49], [30, 49], [30, 45.5]]) ] } };
            defaultZone = gIntersect(defaultZone, west) || defaultZone;
          } catch (e) { console.warn('ignore corridor failed, using box only', e); defaultZone = box; }
          return defaultZone;
        }

        var elToggle = document.getElementById('laToggle');
        var elGroups = document.getElementById('laGroups');
        var elBtn = document.getElementById('laCompareBtn');
        var elClear = document.getElementById('laClearBtn');
        var elResult = document.getElementById('laResult');
        var elNote = document.getElementById('laNote');
        if (!elToggle) { return; }

        var EMPTY = { type: 'FeatureCollection', features: [] };
        function fmt(km2) {
          var v = Math.abs(km2);
          return v.toLocaleString(undefined, { maximumFractionDigits: v >= 100 ? 0 : 1 });
        }
        function isPoly(f) { return f && f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'); }
        function viewFeatures() { return clipped || data.features; }
        function selectedFeatures() { return viewFeatures().filter(function (f) { return sel[f.properties.g]; }); }
        // LostArmour polygons minus the seas.
        function rebuildClipped() {
          if (!seaMask) { clipped = null; return; }
          var out = [];
          data.features.forEach(function (f) {
            var res = f;
            try { res = gDifference(f, seaMask); } catch (e) { console.warn('sea cut failed', e); res = f; }
            if (res) { res.properties = f.properties; out.push(res); }
          });
          clipped = out;
        }
        function selectedCollection() { return { type: 'FeatureCollection', features: selectedFeatures() }; }
        function areaKm2(geomOrFeature) { return geomOrFeature ? turf.area(geomOrFeature) / 1e6 : 0; }

        // polygon-clipping (inside turf 6.5) can die with "Infinite loop when
        // passing sweep line over endpoints" on near-coincident edges (e.g. a
        // border line that almost matches a LostArmour edge). Retry with the
        // coordinates snapped to a coarser grid, then with a zero-buffer repair.
        function snap(g, digits) {
          var c = g;
          try { c = turf.cleanCoords(g); } catch (e) { c = g; }
          return turf.truncate(c, { precision: digits, coordinates: 2, mutate: false });
        }
        function gOp(op, a, b) {
          try { return turf[op](a, b); } catch (first) {
            var digits = [6, 5, 4];
            for (var i = 0; i < digits.length; i++) {
              try { return turf[op](snap(a, digits[i]), snap(b, digits[i])); } catch (e) { /* try coarser */ }
            }
            try { return turf[op](turf.buffer(a, 0), turf.buffer(b, 0)); } catch (e2) { /* give up */ }
            throw first;
          }
        }
        function gUnion(a, b) { return gOp('union', a, b); }
        function gIntersect(a, b) { return gOp('intersect', a, b); }
        function gDifference(a, b) { return gOp('difference', a, b); }

        // Balanced (tree) union is much faster than folding one by one.
        function unionAll(features) {
          var arr = features.slice();
          if (!arr.length) { return null; }
          while (arr.length > 1) {
            var next = [];
            for (var i = 0; i < arr.length; i += 2) {
              next.push(i + 1 < arr.length ? (gUnion(arr[i], arr[i + 1]) || arr[i]) : arr[i]);
            }
            arr = next;
          }
          return arr[0];
        }

        // ---- map layers ----
        function addPair(id, color, fc, fillOpacity, lineWidth, visibility) {
          if (map.getSource(id)) { map.getSource(id).setData(fc); } else { map.addSource(id, { type: 'geojson', data: fc }); }
          if (!map.getLayer(id + '-fill')) {
            map.addLayer({ id: id + '-fill', type: 'fill', source: id, layout: { visibility: visibility },
              paint: { 'fill-color': color, 'fill-opacity': fillOpacity } });
          } else { map.setLayoutProperty(id + '-fill', 'visibility', visibility); }
          if (!map.getLayer(id + '-line')) {
            map.addLayer({ id: id + '-line', type: 'line', source: id, layout: { visibility: visibility, 'line-join': 'round' },
              paint: { 'line-color': color, 'line-width': lineWidth } });
          } else { map.setLayoutProperty(id + '-line', 'visibility', visibility); }
          map.moveLayer(id + '-fill');
          map.moveLayer(id + '-line');
        }
        function ensureLayers() {
          if (!map.getStyle()) { return; }
          addPair(SRC, LA_COLOR, selectedCollection(), 0.28, 1.6, shown ? 'visible' : 'none');
          addPair('la-diff-site', SITE_ONLY_COLOR, diffSite || EMPTY, 0.55, 1, diffSite ? 'visible' : 'none');
          addPair('la-diff-la', LA_ONLY_COLOR, diffLa || EMPTY, 0.55, 1, diffLa ? 'visible' : 'none');
        }

        // ---- UI ----
        function renderGroups() {
          elGroups.innerHTML = '';
          GROUP_IDS.forEach(function (g) {
            var fs = viewFeatures().filter(function (f) { return f.properties.g === g; });
            var km2 = fs.reduce(function (s, f) { return s + areaKm2(f); }, 0);
            var row = document.createElement('label');
            row.className = 'la-row';
            var cb = document.createElement('input');
            cb.type = 'checkbox'; cb.checked = !!sel[g];
            cb.addEventListener('change', function () { sel[g] = cb.checked; clearComparison(); ensureLayers(); });
            var name = document.createElement('span'); name.textContent = T.groups[g];
            var area = document.createElement('span'); area.className = 'la-area'; area.textContent = fmt(km2) + ' km²';
            row.appendChild(cb); row.appendChild(name); row.appendChild(area);
            elGroups.appendChild(row);
          });
          elNote.textContent = T.sourceNote + ' Data: ' + dataLabel + (seaMask ? '; seas cut out (seas.geojson)' : '') + '.';
        }
        function clearComparison() {
          diffSite = null; diffLa = null;
          elResult.innerHTML = ''; elClear.hidden = true;
          if (map.getStyle()) { ensureLayers(); }
        }
        function row(label, km2, color, cls) {
          return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' +
            (color ? '<span class="la-swatch" style="background:' + color + '"></span>' : '') + label +
            '</td><td>' + (typeof km2 === 'string' ? km2 : fmt(km2) + ' km²') + '</td></tr>';
        }
        function showError(msg) { elResult.innerHTML = '<div class="la-error">' + msg + '</div>'; }

        var MIN_WIDTH_KM = 0.3;
        function polyWidthKm(p) {
          var a = turf.area(p) / 1e6;
          var per = turf.length(turf.polygonToLine(p), { units: 'kilometers' });
          return per ? 2 * a / per : 0;
        }
        function cleanDiff(feature, front) {
          if (!feature) { return null; }
          var keep = [];
          turf.flatten(feature).features.forEach(function (p) {
            if (polyWidthKm(p) < MIN_WIDTH_KM) { return; }
            if (front && areaKm2(p) < 800) {
              var hit = null;
              try { hit = gIntersect(p, front); } catch (e) { hit = p; }
              if (!hit) { return; }
            }
            keep.push(p.geometry.coordinates);
          });
          return keep.length ? { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: keep } } : null;
        }

        function compare() {
          var siteFeatures = ((layerKmlData.main && layerKmlData.main.features) || []).filter(isPoly);
          var laFeatures = selectedFeatures();
          if (!laFeatures.length) { showError(T.noLa); return; }
          if (!siteFeatures.length) { showError(T.noSite); return; }
          var ukFeatures = ((layerKmlData['ukrainian-control'] && layerKmlData['ukrainian-control'].features) || []).filter(isPoly);
          if (!uaMask && !ukFeatures.length) { showError(T.noUk); return; }
          elBtn.disabled = true; elBtn.textContent = T.calculating; elResult.innerHTML = '';
          // Let the browser paint the "Calculating…" state before the heavy work.
          setTimeout(function () {
            try {
              var siteFull = unionAll(siteFeatures);
              var siteFullKm2 = areaKm2(siteFull);
              if (seaMask && siteFull) { siteFull = gDifference(siteFull, seaMask); }
              if (siteFull) {
                try { siteFull = gDifference(siteFull, { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [RU_RING] } }); }
                catch (ruErr) { console.warn('Russia cut failed', ruErr); }
              }
              var laGeom = unionAll(laFeatures);
              var siteGeom, gapNote = '', front = null;
              if (!siteFull) {
                siteGeom = null;
              } else if (uaMask) {
                // Exact outline supplied in lostarmour/ukraine.geojson.
                siteGeom = gIntersect(siteFull, uaMask);
              } else {
                // Ukrainian Control holds only what Ukraine controls; the rest
                // of Ukraine is the LostArmour area. Where this map's Russian
                // Control claims land that neither covers (thin cracks between
                // them, narrower than 2 x CRACK_KM) it is Ukrainian land too.
                var ukGeom = unionAll(ukFeatures), crack = null;
                try {
                  var near = turf.buffer(laGeom, CRACK_KM, { units: 'kilometers', steps: 4 });
                  var ukNear = gIntersect(ukGeom, near);
                  if (ukNear) {
                    front = turf.buffer(ukNear, CRACK_KM, { units: 'kilometers', steps: 4 });
                    var both = gIntersect(near, front);
                    crack = both ? gDifference(both, laGeom) : null;
                    crack = crack ? gDifference(crack, ukGeom) : null;
                  }
                } catch (gapErr) {
                  console.warn('LostArmour gap fill failed', gapErr);
                  crack = null; front = null; gapNote = T.gapFail;
                }
                var parts = [gIntersect(siteFull, ukGeom), gIntersect(siteFull, laGeom),
                  crack ? gIntersect(siteFull, crack) : null].filter(Boolean);
                siteGeom = unionAll(parts);
              }
              var siteInUaKm2 = areaKm2(siteGeom);
              var inter = siteGeom ? gIntersect(siteGeom, laGeom) : null;
              var onlySite = siteGeom ? gDifference(siteGeom, laGeom) : null;
              var onlyLa = siteGeom ? gDifference(laGeom, siteGeom) : laGeom;
              // Drop slivers thinner than MIN_WIDTH_KM (seams between neighbouring
              // polygons) and, for "only on this map", small stray pieces that are
              // not near the front (lagoons, bays, gaps deep inside occupied land).
              onlySite = cleanDiff(onlySite, front);
              onlyLa = cleanDiff(onlyLa, null);
              // Ignore zone: cut it out of both difference sets.
              var ignoredKm2 = 0;
              var zone = !IGNORE_ENABLED ? null : (ignoreMask || getDefaultZone());
              if (zone) {
                if (onlySite) { ignoredKm2 += areaKm2(gIntersect(onlySite, zone)); onlySite = gDifference(onlySite, zone); }
                if (onlyLa) { ignoredKm2 += areaKm2(gIntersect(onlyLa, zone)); onlyLa = gDifference(onlyLa, zone); }
              }
              var interKm2 = areaKm2(inter), onlySiteKm2 = areaKm2(onlySite), onlyLaKm2 = areaKm2(onlyLa);
              // Totals follow from the parts so the table always adds up.
              var siteKm2 = interKm2 + onlySiteKm2, laKm2 = interKm2 + onlyLaKm2;
              diffSite = onlySite ? { type: 'FeatureCollection', features: [onlySite] } : null;
              diffLa = onlyLa ? { type: 'FeatureCollection', features: [onlyLa] } : null;
              ensureLayers();

              var delta = siteKm2 - laKm2;
              var pct = laKm2 ? Math.abs(delta) / laKm2 * 100 : 0;
              var verdict;
              if (Math.abs(delta) < 0.5) {
                verdict = 'Both maps cover practically the same area.';
              } else {
                verdict = 'This map shows <b>' + fmt(delta) + ' km²</b> (' + pct.toFixed(pct < 10 ? 2 : 1) + '%) ' +
                  (delta > 0 ? 'more' : 'less') + ' than LostArmour.';
              }
              elResult.innerHTML = '<table>' +
                row(T.site, siteKm2) + row(T.la, laKm2) +
                row(T.overlap, interKm2) +
                row(T.onlySite, onlySiteKm2, SITE_ONLY_COLOR) +
                row(T.onlyLa, onlyLaKm2, LA_ONLY_COLOR) +
                row(T.diff, (delta > 0 ? '+' : delta < 0 ? '−' : '') + fmt(delta) + ' km²', null, 'la-total') +
                row(T.outside, Math.max(0, siteFullKm2 - siteInUaKm2), null, 'la-muted') +
                (ignoredKm2 > 0.5 ? row(T.ignored, ignoredKm2, null, 'la-muted') : '') +
                '</table><div class="la-verdict">' + verdict + '</div>' +
                (gapNote ? '<div class="la-note la-error" style="margin-top:6px">' + gapNote + '</div>' : '') +
                (state.frontlineHistoryMode ? '<div class="la-note" style="margin-top:6px">' + T.histNote + '</div>' : '');
              elClear.hidden = false;
            } catch (err) {
              console.error('LostArmour comparison failed', err);
              showError(T.fail + (err && err.message ? err.message : err));
            } finally {
              elBtn.disabled = false; elBtn.textContent = T.compare;
            }
          }, 30);
        }

        // ---- KML loading ----
        function parseKml(text) {
          var doc = new DOMParser().parseFromString(text, 'application/xml');
          var out = [];
          Array.prototype.forEach.call(doc.getElementsByTagName('Placemark'), function (pm) {
            if (!pm.getElementsByTagName('Polygon')[0]) { return; }
            var d = pm.getElementsByTagName('description')[0];
            var desc = d ? d.textContent.trim() : '';
            var g = desc.indexOf('до СВО') !== -1 ? 'pre2022'
              : (/^(Республика Крым|Севастополь)/.test(desc) ? 'crimea' : 'since2022');
            var rings = [];
            Array.prototype.forEach.call(pm.getElementsByTagName('coordinates'), function (c) {
              var pts = c.textContent.trim().split(/\s+/).map(function (p) {
                var a = p.split(','); return [parseFloat(a[0]), parseFloat(a[1])];
              }).filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
              if (pts.length > 2) {
                if (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]) { pts.push(pts[0]); }
                rings.push(pts);
              }
            });
            if (rings.length) {
              out.push({ type: 'Feature', properties: { g: g, n: desc }, geometry: { type: 'Polygon', coordinates: rings } });
            }
          });
          return out;
        }
        var FOLDER = 'lostarmour/';
        var elSel = document.getElementById('laFileSel');
        var elFile = document.getElementById('laFileInput');
        var folderFiles = [];

        function applyKml(text, label) {
          var feats = parseKml(text);
          if (!feats.length) { throw new Error('no polygons found in the file'); }
          data = { type: 'FeatureCollection', features: feats };
          rebuildClipped();
          dataLabel = label;
          clearComparison();
          renderGroups();
          ensureLayers();
        }
        function fetchText(url) {
          return fetch(url, { cache: 'no-store' }).then(function (r) {
            if (!r.ok) { throw new Error('HTTP ' + r.status); }
            return r.text();
          });
        }
        function loadEntry(entry) {
          return fetchText(FOLDER + entry.file).then(function (text) {
            applyKml(text, entry.label || entry.file);
          }).catch(function (err) {
            console.error('LostArmour KML load failed: ' + entry.file, err);
            elNote.textContent = 'Could not load ' + FOLDER + entry.file + ' (' + (err && err.message || err) + ').';
          });
        }
        function exists(name) {
          return fetch(FOLDER + name, { method: 'HEAD', cache: 'no-store' }).then(function (r) {
            // Some hosts answer 200 + index.html for missing files; ignore those.
            return r.ok && !/text\/html/i.test(r.headers.get('content-type') || '');
          }).catch(function () { return false; });
        }
        // lostarmour/files.json (optional) lists what is in the folder, so the
        // page does not have to guess with ~150 HEAD requests that each show up
        // as a red 404 in the console. Format:
        //   { "kml": ["2026-10-02.kml", "2026-10-01.kml"], "latest": false,
        //     "extras": ["ukraine.geojson", "ignore.geojson", "seas.geojson"] }
        // Without it the old probing is used as a fallback.
        var manifestPromise = null;
        function getManifest() {
          if (!manifestPromise) {
            manifestPromise = fetchText(FOLDER + 'files.json').then(function (t) {
              var m = JSON.parse(t);
              return m && typeof m === 'object' ? m : null;
            }).catch(function () { return null; });
          }
          return manifestPromise;
        }
        function extraExists(name) {
          return getManifest().then(function (m) {
            return m ? (m.extras || []).indexOf(name) !== -1 : exists(name);
          });
        }
        function isoDate(d) {
          var m = d.getMonth() + 1, day = d.getDate();
          return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
        }
        // 1) hosts with directory listing enabled: read the .kml links.
        function listDir() {
          return fetchText(FOLDER).then(function (t) {
            var out = [], re = /href="([^"?#]+\.kml)"/gi, m;
            while ((m = re.exec(t))) { out.push(decodeURIComponent(m[1].split('/').pop())); }
            return out;
          }).catch(function () { return []; });
        }
        // 2) any host: look for files named YYYY-MM-DD.kml over the last 150 days.
        function probeDates(days) {
          var d = new Date(), names = [];
          d.setDate(d.getDate() + 1);
          for (var i = 0; i < days; i++) { names.push(isoDate(d) + '.kml'); d.setDate(d.getDate() - 1); }
          return Promise.all(names.map(function (n) { return exists(n).then(function (ok) { return ok ? n : null; }); }))
            .then(function (a) { return a.filter(Boolean); });
        }
        // No manifest and no code edits: just put files into lostarmour/ —
        // latest.kml and/or files named like 2026-10-15.kml. The newest is
        // shown; if there are several, a dropdown appears.
        function loadFolder() {
          if (!window.fetch) { return Promise.resolve(); }
          return getManifest().then(function (man) {
            if (man) {
              var listed = (Array.isArray(man.kml) ? man.kml : []).filter(function (n) {
                return typeof n === 'string' && /^[\w.\-]+\.kml$/i.test(n) && n !== 'latest.kml';
              });
              return [!!man.latest, [], listed];
            }
            return Promise.all([exists('latest.kml'), listDir(), probeDates(150)]);
          }).then(function (res) {
            var seen = {}, names = [];
            res[1].concat(res[2]).forEach(function (n) { if (n !== 'latest.kml' && !seen[n]) { seen[n] = 1; names.push(n); } });
            names.sort(function (a, b) { return a < b ? 1 : -1; });
            folderFiles = [];
            if (res[0]) { folderFiles.push({ file: 'latest.kml', label: 'latest.kml' }); }
            names.forEach(function (n) { folderFiles.push({ file: n, label: n.replace(/\.kml$/i, '') }); });
            if (!folderFiles.length) { return; } // keep the embedded fallback
            elSel.innerHTML = '';
            folderFiles.forEach(function (x, i) {
              var o = document.createElement('option');
              o.value = String(i); o.textContent = x.label;
              elSel.appendChild(o);
            });
            elSel.hidden = folderFiles.length < 2;
            return loadEntry(folderFiles[0]);
          });
        }

        function geoToFeatures(g) {
          var out = [];
          if (!g) { return out; }
          if (g.type === 'FeatureCollection') {
            (g.features || []).forEach(function (f) { out = out.concat(geoToFeatures(f)); });
          } else if (g.type === 'Feature') {
            if (isPoly(g)) { out.push({ type: 'Feature', properties: {}, geometry: g.geometry }); }
          } else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
            out.push({ type: 'Feature', properties: {}, geometry: g });
          }
          return out;
        }
        // Optional: lostarmour/ukraine.geojson = exact outline of Ukraine
        // (with Crimea). When present it replaces the automatic estimate.
        function loadMask() {
          if (!window.fetch) { return; }
          extraExists('ukraine.geojson').then(function (ok) {
            if (!ok) { return; }
            return fetchText(FOLDER + 'ukraine.geojson').then(function (t) {
              var feats = geoToFeatures(JSON.parse(t));
              if (feats.length) { uaMask = unionAll(feats); clearComparison(); }
            });
          }).catch(function (err) { console.warn('ukraine.geojson not used', err); });
        }

        function loadIgnore() {
          if (!window.fetch) { return; }
          extraExists('ignore.geojson').then(function (ok) {
            if (!ok) { return; }
            return fetchText(FOLDER + 'ignore.geojson').then(function (t) {
              var feats = geoToFeatures(JSON.parse(t));
              if (feats.length) { ignoreMask = unionAll(feats); clearComparison(); }
            });
          }).catch(function (err) { console.warn('ignore.geojson not used', err); });
        }

        function loadSeas() {
          if (!window.fetch) { return; }
          extraExists('seas.geojson').then(function (ok) {
            if (!ok) { return; }
            return fetchText(FOLDER + 'seas.geojson').then(function (t) {
              var feats = geoToFeatures(JSON.parse(t));
              if (!feats.length) { return; }
              seaMask = unionAll(feats);
              rebuildClipped(); clearComparison(); renderGroups(); ensureLayers();
            });
          }).catch(function (err) { console.warn('seas.geojson not used', err); });
        }

        elToggle.addEventListener('change', function () { shown = elToggle.checked; ensureLayers(); });
        elBtn.addEventListener('click', compare);
        elClear.addEventListener('click', clearComparison);

        renderGroups();
        // A base-style switch wipes custom sources/layers; re-create ours.
        map.on('style.load', ensureLayers);
        if (map.isStyleLoaded()) { ensureLayers(); }
        elSel.addEventListener('change', function () { var e = folderFiles[Number(elSel.value)]; if (e) { loadEntry(e); } });
        elFile.addEventListener('change', function () {
          // The upload is admin-only in both the UI and its event handler.
          if (!document.body.classList.contains('is-admin')) {
            elFile.value = '';
            return;
          }
          var f = elFile.files && elFile.files[0];
          if (!f) { return; }
          var r = new FileReader();
          r.onload = function () {
            try { applyKml(String(r.result), f.name + ' (local file)'); }
            catch (err) { elNote.textContent = 'Could not read ' + f.name + ': ' + (err && err.message || err); }
          };
          r.readAsText(f);
          elFile.value = '';
        });
        loadFolder();
        loadMask();
        loadSeas();
        loadIgnore();
      })();
