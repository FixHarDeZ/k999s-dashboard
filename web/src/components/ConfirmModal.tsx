import { X } from 'lucide-react'

interface ConfirmModalProps {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onCancel} />
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div className="bg-white rounded-xl shadow-xl p-6 w-80 pointer-events-auto">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-bold text-sm text-primary-900">{title}</h3>
            <button onClick={onCancel} className="p-0.5 hover:bg-primary-50 rounded ml-2">
              <X size={14} className="text-primary-400" />
            </button>
          </div>
          {message && <p className="text-xs text-gray-500 mb-4">{message}</p>}
          <div className="flex gap-2 justify-end mt-4">
            <button
              onClick={onCancel}
              className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`text-xs px-3 py-1.5 rounded text-white ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-primary-600 hover:bg-primary-700'}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
