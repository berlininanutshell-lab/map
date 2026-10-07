# berlininanutshell-lab.github.io

## Geolocations

The Geolocations tab stores each published flag as a document in
`mapState/geolocations/locations`. Documents include the flag nation, event
date, coordinates, source, description, and server creation time. The tab is
publicly readable and updates in real time; only the administrator should be
able to create or delete records.

Configure Cloud Firestore rules to allow public reads and restrict writes to
the administrator account. Merge an equivalent rule into the project's
existing rules (and check that no broader matching rule grants public writes):

```text
match /mapState/geolocations/locations/{locationId} {
  allow read: if true;
  allow create, delete: if request.auth != null
    && request.auth.token.email == 'berlininanutshell@gmail.com'
    && request.auth.token.email_verified == true;
  allow update: if false;
}
```

The browser also hides the publishing and delete controls from non-admins;
Firestore rules are the authoritative access control.

## Contested overlay

The **Contested** layer shows a 2 km buffer around the live boundary of
Russian Control. Pending Russian advances are added and pending Ukrainian
advances are subtracted, so the overlay updates before an advance is applied.
The generated band is clipped to Ukrainian land; manually drawn Contested
polygons are stored separately and synced with the other territory layers.
Admins can draw them with **Draw → Territory polygon → Contested**; the
existing smoothing step rounds the shape before it is saved.

`data/ukraine-contested-mask.geojson` contains Ukraine's country boundary and
nearby inland-water polygons used to keep the generated and hand-drawn areas
off the sea and mapped reservoirs. It is extracted from Natural Earth's
10m Admin-0 Countries and Lakes datasets (public domain).