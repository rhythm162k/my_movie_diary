import DeleteIcon from "@mui/icons-material/Delete";
export default function MovieCard({ movie, handleDelete }) {
  return (
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
      <button className="delete-btn" onClick={() => handleDelete(movie.id)}>
        <DeleteIcon />
      </button>
    </div>
  );
}
