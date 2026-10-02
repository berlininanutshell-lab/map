      function updateDrawings() {
        const features = state.drawings.slice();
        if (state.draft) {
          features.push(state.draft);
        }

        clearDrawingsBtn.disabled = features.length === 0;

        // Arrows get an extra little chevron feature at their tip,
        // computed fresh each render from the arrow's last segment —
        // this covers both finished arrows and the in-progress draft,
        // so the arrowhead follows the cursor while drawing too.
        const arrowHeadFeatures = [];
        features.forEach((feature) => {
          if (
            feature.properties &&
            feature.properties.tool === 'arrow' &&
            feature.geometry.type === 'LineString'
          ) {
            const head = computeArrowHeadFeature(feature.geometry.coordinates, feature.properties.color, feature.properties.thickness || 3);
            if (head) {
              arrowHeadFeatures.push(head);
            }
          }
        });

        const source = map.getSource('user-drawings');
        if (source) {
          source.setData({ type: 'FeatureCollection', features: features.concat(arrowHeadFeatures) });
        }
      }

      function makeLineFeature(coordinates, tool) {
        return {
          type: 'Feature',
          properties: { color: state.drawingColor, tool, thickness: state.drawingThickness },
          geometry: { type: 'LineString', coordinates }
        };
      }

      // Builds a small V-shaped chevron at the last point of an arrow's
      // coordinates, pointing the way the line is heading. Worked out
      // in screen pixels (via project/unproject) so the chevron stays
      // a sensible, constant size on screen regardless of how zoomed
      // in or out the map is at the moment the arrow is drawn.
      function computeArrowHeadFeature(coordinates, color, thickness) {
        const count = coordinates.length;
        if (count < 2) {
          return null;
        }

        const tip = coordinates[count - 1];
        const from = coordinates[count - 2];
        if (tip[0] === from[0] && tip[1] === from[1]) {
          return null;
        }

        const tipPx = map.project(tip);
        const fromPx = map.project(from);
        const dx = tipPx.x - fromPx.x;
        const dy = tipPx.y - fromPx.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) {
          return null;
        }

        const ux = dx / len;
        const uy = dy / len;
        const headLength = Math.max(10, 8 + (thickness || 3) * 1.5);
        const headAngle = (28 * Math.PI) / 180;

        const rotate = (x, y, angle) => [
          x * Math.cos(angle) - y * Math.sin(angle),
          x * Math.sin(angle) + y * Math.cos(angle)
        ];

        const [w1x, w1y] = rotate(-ux, -uy, headAngle);
        const [w2x, w2y] = rotate(-ux, -uy, -headAngle);

        const wing1 = map.unproject([tipPx.x + w1x * headLength, tipPx.y + w1y * headLength]);
        const wing2 = map.unproject([tipPx.x + w2x * headLength, tipPx.y + w2y * headLength]);

        return {
          type: 'Feature',
          properties: { color, tool: 'arrow', arrowHead: true, thickness: thickness || 3 },
          geometry: {
            type: 'LineString',
            coordinates: [[wing1.lng, wing1.lat], tip, [wing2.lng, wing2.lat]]
          }
        };
      }
