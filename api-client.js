export async function apiRequest(url, options = {}, fetchImpl = fetch) {
  const { headers: extraHeaders = {}, ...requestOptions } = options;
  const response = await fetchImpl(url, {
    credentials: 'same-origin',
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed (${response.status})`);
  }
  return data;
}
