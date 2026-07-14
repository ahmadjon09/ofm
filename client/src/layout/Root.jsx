import { Outlet } from 'react-router-dom'
import { Header } from '../components/Header'

export const Root = () => {
  return (
    <>
      <Header />
      <main className='pt-2.5 text-gray-700 container'>
        <Outlet />
      </main>
    </>
  )
}
