import React from "react";
import axios from "axios";
import { Link } from "react-router";
import "./LoginPage.css";

function LoginPage() {
  const [loginData, setLoginData] = React.useState({
    email: "",
    password: "",
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setLoginData({
      ...loginData,
      [name]: value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    console.log(loginData);
    await axios.post("http://localhost:3000/api/login", loginData);
  };
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-header">
          <img src="/app-logo.png" />
          <p>Sign in to your account</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={loginData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={loginData.password}
              onChange={handleChange}
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
