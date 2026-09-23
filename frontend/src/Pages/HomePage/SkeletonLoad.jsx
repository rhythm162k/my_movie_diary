import "./SkeletonLoad.css";
export default function SkeletonLoad() {
  return (
    <div className="skeleton-movie">
      <div className="movie-poster-description">
        <div className="skeleton-movie-img"></div>

        <div className="skeleton-title-rate">
          <div className="title"></div>
          <div className="rating"></div>
        </div>
      </div>

      <div className="skeleton-description">
        <div className="skeleton-description-box"></div>
      </div>
    </div>
  );
}
