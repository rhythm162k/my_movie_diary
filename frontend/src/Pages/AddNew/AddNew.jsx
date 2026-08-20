import axios from "axios";
import React from "react";
import { useNavigate } from "react-router";
import { Link } from "react-router";
import "./AddNew.css";

function AddMovie() {
  const navigate = useNavigate();
  const [formData, setFormData] = React.useState({
    title: "",
    description: "",
    rating: "",
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await axios.post("http://localhost:3000/api/movies", formData);
    navigate("/");
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

          <div className="button-group">
            <button type="submit">Add Movie</button>

            <Link to="/" className="cancel-btn">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddMovie;
