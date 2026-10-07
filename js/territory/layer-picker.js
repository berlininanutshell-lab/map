      // Rebuilds the territory drawing buttons from the current layer
      // names/colors. Called once at startup and again every time
      // renderLayers() runs, so a color change (admin recolor, or the
      // shared-color Firestore sync) is reflected here too.
      function renderTerritoryLayerPicker() {
        territoryLayerPicker.querySelectorAll('.territory-layer-option').forEach((btn) => btn.remove());

        territoryDrawLayerIds.forEach((layerId) => {
          const layer = getLayerById(layerId);
          if (!layer) {
            return;
          }

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'territory-layer-option';
          btn.dataset.layer = layerId;
          btn.setAttribute('aria-pressed', String(state.territoryLayerId === layerId));

          const dot = document.createElement('span');
          dot.className = 'territory-layer-dot';
          dot.style.background = layer.color;

          btn.appendChild(dot);
          btn.appendChild(document.createTextNode(layer.name));

          btn.addEventListener('click', () => {
            state.territoryLayerId = layerId;
            territoryLayerPicker.querySelectorAll('.territory-layer-option').forEach((option) => {
              option.setAttribute('aria-pressed', String(option === btn));
            });
          });

          territoryLayerPicker.appendChild(btn);
        });
      }

      // Hint text shown under the tool list for whichever tool is armed.
      // Kept at module scope so both the main tool-option click handler
      // and the line-variant flyout (right-click on the Line button)
      // can use it.
      const toolHints = {
        brush: 'Drag on the map to draw a freehand stroke.',
        line: 'Left-click to add points, right-click to finish the line.',
        lineDashed: 'Left-click to add points, right-click to finish the dashed line.',
        arrow: 'Left-click to add points, right-click to finish the arrow.',
        pinpoint: 'Click the map to place a pinpoint.',
        polygon: 'Choose a territory type, then left-click to draw and smooth its polygon.'
      };
