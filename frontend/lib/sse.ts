import type { AiFillEvent } from '@/types/document'

const BASE_URL = ''

export function connectAiFillStream(
  docId: string,
  onEvent: (event: AiFillEvent) => void,
  onDone: () => void,
  onError: (message: string) => void,
  resume = false,
): () => void {
  const controller = new AbortController()

  fetch(`${BASE_URL}/api/v1/documents/${docId}/ai-fill${resume ? '?resume=true' : ''}`, {
    method: 'POST',
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok || !res.body) {
      onError(`HTTP ${res.status}`)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''

      for (const block of blocks) {
        const lines = block.trim().split('\n')
        if (lines.length < 2) continue

        const eventType = lines[0].replace('event: ', '').trim()
        const dataLine = lines[1].replace('data: ', '').trim()

        try {
          const data = JSON.parse(dataLine)
          const event = { type: eventType, ...data } as AiFillEvent
          if (eventType === 'done') {
            onEvent(event)
            onDone()
          } else if (eventType === 'error') {
            onError(data.message)
          } else {
            onEvent(event)
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onError(err.message)
    }
  })

  return () => controller.abort()
}
