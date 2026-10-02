      const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
      const sidebarToggleIcon = sidebarToggleBtn.querySelector('span');

      sidebarToggleBtn.addEventListener('click', () => {
        const collapsed = document.body.classList.toggle('sidebar-collapsed');
        sidebarToggleBtn.setAttribute('aria-expanded', String(!collapsed));
        sidebarToggleBtn.setAttribute('aria-label', collapsed ? 'Show sidebar' : 'Hide sidebar');
        sidebarToggleIcon.textContent = collapsed ? '›' : '‹';
      });
