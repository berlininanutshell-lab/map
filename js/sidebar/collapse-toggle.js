      const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
      const sidebarToggleIcon = sidebarToggleBtn.querySelector('span');

      sidebarToggleBtn.addEventListener('click', () => {
        const collapsed = document.body.classList.toggle('sidebar-collapsed');
        sidebarToggleBtn.setAttribute('aria-expanded', String(!collapsed));
        sidebarToggleBtn.setAttribute('aria-label', collapsed ? 'Show sidebar' : 'Hide sidebar');
        sidebarToggleIcon.textContent = collapsed ? '›' : '‹';
      });

      const mapOnlyToggleBtn = document.getElementById('mapOnlyToggleBtn');

      mapOnlyToggleBtn.addEventListener('click', () => {
        const mapOnly = document.body.classList.toggle('map-only-mode');
        const label = mapOnly ? 'Show interface' : 'Hide interface';
        mapOnlyToggleBtn.setAttribute('aria-pressed', String(mapOnly));
        mapOnlyToggleBtn.setAttribute('aria-label', label);
        mapOnlyToggleBtn.title = label;
        mapOnlyToggleBtn.textContent = label;
      });
