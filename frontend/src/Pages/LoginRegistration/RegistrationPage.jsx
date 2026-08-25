import React from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router";
import { useAuth } from "../../context/AuthContext";
import "./RegistrationPage.css";

function RegistrationPage() {
  const [error, setError] = React.useState("");
  const navigate = useNavigate();
  const { setAuthenticated } = useAuth();

  const [registrationData, setRegistrationData] = React.useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setRegistrationData({
      ...registrationData,
      [name]: value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (registrationData.password !== registrationData.confirmPassword) {
      setError("Password didn't match");
      return;
    }
    try {
      await axios.post("http://localhost:3000/api/registration", {
        name: registrationData.name,
        email: registrationData.email,
        password: registrationData.password,
      });
      setAuthenticated(true);
      navigate("/home");
    } catch (error) {
      if (error.response?.status === 409) {
        setError(error.response.data.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <main className="register-page">
      <div className="register-card">
        <div className="register-header">
          <h1>Create Account</h1>
          <p>Sign up to get started</p>
        </div>

        <form className="register-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              name="name"
              placeholder="Enter your name"
              value={registrationData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={registrationData.email}
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
              value={registrationData.password}
              onChange={handleChange}
              placeholder="Create a password"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirm-password">Confirm Password</label>
            <input
              type="password"
              id="confirm-password"
              name="confirmPassword"
              value={registrationData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm your password"
              required
            />
          </div>

          {error && <p className="register-error">{error}</p>}

          <button type="submit" className="register-button">
            Create Account
          </button>
        </form>

        <p className="login-text">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}

export default RegistrationPage;
