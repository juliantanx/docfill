import { motion } from 'framer-motion'

interface Props {
  progress: number
  state: 'filling' | 'done' | 'idle'
}

export default function AiProgressStream({ progress, state }: Props) {
  if (state === 'idle') return null

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between text-xs text-white/50">
        <span>{state === 'done' ? 'AI 填写完成' : 'AI 正在填写...'}</span>
        <span>{progress}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}
