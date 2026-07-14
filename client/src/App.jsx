import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { useContext, useEffect, useState } from 'react'
import { ContextData } from './contextData/Context'
import Fetch from "./middlewares/fetcher"
import { Product } from './pages/Product'
import Cookies from "js-cookie"
import Err from './pages/Err'
import { Root } from './layout/Root'
import { AuthModals } from './components/AuthModals'
import { Loading } from './components/Loading'
import { Users } from './pages/Users'
import { Dashboard } from './pages/Dashboard'
import { Clients } from './pages/Clients'
import { Orders } from './pages/Orders'
import { Kassa } from './pages/Kassa'

export default function App() {
  const { setUser, user } = useContext(ContextData)
  const [isLoading, setIsLoading] = useState(false)
  const token = Cookies.get('user_token')

  useEffect(() => {
    const getMyData = async () => {
      setIsLoading(true)

      try {
        const { data } = await Fetch.get('/auth/me')
        if (data?.data.user) {
          setUser(data.data.user)
        } else {
          logout()
        }

      } catch (error) {
        const status = error?.response?.status

        if (status === 401 || status === 403) {
          logout()
        } else {
          console.error(error)
        }

      } finally {
        setIsLoading(false)
      }
    }

    if (token) {
      getMyData()
    }

  }, [token])


  const logout = () => {
    Cookies.remove('user_token')
    setUser(null)
  }


  if (!token) return <AuthModals />

  if (isLoading) return <Loading />
  // const isAdmin = user.role === 'admin'

  const routes = [
    { index: true, element: <Dashboard /> },
    { path: 'products', element: <Product /> },
    { path: 'users', element: <Users /> },
    { path: 'clients', element: <Clients /> },
    { path: 'orders', element: <Orders /> },
    { path: 'kassa', element: <Kassa /> },
    { path: '*', element: <Err /> }
  ].filter(Boolean)

  const router = createBrowserRouter([
    {
      path: '/',
      element: <Root />,
      children: routes
    }
  ])

  return (
    <>
      <RouterProvider router={router} />
    </>
  )
}
