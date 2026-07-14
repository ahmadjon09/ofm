import { useState, useEffect } from 'react'
import { Home, Search, Phone } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Err() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = e => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  return (
    <div className='min-h-[50vh] max-h-[90vh]  relative overflow-hidden'>
      <div
        className='absolute inset-0 opacity-20 transition-all duration-700 ease-out'
        style={{
          background: `radial-gradient(800px circle at ${mousePosition.x}px ${mousePosition.y}px, rgb(59, 131, 246), transparent 50%)`
        }}
      />
      <div
        className='absolute inset-0 opacity-15 transition-all duration-1000 ease-out'
        style={{
          background: `radial-gradient(400px circle at ${mousePosition.x}px ${mousePosition.y}px, rgb(146, 51, 234), transparent 60%)`
        }}
      />
      <div
        className='absolute inset-0 opacity-10 transition-all duration-500 ease-out'
        style={{
          background: `radial-gradient(200px circle at ${mousePosition.x}px ${mousePosition.y}px, rgb(236, 72, 154), transparent 70%)`
        }}
      />

      <div className='relative z-10 flex flex-col items-center justify-center min-h-screen px-4 text-center'>
        <div className='bounce-in mb-8'>
          <h1 className='text-7xl md:text-8xl font-bold bg-gradient-to-r from-blue-500 via-purple-600 to-pink-500 bg-clip-text text-transparent mb-3'>
            404
          </h1>
          <h2 className='text-2xl md:text-3xl font-semibold text-gray-600 mb-4'>
            Ой! Саҳифа топилмади
          </h2>
          <p className='text-base md:text-lg text-gray-500 max-w-lg mx-auto mb-6'>
            Сиз излаган саҳифа мавжуд эмас. Лекин хавотир олманг!
          </p>
        </div>

        <div
          className='grid grid-cols-2 gap-3 mb-8 bounce-in'
          style={{ animationDelay: '0.2s' }}
        >
          <Link to={'/'} className='group cursor-pointer'>
            <div className='bg-[] border border-gray-200 rounded-lg p-4 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:bg-blue-50'>
              <Home className='w-6 h-6 mx-auto mb-2 text-blue-500 group-hover:scale-110 transition-transform duration-300' />
              <p className='text-sm font-medium text-gray-500'>Бош саҳифа</p>
            </div>
          </Link>

          <a href='https://t.me/+998995186261' className='group cursor-pointer'>
            <div className='bg-[] border border-gray-200 rounded-lg p-4 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:bg-pink-50'>
              <Phone className='w-6 h-6 mx-auto mb-2 text-pink-500 group-hover:scale-110 transition-transform duration-300' />
              <p className='text-sm font-medium text-gray-500'>Алоқа</p>
            </div>
          </a>
        </div>

        <div className='bounce-in' style={{ animationDelay: '0.4s' }}>
          <Link
            to={'/'}
            className='group relative px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-full transition-all duration-300 hover:scale-105 hover:shadow-xl overflow-hidden'
          >
            <span className='relative z-10'>Бош саҳифа</span>
            <div className='absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300'></div>
          </Link>
        </div>
      </div>
    </div>
  )
}
