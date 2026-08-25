import LogoutIcon from "@mui/icons-material/Logout";
import axios from "axios";
import "./LogoutButton.css";
import { useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";

function LogoutButton() {
  const navigate = useNavigate();
  const { setAuthenticated } = useAuth();

  const handleLogout = async () => {
    try {
      await axios.post("http://localhost:3000/api/logout");

      setAuthenticated(false);
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <button className="logout-button" onClick={handleLogout}>
      <LogoutIcon />
    </button>
  );
}

export default LogoutButton;
