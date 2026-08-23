import { Navigate, Routes, Route } from "react-router";
import HomePage from "./Pages/HomePage/HomePage";
import AddNew from "./Pages/AddNew/AddNew";
import LoginPage from "./Pages/LoginRegistration/LoginPage";
import RegistrationPage from "./Pages/LoginRegistration/RegistrationPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/add-new" element={<AddNew />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registration" element={<RegistrationPage />} />
    </Routes>
  );
}

export default App;
