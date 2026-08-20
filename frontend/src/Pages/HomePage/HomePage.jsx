import {Link} from "react-router";
import "./HomePage.css";

function HomePage({ movies }) {
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

        <form className="search" action="/search" method="post">
          <input
            type="search"
            id="movie"
            name="srcfield"
            placeholder="Enter movie name"
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
