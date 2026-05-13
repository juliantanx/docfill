'use client'
import { memo, useEffect, useId, useRef, useState } from 'react'
import { getEditorToken } from '@/lib/api'
import type { EditorTokenResponse } from '@/types/document'

interface Props {
  docId: string
  onReady?: (api: { refresh: () => void }) => void
}

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (id: string, config: object) => object }
  }
}

let onlyOfficeScriptPromise: Promise<void> | null = null

function loadOnlyOfficeScript(src: string): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OnlyOffice 仅支持浏览器环境'))
  }

  if (window.DocsAPI) {
    return Promise.resolve()
  }

  if (!onlyOfficeScriptPromise) {
    onlyOfficeScriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', () => reject(new Error('OnlyOffice 脚本加载失败')), { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('OnlyOffice 脚本加载失败'))
      document.head.appendChild(script)
    }).catch((error) => {
      onlyOfficeScriptPromise = null
      throw error
    })
  }

  return onlyOfficeScriptPromise
}

function OnlyOfficeEditor({ docId, onReady }: Props) {
  const editorHostId = useId().replace(/:/g, '-')
  const containerRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef<HTMLDivElement>(null)
  const mountNodeRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const unmountedRef = useRef(false)
  const initFnRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    unmountedRef.current = false
    setError(null)
    // Show loading overlay imperatively
    if (loadingRef.current) loadingRef.current.style.display = ''
    const container = containerRef.current

    const ONLYOFFICE_URL = process.env.NEXT_PUBLIC_ONLYOFFICE_URL ?? 'http://localhost:8080'

    function hideLoading() {
      if (loadingRef.current) loadingRef.current.style.display = 'none'
    }

    async function init() {
      try {
        const tokenData: EditorTokenResponse = await getEditorToken(docId)
        if (unmountedRef.current) return

        await loadOnlyOfficeScript(`${ONLYOFFICE_URL}/web-apps/apps/api/documents/api.js`)
        if (unmountedRef.current || !window.DocsAPI || !container) return

        // Remove only our own mount node, not all children
        if (mountNodeRef.current) {
          try { container.removeChild(mountNodeRef.current) } catch { /* already removed */ }
          mountNodeRef.current = null
        }

        const mountNode = document.createElement('div')
        mountNode.id = `onlyoffice-editor-${editorHostId}`
        mountNode.className = 'h-full w-full'
        container.appendChild(mountNode)
        mountNodeRef.current = mountNode

        try {
          editorRef.current = new window.DocsAPI.DocEditor(mountNode.id, {
            ...tokenData.config,
            events: {
              onDocumentReady: () => {
                if (!unmountedRef.current) hideLoading()
              },
              onError: () => {
                if (!unmountedRef.current) {
                  setError('OnlyOffice 编辑器加载失败，仅显示字段面板')
                  hideLoading()
                }
              },
            },
          }) as unknown as { destroyEditor?: () => void }
        } catch {
          if (!unmountedRef.current) {
            setError('编辑器初始化失败')
            hideLoading()
          }
        }
      } catch {
        if (!unmountedRef.current) {
          setError('OnlyOffice 服务不可用，仅显示字段面板')
          hideLoading()
        }
      }
    }

    initFnRef.current = init
    init()

    return () => {
      unmountedRef.current = true
      if (editorRef.current?.destroyEditor) {
        try { editorRef.current.destroyEditor() } catch { /* ignore */ }
      }
      editorRef.current = null
      // Only remove our own mount node, avoid replaceChildren which removes React-managed nodes
      if (container && mountNodeRef.current) {
        try { container.removeChild(mountNodeRef.current) } catch { /* already removed */ }
        mountNodeRef.current = null
      }
    }
  }, [docId, editorHostId])

  // Expose refresh API to parent
  useEffect(() => {
    onReady?.({
      refresh: () => {
        if (editorRef.current?.destroyEditor) {
          try { editorRef.current.destroyEditor() } catch { /* ignore */ }
        }
        editorRef.current = null
        const container = containerRef.current
        if (container && mountNodeRef.current) {
          try { container.removeChild(mountNodeRef.current) } catch { /* already removed */ }
          mountNodeRef.current = null
        }
        if (loadingRef.current) loadingRef.current.style.display = ''
        initFnRef.current?.()
      },
    })
  }, [onReady])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-100 text-gray-400 text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      {/* Loading overlay managed imperatively — never added/removed by React reconciliation */}
      <div
        ref={loadingRef}
        className="absolute inset-0 flex items-center justify-center bg-white text-gray-400 text-sm z-10"
      >
        加载编辑器...
      </div>
      {/* Container for OnlyOffice — React never touches its children */}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}

export default memo(OnlyOfficeEditor)
