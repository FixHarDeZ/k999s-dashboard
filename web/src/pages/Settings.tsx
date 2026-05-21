import { useEffect, useState } from 'react'
import { fetchSettings, saveSettings } from '@/lib/api'
import { Eye, EyeOff } from 'lucide-react'

type Provider = 'ollama' | 'anthropic' | 'openai' | 'openrouter'

interface ProviderMeta {
  label: string
  needsKey: boolean
  needsBaseURL: boolean
  modelPlaceholder: string
  presetModels?: string[]
  keyPlaceholder?: string
  baseURLPlaceholder?: string
  note?: string
}

const PROVIDERS: Record<Provider, ProviderMeta> = {
  ollama: {
    label: 'Ollama (local)',
    needsKey: false,
    needsBaseURL: true,
    modelPlaceholder: 'llama3.2',
    presetModels: ['llama3.2', 'llama3.1', 'mistral', 'qwen2.5', 'deepseek-r1'],
    baseURLPlaceholder: 'http://localhost:11434 (default)',
    note: 'Runs locally — no API key required. Leave Base URL empty to use localhost:11434.',
  },
  anthropic: {
    label: 'Anthropic',
    needsKey: true,
    needsBaseURL: false,
    modelPlaceholder: 'claude-sonnet-4-6',
    presetModels: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    keyPlaceholder: 'sk-ant-...',
  },
  openai: {
    label: 'OpenAI',
    needsKey: true,
    needsBaseURL: true,
    modelPlaceholder: 'gpt-4o',
    presetModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini'],
    keyPlaceholder: 'sk-...',
    baseURLPlaceholder: 'https://api.openai.com/v1 (default)',
  },
  openrouter: {
    label: 'OpenRouter',
    needsKey: true,
    needsBaseURL: false,
    modelPlaceholder: 'anthropic/claude-sonnet-4-5',
    presetModels: [
      'anthropic/claude-sonnet-4-5',
      'anthropic/claude-3.5-haiku',
      'google/gemini-2.0-flash',
      'google/gemini-flash-1.5',
      'openai/gpt-4o-mini',
      'deepseek/deepseek-chat',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    keyPlaceholder: 'sk-or-...',
    note: 'Use any model from openrouter.ai — type the model ID or pick from presets.',
  },
}

export function Settings() {
  const [provider, setProvider] = useState<Provider>('ollama')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [originalKey, setOriginalKey] = useState('') // masked key from server

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setProvider((s.provider as Provider) || 'ollama')
        setModel(s.model || '')
        setOriginalKey(s.apiKey || '')
        setBaseURL(s.baseURL || '')
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const meta = PROVIDERS[provider]

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      // If user didn't touch the key field, send empty string (backend preserves existing)
      const keyToSend = apiKey === originalKey ? '' : apiKey
      await saveSettings({ provider, model, apiKey: keyToSend, baseURL })
      setSaveSuccess(true)
      if (apiKey && apiKey !== originalKey) {
        setOriginalKey(apiKey.length > 4 ? '•'.repeat(apiKey.length - 4) + apiKey.slice(-4) : apiKey)
        setApiKey('')
      }
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-primary-500 text-sm">
        Loading settings...
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="mb-5">
        <h1 className="text-base font-bold text-primary-900">Settings</h1>
        <p className="text-[11px] text-primary-500">AI Diagnostic provider configuration — saved to ~/.k999s/config.yaml</p>
      </div>

      <div style={{ border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden' }}>
        {/* Section header */}
        <div style={{ padding: '10px 16px', background: '#f0f4ff', borderBottom: '1px solid #e0e7ff' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#4338ca' }}>AI Diagnostic</span>
          <span style={{ fontSize: 10, color: '#818cf8', marginLeft: 8 }}>
            Used for pod investigation and root cause analysis
          </span>
        </div>

        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16, background: '#fff' }}>

          {/* Provider select */}
          <Field label="Provider">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => { setProvider(p); setModel(''); setApiKey(''); setBaseURL('') }}
                  style={{
                    padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                    border: `1px solid ${provider === p ? '#6366f1' : '#e0e7ff'}`,
                    background: provider === p ? '#6366f1' : '#fff',
                    color: provider === p ? '#fff' : '#374151',
                    cursor: 'pointer',
                  }}
                >
                  {PROVIDERS[p].label}
                </button>
              ))}
            </div>
            {meta.note && (
              <p style={{ fontSize: 10, color: '#6b7280', marginTop: 6 }}>{meta.note}</p>
            )}
          </Field>

          {/* Model */}
          <Field label="Model">
            {meta.presetModels && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {meta.presetModels.map((m) => (
                  <button
                    key={m}
                    onClick={() => setModel(m)}
                    style={{
                      padding: '3px 10px', borderRadius: 4, fontSize: 10,
                      border: `1px solid ${model === m ? '#a5b4fc' : '#e0e7ff'}`,
                      background: model === m ? '#eef2ff' : '#f9fafb',
                      color: model === m ? '#4338ca' : '#6b7280',
                      cursor: 'pointer', fontFamily: 'monospace',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={meta.modelPlaceholder}
              style={inputStyle}
            />
          </Field>

          {/* API Key */}
          {meta.needsKey && (
            <Field label="API Key">
              {originalKey && !apiKey && (
                <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 6, fontFamily: 'monospace' }}>
                  Current: {originalKey}
                </div>
              )}
              <div style={{ position: 'relative' }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={originalKey ? 'Enter new key to replace...' : (meta.keyPlaceholder ?? '')}
                  style={{ ...inputStyle, paddingRight: 36 }}
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2,
                  }}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </Field>
          )}

          {/* Base URL */}
          {meta.needsBaseURL && (
            <Field label={<>Base URL <span style={{ fontWeight: 400, color: '#9ca3af' }}>optional</span></>}>
              <input
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
                placeholder={meta.baseURLPlaceholder ?? ''}
                style={inputStyle}
              />
            </Field>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', background: '#f9fafb', borderTop: '1px solid #e0e7ff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 10 }}>
            {saveSuccess && <span style={{ color: '#16a34a' }}>✓ Saved — provider reloaded</span>}
            {saveError && <span style={{ color: '#dc2626' }}>✗ {saveError}</span>}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '6px 20px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: 'none', background: saving ? '#a5b4fc' : '#4f46e5',
              color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  fontSize: 12,
  border: '1px solid #e0e7ff',
  borderRadius: 6,
  outline: 'none',
  fontFamily: 'inherit',
  color: '#111827',
  background: '#fff',
  boxSizing: 'border-box',
}
