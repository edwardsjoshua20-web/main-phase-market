update storage.buckets
set allowed_mime_types = array['application/gzip', 'application/vnd.sqlite3', 'application/octet-stream']
where id = 'main-phase-market-automation';
