import axios from "axios";
import React from "react";
import { useLocation, useNavigate } from "react-router";
import ErrorIcon from "@mui/icons-material/Error";
import { Link } from "react-router";
import LoadingSVG from "../../components/LoadingSVG";
import "./EditPage.css";
import API_URL from "../../api";

function EditMovie() {
  const location = useLocation();
  const navigate = useNavigate();
  const { movie } = location.state || {};

  const [error, setError] = React.useState("");
  const [formData, setFormData] = React.useState({
    title: movie?.title || "",
    description: movie?.description || "",
    rating: movie?.rating || "",
  });
  const [loading, setLoading] = React.useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    const updatedFields = {};
    if (formData.title !== movie.title) updatedFields.title = formData.title;
    if (formData.description !== movie.description)
      updatedFields.description = formData.description;
    if (formData.rating !== movie.rating)
      updatedFields.rating = formData.rating;

    if (Object.keys(updatedFields).length === 0) {
      navigate("/home");
      return;
    }

    try {
      await axios.patch(`${API_URL}/api/movies/edit`, updatedFields, {
        params: { id: movie.id },
        withCredentials: true,
      });
      navigate("/home");
    } catch (error) {
      setLoading(false);
      setError(error.response.data.message);
    }
  };

  return (
    <div className="container">
      <div className="form-container">
        <h1>Edit The Movie</h1>

        <form className="movie-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">Movie Title</label>

            <input
              type="text"
              id="title"
              name="title"
              placeholder="Enter movie title"
              value={formData.title}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>

            <textarea
              id="description"
              name="description"
              rows="6"
              placeholder="Write your thoughts about the movie..."
              value={formData.description}
              onChange={handleChange}
              required
            ></textarea>
          </div>

          <div className="form-group">
            <label htmlFor="rating">Rating</label>

            <input
              type="number"
              id="rating"
              name="rating"
              min="0"
              max="10"
              step="0.1"
              placeholder="0 - 10"
              value={formData.rating}
              onChange={handleChange}
              required
            />
          </div>

          {error && (
            <div className="adding-error">
              <ErrorIcon className="error-icon" />
              <p className="adding-error">{error}</p>
            </div>
          )}

          <div className="button-group">
            <button type="submit" className="custom-btn" disabled={loading}>
              {loading ? (
                <LoadingSVG />
              ) : (
                <>
                  <img
                    className="edit-movie-btn"
                    src="/edit-movie.png"
                    alt="Add Movie"
                  />
                </>
              )}
            </button>

            <Link to="/home" className="cancel-btn">
              <img className="cancel-link-btn" src="/cancel.png" />
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditMovie;
