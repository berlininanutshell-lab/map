      // ---- Distance ruler (independent of the LostArmour overlay) ----
      // Button in the top-right map controls. Left-click adds points, right-click
      // finishes and keeps the line on the map (like the line tool);
      // distances are great-circle (spherical earth, accurate to ~0.5%).
      (function () {
        'use strict';
        if (typeof map === 'undefined' || typeof maplibregl === 'undefined') { return; }

        var R_EARTH = 6371.0088;
        var pts = [], active = false, done = false, labels = [], rubberLabel = null, downPos = null, btn = null;
        var EMPTY = { type: 'FeatureCollection', features: [] };

        // ---- styles ----
        var st = document.createElement('style');
        st.textContent =
          '.ruler-on { background: #cfe8ff !important; }' +
          'body.ruler-active .maplibregl-canvas-container, body.ruler-active .maplibregl-canvas-container * { cursor: crosshair !important; }' +
          '.ruler-label { background: rgba(12,16,22,0.93); color: #fff; border: 1px solid rgba(255,255,255,0.28); border-radius: 6px; padding: 2px 6px; font: 600 11px/1.3 system-ui, sans-serif; white-space: nowrap; pointer-events: none; }' +
          '#rulerPanel { position: fixed; top: 12px; left: calc(50% + var(--sidebar-width, 320px) / 2); transform: translateX(-50%); z-index: 450; min-width: 250px; max-width: calc(100vw - 24px); padding: 10px 12px; border: 1px solid rgba(255,255,255,0.16); border-radius: 12px; background: rgba(12,16,22,0.94); box-shadow: 0 8px 28px rgba(0,0,0,0.45); color: #edf5ff; font: 13px system-ui, sans-serif; text-align: center; transition: left 0.22s ease; }' +
          'body.sidebar-collapsed #rulerPanel { left: 50%; }' +
          '@media (max-width: 640px) { #rulerPanel { left: 50%; } }' +
          '#rulerPanel[hidden] { display: none; }' +
          '#rulerPanel .r-total { font-size: 20px; font-weight: 700; }' +
          '#rulerPanel .r-mi { color: #98a9b9; margin-left: 8px; font-size: 13px; }' +
          '#rulerPanel .r-hint { color: #98a9b9; font-size: 11.5px; margin: 4px 0 8px; }' +
          '#rulerPanel .r-btns { display: flex; gap: 6px; justify-content: center; }' +
          '#rulerPanel button { min-height: 30px; padding: 0 12px; border: 1px solid rgba(255,255,255,0.16); border-radius: 8px; background: #1b2530; color: #edf5ff; font: inherit; font-size: 12.5px; cursor: pointer; }' +
          '#rulerPanel button:hover:not(:disabled) { background: #253242; }' +
          '#rulerPanel button:disabled { opacity: 0.45; cursor: default; }';
        document.head.appendChild(st);

        var panel = document.createElement('div');
        panel.id = 'rulerPanel';
        panel.hidden = true;
        panel.innerHTML =
          '<div><span class="r-total" id="rulerTotal">0 m</span><span class="r-mi" id="rulerMi">0 mi</span></div>' +
          '<div class="r-hint" id="rulerHint">Click the map to start measuring</div>' +
          '<div class="r-btns"><button type="button" id="rulerUndo">Undo</button><button type="button" id="rulerClear">Clear</button><button type="button" id="rulerDone">Done</button><button type="button" id="rulerNew" hidden>New</button><button type="button" id="rulerRemove" hidden>Remove</button></div>';
        document.body.appendChild(panel);
        var elTotal = document.getElementById('rulerTotal'), elMi = document.getElementById('rulerMi'), elHint = document.getElementById('rulerHint');
        var elUndo = document.getElementById('rulerUndo'), elClear = document.getElementById('rulerClear'), elDone = document.getElementById('rulerDone');
        var elNew = document.getElementById('rulerNew'), elRemove = document.getElementById('rulerRemove');

        // ---- geometry ----
        function rad(d) { return d * Math.PI / 180; }
        function hav(a, b) {
          var dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
          var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
          return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
        }
        function toVec(p) { var la = rad(p[1]), lo = rad(p[0]); return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; }
        function toLL(v) { return [Math.atan2(v[1], v[0]) * 180 / Math.PI, Math.atan2(v[2], Math.sqrt(v[0] * v[0] + v[1] * v[1])) * 180 / Math.PI]; }
        // Points along the great circle so long measurements curve correctly.
        function arc(a, b) {
          var km = hav(a, b), d = km / R_EARTH;
          if (d < 1e-6) { return [a, b]; }
          var n = Math.max(1, Math.min(200, Math.ceil(km / 20)));
          var va = toVec(a), vb = toVec(b), sd = Math.sin(d), out = [a];
          for (var i = 1; i < n; i++) {
            var t = i / n, k1 = Math.sin((1 - t) * d) / sd, k2 = Math.sin(t * d) / sd;
            out.push(toLL([k1 * va[0] + k2 * vb[0], k1 * va[1] + k2 * vb[1], k1 * va[2] + k2 * vb[2]]));
          }
          out.push(b);
          return out;
        }
        // Exact point at fraction f (0..1) along the great circle a -> b.
        // (arc() only has intermediate points every ~20 km, so for short
        // segments it is just [a, b] and cannot give a midpoint.)
        function interp(a, b, f) {
          var d = hav(a, b) / R_EARTH;
          if (d < 1e-9) { return a; }
          var va = toVec(a), vb = toVec(b), sd = Math.sin(d);
          var k1 = Math.sin((1 - f) * d) / sd, k2 = Math.sin(f * d) / sd;
          return toLL([k1 * va[0] + k2 * vb[0], k1 * va[1] + k2 * vb[1], k1 * va[2] + k2 * vb[2]]);
        }
        function fmtKm(km) {
          if (km < 1) { return Math.round(km * 1000) + ' m'; }
          if (km < 100) { return km.toFixed(2) + ' km'; }
          if (km < 1000) { return km.toFixed(1) + ' km'; }
          return Math.round(km).toLocaleString() + ' km';
        }
        function fmtMi(km) {
          var mi = km * 0.621371;
          return (mi < 100 ? mi.toFixed(mi < 1 ? 2 : 1) : Math.round(mi).toLocaleString()) + ' mi';
        }
        function total() {
          var t = 0;
          for (var i = 1; i < pts.length; i++) { t += hav(pts[i - 1], pts[i]); }
          return t;
        }

        // ---- map layers ----
        function ensureLayers() {
          if (!map.getStyle()) { return; }
          ['ruler-line', 'ruler-pts', 'ruler-rubber'].forEach(function (id) {
            if (!map.getSource(id)) { map.addSource(id, { type: 'geojson', data: EMPTY }); }
          });
          if (!map.getLayer('ruler-line-casing')) {
            map.addLayer({ id: 'ruler-line-casing', type: 'line', source: 'ruler-line',
              layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#000000', 'line-opacity': 0.55, 'line-width': 6 } });
            map.addLayer({ id: 'ruler-line', type: 'line', source: 'ruler-line',
              layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 2.5 } });
            map.addLayer({ id: 'ruler-rubber', type: 'line', source: 'ruler-rubber',
              layout: { 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.85 } });
            map.addLayer({ id: 'ruler-pts', type: 'circle', source: 'ruler-pts',
              paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-color': '#111111', 'circle-stroke-width': 2 } });
          }
          ['ruler-line-casing', 'ruler-line', 'ruler-rubber', 'ruler-pts'].forEach(function (id) { map.moveLayer(id); });
        }
        function setData(id, data) { var s = map.getSource(id); if (s) { s.setData(data); } }

        function clearLabels() {
          labels.forEach(function (m) { m.remove(); });
          labels = [];
        }
        function makeLabel(text, lnglat, anchor, offset) {
          var el = document.createElement('div');
          el.className = 'ruler-label';
          el.textContent = text;
          return new maplibregl.Marker({ element: el, anchor: anchor || 'center', offset: offset || [0, 0] }).setLngLat(lnglat).addTo(map);
        }
        function hideRubber() {
          setData('ruler-rubber', EMPTY);
          if (rubberLabel) { rubberLabel.remove(); rubberLabel = null; }
        }

        function redraw() {
          ensureLayers();
          var coords = [];
          for (var i = 1; i < pts.length; i++) { coords = coords.concat(arc(pts[i - 1], pts[i])); }
          setData('ruler-line', coords.length ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] } : EMPTY);
          setData('ruler-pts', { type: 'FeatureCollection', features: pts.map(function (p) {
            return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }; }) });
          clearLabels();
          // Finished line: one "Total" label at the middle of the whole path
          // (by distance), no per-segment labels so nothing overlaps.
          // While measuring, each segment keeps its own label.
          if (!done) {
            for (var j = 1; j < pts.length; j++) {
              var a = arc(pts[j - 1], pts[j]);
              labels.push(makeLabel(fmtKm(hav(pts[j - 1], pts[j])), a[Math.floor(a.length / 2)]));
            }
          }
          var t = total();
          elTotal.textContent = fmtKm(t);
          elMi.textContent = fmtMi(t);
          if (done && pts.length > 1) {
            var half = t / 2, acc = 0, mid = pts[0];
            for (var k = 1; k < pts.length; k++) {
              var seg = hav(pts[k - 1], pts[k]);
              if (acc + seg >= half) {
                var f = seg > 0 ? (half - acc) / seg : 0;
                mid = interp(pts[k - 1], pts[k], f);
                break;
              }
              acc += seg;
            }
            var tl = makeLabel('Total ' + fmtKm(t), mid);
            tl.getElement().style.fontWeight = '700';
            labels.push(tl);
          }
          syncPanel();
          if (!pts.length) { hideRubber(); }
        }
        function syncPanel() {
          elUndo.hidden = elClear.hidden = elDone.hidden = done;
          elNew.hidden = elRemove.hidden = !done;
          elUndo.disabled = !pts.length;
          elHint.textContent = done
            ? 'Measurement kept on the map'
            : (pts.length ? 'Left-click adds points · right-click finishes · Esc cancels' : 'Click the map to start measuring');
        }

        // ---- on / off ----
        function start() {
          if (active) { return; }
          if (done) { cancel(); }
          if (typeof deactivateDrawingTool === 'function' && typeof state !== 'undefined' && state.drawingTool) {
            deactivateDrawingTool();
          }
          active = true;
          document.body.classList.add('ruler-active');
          if (btn) { btn.classList.add('ruler-on'); }
          panel.hidden = false;
          redraw();
        }
        // Right-click / Done: leave measuring mode but keep the result on the map.
        function finish() {
          if (!active) { return; }
          if (pts.length < 2) { cancel(); return; }
          active = false;
          done = true;
          document.body.classList.remove('ruler-active');
          if (btn) { btn.classList.remove('ruler-on'); }
          hideRubber();
          redraw();
        }
        // Esc / button while measuring / Remove: throw the measurement away.
        function cancel() {
          if (!active && !done) { return; }
          active = false;
          done = false;
          pts = [];
          document.body.classList.remove('ruler-active');
          if (btn) { btn.classList.remove('ruler-on'); }
          panel.hidden = true;
          clearLabels();
          hideRubber();
          setData('ruler-line', EMPTY);
          setData('ruler-pts', EMPTY);
        }
        function toggle() { if (active) { cancel(); } else { start(); } }

        // ---- control button ----
        function RulerControl() {}
        RulerControl.prototype.onAdd = function () {
          this._c = document.createElement('div');
          this._c.className = 'maplibregl-ctrl maplibregl-ctrl-group';
          btn = document.createElement('button');
          btn.type = 'button';
          btn.title = 'Measure distance';
          btn.setAttribute('aria-label', 'Measure distance');
          btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:auto"><path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/></svg>';
          btn.addEventListener('click', toggle);
          this._c.appendChild(btn);
          return this._c;
        };
        RulerControl.prototype.onRemove = function () {
          if (this._c && this._c.parentNode) { this._c.parentNode.removeChild(this._c); }
        };
        map.addControl(new RulerControl(), 'top-right');

        // ---- clicks: while measuring, the map's other click handlers are bypassed ----
        var cont = map.getContainer();
        cont.addEventListener('pointerdown', function (e) { downPos = [e.clientX, e.clientY]; }, true);
        cont.addEventListener('dblclick', function (e) {
          if (active && map.getCanvasContainer().contains(e.target)) { e.stopPropagation(); e.preventDefault(); }
        }, true);
        cont.addEventListener('click', function (e) {
          if (!active || !map.getCanvasContainer().contains(e.target)) { return; }
          e.stopPropagation();
          e.preventDefault();
          if (downPos && Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > 5) { return; } // it was a drag
          var rect = map.getCanvasContainer().getBoundingClientRect();
          var ll = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
          var p = [ll.lng, ll.lat];
          if (pts.length && hav(pts[pts.length - 1], p) < 0.003) { return; } // double tap
          pts.push(p);
          redraw();
        }, true);

        cont.addEventListener('contextmenu', function (e) {
          if (!active || !map.getCanvasContainer().contains(e.target)) { return; }
          e.stopPropagation();
          e.preventDefault();
          finish();
        }, true);

        map.on('mousemove', function (ev) {
          if (!active || !pts.length) { return; }
          var last = pts[pts.length - 1], p = [ev.lngLat.lng, ev.lngLat.lat];
          setData('ruler-rubber', { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: arc(last, p) } }] });
          var seg = hav(last, p), text = fmtKm(seg) + (pts.length > 1 ? '  ·  Σ ' + fmtKm(total() + seg) : '');
          if (!rubberLabel) { rubberLabel = makeLabel(text, p, 'left', [14, -14]); }
          else { rubberLabel.setLngLat(p); rubberLabel.getElement().textContent = text; }
        });

        // ---- panel buttons / keyboard ----
        elUndo.addEventListener('click', function () { pts.pop(); redraw(); });
        elClear.addEventListener('click', function () { pts = []; redraw(); });
        elDone.addEventListener('click', finish);
        elNew.addEventListener('click', function () { cancel(); start(); });
        elRemove.addEventListener('click', cancel);
        document.addEventListener('keydown', function (e) {
          if (!active) { return; }
          var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
          if (e.key === 'Escape') { cancel(); }
          else if (!typing && (e.key === 'Backspace' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'))) { e.preventDefault(); pts.pop(); redraw(); }
        });
        // Picking a drawing tool finishes the measurement (and keeps it).
        document.addEventListener('click', function (e) {
          if (active && e.target.closest && e.target.closest('.tool-option')) { finish(); }
        }, true);

        // A base-style switch wipes custom sources/layers; put them back.
        map.on('style.load', function () { if (active || done) { redraw(); } });
      })();
