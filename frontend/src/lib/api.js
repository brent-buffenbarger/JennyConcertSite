const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''
const ADMIN_TOKEN_STORAGE_KEY = 'jenny-concert-admin-token'

function formatErrorDetail(detail) {
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        const location = Array.isArray(item.loc) ? item.loc.join(' > ') : null
        return location ? `${location}: ${item.msg}` : item.msg || JSON.stringify(item)
      }
      return String(item)
    }).join('; ')
  }
  if (detail && typeof detail === 'object') return JSON.stringify(detail)
  return detail
}

// Read / write the encoded admin credential from session storage. We keep it in memory only
// so a closed tab clears the credential; a shared machine won't leak it.
export function getAdminCredential() {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setAdminCredential(username, password) {
  const token = window.btoa(`${username}:${password}`)
  try {
    window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token)
  } catch {
    // Session storage may be blocked in private mode; the caller keeps the credential in memory.
  }
  return token
}

export function clearAdminCredential() {
  try {
    window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
  } catch {
    // Ignore storage failures; clearing is best-effort.
  }
}

function authorizationHeader() {
  const token = getAdminCredential()
  return token ? { Authorization: `Basic ${token}` } : {}
}

async function request(path, options = {}) {
  const body = options.body
  const isFormData = Boolean(
    body
    && typeof FormData !== 'undefined'
    && (body instanceof FormData || body[Symbol.toStringTag] === 'FormData' || typeof body.append === 'function')
  )
  const requiresAuth = options.requiresAuth === true
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(requiresAuth ? authorizationHeader() : {}),
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const errorPayload = await response.json()
      detail = formatErrorDetail(errorPayload.detail || errorPayload)
    } catch {
      // Ignore JSON parse failures and fall back to status text.
    }
    const error = new Error(detail)
    error.status = response.status
    throw error
  }

  return response.json()
}

export function fetchConcertsCatalog() {
  return request('/api/concerts/catalog')
}

export function fetchConcertMedia() {
  return request('/api/concerts/media')
}

export function setArtistImage(artist, imageUrl) {
  return request('/api/concerts/media/artist', {
    method: 'PUT',
    requiresAuth: true,
    body: JSON.stringify({ artist, imageUrl }),
  })
}

export function fetchConcertUploads() {
  return request('/api/concerts/uploads')
}

export async function uploadConcertMedia(artist, date, file) {
  const response = await fetch(`${API_BASE_URL}/api/concerts/uploads/raw`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-Concert-Artist': artist,
      'X-Concert-Date': date,
      'X-Concert-Filename': file.name || 'upload',
      'X-Concert-Mime-Type': file.type || 'application/octet-stream',
      ...authorizationHeader(),
    },
    body: file,
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const errorPayload = await response.json()
      detail = formatErrorDetail(errorPayload.detail || errorPayload)
    } catch {
      // Ignore JSON parse failures and fall back to status text.
    }
    const error = new Error(detail)
    error.status = response.status
    throw error
  }

  return response.json()
}

export function deleteConcertMedia(mediaId) {
  return request(`/api/concerts/uploads/${mediaId}`, { method: 'DELETE', requiresAuth: true })
}

export function refreshConcertsCatalog({ enrich = true } = {}) {
  return request(`/api/concerts/refresh?enrich=${enrich}`, { method: 'POST', requiresAuth: true })
}

export function createConcertEntry(payload) {
  return request('/api/concerts/note/entries', {
    method: 'POST',
    requiresAuth: true,
    body: JSON.stringify(payload),
  })
}

export function updateConcertEntry(payload) {
  return request('/api/concerts/note/entries', {
    method: 'PATCH',
    requiresAuth: true,
    body: JSON.stringify(payload),
  })
}

export function appendConcertLine(line) {
  return request('/api/concerts/note/append', {
    method: 'PATCH',
    requiresAuth: true,
    body: JSON.stringify({ line }),
  })
}
