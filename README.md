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