import type { DocumentInfo, EditorTokenResponse } from '@/types/document'

const BASE_URL = ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function uploadDocument(file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE_URL}/api/v1/documents/upload`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function uploadReference(docId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE_URL}/api/v1/documents/${docId}/references`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export const getDocument = (docId: string) =>
  request<DocumentInfo>(`/api/v1/documents/${docId}`)

export const getEditorToken = (docId: string) =>
  request<EditorTokenResponse>(`/api/v1/documents/${docId}/editor-token`)

export const updateField = (docId: string, fieldId: string, value: string) =>
  request<unknown>(`/api/v1/documents/${docId}/fields/${fieldId}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  })

export const confirmFields = (docId: string) =>
  request<{ download_url: string }>(`/api/v1/documents/${docId}/confirm`, { method: 'POST' })

export const cancelAiFill = (docId: string) =>
  request<unknown>(`/api/v1/documents/${docId}/ai-fill-cancel`, { method: 'POST' })

export const fillPreview = (docId: string) =>
  request<{ success: boolean }>(`/api/v1/documents/${docId}/fill-preview`, { method: 'POST' })

export const getDownloadUrl = (docId: string) =>
  `${BASE_URL}/api/v1/documents/${docId}/download`
