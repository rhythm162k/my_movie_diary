import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import pg from "pg";
import cors from "cors";

dotenv.config();
const app = express();
app.use(cors());
const port = 3000;
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();

const apiKey = process.env.OMDB_API_KEY;
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.get("/api/movies", async (req, res) => {
  const result = await db.query("SELECT * FROM movies ORDER BY id DESC");
  res.json(result.rows);
});

app.post("/api/movies", async (req, res) => {
  const { title, description, rating } = req.body;
  const fallbackPoster =
    "https://cdn.displate.com/artwork/735x1024/2022-04-15/7422bfe15b3ea7b5933dffd896e9c7f9_46003a1b7353dc7b5a02949bd074432a.jpg";

  let poster = fallbackPoster;

  try {
    const response = await fetch(
      `https://www.omdbapi.com/?apikey=${apiKey}&t=${encodeURIComponent(title)}`,
    );

    if (response.ok) {
      const data = await response.json();

      if (data.Response === "True" && data.Poster && data.Poster !== "N/A") {
        poster = data.Poster;
      }
    }
  } catch (err) {
    console.error("OMDb fetch failed:", err);
  }

  await db.query(
    "INSERT INTO movies (title, rating, description, imgsrc) VALUES ($1, $2, $3, $4)",
    [title, rating, description, poster],
  );

  res.json({ message: "Movie added successfully" });
});

app.get("/api/movies/search", async (req, res) => {
  const { title } = req.query;
  const result = await db.query(
    "SELECT * FROM movies WHERE LOWER(title) LIKE LOWER('%' || $1 || '%')",
    [title.trim()],
  );
  res.json(result.rows);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
