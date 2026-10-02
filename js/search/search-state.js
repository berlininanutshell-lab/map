      const coordinatePopup = document.getElementById('coordinatePopup');
      const coordinateText = document.getElementById('coordinateText');
      const closeCoordinatesBtn = document.getElementById('closeCoordinatesBtn');
      const copyCoordinatesBtn = document.getElementById('copyCoordinatesBtn');
      const addPinpointBtn = document.getElementById('addPinpointBtn');
      let currentCoordinates = '';
      let currentCoordinateLatLng = null;
      let coordinatePopupHideTimeout = null;

      const searchInput = document.getElementById('searchInput');
      const searchResults = document.getElementById('searchResults');
      let searchMarker = null;

      coordinatePopup.addEventListener('click', (event) => {
        event.stopPropagation();
      });

      closeCoordinatesBtn.addEventListener('click', () => {
        closeCoordinatePopup();
      });

      // wrapped: closeCoordinatePopup() is declared in a later file (js/map/coordinate-popup.js)
      mapStyleSelect.addEventListener('change', () => closeCoordinatePopup(), true);
