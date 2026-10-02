      // ---- Flags (placed/moved by admins, visible to everyone) ----
      // Flags are draggable maplibregl.Markers, not part of the
      // GeoJSON drawings source — dragging a marker is built in.
      // placeFlag() is used two ways: (1) from the map-click handler,
      // which already checks state.role === 'admin', to create a new
      // flag locally and push it to everyone via Firestore; and (2)
      // from the flagsDocRef onSnapshot listener, to build the local
      // marker for a flag some other admin already placed — in that
      // case an existing flagId is passed in so both sides agree on
      // which marker is which.
      function currentFlagsPayload() {
        return flagMarkers.map((marker) => {
          const lngLat = marker.getLngLat();
          return { id: marker.flagId, nation: marker.flagNation, lng: lngLat.lng, lat: lngLat.lat };
        });
      }

      function pushFlagsToFirestore() {
        if (!flagsDocRef) {
          return;
        }
        flagsDocRef.set({ list: currentFlagsPayload() }).catch((error) => {
          console.error('Failed to save shared flags', error);
        });
      }

      // Builds the flag popup's HTML, including its current
      // coordinates — pulled out into its own function since the
      // popup needs regenerating (via refreshFlagPopup) whenever the
      // flag moves, not just once at creation.
      function flagPopupHtml(label, lat, lng) {
        const coordsText = lat.toFixed(11) + ', ' + lng.toFixed(11);
        return (
          '<div class="marker-popup">' +
          '<div class="marker-popup-title">' + label + ' flag</div>' +
          '<div class="marker-popup-coords">' + escapeHtml(coordsText) + '</div>' +
          '<div class="marker-popup-actions">' +
          '<button type="button" class="marker-popup-copy" data-coords="' + escapeHtml(coordsText) + '">Copy coordinates</button>' +
          '<button type="button" class="marker-popup-delete admin-only">Delete flag</button>' +
          '</div>' +
          '</div>'
        );
      }

      // Wires up the copy/delete buttons inside a flag popup. Called
      // both when the popup first opens and again after refreshFlagPopup()
      // regenerates its HTML (setHTML doesn't refire 'open', so any
      // listeners bound to the old DOM would otherwise be lost).
      function wireFlagPopupButtons(popup, marker) {
        const container = popup.getElement();
        if (!container) {
          return;
        }

        const copyBtn = container.querySelector('.marker-popup-copy');
        if (copyBtn) {
          copyBtn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(copyBtn.dataset.coords);
              copyBtn.textContent = 'Copied';
              setTimeout(() => {
                copyBtn.textContent = 'Copy coordinates';
              }, 1500);
            } catch (error) {
              copyBtn.textContent = 'Copy unavailable';
            }
          });
        }

        const deleteBtn = container.querySelector('.marker-popup-delete');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', () => {
            if (state.role !== 'admin' || state.frontlineHistoryMode) {
              return;
            }
            marker.remove();
            flagMarkers = flagMarkers.filter((m) => m !== marker);
            pushFlagsToFirestore();
          });
        }
      }

      // Regenerates a flag's popup content with its current
      // coordinates. Called after a drag (local admin move) and after
      // a remote position update (some other admin moved it), so the
      // coordinates shown never go stale.
      function refreshFlagPopup(marker) {
        const popup = marker.getPopup();
        if (!popup) {
          return;
        }
        const lngLat = marker.getLngLat();
        popup.setHTML(flagPopupHtml(marker.flagLabel, lngLat.lat, lngLat.lng));
        if (popup.isOpen()) {
          wireFlagPopupButtons(popup, marker);
        }
      }

      function placeFlag(lng, lat, flagType, flagId) {
        const nation = flagType === 'russia' ? 'russia' : 'ukraine';
        const code = nation === 'russia' ? 'ru' : 'ua';
        const label = nation === 'russia' ? 'Russia' : 'Ukraine';
        const canManage = state.role === 'admin' && !state.frontlineHistoryMode;

        const el = document.createElement('div');
        el.className = 'flag-marker';
        el.innerHTML = '<img src="https://flagcdn.com/w40/' + code + '.png" alt="' + label + ' flag" draggable="false" />';

        const marker = new maplibregl.Marker({ element: el, draggable: canManage, anchor: 'bottom-left' })
          .setLngLat([lng, lat])
          .addTo(map);

        marker.flagId = flagId || ('flag-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
        marker.flagNation = nation;
        marker.flagLabel = label;

        const popup = new maplibregl.Popup({ offset: 18, closeButton: true, closeOnClick: false })
          .setHTML(flagPopupHtml(label, lat, lng));

        popup.on('open', () => {
          wireFlagPopupButtons(popup, marker);
        });

        if (canManage) {
          marker.on('dragend', () => {
            if (state.frontlineHistoryMode) {
              return;
            }
            refreshFlagPopup(marker);
            pushFlagsToFirestore();
          });
        }

        marker.setPopup(popup);
        flagMarkers.push(marker);
        return marker;
      }

      function setFlagInteractivity(enabled) {
        flagMarkers.forEach((marker) => {
          if (typeof marker.setDraggable === 'function') {
            marker.setDraggable(enabled && state.role === 'admin');
          }
        });
      }

      map.on('contextmenu', (event) => {
        event.preventDefault();
        if (event.originalEvent) {
          event.originalEvent.preventDefault();
        }

        if (state.territorySmoothing) {
          return;
        }

        if (state.drawingTool === 'polygon' && state.draft) {
          finishPolygonDraft();
          return;
        }

        if (isOpenLineTool(state.drawingTool) && state.draft) {
          finishOpenLineDraft();
          return;
        }

        showCoordinates(event.lngLat.lat, event.lngLat.lng, event.originalEvent);
      });
