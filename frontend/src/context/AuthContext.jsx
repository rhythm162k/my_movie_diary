/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import API_URL from "../api";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        await axios.get(`${API_URL}/api/session`, {
          withCredentials: true,
        });
        setAuthenticated(true);
      } catch {
        setAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  return (
    <AuthContext.Provider value={{ authenticated, setAuthenticated, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
