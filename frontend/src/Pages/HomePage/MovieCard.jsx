import DeleteIcon from "@mui/icons-material/Delete";
import EditNoteIcon from "@mui/icons-material/EditNote";
import { useNavigate } from "react-router";
import "./MovieCard.css";
export default function MovieCard({ movie, handleDelete }) {
  const navigate = useNavigate();

  const handleEdit = () => {
    navigate(`/edit-movie/${movie.id}`, { state: { movie } });
  };

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

      <div className="buttons">
        <button className="edit-btn" onClick={handleEdit}>
          <EditNoteIcon />
        </button>
        <button className="delete-btn" onClick={() => handleDelete(movie.id)}>
          <DeleteIcon />
        </button>
      </div>
    </div>
  );
}
