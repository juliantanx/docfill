interface Props {
  progress: number
  state: 'filling' | 'done' | 'idle'
}

export default function AiProgressStream({ progress, state }: Props) {
  const visible = state !== 'idle'

  return (
    <div
      aria-hidden={!visible}
      className={`space-y-2 rounded-xl border border-white/10 bg-white/5 p-4 ${visible ? 'mt-4' : 'hidden'}`}
    >
      <div className="flex items-center justify-between text-xs text-white/50">
        <span>{state === 'done' ? 'AI 填写完成' : 'AI 正在填写...'}</span>
        <span>{progress}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-400 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
