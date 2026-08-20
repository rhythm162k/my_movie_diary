import { useEffect, useState } from "react";
import axios from "axios";
import { Routes, Route } from "react-router";
import HomePage from "./Pages/HomePage/HomePage";
import AddNew from "./Pages/AddNew/AddNew";

function App() {
  const [movies, setMovies] = useState([]);

  useEffect(() => {
    const fetchMovieData = async () => {
      const response = await axios.get("http://localhost:3000/api/movies");
      setMovies(response.data);
    };

    fetchMovieData();
  }, []);

  return (
    <Routes>
      <Route index element={<HomePage movies={movies} />} />
      <Route path="/add-new" element={<AddNew />} />
    </Routes>
  );
}

export default App;
