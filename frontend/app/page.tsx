'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DropZone from '@/components/upload/DropZone'
import UploadProgress from '@/components/upload/UploadProgress'
import { uploadDocument, uploadReference } from '@/lib/api'

type Stage = 'idle' | 'uploading' | 'parsing' | 'ready' | 'error'

export default function HomePage() {
  const router = useRouter()
  const [docId, setDocId] = useState<string | null>(null)
  const [filename, setFilename] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [refs, setRefs] = useState<string[]>([])

  const handleDocUpload = useCallback(async (file: File) => {
    setFilename(file.name)
    setStage('uploading')
    setErrorMsg('')
    try {
      const res = await uploadDocument(file)
      setDocId(res.doc_id)
      setStage(res.status === 'ready' ? 'ready' : 'error')
      if (res.status !== 'ready') setErrorMsg(res.message)
    } catch (e: unknown) {
      setStage('error')
      setErrorMsg(e instanceof Error ? e.message : '上传失败')
    }
  }, [])

  const handleRefUpload = useCallback(async (file: File) => {
    if (!docId) return
    try {
      await uploadReference(docId, file)
      setRefs((prev) => [...prev, file.name])
    } catch {
      // reference upload failure doesn't block main flow
    }
  }, [docId])

  const handleRefsUpload = useCallback(async (files: File[]) => {
    if (!docId) return
    const names: string[] = []
    for (const file of files) {
      try {
        await uploadReference(docId, file)
        names.push(file.name)
      } catch {
        // reference upload failure doesn't block main flow
      }
    }
    if (names.length > 0) setRefs((prev) => [...prev, ...names])
  }, [docId])

  const handleStart = () => {
    if (docId) router.push(`/workspace/${docId}`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] px-4">
      <div className="mb-12 text-center animate-[fadeInDown_0.6s_ease-out]">
        <h1 className="text-5xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
            docfill
          </span>
        </h1>
        <p className="mt-3 text-lg text-white/60">上传文档，AI 智能填写</p>
        <p className="mt-1 text-sm text-white/30">支持合同、表单、试卷等任意 Word 文档</p>
      </div>

      <div className="w-full max-w-xl animate-[fadeInUp_0.6s_ease-out_0.2s_both]">
        {stage === 'idle' ? (
          <DropZone onFileSelect={handleDocUpload} className="h-64 w-full" />
        ) : (
          <UploadProgress
            filename={filename}
            state={stage === 'uploading' ? 'uploading' : stage === 'parsing' ? 'parsing' : stage === 'ready' ? 'ready' : 'error'}
            message={errorMsg || undefined}
          />
        )}

        {stage === 'ready' && (
          <div className="mt-5 animate-[fadeInUp_0.4s_ease-out_both]">
            {/* Reference docs upload — horizontal inline */}
            <label
              className="group flex w-full items-center gap-3 rounded-xl border border-dashed
                         border-white/15 bg-white/[0.03] px-4 py-3 cursor-pointer
                         hover:border-white/30 hover:bg-white/[0.06] transition-all duration-200"
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-violet-400/50') }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('border-violet-400/50') }}
              onDrop={(e) => {
                e.preventDefault()
                e.currentTarget.classList.remove('border-violet-400/50')
                const files = Array.from(e.dataTransfer.files)
                if (files.length > 0) handleRefsUpload(files)
              }}
            >
              <input
                type="file"
                accept=".docx,.doc"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  if (files.length > 0) handleRefsUpload(files)
                }}
              />
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md
                               border border-white/10 bg-white/5 text-white/40
                               group-hover:border-white/20 group-hover:text-white/60 transition-colors">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M8 3v10M3 8h10" />
                </svg>
              </span>
              <span className="text-sm text-white/40 group-hover:text-white/60 transition-colors">
                添加参考文档（可选，支持多选）
              </span>
            </label>

            {/* Uploaded refs as chips */}
            {refs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {refs.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10
                               bg-white/[0.04] px-2 py-0.5 text-xs text-white/50"
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-green-400/60">
                      <path d="M2.5 6.5L5 9l4.5-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="max-w-[160px] truncate">{r}</span>
                  </span>
                ))}
              </div>
            )}

            <button
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-violet-600 to-blue-600
                         py-4 text-base font-semibold text-white shadow-lg
                         hover:from-violet-500 hover:to-blue-500 active:scale-[0.98]
                         transition-all duration-150"
              onClick={handleStart}
            >
              开始 AI 填写 →
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
