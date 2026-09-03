import { useState, type FormEvent } from "react";
import { login } from "../../api/api";
import "./LoginForm.css";

interface LoginFormProps {
  onLogin: (token: string) => void;
}

export default function LoginForm({
  onLogin,
}: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!username || !password) {
      setError("Please enter username and password.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const data = await login(username, password);

      localStorage.setItem(
        "cameraToken",
        data.token
      );

      onLogin(data.token);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Login failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form
        className="login-card"
        onSubmit={handleSubmit}
      >
        <h1>Raspberry Pi Camera</h1>

        <p className="login-subtitle">
          Sign in to view the camera
        </p>

        <label htmlFor="username">
          Username
        </label>

        <input
          id="username"
          type="text"
          value={username}
          onChange={(event) =>
            setUsername(event.target.value)
          }
          autoComplete="username"
          placeholder="Username"
        />

        <label htmlFor="password">
          Password
        </label>

        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) =>
            setPassword(event.target.value)
          }
          autoComplete="current-password"
          placeholder="Password"
        />

        {error && (
          <div className="login-error">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
        >
          {loading
            ? "Signing in..."
            : "Login"}
        </button>
      </form>
    </div>
  );
}
