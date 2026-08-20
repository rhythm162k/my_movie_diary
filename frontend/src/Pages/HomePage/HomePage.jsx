import { useEffect, useState } from "react";
import axios from "axios";
import { Link } from "react-router";
import "./HomePage.css";

function HomePage() {
  const [movies, setMovies] = useState([]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState(null);

  useEffect(() => {
    const fetchMovieData = async () => {
      const response = await axios.get("http://localhost:3000/api/movies");
      setMovies(response.data);
    };

    fetchMovieData();
  }, []);

  const handleSearch = async (event) => {
    event.preventDefault();

    const response = await axios.get(
      `http://localhost:3000/api/movies/search?title=${encodeURIComponent(search)}`,
    );

    setSearchResults(response.data);
    console.log(searchResults);
  };

  return (
    <div className="container">
      <div className="upper-part">
        <div className="title-add">
          <h1>My Movie Diary</h1>

          <h4>Total: {movies.length}</h4>

          <Link to="/add-new">
            <button type="submit">Add New</button>
          </Link>
        </div>

        <form className="search" onSubmit={handleSearch}>
          <input
            type="search"
            id="movie"
            name="srcfield"
            placeholder="Enter movie name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            required
          />

          <button type="submit">Search</button>
        </form>
      </div>

      <div className="main-body">
        {movies.length === 0 ? (
          <p>No Movie Added Yet</p>
        ) : (
          movies.map((movie) => (
            <div className="movie" key={movie.id}>
              <div className="movie-poster-description">
                <div className="movie-img">
                  <img src={movie.imgsrc} alt={movie.title} />
                </div>

                <div className="title-rate">
                  <h2>{movie.title}</h2>
                  <h5>Rating: {movie.rating}/10</h5>
                </div>
              </div>

              <div className="description">
                <h3>My Description:</h3>
                <p>{movie.description}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default HomePage;
