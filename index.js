import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import pg from "pg";
import cors from "cors";

dotenv.config();
const app = express();
app.use(cors());
const port = process.env.PORT || 3000;
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

// const db = new pg.Client({
//   connectionString: process.env.DATABASE_URL,
// });
db.connect();

const apiKey = process.env.OMDB_API_KEY;
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

let user;

app.get("/api/movies", async (req, res) => {
  const result = await db.query(
    "SELECT * FROM movies WHERE userid = $1 ORDER BY id DESC",
    [user],
  );
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
    "INSERT INTO movies (title, rating, description, imgsrc, userid) VALUES ($1, $2, $3, $4, $5)",
    [title, rating, description, poster, user],
  );

  res.json({ message: "Movie added successfully" });
});

app.get("/api/movies/search", async (req, res) => {
  const { title } = req.query;
  const result = await db.query(
    "SELECT * FROM movies WHERE userid = $1 AND LOWER(title) LIKE LOWER('%' || $2 || '%')",
    [user, title.trim()],
  );
  res.json(result.rows);
});

app.post("/api/registration", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const existingUser = await db.query(
      "SELECT userid FROM users WHERE email = $1",
      [email],
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        message: "A user with this email already exists. So just Login ;)",
      });
    }

    const result = await db.query(
      `INSERT INTO users (name, email, password)
       VALUES ($1, $2, $3)
       RETURNING userid`,
      [name, email, password],
    );

    user = result.rows[0].userid;

    res.status(201).json({
      message: "User registered successfully.",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Something went wrong.",
    });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await db.query(
      "SELECT userid, password FROM users WHERE email = $1",
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User with this email doesn't exist.",
      });
    }

    user = result.rows[0].userid;

    const userPassword = result.rows[0].password;

    if (userPassword !== password) {
      return res.status(403).json({
        message: "Incorrect password.",
      });
    }

    res.status(200).json({
      message: "User login successful.",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Something went wrong.",
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
