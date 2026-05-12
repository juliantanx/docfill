'use client'
import { useEffect, useRef, useState } from 'react'
import { getEditorToken } from '@/lib/api'

interface Props {
  docId: string
}

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (id: string, config: object) => object }
  }
}

export default function OnlyOfficeEditor({ docId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let editorInstance: object | null = null

    const ONLYOFFICE_URL = process.env.NEXT_PUBLIC_ONLYOFFICE_URL ?? 'http://localhost:8080'

    async function init() {
      try {
        const tokenData = await getEditorToken(docId) as { config: object }

        const script = document.createElement('script')
        script.src = `${ONLYOFFICE_URL}/web-apps/apps/api/documents/api.js`
        script.onload = () => {
          if (!window.DocsAPI || !containerRef.current) return
          editorInstance = new window.DocsAPI.DocEditor('onlyoffice-editor', {
            ...tokenData.config,
            events: {
              onDocumentReady: () => setLoading(false),
              onError: (e: unknown) => setError(String(e)),
            },
          })
        }
        script.onerror = () => {
          setError('OnlyOffice 服务不可用，仅显示字段面板')
          setLoading(false)
        }
        document.head.appendChild(script)
      } catch (e) {
        setError('无法获取编辑器配置')
        setLoading(false)
      }
    }

    init()
    return () => {
      if (editorInstance && typeof (editorInstance as any).destroyEditor === 'function') {
        (editorInstance as any).destroyEditor()
      }
      editorInstance = null
      const scripts = document.head.querySelectorAll('script[src*="api.js"]')
      scripts.forEach(s => s.remove())
    }
  }, [docId])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-100 text-gray-400 text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white text-gray-400 text-sm z-10">
          加载编辑器...
        </div>
      )}
      <div ref={containerRef} id="onlyoffice-editor" className="h-full w-full" />
    </div>
  )
}
