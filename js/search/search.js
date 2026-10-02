      function flyToResult(lat, lng, zoom, cityName, countryName) {
        map.flyTo({
          center: [lng, lat],
          zoom: typeof zoom === 'number' ? zoom : Math.max(map.getZoom(), 10),
          essential: true
        });

        if (searchMarker) {
          searchMarker.remove();
        }
        searchMarker = new maplibregl.Marker({ color: '#ff9400' })
          .setLngLat([lng, lat])
          .addTo(map);
        attachMarkerPopup(searchMarker, lat, lng, cityName, countryName);
      }

      function closeSearchResults() {
        searchResults.hidden = true;
        searchResults.innerHTML = '';
      }

      function showSearchMessage(message) {
        searchResults.innerHTML = '';
        const item = document.createElement('div');
        item.className = 'search-result-message';
        item.textContent = message;
        searchResults.appendChild(item);
        searchResults.hidden = false;
      }

      function renderSearchResults(placeResults) {
        searchResults.innerHTML = '';
        placeResults.forEach((result) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'search-result-item';
          button.textContent = result.label;
          button.addEventListener('click', () => {
            flyToResult(result.lat, result.lng, result.zoom, result.city, result.country);
            searchInput.value = result.label;
            closeSearchResults();
          });
          searchResults.appendChild(button);
        });
        searchResults.hidden = placeResults.length === 0;
      }

      async function runSearch() {
        const query = searchInput.value.trim();
        if (!query) {
          closeSearchResults();
          return;
        }

        const coordinates = parseCoordinateInput(query);
        if (coordinates) {
          flyToResult(coordinates.lat, coordinates.lng, 12);
          closeSearchResults();
          return;
        }

        if (query.length < 2) {
          closeSearchResults();
          return;
        }

        showSearchMessage('Searching…');

        try {
          const url = 'https://api.maptiler.com/geocoding/' + encodeURIComponent(query) +
            '.json?key=okpdMcXQXKD9GKjumNOC&limit=5&autocomplete=true';
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error('Geocoding request failed');
          }

          const data = await response.json();

          // A later keystroke may have started a newer search already —
          // don't overwrite its (possibly still loading) results with a
          // stale response from this older request.
          if (searchInput.value.trim() !== query) {
            return;
          }

          const features = data.features || [];

          if (features.length === 0) {
            showSearchMessage('No results found.');
            return;
          }

          renderSearchResults(features.map((feature) => {
            const countryContext = (feature.context || []).find(
              (entry) => entry.id && entry.id.startsWith('country')
            );
            return {
              label: feature.place_name || feature.text,
              lat: feature.center[1],
              lng: feature.center[0],
              zoom: 11,
              city: feature.text,
              country: countryContext ? countryContext.text : ''
            };
          }));
        } catch (error) {
          console.error('search error', error);
          if (searchInput.value.trim() === query) {
            showSearchMessage('Search failed — check your connection and try again.');
          }
        }
      }

      let searchDebounceTimer = null;
      searchInput.addEventListener('input', () => {
        if (searchDebounceTimer) {
          clearTimeout(searchDebounceTimer);
        }
        searchDebounceTimer = setTimeout(runSearch, 300);
      });
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
          }
          runSearch();
        }
      });
      searchInput.addEventListener('focus', () => {
        if (searchResults.children.length > 0) {
          searchResults.hidden = false;
        }
      });

      document.addEventListener('click', (event) => {
        if (
          !searchResults.hidden &&
          !searchResults.contains(event.target) &&
          event.target !== searchInput
        ) {
          closeSearchResults();
        }
      });
