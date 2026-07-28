const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

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

async function request(path, options = {}) {
  const body = options.body
  const isFormData = Boolean(
    body
    && typeof FormData !== 'undefined'
    && (body instanceof FormData || body[Symbol.toStringTag] === 'FormData' || typeof body.append === 'function')
  )
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
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

export function refreshConcertsCatalog({ enrich = true } = {}) {
  return request(`/api/concerts/refresh?enrich=${enrich}`, { method: 'POST' })
}
