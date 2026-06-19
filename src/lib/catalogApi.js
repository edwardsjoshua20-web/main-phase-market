async function readJsonIfAvailable(response) {
  if (!response?.ok) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return null;
  }

  return response.json();
}

export async function getLocalJsonIfAvailable(url) {
  try {
    return await readJsonIfAvailable(await fetch(url));
  } catch {
    return null;
  }
}

export async function postLocalJsonIfAvailable(url, payload) {
  try {
    return await readJsonIfAvailable(await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }));
  } catch {
    return null;
  }
}
