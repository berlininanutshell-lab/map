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

The **Contested** layer shows the live boundary line of Russian Control and a
4 km buffer built directly from that line. Pending Russian advances and
pending Ukrainian advances are included on their respective sides before
application. The automatic line follows the Russian Control boundary from
51.87851293361, 34.31462230371 to
47.55134608883, 35.33076423005. Its endpoints snap to the nearest point on
the current Russian Control boundary; the line and buffer update when control
changes. A separate 300 m-wide band is shown just inside each closed Cities
Outline polygon, formed by subtracting the polygon inset 300 m from its
boundary. This city buffer does not change Contested. The generated buffer
is not clipped, so it can extend outside Ukraine and across water.
Manually drawn Contested polygons are stored separately and synced with the
other territory layers. Admins can draw them with
**Draw → Territory polygon → Contested**; the existing smoothing step rounds
the shape before it is saved.
