import "./Pagination.css";

function Pagination({ currentPage, totalPages, onPageChange }) {
  console.log("currentPage:", currentPage);
  console.log("totalPages:", totalPages);
  if (totalPages <= 1) {
    return null;
  }

  const getPageNumbers = () => {
    const pages = [];

    if (totalPages <= 7) {
      for (let page = 1; page <= totalPages; page++) {
        pages.push(page);
      }

      return pages;
    }

    pages.push(1);

    if (currentPage <= 4) {
      pages.push(2, 3, 4, 5);
      pages.push("...");
      pages.push(totalPages);

      return pages;
    }

    if (currentPage >= totalPages - 3) {
      pages.push("...");
      pages.push(
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      );

      return pages;
    }

    pages.push("...");
    pages.push(currentPage - 1, currentPage, currentPage + 1);
    pages.push("...");
    pages.push(totalPages);

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <nav className="pagination" aria-label="Pagination">
      {pageNumbers.map((page, index) =>
        page === "..." ? (
          <span className="pagination-ellipsis" key={`ellipsis-${index}`}>
            ...
          </span>
        ) : (
          <button
            key={page}
            type="button"
            className={`pagination-button ${
              currentPage === page ? "active" : ""
            }`}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        ),
      )}
    </nav>
  );
}

export default Pagination;
