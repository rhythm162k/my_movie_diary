import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router";
import axios from "axios";
import DeleteIcon from "@mui/icons-material/Delete";
import Pagination from "../../components/pagination";
import Header from "./Header";
import "./HomePage.css";

function HomePage() {
  const [movies, setMovies] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [currentPage, setCurrentPage] = useState(1);
  const [deleted, setDeleted] = useState(false);

  const moviesPerPage = 10;

  useEffect(() => {
    const searchQuery = searchParams.get("search");

    if (searchQuery) {
      const fetchSearchResults = async () => {
        try {
          const response = await axios.get(
            `http://localhost:3000/api/movies/search?title=${encodeURIComponent(
              searchQuery,
            )}`,
          );

          setSearchResults(response.data);
        } catch (error) {
          console.error("Failed to fetch search results:", error);
        }
      };

      fetchSearchResults();
    } else {
      const fetchMovieData = async () => {
        try {
          const response = await axios.get("http://localhost:3000/api/movies");

          setMovies(response.data);

          setSearchResults(null);
        } catch (error) {
          console.error("Failed to fetch movies:", error);
        }
      };

      fetchMovieData();
    }
  }, [searchParams, deleted]);

  const displayedMovies = searchResults !== null ? searchResults : movies;
  const totalPages = Math.ceil(displayedMovies.length / moviesPerPage);
  const startIndex = (currentPage - 1) * moviesPerPage;
  const paginatedMovies = displayedMovies.slice(
    startIndex,
    startIndex + moviesPerPage,
  );

  const handleSearch = (event) => {
    event.preventDefault();
    setCurrentPage(1);
    setSearchParams({ search });
  };

  const handleDelete = async (movieId) => {
    try {
      await axios.delete("http://localhost:3000/api/delete", {
        params: { id: movieId },
      });
      setDeleted(!deleted);
    } catch (err) {
      console.log(err);
    }
  };

  return (
    <div className="container">
      <Header />
      <div className="upper-part">
        <div className="title-add">
          <h4>Total: {displayedMovies.length}</h4>
          <Link to="/add-new">
            <button type="button">Add New</button>
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
        {paginatedMovies.length === 0 ? (
          searchResults !== null ? (
            <div className="nothing-there">
              <img src="/not-found.png" />
            </div>
          ) : (
            <div className="nothing-there">
              <img src="/not-added.png" />
            </div>
          )
        ) : (
          paginatedMovies.map((movie) => (
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
              <button
                className="delete-btn"
                onClick={() => handleDelete(movie.id)}
              >
                <DeleteIcon />
              </button>
            </div>
          ))
        )}
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}

export default HomePage;
