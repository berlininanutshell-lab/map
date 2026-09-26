# KML folder

Put this `kml/` folder next to `index.html` on your web host. Each
sub-folder holds the KML files for one map layer:

- `kml/main/`                -> tied to the "Main Layer" toggle
- `kml/russian-advances/`    -> tied to the "Russian advances" toggle
- `kml/ukrainian-advances/`  -> tied to the "Ukrainian advances" toggle

## Adding a KML file

1. Drop the `.kml` file into the matching sub-folder above.
2. Open `manifest.json` and add the file's name to that layer's list, e.g.:

```json
{
  "main": ["occupation.kml"],
  "russian-advances": ["push-2026-09.kml"],
  "ukrainian-advances": []
}
```

3. Re-upload (or just re-save) `manifest.json` and the KML file to your
   host. Reload the page — the shapes appear on the map automatically,
   colored to match that layer, and turning the layer Off/On in the
   sidebar hides/shows them along with everything else in that layer.

## Adding a brand-new layer

The three layers above are the ones already defined in `index.html`'s
`state.layers` array. To add a new layer (say, "Supply routes"):

1. In `index.html`, add an entry to `state.layers`, e.g.
   `{ id: 'supply-routes', name: 'Supply routes', visible: true, color: '#33cc99' }`.
2. Create `kml/supply-routes/` and add its files there.
3. Add `"supply-routes": ["your-file.kml"]` to `manifest.json`.

## Notes

- Supports KML `Point`, `LineString`, and `Polygon` geometry (including
  ones nested inside `MultiGeometry`).
- This only works once the page is actually hosted somewhere with the
  `kml/` folder alongside it — a fetch for local files doesn't work when
  the map is just previewed as a standalone page.
