import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

export const login = async (
  username: string,
  password: string
) => {
  const response = await API.post("/login", {
    username,
    password,
  });

  return response.data;
};

export default API;