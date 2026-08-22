import { Link } from "react-router";
import "./LoginPage.css";

function LoginPage() {
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/app-logo.png" />
          <p>Sign in to your account</p>
        </div>

        <form className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" className="login-button">
            Sign In
          </button>
        </form>

        <p className="signup-text">
          Don't have an account? <Link to="/registration">Create one</Link>
        </p>
      </div>
    </main>
  );
}

export default LoginPage;
