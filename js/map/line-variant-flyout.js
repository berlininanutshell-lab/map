      // ---- Line tool variant flyout ----
      // Right-clicking the Line button opens a small menu offering a
      // dashed variant. Picking it arms the 'lineDashed' tool, which
      // draws and behaves exactly like 'line' (left-click to add
      // points, right-click to finish) but renders dashed. The Line
      // button itself stays visually "pressed" while either variant
      // is active, since they're really the same tool.
      function closeLineVariantMenu() {
        lineVariantMenu.hidden = true;
      }

      lineToolBtn.addEventListener('contextmenu', (event) => {
        event.preventDefault();
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
        const enabled = ['line', 'lineDashed', 'brush', 'arrow'].includes(state.drawingTool);
        drawThickness.disabled = !enabled;
        drawThickness.parentElement.hidden = !enabled;
      }

      drawThickness.addEventListener('input', () => {
        state.drawingThickness = Number(drawThickness.value) || 3;
        drawThicknessValue.textContent = state.drawingThickness + ' px';
      });

      updateThicknessControl();
