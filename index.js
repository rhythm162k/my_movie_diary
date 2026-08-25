import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import pg from "pg";
import cors from "cors";
import bcrypt from "bcrypt";
import session from "express-session";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const saltRounds = 15;

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

db.connect();

const apiKey = process.env.OMDB_API_KEY;

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

app.get("/api/session", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      message: "Not authenticated.",
    });
  }

  res.status(200).json({
    userId: req.session.userId,
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error(error);

      return res.status(500).json({
        message: "Could not log out.",
      });
    }

    res.clearCookie("connect.sid");

    res.status(200).json({
      message: "Logged out successfully.",
    });
  });
});

app.get("/api/movies", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      message: "Not authenticated.",
    });
  }

  try {
    const result = await db.query(
      "SELECT * FROM movies WHERE userid = $1 ORDER BY id DESC",
      [req.session.userId],
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Something went wrong.",
    });
  }
});

app.post("/api/movies", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      message: "Not authenticated.",
    });
  }

  const { title, description, rating } = req.body;

  const existingMovie = await db.query(
    "SELECT id FROM movies WHERE title = $1",
    [title],
  );

  if (existingMovie.rows.length > 0) {
    return res.status(409).json({
      message: "You Already Added the Movie :)",
    });
  }

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
  } catch (error) {
    console.error("OMDb fetch failed:", error);
  }

  try {
    await db.query(
      `INSERT INTO movies
       (title, rating, description, imgsrc, userid)
       VALUES ($1, $2, $3, $4, $5)`,
      [title, rating, description, poster, req.session.userId],
    );

    res.status(201).json({
      message: "Movie added successfully.",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Something went wrong.",
    });
  }
});

app.get("/api/movies/search", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      message: "Not authenticated.",
    });
  }

  const { title } = req.query;

  try {
    const result = await db.query(
      `SELECT * FROM movies
       WHERE userid = $1
       AND LOWER(title) LIKE LOWER('%' || $2 || '%')
       ORDER BY id DESC`,
      [req.session.userId, title.trim()],
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Something went wrong.",
    });
  }
});

app.delete("/api/delete", async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return res
        .status(400)
        .json({ error: "There's some problem deleting this movie." });
    }
    await db.query("DELETE FROM movies WHERE id = $1", [id]);

    return res.status(200).json({ message: "Movie deleted successfully" });
  } catch (error) {
    console.error("Delete failed:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
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

    const hash = await bcrypt.hash(password, saltRounds);

    const result = await db.query(
      `INSERT INTO users (name, email, password)
       VALUES ($1, $2, $3)
       RETURNING userid`,
      [name, email, hash],
    );

    req.session.userId = result.rows[0].userid;

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

    const user = result.rows[0];

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(403).json({
        message: "Incorrect password.",
      });
    }

    req.session.userId = user.userid;

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
