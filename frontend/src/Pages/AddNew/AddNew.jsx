import axios from "axios";
import React from "react";
import { useNavigate } from "react-router";
import ErrorIcon from "@mui/icons-material/Error";
import { Link } from "react-router";
import LoadingSVG from "../../components/LoadingSVG";
import "./AddNew.css";
import API_URL from "../../api";

function AddMovie() {
  const navigate = useNavigate();
  const [error, setError] = React.useState("");
  const [formData, setFormData] = React.useState({
    title: "",
    description: "",
    rating: "",
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
    try {
      await axios.post(`${API_URL}/api/movies`, formData, {
        withCredentials: true,
      });
      navigate("/home");
    } catch (error) {
      setLoading(false);
      if (error.response?.status === 409) {
        setError(error.response.data.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <div className="container">
      <div className="form-container">
        <h1>Add New Movie</h1>

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
                    className="add-movie-btn"
                    src="/add-movie.png"
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

export default AddMovie;
