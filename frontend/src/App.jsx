import { useEffect, useState } from "react";
import axios from "axios";

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
    <div>
      <h1>My Movie Diary</h1>

      {movies.map((movie) => (
        <div key={movie.id}>
          <h2>{movie.title}</h2>
          <p>Rating: {movie.rating}</p>
        </div>
      ))}
    </div>
  );
}

export default App;
