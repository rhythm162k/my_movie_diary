import { useEffect, useState } from "react";
import axios from "axios";
import HomePage from "./HomePage";

function App() {
  const [movies, setMovies] = useState([]);

  useEffect(() => {
    const fetchMovieData = async () => {
      const response = await axios.get("http://localhost:3000/api/movies");
      setMovies(response.data);
    };

    fetchMovieData();
  }, []);

  return <HomePage movies={movies} />;
}

export default App;
