      // Supports both the combined and legacy split-coordinate form fields.
      const geoNationDetails = {
        ukraine: { label: 'Ukraine' },
        russia: { label: 'Russia' }
      };

      const geoLocationsListEl = document.getElementById('geoLocationsList');
      const geoResultsCountEl = document.getElementById('geoResultsCount');
      const geoCalendarMonthEl = document.getElementById('geoCalendarMonth');
      const geoCalendarDaysEl = document.getElementById('geoCalendarDays');
      const geoCalendarHintEl = document.getElementById('geoCalendarHint');
      const geoRangeStartEl = document.getElementById('geoRangeStart');
      const geoRangeEndEl = document.getElementById('geoRangeEnd');
      const geoAdminAccessNoteEl = document.getElementById('geoAdminAccessNote');
      const geoAdminStatusEl = document.getElementById('geoAdminStatus');
      const geoLocationForm = document.getElementById('geoLocationForm');
      const geoDateInput = document.getElementById('geoDateInput');
      const geoCoordinatesInput = document.getElementById('geoCoordinatesInput');
      const geoLatitudeInput = document.getElementById('geoLatitudeInput');
      const geoLongitudeInput = document.getElementById('geoLongitudeInput');
      const geoPickLocationBtn = document.getElementById('geoPickLocationBtn');
      const geoPublishBtn = document.getElementById('geoPublishBtn');
      const geoCollectionRef = typeof db !== 'undefined' && db
        ? db.collection('mapState').doc('geolocations').collection('locations')
        : null;
      const geoLocations = new Map();
      let geoVisibleLocations = [];
      let geoPopup = null;
      let geoPopupLocationId = null;
      let geoMapClickBound = false;

      const geoToday = new Date();
      const geoTodayKey = toGeoDateKey(geoToday);
      let geoRangeStart = geoTodayKey;
      let geoRangeEnd = geoTodayKey;
      let geoCalendarMonth = new Date(geoToday.getFullYear(), geoToday.getMonth(), 1);
      let geoPickingLocation = false;
      let geoLocationsLoaded = false;
      let geoLoadError = '';

      function toGeoDateKey(date) {
        return date.getFullYear() + '-' +
          String(date.getMonth() + 1).padStart(2, '0') + '-' +
          String(date.getDate()).padStart(2, '0');
      }

      function isValidGeoDateKey(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          return false;
        }
        const date = new Date(value + 'T12:00:00');
        return !Number.isNaN(date.getTime()) && toGeoDateKey(date) === value;
      }

      function formatGeoDate(dateKey) {
        if (!isValidGeoDateKey(dateKey)) {
          return dateKey || '';
        }
        const [year, month, day] = dateKey.split('-');
        return day + '.' + month + '.' + year;
      }

      function setGeoAdminStatus(message, type) {
        geoAdminStatusEl.textContent = message || '';
        geoAdminStatusEl.classList.toggle('is-error', type === 'error');
        geoAdminStatusEl.classList.toggle('is-success', type === 'success');
      }

      function readGeoCoordinates() {
        if (geoCoordinatesInput) {
          return parseCoordinateInput(geoCoordinatesInput.value);
        }
        if (!geoLatitudeInput || !geoLongitudeInput) {
          return null;
        }
        const lat = Number(geoLatitudeInput.value);
        const lng = Number(geoLongitudeInput.value);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      }

      function fillGeoCoordinates(lat, lng) {
        if (geoCoordinatesInput) {
          geoCoordinatesInput.value = lat.toFixed(6) + ', ' + lng.toFixed(6);
          return;
        }
        if (geoLatitudeInput && geoLongitudeInput) {
          geoLatitudeInput.value = lat.toFixed(6);
          geoLongitudeInput.value = lng.toFixed(6);
        }
      }

      function safeGeoSourceMarkup(source, popup) {
        const safeSource = escapeHtml(source);
        let sourceUrl;
        try {
          sourceUrl = new URL(source);
        } catch (error) {
          return safeSource;
        }
        if (sourceUrl.protocol !== 'https:' && sourceUrl.protocol !== 'http:') {
          return safeSource;
        }
        const className = popup ? 'geo-popup-source' : 'geo-location-source';
        return '<a class="' + className + '" href="' + escapeHtml(sourceUrl.href) +
          '" target="_blank" rel="noopener noreferrer">' + safeSource + '</a>';
      }

      function geoLocationPopupHtml(location) {
        const nation = geoNationDetails[location.nation];
        return '<div class="geo-popup">' +
          '<div class="geo-popup-title">' + escapeHtml(nation.label) + ' flag</div>' +
          '<div class="geo-popup-date">' + escapeHtml(formatGeoDate(location.date)) + '</div>' +
          '<div class="geo-popup-description">' + escapeHtml(location.description) + '</div>' +
          safeGeoSourceMarkup(location.source, true) +
          (state.role === 'admin'
            ? '<br /><button type="button" class="geo-popup-delete" data-geo-id="' + escapeHtml(location.id) + '">Delete location</button>'
            : '') +
          '</div>';
      }

      function geoFlagImageData(nation) {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 22;
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Could not create geolocation flag image.');
        }

        if (nation === 'ukraine') {
          context.fillStyle = '#0057b7';
          context.fillRect(0, 0, 32, 11);
          context.fillStyle = '#ffd700';
          context.fillRect(0, 11, 32, 11);
        } else {
          context.fillStyle = '#fff';
          context.fillRect(0, 0, 32, 22 / 3);
          context.fillStyle = '#0039a6';
          context.fillRect(0, 22 / 3, 32, 22 / 3);
          context.fillStyle = '#d52b1e';
          context.fillRect(0, 44 / 3, 32, 22 / 3);
        }
        context.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        context.lineWidth = 1;
        context.strokeRect(0.5, 0.5, 31, 21);
        return context.getImageData(0, 0, canvas.width, canvas.height);
      }

      function geoFeatureCollection(locations) {
        return {
          type: 'FeatureCollection',
          features: locations.map((location) => ({
            type: 'Feature',
            id: location.id,
            properties: {
              id: location.id,
              nation: location.nation,
              date: location.date,
              source: location.source,
              description: location.description,
              icon: 'geolocation-flag-' + location.nation
            },
            geometry: {
              type: 'Point',
              coordinates: [location.lng, location.lat]
            }
          }))
        };
      }

      function ensureGeoMapLayer() {
        if (!map.isStyleLoaded()) {
          return;
        }
        ['ukraine', 'russia'].forEach((nation) => {
          const imageId = 'geolocation-flag-' + nation;
          if (!map.hasImage(imageId)) {
            map.addImage(imageId, geoFlagImageData(nation));
          }
        });

        if (!map.getSource('geolocation-flags')) {
          map.addSource('geolocation-flags', {
            type: 'geojson',
            data: geoFeatureCollection(geoVisibleLocations)
          });
        }
        if (!map.getLayer('geolocation-flags-symbols')) {
          map.addLayer({
            id: 'geolocation-flags-symbols',
            type: 'symbol',
            source: 'geolocation-flags',
            layout: {
              'icon-image': ['get', 'icon'],
              'icon-anchor': 'bottom-left',
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
              'icon-size': 1
            }
          });
        }
        if (!geoMapClickBound) {
          map.on('click', 'geolocation-flags-symbols', (event) => {
            const feature = event.features && event.features[0];
            if (!feature) {
              return;
            }
            const location = geoLocations.get(feature.properties.id);
            if (!location) {
              return;
            }
            if (geoPopup) {
              geoPopup.remove();
            }
            geoPopup = new maplibregl.Popup({ offset: 16, closeButton: true, closeOnClick: false })
              .setLngLat(feature.geometry.coordinates)
              .setHTML(geoLocationPopupHtml(location))
              .addTo(map);
            geoPopupLocationId = location.id;
          });
          geoMapClickBound = true;
        }

        const source = map.getSource('geolocation-flags');
        if (source) {
          source.setData(geoFeatureCollection(geoVisibleLocations));
        }
      }

      function restoreGeoMapLayerAfterStyleChange() {
        if (!map.isStyleLoaded()) {
          return;
        }
        const layerMissing = !map.getLayer('geolocation-flags-symbols');
        const sourceMissing = !map.getSource('geolocation-flags');
        const imageMissing = !map.hasImage('geolocation-flag-ukraine') ||
          !map.hasImage('geolocation-flag-russia');
        if (layerMissing || sourceMissing || imageMissing) {
          ensureGeoMapLayer();
        }
      }

      function renderGeoMarkers(locations) {
        geoVisibleLocations = locations;
        if (map.isStyleLoaded()) {
          ensureGeoMapLayer();
        }
        if (geoPopup && !locations.some((location) => location.id === geoPopupLocationId)) {
          geoPopup.remove();
          geoPopup = null;
          geoPopupLocationId = null;
        }
      }

      function locationsInSelectedRange() {
        if (!geoRangeStart || !geoRangeEnd) {
          return [];
        }
        return Array.from(geoLocations.values())
          .filter((location) => location.date >= geoRangeStart && location.date <= geoRangeEnd)
          .sort((first, second) => second.date.localeCompare(first.date));
      }

      function renderGeolocationsView() {
        renderGeoCalendar();
        geoAdminAccessNoteEl.hidden = state.role === 'admin';
        if (state.role === 'guest') {
          geoAdminAccessNoteEl.innerHTML =
            'To publish or remove flags, sign in with the verified administrator account.' +
            ' <button id="geoAdminLoginBtn" class="geo-admin-login-btn" type="button">Log in</button>';
        } else if (state.role !== 'admin') {
          geoAdminAccessNoteEl.textContent =
            'You are signed in, but publishing and deleting flags are available only to the administrator.';
        }
        const locations = locationsInSelectedRange();
        geoResultsCountEl.textContent = String(locations.length);
        geoLocationsListEl.innerHTML = locations.length
          ? locations.map((location) => {
            const nation = geoNationDetails[location.nation];
            return '<article class="geo-location-card" data-geo-id="' + escapeHtml(location.id) + '">' +
              '<div class="geo-location-topline">' +
              '<img class="geo-location-flag" src="https://flagcdn.com/w40/' + nation.flagCode +
              '.png" alt="' + escapeHtml(nation.label) + ' flag" />' +
              '<div class="geo-location-heading">' +
              '<div class="geo-location-name">' + escapeHtml(nation.label) + '</div>' +
              '<div class="geo-location-date">' + escapeHtml(formatGeoDate(location.date)) + '</div>' +
              '</div>' +
              '</div>' +
              '<p class="geo-location-description">' + escapeHtml(location.description) + '</p>' +
              safeGeoSourceMarkup(location.source, false) +
              '<div class="geo-location-actions">' +
              '<button class="geo-location-action" type="button" data-geo-action="show" data-geo-id="' +
              escapeHtml(location.id) + '">Show on map</button>' +
              (state.role === 'admin'
                ? '<button class="geo-location-action danger" type="button" data-geo-action="delete" data-geo-id="' +
                  escapeHtml(location.id) + '">Delete</button>'
                : '') +
              '</div>' +
              '</article>';
          }).join('')
          : '<div class="geo-location-empty">' +
            (geoLoadError
              ? escapeHtml(geoLoadError)
              : geoLocationsLoaded ? 'No flags in this date range.' : 'Loading published locations…') +
            '</div>';
        renderGeoMarkers(locations);
      }

      function renderGeoCalendar() {
        const year = geoCalendarMonth.getFullYear();
        const month = geoCalendarMonth.getMonth();
        geoCalendarMonthEl.textContent = geoCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const firstDay = new Date(year, month, 1);
        const mondayOffset = (firstDay.getDay() + 6) % 7;
        const gridStart = new Date(year, month, 1 - mondayOffset);
        const cells = [];
        for (let index = 0; index < 42; index += 1) {
          const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
          const dateKey = toGeoDateKey(date);
          const isStart = dateKey === geoRangeStart;
          const isEnd = dateKey === geoRangeEnd;
          const inRange = geoRangeStart && geoRangeEnd &&
            dateKey > geoRangeStart && dateKey < geoRangeEnd;
          const classes = ['geo-calendar-day'];
          if (date.getMonth() !== month) classes.push('outside-month');
          if (dateKey === geoTodayKey) classes.push('today');
          if (inRange) classes.push('in-range');
          if (isStart || isEnd) classes.push('range-edge');
          cells.push(
            '<button class="' + classes.join(' ') + '" type="button" data-geo-date="' + dateKey +
            '" aria-label="' + escapeHtml(date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })) +
            '"' + (isStart || isEnd ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' +
            date.getDate() + '</button>'
          );
        }
        geoCalendarDaysEl.innerHTML = cells.join('');
        geoRangeStartEl.textContent = geoRangeStart ? formatGeoDate(geoRangeStart) : 'Choose start date';
        geoRangeEndEl.textContent = geoRangeEnd ? formatGeoDate(geoRangeEnd) : 'Choose end date';
        geoCalendarHintEl.textContent = !geoRangeStart
          ? 'Choose a start date.'
          : !geoRangeEnd
            ? 'Now choose an end date.'
            : 'Showing dates from ' + formatGeoDate(geoRangeStart) + ' through ' + formatGeoDate(geoRangeEnd) + '.';
      }

      function selectGeoCalendarDate(dateKey) {
        if (!geoRangeStart || geoRangeEnd) {
          geoRangeStart = dateKey;
          geoRangeEnd = null;
        } else if (dateKey < geoRangeStart) {
          geoRangeStart = dateKey;
        } else {
          geoRangeEnd = dateKey;
        }
        const selectedDate = new Date(dateKey + 'T12:00:00');
        geoCalendarMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        renderGeolocationsView();
      }

      async function deleteGeoLocation(locationId) {
        if (state.role !== 'admin' || !geoCollectionRef) {
          return;
        }
        try {
          await geoCollectionRef.doc(locationId).delete();
          setGeoAdminStatus('Location deleted.', 'success');
        } catch (error) {
          console.error('Failed to delete geolocation', error);
          setGeoAdminStatus('Could not delete the location. Check Firestore permissions and try again.', 'error');
        }
      }

      document.getElementById('geoCalendarPrev').addEventListener('click', () => {
        geoCalendarMonth = new Date(geoCalendarMonth.getFullYear(), geoCalendarMonth.getMonth() - 1, 1);
        renderGeoCalendar();
      });
      document.getElementById('geoCalendarNext').addEventListener('click', () => {
        geoCalendarMonth = new Date(geoCalendarMonth.getFullYear(), geoCalendarMonth.getMonth() + 1, 1);
        renderGeoCalendar();
      });
      document.getElementById('geoRangeReset').addEventListener('click', () => {
        geoRangeStart = null;
        geoRangeEnd = null;
        renderGeolocationsView();
      });
      geoCalendarDaysEl.addEventListener('click', (event) => {
        const button = event.target.closest('[data-geo-date]');
        if (button) {
          selectGeoCalendarDate(button.dataset.geoDate);
        }
      });

      geoLocationsListEl.addEventListener('click', (event) => {
        const button = event.target.closest('[data-geo-action]');
        if (!button) {
          return;
        }
        const location = geoLocations.get(button.dataset.geoId);
        if (!location) {
          return;
        }
        if (button.dataset.geoAction === 'show') {
          map.flyTo({ center: [location.lng, location.lat], zoom: Math.max(map.getZoom(), 8) });
          if (geoPopup) {
            geoPopup.remove();
          }
          geoPopup = new maplibregl.Popup({ offset: 16, closeButton: true, closeOnClick: false })
            .setLngLat([location.lng, location.lat])
            .setHTML(geoLocationPopupHtml(location))
            .addTo(map);
          geoPopupLocationId = location.id;
        } else if (button.dataset.geoAction === 'delete') {
          deleteGeoLocation(location.id);
        }
      });

      geoAdminAccessNoteEl.addEventListener('click', (event) => {
        if (event.target.closest('#geoAdminLoginBtn') && typeof showAuthOverlay === 'function') {
          showAuthOverlay();
        }
      });

      map.on('click', (event) => {
        if (!geoPickingLocation || state.role !== 'admin' || event.defaultPrevented) {
          return;
        }
        fillGeoCoordinates(event.lngLat.lat, event.lngLat.lng);
        geoPickingLocation = false;
        geoPickLocationBtn.classList.remove('is-picking');
        geoPickLocationBtn.textContent = 'Choose location on map';
        setGeoAdminStatus('Coordinates selected. Add the source and description, then publish.', '');
      });

      geoPickLocationBtn.addEventListener('click', () => {
        if (state.role !== 'admin') {
          return;
        }
        if (typeof deactivateDrawingTool === 'function') {
          deactivateDrawingTool();
        }
        geoPickingLocation = true;
        geoPickLocationBtn.classList.add('is-picking');
        geoPickLocationBtn.textContent = 'Click a point on the map…';
        setGeoAdminStatus('Click the map to choose the location.', '');
      });

      geoLocationForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (state.role !== 'admin') {
          setGeoAdminStatus('Only an administrator can publish locations.', 'error');
          return;
        }
        if (!geoCollectionRef) {
          setGeoAdminStatus('Firestore is unavailable. This location was not saved.', 'error');
          return;
        }

        const nationInput = document.getElementById('geoNationInput');
        const sourceInput = document.getElementById('geoSourceInput');
        const descriptionInput = document.getElementById('geoDescriptionInput');
        if (!nationInput || !geoDateInput || !sourceInput || !descriptionInput || !geoAdminStatusEl) {
          console.error('Geolocation form is missing required fields in index.html.');
          return;
        }

        const nation = nationInput.value;
        const date = geoDateInput.value;
        const coordinates = readGeoCoordinates();
        const lat = coordinates ? coordinates.lat : NaN;
        const lng = coordinates ? coordinates.lng : NaN;
        const source = sourceInput.value.trim();
        const description = descriptionInput.value.trim();
        if (!geoNationDetails[nation] || !isValidGeoDateKey(date) ||
            !Number.isFinite(lat) || lat < -90 || lat > 90 ||
            !Number.isFinite(lng) || lng < -180 || lng > 180 ||
            !source || !description) {
          setGeoAdminStatus('Enter a valid date, coordinates, source, and description.', 'error');
          return;
        }

        geoPublishBtn.disabled = true;
        setGeoAdminStatus('Publishing…', '');
        try {
          await geoCollectionRef.add({
            nation,
            date,
            lat,
            lng,
            source,
            description,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          geoLocationForm.reset();
          geoDateInput.value = geoTodayKey;
          geoPickingLocation = false;
          geoPickLocationBtn.classList.remove('is-picking');
          geoPickLocationBtn.textContent = 'Choose location on map';
          setGeoAdminStatus('Location published.', 'success');
        } catch (error) {
          console.error('Failed to publish geolocation', error);
          const errorCode = error && error.code ? error.code : '';
          if (errorCode === 'permission-denied') {
            setGeoAdminStatus(
              'Firestore rejected the write. Verify that you are signed in as the administrator with a verified email, and that the latest Firestore rules are published.',
              'error'
            );
          } else if (errorCode === 'unauthenticated') {
            setGeoAdminStatus('Your session has expired. Sign in again and retry.', 'error');
          } else {
            setGeoAdminStatus(
              'Could not publish the location (' + (errorCode || 'unknown error') + '). Check the browser console for details.',
              'error'
            );
          }
        } finally {
          geoPublishBtn.disabled = false;
        }
      });

      document.addEventListener('click', (event) => {
        const button = event.target.closest('.geo-popup-delete[data-geo-id]');
        if (button) {
          deleteGeoLocation(button.dataset.geoId);
        }
      });

      if (geoCollectionRef) {
        geoCollectionRef.orderBy('date', 'asc').onSnapshot((snapshot) => {
          geoLoadError = '';
          geoLocations.clear();
          snapshot.forEach((documentSnapshot) => {
            const data = documentSnapshot.data();
            if (!geoNationDetails[data.nation] || !isValidGeoDateKey(data.date) ||
                !Number.isFinite(data.lat) || data.lat < -90 || data.lat > 90 ||
                !Number.isFinite(data.lng) || data.lng < -180 || data.lng > 180 ||
                typeof data.source !== 'string' || typeof data.description !== 'string') {
              console.warn('Skipping invalid geolocation record', documentSnapshot.id);
              return;
            }
            geoLocations.set(documentSnapshot.id, {
              id: documentSnapshot.id,
              nation: data.nation,
              date: data.date,
              lat: data.lat,
              lng: data.lng,
              source: data.source,
              description: data.description
            });
          });
          geoLocationsLoaded = true;
          renderGeolocationsView();
        }, (error) => {
          console.error('Failed to load shared geolocations', error);
          geoLocationsLoaded = true;
          geoLoadError = 'Could not load locations. Check Firestore configuration and read permissions.';
          renderGeolocationsView();
        });
      } else {
        geoLocationsLoaded = true;
        geoLoadError = 'Firestore is unavailable. Published locations cannot be loaded.';
        setGeoAdminStatus('Firestore is unavailable. Published locations cannot be loaded or saved.', 'error');
      }

      map.on('style.load', restoreGeoMapLayerAfterStyleChange);
      map.on('styledata', restoreGeoMapLayerAfterStyleChange);
      geoDateInput.value = geoTodayKey;
      renderGeolocationsView();
      window.renderGeolocationsView = renderGeolocationsView;
