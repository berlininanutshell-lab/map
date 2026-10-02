      // ---- Standard color swatches ----
      // Quick-pick buttons next to the native color input, so common
      // colors don't need the OS color picker every time. The native
      // input stays for anything outside this set; picking a swatch
      // updates it too, and typing a custom color there clears the
      // swatch highlight (unless it happens to match one exactly).
      const colorSwatches = document.getElementById('colorSwatches');

      function updateActiveSwatch() {
        const current = state.drawingColor.toLowerCase();
        colorSwatches.querySelectorAll('.color-swatch').forEach((swatch) => {
          swatch.setAttribute('aria-pressed', String(swatch.dataset.color.toLowerCase() === current));
        });
      }

      colorSwatches.querySelectorAll('.color-swatch').forEach((swatch) => {
        swatch.addEventListener('click', () => {
          state.drawingColor = swatch.dataset.color;
          drawColor.value = swatch.dataset.color;
          updateActiveSwatch();
        });
      });

      const mapContainer = document.getElementById('map');

      document.addEventListener('click', (event) => {
        if (
          !toolMenu.hidden &&
          !toolMenu.contains(event.target) &&
          !lineVariantMenu.contains(event.target) &&
          !drawToolsBtn.contains(event.target) &&
          !mapContainer.contains(event.target) &&
          !(territorySmoothingControlsEl && territorySmoothingControlsEl.contains(event.target))
        ) {
          closeToolMenu();
        }
        if (!lineVariantMenu.hidden && !lineVariantMenu.contains(event.target) && event.target !== lineToolBtn) {
          closeLineVariantMenu();
        }
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !lineVariantMenu.hidden) {
          closeLineVariantMenu();
        }
        // While smoothing a just-finished advance, Escape belongs to the
        // smoothing workflow rather than the Draw menu. This prevents the
        // menu's normal deactivation path from deleting the in-progress
        // advance preview.
        if (event.key === 'Escape' && state.territorySmoothing) {
          cancelTerritorySmoothing();
          return;
        }
        if (event.key === 'Escape' && !toolMenu.hidden) {
          closeToolMenu();
        }
      });

      // Flags are placed/managed independently of drawings (each has
      // its own delete button in its popup), so "Clear all drawings"
      // only clears drawings — it no longer touches flags.
      clearDrawingsBtn.addEventListener('click', () => {
        state.drawings = [];
        state.draft = null;
        state.isBrushing = false;
        map.dragPan.enable();
        updateDrawings();
      });

      mapStyleSelect.addEventListener('change', () => {
        const selectedValue = mapStyleSelect.value;
        const selectedStyle = mapStyles[selectedValue];
        closeCoordinatePopup();
        map.setStyle(selectedStyle.style || selectedStyle.url, { diff: false });

        state.currentStyle = selectedStyle.name;
        state.currentStyleValue = selectedValue;
        renderLayers();
        document.getElementById('error').style.display = 'none';
      });

      renderLayers();
