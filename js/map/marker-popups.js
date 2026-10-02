      // Fill-layer ids ('kml-main-fill', etc.) already wired with a
      // click-to-manage handler — see ensureKmlLayersForLayer — so a
      // map style switch (which recreates the layer) doesn't stack up
      // duplicate handlers.
      const wiredTerritoryClickLayers = new Set();

      function buildMarkerPopupHTML(lat, lng, cityName, countryName) {
        const coordsText = lat.toFixed(11) + ', ' + lng.toFixed(11);
        return (
          '<div class="marker-popup">' +
          '<div class="marker-popup-title">' + escapeHtml(cityName || 'Selected location') + '</div>' +
          (countryName ? '<div class="marker-popup-subtitle">' + escapeHtml(countryName) + '</div>' : '') +
          '<div class="marker-popup-coords">' + coordsText + '</div>' +
          '<button type="button" class="marker-popup-copy" data-coords="' + escapeHtml(coordsText) + '">Copy coordinates</button>' +
          '</div>'
        );
      }

      function attachMarkerPopup(marker, lat, lng, cityName, countryName) {
        const popup = new maplibregl.Popup({ offset: 28, closeButton: true, closeOnClick: false })
          .setHTML(buildMarkerPopupHTML(lat, lng, cityName, countryName));

        popup.on('open', () => {
          const container = popup.getElement();
          if (!container) {
            return;
          }

          const copyBtn = container.querySelector('.marker-popup-copy');
          if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
              try {
                await navigator.clipboard.writeText(copyBtn.dataset.coords);
                copyBtn.textContent = 'Copied';
                setTimeout(() => {
                  copyBtn.textContent = 'Copy coordinates';
                }, 1500);
              } catch (error) {
                copyBtn.textContent = 'Copy unavailable';
              }
            });
          }

          // The × button removes the pinpoint itself, not just the popup.
          const closeBtn = container.querySelector('.maplibregl-popup-close-button');
          if (closeBtn) {
            closeBtn.addEventListener('click', () => {
              marker.remove();
              if (marker === searchMarker) {
                searchMarker = null;
              }
            });
          }
        });

        marker.setPopup(popup);
      }
