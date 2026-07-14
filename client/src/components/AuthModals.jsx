import { useContext, useState } from 'react'
import { Phone, Lock, Eye, EyeOff } from 'lucide-react'
import Fetch from '../middlewares/fetcher'
import { ContextData } from '../contextData/Context'

export const AuthModals = () => {
  const { dark } = useContext(ContextData)

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-4 ${dark ? 'bg-black/80' : 'bg-black/50'
        }`}
    >
      <div
        className={`rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all duration-300 animate-scale-in
        ${dark ? 'bg-[#111] text-white' : 'bg-white text-black'}`}
      >
        {/* Header */}
        <div className='bg-gradient-to-r from-blue-600 to-indigo-700 p-6'>
          <div className='flex items-center justify-center gap-3 mb-2'>
            <h1 className='text-2xl font-bold text-white'>OFM</h1>
          </div>
          <p className='text-blue-100 text-center text-sm'>Xуш келибсиз</p>
        </div>

        <div className='p-6'>
          <LoginForm />
        </div>
      </div>
    </div>
  )
}

const LoginForm = () => {
  const { setUserToken, dark } = useContext(ContextData)
  const [phoneNumber, setPhoneNumber] = useState('+998')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const validateForm = () => {
    const newErrors = {}
    if (!phoneNumber.trim() || phoneNumber === '+998') {
      newErrors.phoneNumber = 'Телефон рақамини киритинг'
    } else {
      const numericPhone = phoneNumber.replace(/\D/g, '')
      if (numericPhone.length !== 12) {
        newErrors.phoneNumber =
          'Телефон рақами 12 та рақамдан иборат бўлиши керак'
      }
    }

    if (!password) {
      newErrors.password = 'Парол киритилиши шарт'
    } else if (password.length < 6) {
      newErrors.password = 'Парол камида 6 та белгидан иборат бўлиши керак'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!validateForm()) return

    setLoading(true)
    setErrors({})

    try {
      const { data } = await Fetch.post('auth/login', {
        password,
        phone: phoneNumber
      })

      setUserToken(data.data.accessToken)
      window.location.href = '/'
    } catch (error) {
      console.log(error);

      const errorMessage =
        error.response?.data?.message || 'Киришда хатолик юз берди'
      setErrors({
        api: errorMessage,
        ...(error.response?.data?.errors || {})
      })
    } finally {
      setLoading(false)
    }
  }

  const formatPhoneNumber = value => {
    let numbers = value.replace(/[^\d+]/g, '')

    if (!numbers.startsWith('+998') && numbers.replace('+', '').length > 0) {
      numbers = '+998' + numbers.replace('+998', '').replace('+', '')
    }

    if (numbers.length > 13) {
      numbers = numbers.slice(0, 13)
    }

    return numbers
  }

  return (
    <form onSubmit={handleSubmit} className='space-y-5'>
      <h2
        className={`text-xl font-bold text-center mb-2 ${dark ? 'text-white' : 'text-gray-800'
          }`}
      >
        Тизимга кириш
      </h2>

      <p className={`text-center text-sm mb-6 ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
        Маълумотларингизни киритинг
      </p>

      {errors.api && (
        <div className='p-3 border border-red-300 bg-red-50 text-red-700 rounded-xl text-sm flex items-center gap-2'>
          <div className='w-2 h-2 bg-red-500 rounded-full'></div>
          {errors.api}
        </div>
      )}

      {/* PHONE INPUT */}
      <div className='space-y-2'>
        <label
          htmlFor='phoneNumber'
          className={`block text-sm font-semibold ${dark ? 'text-gray-300' : 'text-gray-700'
            }`}
        >
          Телефон рақами
        </label>

        <div className='relative'>
          <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
            <Phone size={18} className='text-gray-400' />
          </div>

          <input
            id='phoneNumber'
            type='tel'
            value={phoneNumber}
            onChange={e => setPhoneNumber(formatPhoneNumber(e.target.value))}
            className={`w-full pl-10 pr-4 py-3 border-2 rounded-xl transition-all duration-200 outline-none
              ${errors.phoneNumber
                ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
                : dark
                  ? 'border-gray-600 bg-[#1a1a1a] text-white focus:border-blue-500'
                  : 'border-gray-300 bg-white text-black focus:border-blue-500'
              }
            `}
            placeholder='+998901234567'
          />
        </div>

        {errors.phoneNumber && (
          <p className='text-red-600 text-xs mt-1 flex items-center gap-1'>
            <span>•</span>
            {errors.phoneNumber}
          </p>
        )}
      </div>

      {/* PASSWORD INPUT */}
      <div className='space-y-2'>
        <div className='flex justify-between items-center'>
          <label
            htmlFor='password'
            className={`block text-sm font-semibold ${dark ? 'text-gray-300' : 'text-gray-700'
              }`}
          >
            Парол
          </label>
        </div>

        <div className='relative'>
          <div className='absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none'>
            <Lock size={18} className='text-gray-400' />
          </div>

          <input
            id='password'
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={`w-full pl-10 pr-10 py-3 border-2 rounded-xl transition-all duration-200 outline-none
              ${errors.password
                ? 'border-red-300 focus:border-red-500'
                : dark
                  ? 'border-gray-600 bg-[#1a1a1a] text-white focus:border-blue-500'
                  : 'border-gray-300 bg-white text-black focus:border-blue-500'
              }
            `}
            placeholder='Паролингизни киритинг'
          />

          <button
            type='button'
            className={`absolute inset-y-0 right-0 pr-3 flex items-center ${dark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'
              }`}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {errors.password && (
          <p className='text-red-600 text-xs mt-1 flex items-center gap-1'>
            <span>•</span>
            {errors.password}
          </p>
        )}
      </div>

      {/* BUTTON */}
      <button
        type='submit'
        disabled={loading}
        className='w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3.5 rounded-xl font-semibold transition-all duration-200 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed transform hover:-translate-y-0.5 shadow-lg hover:shadow-xl'
      >
        {loading ? (
          <div className='flex items-center justify-center gap-2'>
            <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin'></div>
            Кириш...
          </div>
        ) : (
          'Тизимга кириш'
        )}
      </button>
    </form>
  )
}

const styles = `
@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-scale-in {
  animation: scale-in 0.3s ease-out;
}
`

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.innerText = styles
  document.head.appendChild(styleSheet)
}
