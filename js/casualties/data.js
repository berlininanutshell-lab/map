      // ---- Casualty data ----
      // EXAMPLE DATA ONLY. totalSince2022 is meant to be a war-start-to-
      // date running total (24.02.2022 onward); daily is that side's
      // reported/estimated losses for each single day shown in the chart
      // (not a running total). Swap both out for a real, sourced dataset
      // — e.g. pulled from the `sources` list below — before treating
      // any of it as factual.
      const casualtyData = {
        russia: {
          totalSince2022: 1528970,
          daily: [
            { date: '2026-09-21', casualties: 1660 },
            { date: '2026-09-22', casualties: 1230 },
            { date: '2026-09-23', casualties: 1560 },
            { date: '2026-09-24', casualties: 1540 },
            { date: '2026-09-25', casualties: 1590 },
            { date: '2026-09-26', casualties: 1710 },
            { date: '2026-09-27', casualties: 1690 }
          ]
        },
        ukraine: {
          totalSince2022: 1856280,
          daily: [
            { date: '2026-09-21', casualties: 1440 },
            { date: '2026-09-22', casualties: 1315 },
            { date: '2026-09-23', casualties: 1380 },
            { date: '2026-09-24', casualties: 1290 },
            { date: '2026-09-25', casualties: 1275 },
            { date: '2026-09-26', casualties: 1350 },
            { date: '2026-09-27', casualties: 1515 }
          ]
        },
        // Add real citations here — label + url — and they'll render as
        // links at the bottom of the Casualties tab.
        sources: [
          { label: 'Time MSK / Время МСК', url: 'https://mskvremya.ru/article/2023/1520-poteri-ukrainy-za-vremya-spetsoperatsii' },
          { label: 'General Staff of Armed Forces of Ukraine', url: 'https://t.me/GeneralStaffZSU' }
        ]
      };

      function formatShortDate(isoDate) {
        const d = new Date(isoDate + 'T00:00:00');
        if (Number.isNaN(d.getTime())) {
          return isoDate;
        }
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }

      function formatFullDate(isoDate) {
        const d = new Date(isoDate + 'T00:00:00');
        if (Number.isNaN(d.getTime())) {
          return isoDate;
        }
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }

      function buildCasualtyChartSVG(data, color, textColor) {
        textColor = textColor || color;
        const width = 264;
        const height = 150;
        const padLeft = 38;
        const padRight = 10;
        const padTop = 12;
        const padBottom = 22;
        const plotW = width - padLeft - padRight;
        const plotH = height - padTop - padBottom;

        if (!data || data.length === 0) {
          return '<svg viewBox="0 0 ' + width + ' ' + height + '" class="casualty-chart" role="img" aria-label="No data">' +
            '<text x="' + (width / 2) + '" y="' + (height / 2) + '" text-anchor="middle" fill="#6d7d8c" font-size="11">No data</text></svg>';
        }

        const maxVal = Math.max.apply(null, data.map((d) => d.casualties).concat([1]));
        const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
        const points = data.map((d, i) => {
          const x = padLeft + i * stepX;
          const y = padTop + plotH - (d.casualties / maxVal) * plotH;
          return [x, y];
        });

        const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
        const baseY = (padTop + plotH).toFixed(1);
        const areaPath = linePath +
          ' L' + points[points.length - 1][0].toFixed(1) + ' ' + baseY +
          ' L' + points[0][0].toFixed(1) + ' ' + baseY + ' Z';

        let gridlines = '';
        for (let i = 0; i <= 2; i++) {
          const y = (padTop + (plotH / 2) * i).toFixed(1);
          gridlines += '<line x1="' + padLeft + '" y1="' + y + '" x2="' + (width - padRight) + '" y2="' + y + '" stroke="rgba(255,255,255,0.08)" stroke-width="1" />';
        }

        const yLabels = [maxVal, Math.round(maxVal / 2), 0].map((v, i) => {
          const y = (padTop + (plotH / 2) * i + 3).toFixed(1);
          return '<text x="' + (padLeft - 6) + '" y="' + y + '" text-anchor="end" fill="#6d7d8c" font-size="9">' + v + '</text>';
        }).join('');

        const tickIdxs = data.length > 1
          ? [0, Math.floor((data.length - 1) / 2), data.length - 1]
          : [0];
        const seenX = new Set();
        const xLabels = tickIdxs.filter((idx) => {
          if (seenX.has(idx)) return false;
          seenX.add(idx);
          return true;
        }).map((idx) => {
          const p = points[idx];
          return '<text x="' + p[0].toFixed(1) + '" y="' + (height - 5) + '" text-anchor="middle" fill="#6d7d8c" font-size="9">' + escapeHtml(formatShortDate(data[idx].date)) + '</text>';
        }).join('');

        const dots = points.map((p, i) => {
          const d = data[i];
          return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.6" fill="' + color +
            '" stroke="#0b0f14" stroke-width="1" tabindex="0" role="button" ' +
            'data-date="' + escapeHtml(d.date) + '" data-casualties="' + d.casualties + '" data-color="' + escapeHtml(textColor) + '">' +
            '<title>' + escapeHtml(formatShortDate(d.date)) + ': ' + d.casualties + '</title></circle>';
        }).join('');

        return (
          '<svg viewBox="0 0 ' + width + ' ' + height + '" class="casualty-chart" role="img" aria-label="Daily casualties chart">' +
          gridlines +
          '<path d="' + areaPath + '" fill="' + color + '" fill-opacity="0.14" stroke="none" />' +
          '<path d="' + linePath + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />' +
          dots +
          yLabels +
          xLabels +
          '</svg>'
        );
      }

      // Unlike a lot of the rest of this page, the Casualties view is
      // rebuilt every time it's shown (not just once) — it now needs to
      // reflect whatever an admin last edited, and, when Firestore is
      // set up, whatever any admin's edit synced in live while the tab
      // is open (see the casualtyDataDocRef onSnapshot listener below).
      function renderCasualtiesView() {
        document.getElementById('russiaTotalSince').innerHTML =
          'Total since 24.02.2022<strong>' + casualtyData.russia.totalSince2022.toLocaleString() + '</strong>';
        document.getElementById('ukraineTotalSince').innerHTML =
          'Total since 24.02.2022<strong>' + casualtyData.ukraine.totalSince2022.toLocaleString() + '</strong>';

        const russiaChartTotal = casualtyData.russia.daily.reduce((sum, d) => sum + d.casualties, 0);
        const ukraineChartTotal = casualtyData.ukraine.daily.reduce((sum, d) => sum + d.casualties, 0);

        document.getElementById('russiaCasualtyTotal').innerHTML =
          'Shown in chart: <strong>' + russiaChartTotal.toLocaleString() + '</strong>';
        document.getElementById('ukraineCasualtyTotal').innerHTML =
          'Shown in chart: <strong>' + ukraineChartTotal.toLocaleString() + '</strong>';

        document.getElementById('russiaCasualtyChart').innerHTML = buildCasualtyChartSVG(casualtyData.russia.daily, '#FF9400');
        document.getElementById('ukraineCasualtyChart').innerHTML = buildCasualtyChartSVG(casualtyData.ukraine.daily, '#0000ff', '#5b9dff');

        wireCasualtyChartDots(document.getElementById('russiaCasualtyChart'));
        wireCasualtyChartDots(document.getElementById('ukraineCasualtyChart'));

        // Built and wired for every visitor (cheap — it's just a form),
        // but only ever visible to admins: these containers already
        // carry the .admin-only class, hidden via CSS for everyone else
        // (see "body:not(.is-admin) .admin-only" near the top of the
        // stylesheet).
        const russiaAdminEl = document.getElementById('russiaCasualtyAdmin');
        russiaAdminEl.innerHTML = buildCasualtyAdminHTML('russia');
        wireCasualtyAdmin(russiaAdminEl, 'russia');

        const ukraineAdminEl = document.getElementById('ukraineCasualtyAdmin');
        ukraineAdminEl.innerHTML = buildCasualtyAdminHTML('ukraine');
        wireCasualtyAdmin(ukraineAdminEl, 'ukraine');

        const sourcesContainer = document.getElementById('casualtySources');
        const titleHtml = '<div class="casualty-sources-title">Sources</div>';
        const linksHtml = (casualtyData.sources || []).map((source) =>
          '<a class="casualty-source-item" href="' + escapeHtml(source.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(source.label) + '</a>'
        ).join('');
        sourcesContainer.innerHTML = titleHtml + (linksHtml || '<div class="casualty-source-item" style="color:#6d7d8c;">No sources listed yet.</div>');
      }
