import { useState } from 'react'
import { Key, Eye, EyeOff, Save, X } from 'lucide-react'
import { BaseDialog } from '../../components/shared/BaseDialog'
import { useDialogAnimation } from '../../hooks/useDialogAnimation'
import toast from 'react-hot-toast'

interface HuggingFaceConfigDialogProps {
  isOpen: boolean
  onClose: () => void
  hfToken: string
  setHfToken: (token: string) => void
  showHfToken: boolean
  setShowHfToken: (show: boolean) => void
  actualToken: string
  setActualToken: (token: string) => void
  isTokenSaved: boolean
  setIsTokenSaved: (saved: boolean) => void
}

export function HuggingFaceConfigDialog ({
  isOpen,
  onClose,
  hfToken,
  setHfToken,
  showHfToken,
  setShowHfToken,
  actualToken,
  setActualToken,
  isTokenSaved,
  setIsTokenSaved
}: HuggingFaceConfigDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  const { shouldRender, isVisible, handleClose } = useDialogAnimation(
    isOpen,
    onClose
  )

  const handleSaveHfToken = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/local-llm/hf-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: hfToken })
      })

      if (response.ok) {
        toast.success('Hugging Face token saved successfully')
        setActualToken(hfToken)
        setHfToken('•'.repeat(20))
        setIsTokenSaved(true)
        setShowHfToken(false)
        handleClose()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to save token')
      }
    } catch (error) {
      console.error('Error saving HF token:', error)
      toast.error('Failed to save token')
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleTokenVisibility = async () => {
    if (!showHfToken && isTokenSaved && !actualToken) {
      try {
        const response = await fetch('/api/local-llm/hf-token')
        if (response.ok) {
          const data = await response.json()
          setActualToken(data.token)
          setHfToken(data.token)
        }
      } catch (error) {
        console.error('Error fetching token:', error)
        toast.error('Failed to retrieve token')
        return
      }
    } else if (!showHfToken && isTokenSaved && actualToken) {
      setHfToken(actualToken)
    } else if (showHfToken && isTokenSaved) {
      setHfToken('•'.repeat(20))
    }

    setShowHfToken(!showHfToken)
  }

  const handleTokenChange = (value: string) => {
    setHfToken(value)
    if (isTokenSaved && value !== '•'.repeat(20)) {
      setActualToken(value)
    }
  }

  if (!shouldRender) return null

  return (
    <BaseDialog
      isOpen={isOpen}
      onClose={handleClose}
      isVisible={isVisible}
      maxWidth='max-w-lg'
    >
      <div className='p-6'>
        <div className='flex items-center justify-between mb-6'>
          <div className='flex items-center gap-3'>
            <Key size={20} className='text-yellow-400' />
            <h3 className='text-lg font-medium text-white'>
              Hugging Face Configuration
            </h3>
          </div>
          <button
            onClick={handleClose}
            className='p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white'
          >
            <X size={16} />
          </button>
        </div>

        <div className='space-y-4'>
          <div>
            <label className='block text-sm font-medium text-gray-300 mb-2'>
              API Token
            </label>
            <div className='relative'>
              <input
                type={showHfToken ? 'text' : 'password'}
                value={hfToken}
                onChange={e => handleTokenChange(e.target.value)}
                placeholder='Enter your Hugging Face API token'
                className='w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 pr-12'
              />
              <button
                type='button'
                onClick={handleToggleTokenVisibility}
                className='absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white'
              >
                {showHfToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className='p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg'>
            <p className='text-sm text-yellow-200'>
              <strong>Why do I need this?</strong> Some models on Hugging Face
              require authentication. Get your free API token from{' '}
              <a
                href='https://huggingface.co/settings/tokens'
                target='_blank'
                rel='noopener noreferrer'
                className='text-yellow-400 hover:text-yellow-300 underline'
              >
                Hugging Face Settings
              </a>
            </p>
          </div>

          <div className='flex justify-end gap-3 pt-4'>
            <button
              onClick={handleClose}
              disabled={isLoading}
              className='px-4 py-2 text-gray-400 hover:text-white transition-colors disabled:cursor-not-allowed'
            >
              Cancel
            </button>
            <button
              onClick={handleSaveHfToken}
              disabled={!hfToken.trim() || isLoading}
              className='flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-800 disabled:cursor-not-allowed rounded-lg text-white transition-colors'
            >
              <Save size={16} />
              {isLoading ? 'Saving...' : 'Save Token'}
            </button>
          </div>
        </div>
      </div>
    </BaseDialog>
  )
}
