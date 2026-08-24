import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Link } from "react-router";
import axios from "axios";
import Pagination from "../../components/pagination";
import "./HomePage.css";

function HomePage() {
  const [movies, setMovies] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [currentPage, setCurrentPage] = useState(1);

  const moviesPerPage = 10;
  const totalPages = Math.ceil(movies.length / moviesPerPage);
  // Start/end indexes for the current page
  const startIndex = (currentPage - 1) * moviesPerPage;

  useEffect(() => {
    const searchQuery = searchParams.get("search");

    if (searchQuery) {
      const fetchSearchResults = async () => {
        const response = await axios.get(
          `http://localhost:3000/api/movies/search?title=${encodeURIComponent(
            searchQuery,
          )}`,
        );

        const currentSearchedMovies = response.data.slice(
          startIndex,
          startIndex + moviesPerPage,
        );

        setSearchResults(currentSearchedMovies);
      };

      fetchSearchResults();
    } else {
      const fetchMovieData = async () => {
        const response = await axios.get("http://localhost:3000/api/movies");
        const currentMovies = response.data.slice(
          startIndex,
          startIndex + moviesPerPage,
        );
        setMovies(currentMovies);
        setSearchResults(null);
      };

      fetchMovieData();
    }
  }, [searchParams]);

  const handleSearch = (event) => {
    event.preventDefault();
    setSearchParams({ search });
  };

  const displayedMovies = searchResults !== null ? searchResults : movies;

  return (
    <div className="container">
      <div className="upper-part">
        <div className="title-add">
          <img src="/app-logo.png" />
          <h4>Total: {displayedMovies.length}</h4>

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
        {displayedMovies.length === 0 ? (
          searchResults !== null ? (
            <h1>No Items Found</h1>
          ) : (
            <p>No Movie Added Yet</p>
          )
        ) : (
          displayedMovies.map((movie) => (
            <div className="movie" key={movie.id}>
              <div className="movie-poster-description">
                <div className="movie-img">
                  <img src={movie.imgsrc} />
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
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
}

export default HomePage;
