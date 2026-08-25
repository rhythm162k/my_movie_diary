import { Navigate, Routes, Route } from "react-router";
import HomePage from "./Pages/HomePage/HomePage";
import AddNew from "./Pages/AddNew/AddNew";
import LoginPage from "./Pages/LoginRegistration/LoginPage";
import RegistrationPage from "./Pages/LoginRegistration/RegistrationPage";
import { useAuth } from "./context/AuthContext";

function App() {
  const { authenticated } = useAuth();

  if (authenticated === null) {
    return null;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          authenticated ? (
            <Navigate to="/home" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/login"
        element={
          authenticated ? <Navigate to="/home" replace /> : <LoginPage />
        }
      />

      <Route
        path="/registration"
        element={
          authenticated ? <Navigate to="/home" replace /> : <RegistrationPage />
        }
      />

      <Route
        path="/home"
        element={
          authenticated ? <HomePage /> : <Navigate to="/login" replace />
        }
      />

      <Route
        path="/add-new"
        element={authenticated ? <AddNew /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}

export default App;
