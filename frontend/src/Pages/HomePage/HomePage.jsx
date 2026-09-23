import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router";
import axios from "axios";
import Pagination from "../../components/Pagination";
import MovieCard from "./MovieCard";
import Header from "./Header";
import SkeletonLoad from "./SkeletonLoad";
import "./HomePage.css";
import API_URL from "../../api";

function HomePage() {
  const [movies, setMovies] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [currentPage, setCurrentPage] = useState(1);
  const [deleted, setDeleted] = useState(false);
  const [loading, setLoading] = useState(false);

  const moviesPerPage = 10;

  useEffect(() => {
    const searchQuery = searchParams.get("search");

    const fetchMovies = async () => {
      setLoading(true);
      try {
        if (searchQuery) {
          const response = await axios.get(
            `${API_URL}/api/movies/search?title=${encodeURIComponent(searchQuery)}`,
            {
              withCredentials: true,
            },
          );

          setSearchResults(response.data);
        } else {
          const response = await axios.get(`${API_URL}/api/movies`, {
            withCredentials: true,
          });

          setMovies(response.data);
          setSearchResults(null);
        }
      } catch (error) {
        console.error("Failed to fetch movies:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMovies();
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
      await axios.delete(`${API_URL}/api/delete`, {
        params: { id: movieId },
        withCredentials: true,
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
            <button type="button">
              <img className="add_new_btn" src="/add-new.png" />
            </button>
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

          <button type="submit">
            <img className="search_btn" src="/search.png" />
          </button>
        </form>
      </div>

      <div className="main-body">
        {loading ? (
          Array(6)
            .fill()
            .map((_, index) => <SkeletonLoad key={index} />)
        ) : paginatedMovies.length === 0 ? (
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
            <MovieCard
              key={movie.id}
              movie={movie}
              handleDelete={handleDelete}
            />
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
