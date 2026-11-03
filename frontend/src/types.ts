// A movie row as the API returns it.
// `rating` is a string because Postgres sends NUMERIC columns as strings.
export interface Movie {
  id: number;
  title: string;
  rating: string;
  description: string;
  imgsrc: string;
  userid: number;
}
