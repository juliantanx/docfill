'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
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

  const handleStart = () => {
    if (docId) router.push(`/workspace/${docId}`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] px-4">
      <motion.div
        className="mb-12 text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="text-5xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
            docfill
          </span>
        </h1>
        <p className="mt-3 text-lg text-white/60">上传文档，AI 智能填写</p>
        <p className="mt-1 text-sm text-white/30">支持合同、表单、试卷等任意 Word 文档</p>
      </motion.div>

      <motion.div
        className="w-full max-w-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        {stage === 'idle' ? (
          <DropZone onFileSelect={handleDocUpload} className="h-64 w-full" />
        ) : (
          <UploadProgress
            filename={filename}
            state={stage === 'uploading' ? 'uploading' : stage === 'parsing' ? 'parsing' : stage === 'ready' ? 'ready' : 'error'}
            message={errorMsg || undefined}
          />
        )}

        <AnimatePresence>
          {stage === 'ready' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4"
            >
              <DropZone
                onFileSelect={handleRefUpload}
                label="+ 添加参考文档（可选）"
                className="h-24 w-full"
              />
              {refs.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {refs.map((r) => (
                    <li key={r} className="text-xs text-white/40">✓ {r}</li>
                  ))}
                </ul>
              )}

              <motion.button
                className="mt-6 w-full rounded-xl bg-gradient-to-r from-violet-600 to-blue-600
                           py-4 text-base font-semibold text-white shadow-lg
                           hover:from-violet-500 hover:to-blue-500 active:scale-95"
                onClick={handleStart}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                开始 AI 填写 →
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  )
}
