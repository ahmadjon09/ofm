import axios from 'axios'
import Cookies from 'js-cookie'

const BASE_URL = `https://ofm-r37o.onrender.com/api/v1`
localStorage.setItem('base_url', BASE_URL)
const token = Cookies.get('user_token')
const instance = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${token}`
  }
})




export default instance;
