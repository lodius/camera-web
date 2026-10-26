import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

export const login = async (
  username: string,
  password: string
) => {
  try {
    const response = await API.post("/login", {
      username,
      password,
    });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message;

      if (typeof message === "string") {
        throw new Error(message);
      }
    }

    throw error;
  }
};

export default API;