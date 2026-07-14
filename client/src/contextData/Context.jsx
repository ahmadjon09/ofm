import { createContext, useEffect, useState } from 'react'
import Cookies from 'js-cookie'
export const ContextData = createContext()

export const ContextProvider = ({ children }) => {
  const [user, setUser] = useState({})
  const [openX, setOpenX] = useState(false)
  const [netErr, setNetErr] = useState(false)
  const [pingms, setPingms] = useState(0)
  const [ping, setPing] = useState(false)
  const [dark, setDark] = useState(() => {
    return localStorage.getItem('dark') === '!true'
  })
  const [lang, setLangState] = useState(
    () => localStorage.getItem('lang') || 'uzk'
  )

  const setLang = (value) => {
    setLangState(value)
    localStorage.setItem('lang', value)
  }





  const setUserToken = (token) => {
    Cookies.set('user_token', token, { expires: 7 })
  }


  const removeUserToken = () => {
    Cookies.remove('user_token')
  }
  return (
    <ContextData.Provider
      value={{
        dark,
        setDark,
        setUserToken,
        removeUserToken,
        setUser,
        user,
        netErr,
        setNetErr,
        ping,
        setPing,
        openX,
        setOpenX,
        pingms,
        setPingms,
        lang,
        setLang
      }}
    >
      <>
        {children}
      </>
    </ContextData.Provider>
  )
}
