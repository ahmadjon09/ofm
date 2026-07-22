import axios from 'axios'
import Cookies from 'js-cookie'

const BASE_URL = `https://api.ofmm.uz/api/v1`
// export const BASE_URL = `http://localhost:5000/api/v1`

const token = Cookies.get('user_token')
const instance = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${token}`
  }
})




export default instance;
