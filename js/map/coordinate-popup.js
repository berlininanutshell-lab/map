      function closeCoordinatePopup() {
        if (coordinatePopupHideTimeout) {
          clearTimeout(coordinatePopupHideTimeout);
          coordinatePopupHideTimeout = null;
        }
        coordinatePopup.classList.remove('visible');
      }

      function showCoordinates(lat, lng, originalEvent) {
        currentCoordinates = lat.toFixed(11) + ', ' + lng.toFixed(11);
        currentCoordinateLatLng = { lat, lng };
        coordinateText.textContent = currentCoordinates;
        copyCoordinatesBtn.textContent = 'Copy coordinates';

        if (coordinatePopupHideTimeout) {
          clearTimeout(coordinatePopupHideTimeout);
          coordinatePopupHideTimeout = null;
        }

        // Position near the click, but keep the popup fully on-screen.
        const popupWidth = 260;
        const popupHeight = 130;
        let left = (originalEvent ? originalEvent.clientX : window.innerWidth / 2) + 12;
        let top = (originalEvent ? originalEvent.clientY : window.innerHeight / 2) + 12;
        left = Math.min(left, window.innerWidth - popupWidth - 12);
        top = Math.min(top, window.innerHeight - popupHeight - 12);

        coordinatePopup.style.left = Math.max(12, left) + 'px';
        coordinatePopup.style.top = Math.max(12, top) + 'px';

        // Fade in on the next frame so the transition actually runs.
        requestAnimationFrame(() => {
          coordinatePopup.classList.add('visible');
        });
      }
