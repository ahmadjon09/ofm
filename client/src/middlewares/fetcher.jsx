import axios from 'axios'
import Cookies from 'js-cookie'

const BASE_URL = import.meta.env.VITE_API_BASE || `https://api.ofmm.uz/api/v2`
// Lokal ishlatish uchun: .env faylga VITE_API_BASE=http://localhost:5000/api/v2 yozing

const token = Cookies.get('user_token')
const instance = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${token}`
  }
})




export default instance;
