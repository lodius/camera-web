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

export interface TapoPowerState {
  on: boolean;
}

const authConfig = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem("cameraToken") ?? ""}`,
  },
});

export const getTapoPower = async () => {
  const response = await API.get<TapoPowerState>(
    "/tapo/power",
    authConfig()
  );

  return response.data;
};

export const setTapoPower = async (on: boolean) => {
  const response = await API.put<TapoPowerState>(
    "/tapo/power",
    { on },
    authConfig()
  );

  return response.data;
};

export default API;