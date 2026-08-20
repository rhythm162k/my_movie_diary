import { Link } from "react-router";
import "./AddNew.css";

function AddMovie() {
  return (
    <div className="container">
      <div className="form-container">
        <h1>Add New Movie</h1>

        <form className="movie-form">
          <div className="form-group">
            <label htmlFor="title">Movie Title</label>

            <input
              type="text"
              id="title"
              name="title"
              placeholder="Enter movie title"
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
