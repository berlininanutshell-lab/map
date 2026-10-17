      // ---- Line tool variant flyout ----
      // Right-clicking the Line button opens a small menu offering a
      // dashed variant. Picking it arms the 'lineDashed' tool, which
      // draws and behaves exactly like 'line' (left-click to add
      // points, right-click to finish) but renders dashed. The Line
      // button itself stays visually "pressed" while either variant
      // is active, since they're really the same tool.
      function closeLineVariantMenu() {
        lineVariantMenu.hidden = true;
        closeLayerLineMenu();
      }

      lineToolBtn.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        closeLayerLineMenu();
        lineVariantMenu.hidden = false;

        const menuWidth = 170;
        const menuHeight = 46;
        const left = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
        const top = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
        lineVariantMenu.style.left = Math.max(8, left) + 'px';
        lineVariantMenu.style.top = Math.max(8, top) + 'px';
      });

      lineVariantMenu.querySelectorAll('.tool-option').forEach((button) => {
        button.addEventListener('click', () => {
          if (state.drawingTool === 'contested-circle') {
            state.circleCenter = null;
            state.circleRadiusGuide = null;
            state.circleRadiusLabel = null;
            state.draft = null;
            updateDrawings();
          }
          state.drawingTool = button.dataset.tool;
          updateThicknessControl();
          document.querySelectorAll('.tool-option').forEach((option) => {
            const isActive = option === button || (option === lineToolBtn && button.dataset.tool === 'lineDashed');
            option.setAttribute('aria-pressed', String(isActive));
          });
          territoryLayerPicker.hidden = true;
          drawHint.textContent = toolHints[state.drawingTool];
          map.getCanvasContainer().style.cursor = 'crosshair';
          closeLineVariantMenu();
        });
      });

      drawColor.addEventListener('input', () => {
        state.drawingColor = drawColor.value;
        updateActiveSwatch();
      });

      function updateThicknessControl() {
        const enabled = ['line', 'lineDashed', 'russian-frontline', 'ukrainian-frontline', 'constitutional-border', 'brush', 'arrow'].includes(state.drawingTool);
        drawThickness.disabled = !enabled;
        drawThickness.parentElement.hidden = !enabled;
      }

      drawThickness.addEventListener('input', () => {
        state.drawingThickness = Number(drawThickness.value) || 3;
        drawThicknessValue.textContent = state.drawingThickness + ' px';
      });

      updateThicknessControl();

      // ---- "Line for layers" flyout ----
      // Left-click arms the last chosen variant (pro-Russian by default);
      // right-click opens a menu to choose pro-Russian, pro-Ukrainian or
      // the constitutional border of the Russian Federation.
      const layerLineBtn = document.getElementById('layerLineBtn');
      const layerLineMenu = document.getElementById('layerLineMenu');

      if (typeof toolHints !== 'undefined' && !toolHints['constitutional-border']) {
        toolHints['constitutional-border'] =
          'Click to add points to the constitutional border of the Russian Federation. Right-click to finish the line.';
      }

      function closeLayerLineMenu() {
        layerLineMenu.hidden = true;
      }

      layerLineBtn.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        closeLineVariantMenu();
        layerLineMenu.hidden = false;
        const menuWidth = 240;
        const menuHeight = 130;
        const left = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
        const top = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
        layerLineMenu.style.left = Math.max(8, left) + 'px';
        layerLineMenu.style.top = Math.max(8, top) + 'px';
      });

      layerLineMenu.querySelectorAll('.tool-option').forEach((button) => {
        button.addEventListener('click', () => {
          layerLineBtn.dataset.tool = button.dataset.tool;
          layerLineBtn.title = 'Current: ' + button.textContent.trim() + ' (right-click to change)';
          layerLineBtn.click(); // the shared tool handler arms the chosen tool
          closeLayerLineMenu();
        });
      });