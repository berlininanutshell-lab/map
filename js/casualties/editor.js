      // ---- Casualty data editor (admin only) ----
      // Lets an admin change a side's running total, edit or delete an
      // existing daily dot, or add a brand new one. Every change is
      // pushed to Firestore (when configured) so it's visible to every
      // visitor, not just this admin's own browser — same pattern as
      // the shared layer colors above.
      function saveCasualtyDataRemote() {
        if (!casualtyDataDocRef) {
          return;
        }
        casualtyDataDocRef
          .set({
            russia: { totalSince2022: casualtyData.russia.totalSince2022, daily: casualtyData.russia.daily },
            ukraine: { totalSince2022: casualtyData.ukraine.totalSince2022, daily: casualtyData.ukraine.daily }
          }, { merge: true })
          .catch((error) => {
            console.error('Failed to save shared casualty data', error);
          });
      }

      function buildCasualtyAdminHTML(sideKey) {
        const side = casualtyData[sideKey];

        const entriesHtml = side.daily.map((entry, index) => (
          '<div class="casualty-admin-entry" data-index="' + index + '">' +
          '<span class="entry-date">' + escapeHtml(formatShortDate(entry.date)) + '</span>' +
          '<input type="number" class="entry-casualties-input" min="0" step="1" value="' + entry.casualties + '" aria-label="Casualties on ' + escapeHtml(entry.date) + '" />' +
          '<button type="button" class="casualty-admin-btn entry-save-btn">Save</button>' +
          '<button type="button" class="casualty-admin-btn danger entry-delete-btn">Delete</button>' +
          '</div>'
        )).join('');

        return (
          '<div class="casualty-admin-title">Admin: edit ' + (sideKey === 'russia' ? 'Russian' : 'Ukrainian') + ' data</div>' +
          '<div class="casualty-admin-total-row">' +
          '<label for="' + sideKey + 'TotalInput">Total since 24.02.2022</label>' +
          '<input id="' + sideKey + 'TotalInput" type="number" class="total-input" min="0" step="1" value="' + side.totalSince2022 + '" />' +
          '<button type="button" class="casualty-admin-btn total-save-btn">Save</button>' +
          '</div>' +
          '<div class="casualty-admin-entries">' +
          (entriesHtml || '<div class="casualty-admin-empty">No daily dots yet — add one below.</div>') +
          '</div>' +
          '<div class="casualty-admin-add-row">' +
          '<input type="date" class="new-date-input" aria-label="New dot date" />' +
          '<input type="number" class="new-casualties-input" min="0" step="1" placeholder="Casualties" aria-label="New dot casualties" />' +
          '<button type="button" class="casualty-admin-btn add-entry-btn">Add dot</button>' +
          '</div>'
        );
      }

      function wireCasualtyAdmin(container, sideKey) {
        const totalInput = container.querySelector('.total-input');
        const totalSaveBtn = container.querySelector('.total-save-btn');
        if (totalSaveBtn) {
          totalSaveBtn.addEventListener('click', () => {
            const value = Math.round(Number(totalInput.value));
            if (!Number.isFinite(value) || value < 0) {
              return;
            }
            casualtyData[sideKey].totalSince2022 = value;
            saveCasualtyDataRemote();
            renderCasualtiesView();
          });
        }

        container.querySelectorAll('.casualty-admin-entry').forEach((row) => {
          const index = Number(row.dataset.index);
          const input = row.querySelector('.entry-casualties-input');
          const saveBtn = row.querySelector('.entry-save-btn');
          const deleteBtn = row.querySelector('.entry-delete-btn');

          if (saveBtn) {
            saveBtn.addEventListener('click', () => {
              const value = Math.round(Number(input.value));
              if (!Number.isFinite(value) || value < 0) {
                return;
              }
              casualtyData[sideKey].daily[index].casualties = value;
              saveCasualtyDataRemote();
              renderCasualtiesView();
            });
          }

          if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
              casualtyData[sideKey].daily.splice(index, 1);
              saveCasualtyDataRemote();
              renderCasualtiesView();
            });
          }
        });

        const newDateInput = container.querySelector('.new-date-input');
        const newCasualtiesInput = container.querySelector('.new-casualties-input');
        const addBtn = container.querySelector('.add-entry-btn');
        if (addBtn) {
          addBtn.addEventListener('click', () => {
            const date = newDateInput.value;
            const value = Math.round(Number(newCasualtiesInput.value));
            if (!date || !Number.isFinite(value) || value < 0) {
              return;
            }

            // Adding a dot for a date that already has one just updates
            // it in place, rather than creating a confusing duplicate.
            const existingIndex = casualtyData[sideKey].daily.findIndex((entry) => entry.date === date);
            if (existingIndex >= 0) {
              casualtyData[sideKey].daily[existingIndex].casualties = value;
            } else {
              casualtyData[sideKey].daily.push({ date, casualties: value });
            }
            casualtyData[sideKey].daily.sort((a, b) => a.date.localeCompare(b.date));

            saveCasualtyDataRemote();
            renderCasualtiesView();
          });
        }
      }

      // Keeps every visitor's casualty totals/dots in sync with
      // whatever an admin last saved, in real time — including on first
      // page load, so a fresh guest sees the admin's data, not the
      // hardcoded defaults in casualtyData above. sources stays local
      // (not synced) since it isn't editable from this panel.
      if (casualtyDataDocRef) {
        casualtyDataDocRef.onSnapshot((doc) => {
          if (!doc.exists) {
            return;
          }
          const remote = doc.data() || {};
          let changed = false;

          ['russia', 'ukraine'].forEach((sideKey) => {
            const remoteSide = remote[sideKey];
            if (!remoteSide) {
              return;
            }
            if (typeof remoteSide.totalSince2022 === 'number') {
              casualtyData[sideKey].totalSince2022 = remoteSide.totalSince2022;
              changed = true;
            }
            if (Array.isArray(remoteSide.daily)) {
              casualtyData[sideKey].daily = remoteSide.daily
                .filter((entry) => entry && typeof entry.date === 'string' && typeof entry.casualties === 'number')
                .sort((a, b) => a.date.localeCompare(b.date));
              changed = true;
            }
          });

          if (changed && sidebarTab === 'casualties') {
            renderCasualtiesView();
          }
        }, (error) => {
          console.error('Failed to sync shared casualty data', error);
        });
      }
