import { useContext } from 'react'
import { ContextData } from '../contextData/Context'

export const Loading = () => {
  const { dark } = useContext(ContextData)

  return (
    <>
      <section
        className={`h-screen flex justify-center items-center ${dark ? 'bg-gray-800' : 'bg-white'
          }`}
      >
        <div className="flex flex-col items-center justify-center py-12">
          <div
            className={`w-16 h-16 border-4 rounded-full animate-spin mb-4 ${dark
              ? 'border-gray-700 border-t-gray-300'
              : 'border-blue-200 border-t-blue-600'
              }`}
          ></div>
        </div>
      </section>
    </>
  )
}
