'use client'
import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface DropZoneProps {
  onFileSelect: (file: File) => void
  label?: string
  accept?: string
  className?: string
}

export default function DropZone({
  onFileSelect,
  label = '拖拽或点击上传 Word 文档',
  accept = '.docx,.doc',
  className = '',
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect],
  )

  return (
    <motion.label
      className={`relative flex flex-col items-center justify-center
        cursor-pointer rounded-2xl border-2 border-dashed transition-all
        ${isDragging
          ? 'border-violet-400 bg-violet-500/10 shadow-[0_0_40px_rgba(139,92,246,0.3)]'
          : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'
        } ${className}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <input type="file" accept={accept} className="sr-only" onChange={handleChange} />

      <div className="flex flex-col items-center gap-4 p-12 text-center">
        <motion.div
          className="text-5xl"
          animate={isDragging ? { scale: 1.2, rotate: 5 } : { scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          📄
        </motion.div>
        <p className="text-lg font-medium text-white/80">{label}</p>
        <p className="text-sm text-white/40">支持 .docx、.doc 格式</p>
      </div>

      <AnimatePresence>
        {isDragging && (
          <motion.div
            className="absolute inset-0 rounded-2xl bg-violet-500/5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
    </motion.label>
  )
}
