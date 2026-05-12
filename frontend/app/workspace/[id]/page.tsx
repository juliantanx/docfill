'use client'
import { useEffect, useState, useCallback, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import type { DocumentInfo, DocField, AiFillEvent } from '@/types/document'
import { getDocument, updateField, confirmFields, cancelAiFill, getDownloadUrl } from '@/lib/api'
import { connectAiFillStream } from '@/lib/sse'
import OutlineSidebar from '@/components/workspace/OutlineSidebar'
import OnlyOfficeEditor from '@/components/workspace/OnlyOfficeEditor'
import AiPanel from '@/components/workspace/AiPanel'
import PersonalInfoModal from '@/components/workspace/PersonalInfoModal'

interface Props {
  params: Promise<{ id: string }>
}

export default function WorkspacePage({ params }: Props) {
  const { id: docId } = use(params)
  const router = useRouter()
  const [doc, setDoc] = useState<DocumentInfo | null>(null)
  const [fields, setFields] = useState<DocField[]>([])
  const [aiFillState, setAiFillState] = useState<'idle' | 'filling' | 'paused' | 'done'>('idle')
  const [progress, setProgress] = useState(0)
  const [pendingInputField, setPendingInputField] = useState<DocField | null>(null)
  const pendingInputFieldsRef = useRef<DocField[]>([])
  const [abortFill, setAbortFill] = useState<(() => void) | null>(null)

  useEffect(() => {
    getDocument(docId).then((data: DocumentInfo) => {
      setDoc(data)
      setFields(data.fields ?? [])
    }).catch(() => router.push('/'))
  }, [docId, router])

  const handleAiEvent = useCallback((event: AiFillEvent) => {
    if (event.type === 'field_filled') {
      setFields((prev) =>
        prev.map((f) =>
          f.id === event.id
            ? { ...f, value: event.value, status: 'filled' }
            : f,
        ),
      )
    } else if (event.type === 'field_requires_input') {
      pendingInputFieldsRef.current.push({
        id: event.id,
        label: event.label ?? event.id,
        value: '',
        status: 'empty',
        field_type: 'blank',
        requires_input: true,
      })
    } else if (event.type === 'progress') {
      setProgress(event.percentage)
    } else if (event.type === 'cancelled') {
      setAiFillState('paused')
      setProgress(0)
      if (pendingInputFieldsRef.current.length > 0) {
        setPendingInputField(pendingInputFieldsRef.current.shift() ?? null)
      }
    } else if (event.type === 'done') {
      setAiFillState('done')
      setProgress(100)
      if (pendingInputFieldsRef.current.length > 0) {
        setPendingInputField(pendingInputFieldsRef.current.shift() ?? null)
      }
    }
  }, [])

  const startAiFill = useCallback(() => {
    setAiFillState('filling')
    setProgress(0)
    pendingInputFieldsRef.current = []
    const abort = connectAiFillStream(
      docId,
      handleAiEvent,
      () => setAiFillState('done'),
      () => setAiFillState('idle'),
    )
    setAbortFill(() => abort)
  }, [docId, handleAiEvent])

  const resumeAiFill = useCallback(() => {
    setAiFillState('filling')
    pendingInputFieldsRef.current = []
    const abort = connectAiFillStream(
      docId,
      handleAiEvent,
      () => setAiFillState('done'),
      () => setAiFillState('idle'),
      true,
    )
    setAbortFill(() => abort)
  }, [docId, handleAiEvent])

  const stopAiFill = useCallback(async () => {
    await cancelAiFill(docId)
    setAiFillState('filling')
  }, [docId])

  const handleFieldChange = useCallback(async (fieldId: string, value: string) => {
    await updateField(docId, fieldId, value)
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId ? { ...f, value, status: value ? 'filled' : 'empty' } : f,
      ),
    )
  }, [docId])

  const handlePersonalInfoSubmit = useCallback(async (fieldId: string, value: string) => {
    await handleFieldChange(fieldId, value)
    setPendingInputField(pendingInputFieldsRef.current.shift() ?? null)
  }, [handleFieldChange])

  const handleConfirmAndDownload = useCallback(async () => {
    const result = await confirmFields(docId)
    window.open(result.download_url, '_blank')
  }, [docId])

  if (!doc) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-white/50">
        加载中...
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <button
          onClick={() => router.push('/')}
          className="text-sm font-bold tracking-tight text-white/80 hover:text-white"
        >
          docfill
        </button>
        <span className="text-sm text-white/50 truncate max-w-xs">{doc.original_filename}</span>
        <button
          onClick={handleConfirmAndDownload}
          className="rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-1.5 text-sm font-medium hover:opacity-90"
        >
          确认并下载
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <OutlineSidebar
          outline={doc.outline ?? []}
          references={doc.references ?? []}
        />

        <main className="flex-1 overflow-hidden bg-white">
          <OnlyOfficeEditor docId={docId} />
        </main>

        <AiPanel
          fields={fields}
          aiFillState={aiFillState}
          progress={progress}
          onStartFill={startAiFill}
          onStopFill={stopAiFill}
          onResumeFill={resumeAiFill}
          onFieldChange={handleFieldChange}
        />
      </div>

      {pendingInputField && (
        <PersonalInfoModal
          field={pendingInputField}
          onSubmit={handlePersonalInfoSubmit}
          onSkip={() => setPendingInputField(pendingInputFieldsRef.current.shift() ?? null)}
        />
      )}
    </div>
  )
}
