      // ---- Drawing tool activation / deactivation ----
      // The map only responds to draw gestures while a tool is armed
      // (state.drawingTool !== null). Closing the tool menu, in any way,
      // disarms the current tool so clicks/drags on the map behave like
      // normal panning again until the user reopens the menu and picks
      // a tool explicitly.
      function deactivateDrawingTool() {
        if (state.territoryEdit) {
          finishVertexEditMode(false);
        }
        state.drawingTool = null;
        document.querySelectorAll('.tool-option').forEach((option) => {
          option.setAttribute('aria-pressed', 'false');
        });
        drawHint.textContent = 'Choose a tool to start drawing.';
        map.getCanvasContainer().style.cursor = '';
        territoryLayerPicker.hidden = true;

        // Discard any in-progress drawing (e.g. a line waiting for its
        // second click, or an active brush stroke) so nothing is left
        // half-drawn once the tool is disarmed.
        state.isBrushing = false;
        state.draft = null;
        cancelTerritorySmoothing();
        map.dragPan.enable();
        updateDrawings();
      }

      function closeToolMenu() {
        if (toolMenu.hidden) {
          return;
        }
        toolMenu.hidden = true;
        drawToolsBtn.setAttribute('aria-expanded', 'false');
        closeLineVariantMenu();
        deactivateDrawingTool();
      }
