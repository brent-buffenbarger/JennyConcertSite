## Publish Concerts Shortcut

This is the exact request shape for the Shortcut that will publish the latest
Apple Notes content to a hosted backend.

### Request

**Method:** `POST`

**URL:**

```text
https://api.<your-domain>/api/concerts/publish-notes
```

**Headers:**

```http
X-Publish-Token: <same value as PUBLISH_NOTES_TOKEN on the backend>
Content-Type: application/json
```

**JSON body:**

```json
{
  "bodyText": "Concerts\n\nWant to see\n\nGlass Animals",
  "title": "Concerts",
  "noteId": "optional-stable-device-note-id",
  "account": "iCloud",
  "folder": "Notes",
  "modifiedAt": "2026-07-29T04:12:00Z",
  "sourceDevice": "Jenny's iPhone"
}
```

Only `bodyText` is required. The rest is optional but useful.

### What the backend does

1. Writes a server-side `data/notes/concerts.json`
2. Rebuilds `data/notes/concerts.catalog.json`
3. Runs the normal post-processing path:
   - artist media resolution
   - venue geocoding
4. Returns the refreshed catalog

### Suggested Shortcut steps

1. **Find Notes** → locate the `Concerts` note
2. **Get Details of Note** → grab the note body text
3. **Dictionary** → build the JSON payload
4. **Get Contents of URL** → POST to the endpoint above
5. **Show Result** → display success/failure

### Notes link

Put this at the top of the note as a tappable link:

```text
shortcuts://run-shortcut?name=Publish%20Concerts
```

Label it `Publish Concerts`.
