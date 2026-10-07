      // ---- Casualty chart dot tooltip: click a dot to see that day's figure ----
      const casualtyTooltip = document.getElementById('casualtyTooltip');
      let activeCasualtyDot = null;

      function hideCasualtyTooltip() {
        casualtyTooltip.classList.remove('visible');
        if (activeCasualtyDot) {
          activeCasualtyDot.classList.remove('active');
          activeCasualtyDot = null;
        }
      }

      function showCasualtyTooltip(dotEl) {
        const date = dotEl.getAttribute('data-date');
        const casualties = Number(dotEl.getAttribute('data-casualties'));
        const color = dotEl.getAttribute('data-color') || '#edf5ff';

        casualtyTooltip.innerHTML =
          '<div class="casualty-tooltip-date">' + escapeHtml(formatFullDate(date)) + '</div>' +
          '<span class="casualty-tooltip-value" style="color:' + escapeHtml(color) + '">' + casualties.toLocaleString() + '</span>' +
          '<span class="casualty-tooltip-label">reported that day</span>';

        // Position near the clicked dot, keeping the box on-screen.
        const rect = dotEl.getBoundingClientRect();
        casualtyTooltip.classList.add('visible');
        const tooltipRect = casualtyTooltip.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        let top = rect.top - tooltipRect.height - 10;
        if (top < 8) {
          top = rect.bottom + 10;
        }
        left = Math.min(Math.max(8, left), window.innerWidth - tooltipRect.width - 8);
        casualtyTooltip.style.left = left + 'px';
        casualtyTooltip.style.top = top + 'px';

        if (activeCasualtyDot && activeCasualtyDot !== dotEl) {
          activeCasualtyDot.classList.remove('active');
        }
        dotEl.classList.add('active');
        activeCasualtyDot = dotEl;
      }

      function wireCasualtyChartDots(container) {
        container.querySelectorAll('.casualty-chart circle').forEach((circle) => {
          circle.addEventListener('click', (event) => {
            event.stopPropagation();
            showCasualtyTooltip(circle);
          });
          circle.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              showCasualtyTooltip(circle);
            }
          });
        });
      }

      casualtyTooltip.addEventListener('click', (event) => event.stopPropagation());
      document.addEventListener('click', hideCasualtyTooltip);
      window.addEventListener('resize', hideCasualtyTooltip);

      const mapStyles = {
        dark: {
          name: 'Dark Matter',
          url: 'https://api.maptiler.com/maps/dataviz-v4-dark/style.json?key=okpdMcXQXKD9GKjumNOC'
        },
        streets: {
          name: 'Streets',
          url: 'https://api.maptiler.com/maps/streets-v2/style.json?key=okpdMcXQXKD9GKjumNOC'
        },
        hybrid: {
          name: 'Satellite Hybrid',
          url: 'https://api.maptiler.com/maps/hybrid/style.json?key=okpdMcXQXKD9GKjumNOC'
        },
        terrain: {
          name: 'Mapzen Terrain',
          style: {
            version: 8,
            sources: {},
            layers: [{
              id: 'terrain-background',
              type: 'background',
                paint: { 'background-color': '#0b0f14' }
            }]
          }
        }
      };

      const state = {
        layers: [
          { id: 'main', name: 'Russian Control', visible: true, color: '#ff0000', renderMode: 'fill', thickness: 3 },
          { id: 'ukrainian-control', name: 'Ukrainian Control', visible: true, color: '#00008b', renderMode: 'fill', thickness: 3 },
          { id: 'contested', name: 'Contested', visible: true, color: '#f2c14e', renderMode: 'fill', thickness: 2 },
          { id: 'russian-advances', name: 'Russian advances', visible: true, color: '#FF9400', renderMode: 'fill', thickness: 3 },
          { id: 'ukrainian-advances', name: 'Ukrainian advances', visible: true, color: '#0000ff', renderMode: 'fill', thickness: 3 },
          { id: 'cities-outline', name: 'Cities Outline', visible: true, color: '#ffffff', renderMode: 'outline', thickness: 2 }
        ],
        currentStyle: 'Dark Matter',
        currentStyleValue: 'dark',
        drawingColor: '#FF9400',
        drawingThickness: 3,
        drawingTool: null,
        drawings: [],
        draft: null,
        isBrushing: false,
        role: 'guest',
        flagType: 'ukraine',
        nickname: '',
        // Which layer a drawn Territory polygon will be applied to —
        // see the "Territory polygon" tool below.
        territoryLayerId: 'russian-advances',
        // Non-null while a territory shape's points are being
        // dragged/added/removed via "Edit shape" — see
        // enterVertexEditMode / finishVertexEditMode below.
        territoryEdit: null,
        // Non-null while a newly drawn territory polygon is waiting for
        // the smoothing amount to be chosen before it becomes an advance.
        territorySmoothing: null,
        frontlineHistoryMode: false,
        frontlineHistoryDate: null,
        frontlineLiveBackup: null
      };

      // Flags are plain maplibregl.Markers (not GeoJSON features like the
      // other drawings) so admins can drag them around freely. Kept in
      // their own array purely so "Clear all drawings" doesn't have to
      // guess which markers on the map are flags.
      let flagMarkers = [];

      const layersList = document.getElementById('layersList');
      const drawToolsBtn = document.getElementById('drawToolsBtn');
      const toolMenu = document.getElementById('toolMenu');
      const drawColor = document.getElementById('drawColor');
      const drawThickness = document.getElementById('drawThickness');
      const drawThicknessValue = document.getElementById('drawThicknessValue');
      const drawHint = document.getElementById('drawHint');
      const clearDrawingsBtn = document.getElementById('clearDrawingsBtn');
      const mapSummary = document.getElementById('mapSummary');
      const mapStyleSelect = document.getElementById('mapStyleSelect');
      const lineToolBtn = document.querySelector('.tool-option[data-tool="line"]');
      const lineVariantMenu = document.getElementById('lineVariantMenu');
      const polygonToolBtn = document.querySelector('.tool-option[data-tool="polygon"]');
      const territoryLayerPicker = document.getElementById('territoryLayerPicker');

      // Territory shapes are persisted/synced; the derived Contested band is
      // rendered from current territory plus manually stored Contested polygons.
      const territoryLayerIds = ['main', 'ukrainian-control', 'russian-advances', 'ukrainian-advances', 'contested'];
      const territoryAdvanceLayerIds = ['russian-advances', 'ukrainian-advances'];
      const territoryDrawLayerIds = territoryAdvanceLayerIds.concat(['contested']);
      // All polygon/KML layers that are shared through the same compact
      // Firestore document. Territory logic remains restricted to the
      // ids above; extra managed layers such as Cities Outline are visual-only.
      const sharedLayerIds = territoryLayerIds.concat(['cities-outline']);

      // Set of territory layer ids for which we've already received an
      // authoritative update from Firestore (territoriesDocRef) at
      // least once this page load. Used by loadKmlManifestAndData below
      // to avoid clobbering live, admin-synced territory data with the
      // static KML baseline — see the comment there for why this
      // exists.
      const territoryLoadedFromFirestore = new Set();
      // True after a save of the shared territories failed (permissions,
      // document too large, offline...). While set, incoming server data
      // is not allowed to wipe the shapes the admin just drew locally.
      let territorySyncBlocked = false;
      let territoryPushesInFlight = 0;
      let territoryPushChain = Promise.resolve();
      let territorySnapshotSeq = 0;
