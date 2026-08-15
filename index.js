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
  user: "postgres",
  host: "localhost",
  database: "myMovies",
  password: "rhythm161469",
  port: 5432,
});
db.connect();

const apiKey = process.env.OMDB_API_KEY;
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

let movieData = [];

async function getData() {
  const result = await db.query("SELECT * FROM movies ORDER BY id DESC");
  movieData = result.rows;
}

app.get("/", async (req, res) => {
  await getData();
  res.render("index.ejs", {
    total: movieData.length,
    movieData: movieData,
  });
});

app.get("/api/movies", async (req, res) => {
  const result = await db.query("SELECT * FROM movies ORDER BY id DESC");
  res.json(result.rows);
});

app.get("/add", async (req, res) => {
  res.render("new.ejs");
});

app.post("/new", async (req, res) => {
  const response = await fetch(
    `https://www.omdbapi.com/?apikey=${apiKey}&t=${encodeURIComponent(
      req.body.title,
    )}`,
  );
  const data = await response.json();
  await db.query(
    "INSERT INTO movies (title, rating, description, imgsrc) VALUES ($1, $2, $3, $4)",
    [req.body.title, req.body.rating, req.body.description, data.Poster],
  );
  res.redirect("/");
});

app.post("/search", async (req, res) => {
  const name = req.body.srcfield.trim();

  const result = await db.query(
    "SELECT * FROM movies WHERE LOWER(title) = LOWER($1)",
    [name],
  );

  if (result.rows.length === 0) {
    const allMovies = await db.query("SELECT * FROM movies ORDER BY id DESC");

    return res.render("index.ejs", {
      total: allMovies.rows.length,
      movieData: allMovies.rows,
      error: "No such movie found",
    });
  }

  res.render("index.ejs", {
    total: result.rows.length,
    movieData: result.rows,
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
