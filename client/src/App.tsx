import { useState } from "react";
import LoginForm from "./components/LoginForm/LoginForm";
import CameraPage from "./pages/CameraPage";

function App() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("cameraToken")
  );

  const handleLogin = (newToken: string) => {
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem("cameraToken");
    setToken(null);
  };

  if (!token) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <CameraPage
      onLogout={handleLogout}
    />
  );
}

export default App;
