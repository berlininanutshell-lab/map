      // ---- Generated post text for advances ----
      // Finds the nearest settlement to the shape's centre via MapTiler
      // reverse geocoding (Russian names), then fills the post template.
      const ADVANCE_MAP_URL = 'https://berlininanutshell-lab.github.io/map/';

      // Settlement lookup for the post text. Returns { name, kind } where
      // kind is 'city' when the shape lies inside/touches a city or town
      // (=> "в городе X"), otherwise 'near' (=> "к X"). Uses OpenStreetMap
      // via Overpass: first "which settlement areas contain the shape"
      // (so a part of a city like a suburb resolves to the city itself),
      // then the nearest village/hamlet node, then a MapTiler fallback.
      async function findSettlement(feature) {
        const center = turf.centroid(feature).geometry.coordinates;
        const [lng, lat] = center;

        // A few sample points across the shape: centre, a point guaranteed
        // to be inside, and some outline vertices.
        const samples = [center];
        try { samples.push(turf.pointOnFeature(feature).geometry.coordinates); } catch (e) { /* ignore */ }
        try {
          const coords = turf.coordAll(feature);
          const step = Math.max(1, Math.floor(coords.length / 5));
          for (let i = 0; i < coords.length; i += step) {
            samples.push(coords[i]);
          }
        } catch (e) { /* ignore */ }
        const points = samples.slice(0, 8).map((c) => [Number(c[0]).toFixed(5), Number(c[1]).toFixed(5)]);

        const hosts = [
          'https://overpass-api.de/api/interpreter',
          'https://overpass.kumi.systems/api/interpreter'
        ];

        const runOverpass = async (query) => {
          for (const host of hosts) {
            try {
              const response = await fetch(host + '?data=' + encodeURIComponent(query));
              if (response.ok) {
                return await response.json();
              }
            } catch (error) {
              console.error('Overpass failed on ' + host, error);
            }
          }
          return null;
        };

        const nameOf = (tags) => (tags && (tags['name:ru'] || tags.name)) || '';
        const isCityType = (t) => t === 'city' || t === 'town';

        // 1) Settlement areas that contain the shape (or touch it).
        const isIn = points.map((pt, i) => 'is_in(' + pt[1] + ',' + pt[0] + ')->.a' + i + ';').join('');
        const union = '(' + points.map((pt, i) => '.a' + i + ';').join('') + ')->.a;';
        const nodeAround = 'node(around:6000,' + lat + ',' + lng + ')[place~"^(city|town|village|hamlet)$"][name];';
        const areaQuery = '[out:json][timeout:25];' + isIn + union +
          '(area.a[place~"^(city|town|village|hamlet)$"][name];' +
          'area.a[boundary=administrative][admin_level=8][name];' + nodeAround + ');out tags center;';
        const areaData = await runOverpass(areaQuery);

        if (areaData && areaData.elements) {
          const nodeTypeByName = {};
          areaData.elements.filter((el) => el.type === 'node').forEach((el) => {
            nodeTypeByName[nameOf(el.tags)] = el.tags.place;
          });

          const areas = areaData.elements
            .filter((el) => el.type === 'area' || el.type === 'relation' || el.type === 'way')
            .map((el) => {
              const name = nameOf(el.tags);
              return { name, type: el.tags.place || nodeTypeByName[name] || '' };
            })
            .filter((a) => a.name);

          const city = areas.find((a) => isCityType(a.type));
          if (city) {
            return { name: city.name, kind: 'city' };
          }
          const village = areas.find((a) => a.type === 'village' || a.type === 'hamlet');
          if (village) {
            return { name: village.name, kind: 'near' };
          }
        }

        // 2) Nearest city/town/village/hamlet node (no suburbs/quarters).
        for (const radius of [8000, 20000]) {
          const data = await runOverpass('[out:json][timeout:20];node(around:' + radius + ',' + lat + ',' + lng + ')' +
            '[place~"^(city|town|village|hamlet)$"][name];out body;');
          if (!data) {
            continue;
          }
          const nodes = (data.elements || [])
            .map((el) => ({
              name: nameOf(el.tags),
              type: el.tags.place,
              dist: turf.distance(turf.point([el.lon, el.lat]), turf.point(center), { units: 'kilometers' })
            }))
            .filter((n) => n.name)
            .sort((a, b) => a.dist - b.dist);
          if (nodes.length) {
            return { name: nodes[0].name, kind: 'near' };
          }
        }

        // 3) MapTiler reverse geocoding fallback.
        try {
          const url = 'https://api.maptiler.com/geocoding/' + lng + ',' + lat + '.json' +
            '?key=okpdMcXQXKD9GKjumNOC&language=ru&types=locality,municipality,joint_municipality,place&limit=1';
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            const hit = (data.features || [])[0];
            if (hit) {
              return { name: hit.text_ru || hit.text || '', kind: 'near' };
            }
          }
        } catch (error) {
          console.error('Reverse geocoding failed', error);
        }
        return { name: '', kind: 'near' };
      }

      async function buildAdvancePostText(layerId, feature, verb) {
        const isRussia = layerId === 'russian-advances';
        const flag = isRussia ? '🇷🇺' : '🇺🇦';
        const army = isRussia ? 'ВС РФ' : 'ВСУ';
        const action = verb === 'captured' ? 'захватили' : 'продвинулись';
        const place = await findSettlement(feature);

        const km2 = turf.area(feature) / 1e6;
        const decimals = km2 < 10 ? 2 : km2 < 100 ? 1 : 0;
        const areaText = km2.toLocaleString('ru-RU', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });

        const name = place.name || '[название н.п.]';
        const where = place.kind === 'city' ? ' в городе ' + name : ' к ' + name;

        return flag + ' ' + army + ' ' + action + where + '.\n\n' +
          'Площадь продвижения: ' + areaText + ' км²\n' +
          'Карта: ' + ADVANCE_MAP_URL;
      }

      function openTerritoryFeaturePopup(layerId, featureId, lngLat) {
        const feature = findTerritoryFeature(layerId, featureId);
        if (!feature) {
          return;
        }
        closeTerritoryPopup();

        const layer = getLayerById(layerId);
        const isAdvance = layerId === 'russian-advances' || layerId === 'ukrainian-advances';
        const areaText = isAdvance ? formatAreaKm2(feature) : null;
        const source = normalizeTerritorySource(feature.properties && feature.properties.source);
        const sourceBlock = isAdvance ? (
          '<div class="territory-popup-source">' +
          '<span class="territory-popup-source-label">Source</span>' +
          (source
            ? '<a href="' + escapeHtml(source) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(source) + '</a>'
            : '<span class="marker-popup-subtitle">No source added.</span>') +
          (isAdmin()
            ? '<input class="territory-popup-source-input" type="url" placeholder="https://example.com/source" value="' + escapeHtml(source || '') + '" />' +
              '<button type="button" class="marker-popup-copy territory-popup-source-save">Save source</button>'
            : '') +
          '</div>'
        ) : '';

        const postBlock = (isAdmin() && isAdvance) ? (
          '<div class="territory-popup-post">' +
          '<div class="territory-popup-post-row">' +
          '<button type="button" class="marker-popup-copy territory-popup-post-advanced" data-verb="advanced">Текст: продвинулись</button>' +
          '<button type="button" class="marker-popup-copy territory-popup-post-captured" data-verb="captured">Текст: захватили</button>' +
          '</div>' +
          '<textarea class="territory-popup-post-text" hidden spellcheck="false"></textarea>' +
          '<button type="button" class="marker-popup-copy territory-popup-post-copy" hidden>Скопировать текст</button>' +
          '</div>'
        ) : '';

        const html =
          '<div class="marker-popup">' +
          '<div class="marker-popup-title">' + escapeHtml(layer ? layer.name : 'Shape') + '</div>' +
          (areaText ? '<div class="marker-popup-coords">' + escapeHtml(areaText) + '</div>' : '') +
          sourceBlock +
          postBlock +
          '<div class="marker-popup-actions">' +
          (isAdmin() && isAdvance ? '<button type="button" class="marker-popup-apply">Apply the advance</button>' : '') +
          (isAdmin() && layerId === 'main' ? '<button type="button" class="marker-popup-copy territory-popup-restore-advance">Move back to Russian advances</button>' : '') +
          (isAdmin() && isAdvance ? '<button type="button" class="marker-popup-copy territory-popup-smooth">Smooth</button>' : '') +
          (isAdmin() ? '<button type="button" class="marker-popup-copy territory-popup-edit">Edit shape (add/move points)</button>' : '') +
          (isAdmin() ? '<button type="button" class="marker-popup-copy territory-popup-kmz">Download KMZ</button>' : '') +
          (isAdmin() ? '<button type="button" class="marker-popup-delete">Delete</button>' : '') +
          '</div></div>';

        territoryPopup = new maplibregl.Popup({ offset: 8, closeButton: true, closeOnClick: false })
          .setLngLat(lngLat)
          .setHTML(html)
          .addTo(map);

        territoryPopup.on('close', () => {
          territoryPopup = null;
        });

        const container = territoryPopup.getElement();
        if (!container) {
          return;
        }

        const sourceSaveBtn = container.querySelector('.territory-popup-source-save');
        if (sourceSaveBtn) {
          sourceSaveBtn.addEventListener('click', () => {
            const input = container.querySelector('.territory-popup-source-input');
            saveTerritorySource(layerId, featureId, input ? input.value : '', lngLat);
          });
        }

        const postTextEl = container.querySelector('.territory-popup-post-text');
        const postCopyBtn = container.querySelector('.territory-popup-post-copy');
        container.querySelectorAll('.territory-popup-post-advanced, .territory-popup-post-captured').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const originalLabel = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Ищу н.п…';
            try {
              const text = await buildAdvancePostText(layerId, feature, btn.dataset.verb);
              postTextEl.value = text;
              postTextEl.hidden = false;
              postCopyBtn.hidden = false;
            } catch (error) {
              console.error('Advance post text failed', error);
              postTextEl.value = 'Не удалось сгенерировать текст.';
              postTextEl.hidden = false;
            } finally {
              btn.disabled = false;
              btn.textContent = originalLabel;
            }
          });
        });
        if (postCopyBtn) {
          postCopyBtn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(postTextEl.value);
            } catch (error) {
              postTextEl.select();
              document.execCommand('copy');
            }
            postCopyBtn.textContent = 'Скопировано ✓';
            setTimeout(() => { postCopyBtn.textContent = 'Скопировать текст'; }, 1500);
          });
        }

        const applyBtn = container.querySelector('.marker-popup-apply');
        if (applyBtn) {
          applyBtn.addEventListener('click', () => {
            applyAdvanceFeature(layerId, featureId);
          });
        }

        const restoreAdvanceBtn = container.querySelector('.territory-popup-restore-advance');
        if (restoreAdvanceBtn) {
          restoreAdvanceBtn.addEventListener('click', () => {
            if (window.confirm('Move this shape out of Russian Control and back to pending Russian advances?')) {
              restoreRussianAdvanceFeature(featureId);
            }
          });
        }

        const smoothBtn = container.querySelector('.territory-popup-smooth');
        if (smoothBtn) {
          smoothBtn.addEventListener('click', () => {
            smoothTerritoryFeature(layerId, featureId, lngLat);
          });
        }

        const kmzBtn = container.querySelector('.territory-popup-kmz');
        if (kmzBtn) {
          kmzBtn.addEventListener('click', () => {
            downloadTerritoryKmz(layerId, featureId);
          });
        }

        const editBtn = container.querySelector('.territory-popup-edit');
        if (editBtn) {
          editBtn.addEventListener('click', () => {
            closeTerritoryPopup();
            enterVertexEditMode(layerId, featureId);
          });
        }

        const deleteBtn = container.querySelector('.marker-popup-delete');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', () => {
            removeTerritoryFeature(layerId, featureId);
            closeTerritoryPopup();
          });
        }
      }
