      // ---- Sidebar tabs: Legend / Casualties / Advances / Frontline ----
      const legendTabBtn = document.getElementById('legendTabBtn');
      const casualtiesTabBtn = document.getElementById('casualtiesTabBtn');
      const advancesTabBtn = document.getElementById('advancesTabBtn');
      const frontlineTabBtn = document.getElementById('frontlineTabBtn');
      const geolocationsTabBtn = document.getElementById('geolocationsTabBtn');
      const contactTabBtn = document.getElementById('contactTabBtn');
      const legendView = document.getElementById('legendView');
      const casualtiesView = document.getElementById('casualtiesView');
      const advancesView = document.getElementById('advancesView');
      const frontlineView = document.getElementById('frontlineView');
      const geolocationsView = document.getElementById('geolocationsView');
      const contactView = document.getElementById('contactView');
      const sidebarEyebrow = document.getElementById('sidebarEyebrow');
      let sidebarTab = 'legend';

      const sidebarTabViews = {
        legend: legendView,
        casualties: casualtiesView,
        advances: advancesView,
        frontline: frontlineView,
        geolocations: geolocationsView,
        contact: contactView
      };
      const sidebarTabBtns = {
        legend: legendTabBtn,
        casualties: casualtiesTabBtn,
        advances: advancesTabBtn,
        frontline: frontlineTabBtn,
        geolocations: geolocationsTabBtn,
        contact: contactTabBtn
      };
      const sidebarTabLabels = {
        legend: 'Legend',
        casualties: 'Casualties',
        advances: 'Advances',
        frontline: 'Frontline',
        geolocations: 'Geolocations',
        contact: 'Contact'
      };

      function setSidebarTab(tab) {
        if (tab === sidebarTab) {
          if (tab === 'frontline') {
            renderFrontlineView();
          }
          return;
        }
        const previousTab = sidebarTab;
        sidebarTab = tab;

        Object.keys(sidebarTabBtns).forEach((key) => {
          sidebarTabBtns[key].setAttribute('aria-selected', String(key === tab));
        });
        sidebarEyebrow.textContent = sidebarTabLabels[tab];

        if (tab === 'casualties') {
          renderCasualtiesView();
        } else if (tab === 'advances') {
          renderAdvancesView();
        } else if (tab === 'frontline') {
          renderFrontlineView();
        } else if (tab === 'geolocations') {
          if (typeof window.renderGeolocationsView === 'function') {
            window.renderGeolocationsView();
          }
        } else if (tab === 'contact' && typeof window.contactOnTabShown === 'function') {
          window.contactOnTabShown();
        }

        const incoming = sidebarTabViews[tab];
        const outgoing = sidebarTabViews[previousTab];

        incoming.hidden = false;
        void incoming.offsetWidth;
        incoming.classList.add('is-active');

        outgoing.classList.remove('is-active');
        outgoing.addEventListener('transitionend', function onFadeOut(event) {
          if (event.target !== outgoing) {
            return;
          }
          outgoing.removeEventListener('transitionend', onFadeOut);
          if (outgoing.classList.contains('is-active')) {
            return;
          }
          outgoing.hidden = true;
        });
      }

      legendTabBtn.addEventListener('click', () => setSidebarTab('legend'));
      casualtiesTabBtn.addEventListener('click', () => setSidebarTab('casualties'));
      advancesTabBtn.addEventListener('click', () => setSidebarTab('advances'));
      frontlineTabBtn.addEventListener('click', () => setSidebarTab('frontline'));
      geolocationsTabBtn.addEventListener('click', () => setSidebarTab('geolocations'));
      contactTabBtn.addEventListener('click', () => setSidebarTab('contact'));

      // ---- Advances tab: live pending-advance area, dated to today ----
      // This remains the live view. The Frontline tab separately stores
      // the values at the moment an admin locks a day's snapshot.
      function sumLayerAreaKm2(layerId) {
        const features = layerPolygonFeatures(layerId);
        let squareMeters = 0;
        features.forEach((feature) => {
          try {
            squareMeters += turf.area(feature);
          } catch (error) {
            // Skip a malformed shape rather than let it break the total.
          }
        });
        return { km2: squareMeters / 1e6, count: features.length };
      }

      function formatAdvancesKm2(km2) {
        const decimals = km2 < 10 ? 2 : km2 < 100 ? 1 : 0;
        return Number(km2 || 0).toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
      }

      function todayDateKey() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
      }

      function dateKeyLabel(dateKey) {
        const parsed = new Date(dateKey + 'T12:00:00');
        return parsed.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      }

      function todayLabel() {
        return dateKeyLabel(todayDateKey());
      }

      function renderAdvancesView() {
        const asOf = 'As of ' + todayLabel();

        const russia = sumLayerAreaKm2('russian-advances');
        document.getElementById('russiaAdvancesValue').innerHTML =
          formatAdvancesKm2(russia.km2) + '<span>km²</span>';
        document.getElementById('russiaAdvancesAsOf').textContent = asOf;
        document.getElementById('russiaAdvancesShapeCount').textContent =
          russia.count + ' pending shape' + (russia.count === 1 ? '' : 's');
        updateAdvanceApplyButton('applyRussianAdvancesBtn', russia.count);

        const ukraine = sumLayerAreaKm2('ukrainian-advances');
        document.getElementById('ukraineAdvancesValue').innerHTML =
          formatAdvancesKm2(ukraine.km2) + '<span>km²</span>';
        document.getElementById('ukraineAdvancesAsOf').textContent = asOf;
        document.getElementById('ukraineAdvancesShapeCount').textContent =
          ukraine.count + ' pending shape' + (ukraine.count === 1 ? '' : 's');
        updateAdvanceApplyButton('applyUkrainianAdvancesBtn', ukraine.count);
      }

      function updateAdvanceApplyButton(buttonId, pendingCount) {
        const button = document.getElementById(buttonId);
        const hasPending = pendingCount > 0;
        button.disabled = !hasPending || state.frontlineHistoryMode;
        button.title = hasPending && state.frontlineHistoryMode
          ? 'Return to the live map to apply advances.'
          : '';
        button.classList.toggle('has-pending', hasPending);
        button.textContent = hasPending ? 'Apply advances' : 'No advances';
      }

      document.getElementById('applyRussianAdvancesBtn').addEventListener('click', () => {
        if (state.role === 'admin') {
          applyAllAdvances('russian-advances');
        }
      });
      document.getElementById('applyUkrainianAdvancesBtn').addEventListener('click', () => {
        if (state.role === 'admin') {
          applyAllAdvances('ukrainian-advances');
        }
      });
