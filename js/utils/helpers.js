      // ---- Search: jump the map to a typed place name or raw coordinates ----
      function parseCoordinateInput(text) {
        const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
        if (!match) {
          return null;
        }

        const first = parseFloat(match[1]);
        const second = parseFloat(match[2]);

        // Accept "lat, lng" (the normal order). If the first number can't be
        // a latitude but the second can, swap them so "lng, lat" still works.
        if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
          return { lat: first, lng: second };
        }
        if (Math.abs(second) <= 90 && Math.abs(first) <= 180) {
          return { lat: second, lng: first };
        }
        return null;
      }

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : text;
        return div.innerHTML;
      }

      // Short, unique-enough id for a hand-drawn territory polygon, so
      // it can be individually selected, edited, deleted, or applied
      // later without disturbing any other shape on the same layer.
      function genId() {
        return 'poly-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      }
