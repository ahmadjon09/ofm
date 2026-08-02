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
          <div className="loader"></div>
        </div>
      </section>
    </>
  )
}
