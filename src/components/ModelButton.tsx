import { SiClaude, SiGooglegemini } from '@icons-pack/react-simple-icons'
import type { AIProvider } from '../services/aiService'

function DeepSeekIcon({ size, color }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color || 'currentColor'}>
      <path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.37.626-.844-.046-1.51.287-2.056.953-.172.21-.356.41-.55.601C17.807 8.32 16.168 9.306 14.2 9.62c-.606.1-1.22.13-1.83.058-1.14-.133-2.1-.62-2.93-1.39-.28-.26-.56-.52-.87-.75-.76-.56-1.59-.75-2.49-.42-.6.22-1.05.64-1.43 1.15-.06.08-.11.17-.17.25-.04.06-.09.12-.15.17-.28.24-.59.26-.87.05-.28-.21-.34-.5-.2-.82.48-1.12 1.29-1.88 2.46-2.27 1.17-.39 2.28-.24 3.31.43.39.25.74.56 1.1.85.36.29.74.52 1.17.67.43.15.87.2 1.32.17.45-.03.88-.14 1.29-.32.41-.18.78-.43 1.11-.73.33-.3.62-.64.88-1.01.26-.37.49-.76.69-1.17.2-.41.37-.84.51-1.28.14-.44.25-.89.33-1.35.08-.46.13-.93.15-1.4.02-.47.01-.94-.02-1.41-.03-.47-.09-.94-.18-1.4-.09-.46-.21-.91-.36-1.35-.15-.44-.33-.87-.54-1.28-.21-.41-.45-.8-.72-1.17-.27-.37-.57-.71-.9-1.02-.33-.31-.69-.59-1.07-.83-.38-.24-.79-.44-1.21-.6-.42-.16-.86-.28-1.31-.35-.45-.07-.91-.1-1.37-.09-.46.01-.92.06-1.37.15-.45.09-.89.22-1.31.39-.42.17-.82.38-1.2.63-.38.25-.73.54-1.05.86-.32.32-.61.67-.86 1.05-.25.38-.47.78-.65 1.2-.18.42-.32.86-.42 1.31-.1.45-.16.91-.18 1.37-.02.46 0 .92.05 1.38.05.46.14.91.26 1.35.12.44.28.87.47 1.28.19.41.42.8.68 1.17.26.37.55.71.87 1.02.32.31.67.59 1.04.83.37.24.77.44 1.18.6.41.16.84.28 1.28.35.44.07.89.1 1.34.09.45-.01.9-.06 1.34-.15.44-.09.87-.22 1.28-.39.41-.17.8-.38 1.17-.63.37-.25.71-.54 1.02-.86.31-.32.59-.67.84-1.05.25-.38.46-.78.64-1.2.18-.42.32-.86.42-1.31.1-.45.16-.91.18-1.37.02-.46 0-.92-.05-1.38-.05-.46-.14-.91-.26-1.35z"/>
    </svg>
  )
}

const MODELS = {
  claude:   { label: 'Claude',   Icon: SiClaude,       color: '#cc785c', bg: '#fff5f0', border: '#cc785c' },
  gemini:   { label: 'Gemini',   Icon: SiGooglegemini, color: '#4285F4', bg: '#eef3ff', border: '#4285F4' },
  deepseek: { label: 'DeepSeek', Icon: DeepSeekIcon,   color: '#4D6BFE', bg: '#eef0ff', border: '#4D6BFE' },
}

interface ModelButtonProps {
  provider: AIProvider
  active?: boolean
  onClick: () => void
}

export function ModelButton({ provider, active, onClick }: ModelButtonProps) {
  const { label, Icon, color, bg, border } = MODELS[provider]
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 13, padding: '6px 12px', borderRadius: 8,
        background: active ? bg : 'transparent',
        color: active ? color : 'var(--ink)',
        border: `0.5px solid ${active ? border : 'var(--line)'}`,
        cursor: 'pointer', fontFamily: 'inherit',
        opacity: active ? 1 : 0.45,
        transition: 'all 0.15s',
        fontWeight: active ? 700 : 500,
      }}
    >
      <Icon size={14} color={active ? color : undefined} />
      {label}
    </button>
  )
}
