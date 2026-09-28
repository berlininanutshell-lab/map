/*
 * layers.js
 *
 * Separate layer-management module for the map.  It owns the Layers panel
 * UI, shared layer appearance controls, and the Cities Outline controls.
 * The main index keeps the map/territory engine; this file only manages the
 * layer presentation and settings so it can evolve independently.
 */
(function () {
  'use strict';

  function renderLayersModule() {
    const visibleCount = state.layers.filter((layer) => layer.visible).length;
    mapSummary.textContent = state.currentStyle + ' • ' + visibleCount + ' visible layer' + (visibleCount === 1 ? '' : 's');

    renderTerritoryLayerPicker();
    layersList.innerHTML = '';

    state.layers.forEach((layer) => {
      const item = document.createElement('div');
      item.className = 'layer-item' + (layer.visible ? '' : ' hidden');

      const dot = document.createElement('span');
      dot.className = 'layer-dot';
      dot.style.background = layer.color;

      const name = document.createElement('div');
      name.className = 'layer-name';
      name.textContent = layer.name;

      const actions = document.createElement('div');
      actions.className = 'layer-actions';

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'layer-color-input admin-only';
      colorInput.value = layer.color;
      colorInput.setAttribute('aria-label', 'Change ' + layer.name + ' color');

      colorInput.addEventListener('input', () => {
        layer.color = colorInput.value;
        dot.style.background = colorInput.value;

        ensureKmlLayersForLayer(layer.id);

        if (layerColorsDocRef) {
          layerColorsDocRef
            .set(
              {
                colors: {
                  [layer.id]: colorInput.value
                }
              },
              { merge: true }
            )
            .catch((error) =>
              console.error(
                'Failed to save shared layer color',
                error
              )
            );
        }
      });

      let thicknessInput = null;

      if (layer.renderMode === 'outline') {
        thicknessInput = document.createElement('input');
        thicknessInput.type = 'range';
        thicknessInput.min = '1';
        thicknessInput.max = '12';
        thicknessInput.step = '1';
        thicknessInput.value = String(layer.thickness || 2);
        thicknessInput.className = 'layer-thickness-input admin-only';
        thicknessInput.title =
          'Outline thickness: ' + thicknessInput.value + ' px';

        thicknessInput.setAttribute(
          'aria-label',
          'Change ' + layer.name + ' outline thickness'
        );

        thicknessInput.addEventListener('input', () => {
          layer.thickness = Number(thicknessInput.value);

          thicknessInput.title =
            'Outline thickness: ' +
            thicknessInput.value +
            ' px';

          ensureKmlLayersForLayer(layer.id);

          if (layerColorsDocRef) {
            layerColorsDocRef
              .set(
                {
                  thickness: {
                    [layer.id]: layer.thickness
                  }
                },
                { merge: true }
              )
              .catch((error) =>
                console.error(
                  'Failed to save shared layer thickness',
                  error
                )
              );
          }
        });
      }

      let kmzBtn = null;
      let importBtn = null;

      if (sharedLayerIds.includes(layer.id)) {
        kmzBtn = document.createElement('button');
        kmzBtn.type = 'button';
        kmzBtn.className = 'toggle-btn admin-only';
        kmzBtn.textContent = 'KMZ';
        kmzBtn.title =
          'Download ' + layer.name + ' polygons as KMZ';

        kmzBtn.addEventListener('click', () => {
          downloadTerritoryKmz(layer.id);
        });

        importBtn = document.createElement('button');
        importBtn.type = 'button';
        importBtn.className = 'toggle-btn admin-only';
        importBtn.textContent = 'Import';
        importBtn.title =
          'Import polygons from a KML/KMZ file into ' +
          layer.name;

        importBtn.addEventListener('click', () => {
          startTerritoryImport(layer.id);
        });
      }

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'toggle-btn';
      toggle.textContent = layer.visible ? 'On' : 'Off';

      toggle.addEventListener('click', () => {
        layer.visible = !layer.visible;

        renderLayersModule();
        ensureKmlLayersForLayer(layer.id);
      });

      actions.appendChild(colorInput);

      if (thicknessInput) {
        actions.appendChild(thicknessInput);
      }

      if (kmzBtn) {
        actions.appendChild(kmzBtn);
      }

      if (importBtn) {
        actions.appendChild(importBtn);
      }

      actions.appendChild(toggle);

      item.appendChild(dot);
      item.appendChild(name);
      item.appendChild(actions);

      layersList.appendChild(item);
    });
  }

  // Expose only the tiny bridge used by index.html.
  // The implementation remains private to this module.
  window.__layersModuleRender = renderLayersModule;

  // Shared appearance settings are kept here with the rest of
  // the layer UI.
  if (layerColorsDocRef) {
    layerColorsDocRef.onSnapshot(
      (doc) => {
        if (!doc.exists) return;

        const data = doc.data() || {};
        const colors = data.colors || {};
        const thicknesses = data.thickness || {};

        let changed = false;

        state.layers.forEach((layer) => {
          const sharedColor = colors[layer.id];

          if (
            sharedColor &&
            sharedColor !== layer.color
          ) {
            layer.color = sharedColor;
            changed = true;
          }

          const sharedThickness =
            Number(thicknesses[layer.id]);

          if (
            layer.renderMode === 'outline' &&
            Number.isFinite(sharedThickness) &&
            sharedThickness !== layer.thickness
          ) {
            layer.thickness = Math.max(
              1,
              Math.min(12, sharedThickness)
            );

            changed = true;
          }

          if (
            changed &&
            map.isStyleLoaded()
          ) {
            ensureKmlLayersForLayer(layer.id);
          }
        });

        if (changed) {
          renderLayersModule();
        }
      },
      (error) => {
        console.error(
          'Failed to sync shared layer colors',
          error
        );
      }
    );
  }

  // index.html may already have called renderLayers()
  // during startup before this file was loaded.
  // Render once now that the module is ready.
  renderLayersModule();
})();
