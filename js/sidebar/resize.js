      // ---- Resizable sidebar ----
      const sidebar = document.getElementById('sidebar');
      const sidebarResizeHandle = document.getElementById('sidebarResizeHandle');
      const SIDEBAR_MIN_WIDTH = 260;
      const SIDEBAR_MAX_WIDTH = 620;
      const SIDEBAR_MAX_VIEWPORT_RATIO = 0.65;
      const SIDEBAR_STORAGE_KEY = 'mapSidebarWidth';

      function sidebarWidthBounds() {
        const maxByViewport = Math.floor(window.innerWidth * SIDEBAR_MAX_VIEWPORT_RATIO);
        const max = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, maxByViewport));
        return { min: Math.min(SIDEBAR_MIN_WIDTH, max), max };
      }

      function clampSidebarWidth(width) {
        const { min, max } = sidebarWidthBounds();
        return Math.round(Math.max(min, Math.min(max, width)));
      }

      function setSidebarWidth(width, save = true) {
        const nextWidth = clampSidebarWidth(Number(width));
        document.documentElement.style.setProperty('--sidebar-width', `${nextWidth}px`);
        if (save) {
          try {
            localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextWidth));
          } catch (error) {
            // Storage may be unavailable; resizing still works normally.
          }
        }
      }

      try {
        const savedWidth = Number(localStorage.getItem(SIDEBAR_STORAGE_KEY));
        if (Number.isFinite(savedWidth) && savedWidth > 0) {
          setSidebarWidth(savedWidth, false);
        } else {
          setSidebarWidth(320, false);
        }
      } catch (error) {
        setSidebarWidth(320, false);
      }

      let resizingSidebar = false;
      let resizePointerId = null;

      function stopSidebarResize() {
        if (!resizingSidebar) return;
        resizingSidebar = false;
        resizePointerId = null;
        document.body.classList.remove('sidebar-resizing');
      }

      sidebarResizeHandle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || document.body.classList.contains('sidebar-collapsed')) return;
        resizingSidebar = true;
        resizePointerId = event.pointerId;
        document.body.classList.add('sidebar-resizing');
        sidebarResizeHandle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });

      sidebarResizeHandle.addEventListener('pointermove', (event) => {
        if (!resizingSidebar || event.pointerId !== resizePointerId) return;
        setSidebarWidth(event.clientX);
      });

      sidebarResizeHandle.addEventListener('pointerup', (event) => {
        if (event.pointerId === resizePointerId) stopSidebarResize();
      });
      sidebarResizeHandle.addEventListener('pointercancel', stopSidebarResize);
      sidebarResizeHandle.addEventListener('lostpointercapture', stopSidebarResize);

      sidebarResizeHandle.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        const current = sidebar.getBoundingClientRect().width;
        const step = event.shiftKey ? 50 : 10;
        setSidebarWidth(current + (event.key === 'ArrowRight' ? step : -step));
        event.preventDefault();
      });

      window.addEventListener('resize', () => {
        setSidebarWidth(sidebar.getBoundingClientRect().width, false);
      });
