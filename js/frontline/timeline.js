      // ---- Floating timeline: play · speed · ‹ date › · calendar ----
      // Steps over the days that have a locked snapshot (oldest -> newest).
      // The last stop after the newest snapshot is the live, current frontline.
      const TIMELINE_SPEEDS = [1, 2, 4, 0.5];
      const TL_ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>';
      const TL_ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
      // var (hoisted): renderFrontlineView() can run before this point.
      var timelineState = { playing: false, busy: false, timer: null, speedIdx: 0 };

      function timelineStepMs() {
        return Math.round(1000 / TIMELINE_SPEEDS[timelineState.speedIdx]);
      }

      function timelineDates() {
        return Array.from(frontlineHistoryEntries.keys()).sort();
      }

      // Index of what is on the map now: 0..n-1 = locked days, n = live.
      function timelineIndex(dates) {
        if (!state.frontlineHistoryMode) {
          return dates.length;
        }
        const i = dates.indexOf(state.frontlineHistoryDate);
        return i < 0 ? dates.length : i;
      }

      function timelineFormatKey(key) {
        const parts = String(key).split('-');
        return parts[2] + '.' + parts[1] + '.' + parts[0];
      }

      function renderFrontlineTimeline() {
        const bar = document.getElementById('frontlineTimeline');
        if (!bar) {
          return;
        }
        const dates = timelineDates();
        const has = dates.length > 0;
        bar.hidden = !has;
        document.body.classList.toggle('has-timeline', has);
        if (!has) {
          return;
        }
        const index = timelineIndex(dates);
        const live = index >= dates.length;
        const isPlaying = !!(timelineState && timelineState.playing);
        const todayKey = todayDateKey();

        document.getElementById('tlDate').textContent = timelineFormatKey(live ? todayKey : dates[index]);
        document.getElementById('tlPrev').disabled = index <= 0;
        document.getElementById('tlNext').disabled = live;
        const liveBtn = document.getElementById('tlLive');
        liveBtn.disabled = live;
        liveBtn.classList.toggle('is-live', live);
        liveBtn.title = live ? 'Showing the current frontline' : 'Back to the current frontline';
        const play = document.getElementById('tlPlay');
        play.innerHTML = isPlaying ? TL_ICON_PAUSE : TL_ICON_PLAY;
        play.classList.toggle('is-playing', isPlaying);
        play.title = isPlaying ? 'Pause' : 'Play animation';
        document.getElementById('tlSpeed').textContent = TIMELINE_SPEEDS[timelineState.speedIdx] + 'x';
        const pick = document.getElementById('tlDatePick');
        pick.min = dates[0];
        pick.max = todayKey;
        bar.classList.toggle('is-history', !live);
      }

      async function timelineGo(index) {
        if (timelineState.busy) {
          return;
        }
        timelineState.busy = true;
        try {
          const dates = timelineDates();
          if (index >= dates.length) {
            await returnToCurrentFrontline();
          } else if (index >= 0) {
            await showFrontlineHistory(dates[index]);
          }
        } finally {
          timelineState.busy = false;
          renderFrontlineTimeline();
        }
      }

      function stopTimelinePlay() {
        timelineState.playing = false;
        clearTimeout(timelineState.timer);
        timelineState.timer = null;
        renderFrontlineTimeline();
      }

      async function timelinePlayStep() {
        if (!timelineState.playing) {
          return;
        }
        const dates = timelineDates();
        const index = timelineIndex(dates);
        if (index >= dates.length) {
          stopTimelinePlay();
          return;
        }
        await timelineGo(index + 1);
        if (!timelineState.playing) {
          return;
        }
        const after = timelineDates();
        const next = timelineIndex(after);
        if (next >= after.length) {
          stopTimelinePlay();
          return;
        }
        // Decode the following day while this one is on screen.
        if (next + 1 < after.length) {
          loadFrontlineSnapshot(after[next + 1]).catch(() => {});
        }
        timelineState.timer = setTimeout(timelinePlayStep, timelineStepMs());
      }

      async function startTimelinePlay() {
        const dates = timelineDates();
        if (!dates.length) {
          return;
        }
        timelineState.playing = true;
        renderFrontlineTimeline();
        // From the newest day or from live: restart from the oldest day.
        if (timelineIndex(dates) >= dates.length - 1) {
          await timelineGo(0);
          if (!timelineState.playing) {
            return;
          }
          if (dates.length > 1) {
            loadFrontlineSnapshot(dates[1]).catch(() => {});
          }
          timelineState.timer = setTimeout(timelinePlayStep, timelineStepMs());
        } else {
          timelinePlayStep();
        }
      }

      (function bindFrontlineTimeline() {
        const ids = ['tlPlay', 'tlSpeed', 'tlPrev', 'tlNext', 'tlLive', 'tlCal', 'tlDatePick'];
        const el = {};
        for (const id of ids) {
          el[id] = document.getElementById(id);
          if (!el[id]) {
            return;
          }
        }
        el.tlPrev.addEventListener('click', () => {
          stopTimelinePlay();
          timelineGo(timelineIndex(timelineDates()) - 1);
        });
        el.tlNext.addEventListener('click', () => {
          stopTimelinePlay();
          timelineGo(timelineIndex(timelineDates()) + 1);
        });
        el.tlLive.addEventListener('click', () => {
          stopTimelinePlay();
          timelineGo(timelineDates().length);
        });
        el.tlPlay.addEventListener('click', () => {
          if (timelineState.playing) {
            stopTimelinePlay();
          } else {
            startTimelinePlay();
          }
        });
        el.tlSpeed.addEventListener('click', () => {
          timelineState.speedIdx = (timelineState.speedIdx + 1) % TIMELINE_SPEEDS.length;
          renderFrontlineTimeline();
        });
        el.tlCal.addEventListener('click', () => {
          stopTimelinePlay();
          const dates = timelineDates();
          const index = timelineIndex(dates);
          el.tlDatePick.value = index >= dates.length ? todayDateKey() : dates[index];
          try {
            el.tlDatePick.showPicker();
          } catch (error) {
            el.tlDatePick.focus();
            el.tlDatePick.click();
          }
        });
        // A picked day jumps to the newest snapshot on or before it; today
        // (or later) means the live frontline.
        el.tlDatePick.addEventListener('change', () => {
          const picked = el.tlDatePick.value;
          if (!picked) {
            return;
          }
          const dates = timelineDates();
          let target;
          if (picked >= todayDateKey()) {
            target = dates.length;
          } else {
            target = 0;
            dates.forEach((key, i) => {
              if (key <= picked) {
                target = i;
              }
            });
          }
          stopTimelinePlay();
          timelineGo(target);
        });
      })();

      if (frontlineLockBtn) {
        frontlineLockBtn.addEventListener('click', lockFrontlineForToday);
      }
      if (frontlineLockDateInput) {
        frontlineLockDateInput.addEventListener('change', () => {
          frontlineLockDate = frontlineLockDateInput.value || null;
          renderFrontlineView();
        });
      }
      if (frontlineReturnCurrentBtn) {
        frontlineReturnCurrentBtn.addEventListener('click', returnToCurrentFrontline);
      }

      if (frontlineHistoryCollectionRef) {
        frontlineHistoryCollectionRef.onSnapshot((snapshot) => {
          frontlineHistoryEntries.clear();
          frontlineSnapshotCache.clear();
          snapshot.forEach((doc) => {
            const data = doc.data() || {};
            frontlineHistoryEntries.set(doc.id, { ...data, date: data.date || doc.id });
          });
          renderFrontlineView();
        }, (error) => {
          console.error('Failed to sync frontline history', error);
          if (isAdmin()) {
            setFrontlineHistoryStatus('History is unavailable. Check Firestore rules for mapState/frontlineHistory/days.');
          }
        });
      }

      // Keeps both today's date and the chronology's admin state current
      // after midnight without requiring a page reload.
      let lastFrontlineDateKey = todayDateKey();
      setInterval(() => {
        const nowKey = todayDateKey();
        if (nowKey !== lastFrontlineDateKey) {
          lastFrontlineDateKey = nowKey;
          renderFrontlineView();
          if (sidebarTab === 'advances') {
            renderAdvancesView();
          }
        }
      }, 60000);
