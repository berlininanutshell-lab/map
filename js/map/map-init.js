      if (!window.WebGLRenderingContext) {
        const e = document.getElementById('error');
        e.textContent = 'WebGL is not available in this browser.';
        e.style.display = 'block';
        throw new Error('WebGL not supported');
      }

      const map = new maplibregl.Map({
        container: 'map',
        style: mapStyles.dark.url,
        center: [30.69368488654, 49.31602324674],
        zoom: 5.3,
        minZoom: 2,
        attributionControl: true,
        // Right-click drag is used only to show coordinates (see the
        // 'contextmenu' handler below), never to tilt/rotate the map.
        pitchWithRotate: false,
        dragRotate: false,
        touchPitch: false
      });

      // Belt-and-suspenders: some builds still wire up rotate/pitch via
      // touch gestures even with the constructor options above, so
      // explicitly disable them once the map instance exists too.
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.touchPitch.disable();
