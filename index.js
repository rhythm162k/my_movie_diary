import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import pg from "pg";
import cors from "cors";
import bcrypt from "bcrypt";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { body, query, validationResult } from "express-validator";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import {
  generalLimiter,
  loginLimiter,
  googleAuthLimiter,
} from "./middleware/rateLimiters.js";

dotenv.config({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
});

const app = express();
app.set("trust proxy", 1);
const port = process.env.PORT || 3000;
// const saltRounds = 15;
const saltRounds = process.env.NODE_ENV === "test" ? 4 : 15;

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

db.connect();

const apiKey = process.env.OMDB_API_KEY;
const fallbackPoster =
  "https://cdn.displate.com/artwork/735x1024/2022-04-15/7422bfe15b3ea7b5933dffd896e9c7f9_46003a1b7353dc7b5a02949bd074432a.jpg";

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.use("/api", generalLimiter);

const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      conObject: {
        user: process.env.PG_USER,
        host: process.env.PG_HOST,
        database: process.env.PG_DATABASE,
        password: process.env.PG_PASSWORD,
        port: process.env.PG_PORT,
      },
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

app.use(passport.initialize());

if (process.env.NODE_ENV !== "test") {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },

      async (accessToken, refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails[0].value;
          const name = profile.displayName;

          const existingGoogleUser = await db.query(
            "SELECT userid FROM users WHERE googleid = $1",
            [googleId],
          );

          if (existingGoogleUser.rows.length > 0) {
            return done(null, existingGoogleUser.rows[0]);
          }

          const existingEmailUser = await db.query(
            "SELECT userid FROM users WHERE email = $1",
            [email],
          );

          if (existingEmailUser.rows.length > 0) {
            return done(null, existingEmailUser.rows[0]);
          }

          const result = await db.query(
            `INSERT INTO users (name, email, googleid)
           VALUES ($1, $2, $3)
           RETURNING userid`,
            [name, email, googleId],
          );

          return done(null, result.rows[0]);
        } catch (error) {
          console.error("Google authentication error:", error);
          return done(error, null);
        }
      },
    ),
  );
}

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

app.get(
  "/auth/google",
  googleAuthLimiter,
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

app.get(
  "/auth/google/callback",
  googleAuthLimiter,
  (req, res, next) => {
    // console.log("GOOGLE CALLBACK REACHED");
    next();
  },
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL || "http://localhost:5173"}/login`,
    session: false,
  }),
  (req, res) => {
    // console.log("PASSPORT SUCCESS:", req.user);

    req.session.userId = req.user.userid;

    req.session.save((err) => {
      if (err) {
        console.error("SESSION SAVE ERROR:", err);
        return res.status(500).send("Session error");
      }

      // console.log("SESSION SAVED:", req.session.userId);

      res.redirect(
        `${process.env.FRONTEND_URL || "http://localhost:5173"}/home`,
      );
    });
  },
);

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

app.post(
  "/api/movies",
  [
    body("title").trim().notEmpty().withMessage("Title is required."),
    body("description")
      .trim()
      .notEmpty()
      .withMessage("Description is required."),
    body("rating").custom((rating) => {
      if (
        rating === undefined ||
        rating === null ||
        rating === "" ||
        !Number.isFinite(Number(rating)) ||
        Number(rating) < 0 ||
        Number(rating) > 10
      ) {
        throw new Error("Rating is required with a number between 0 and 10.");
      }

      return true;
    }),
  ],
  async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({
        message: "Not authenticated.",
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: errors.array()[0].msg,
      });
    }

    const { title, description, rating } = req.body;
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
      if (error.code === "23505") {
        return res.status(409).json({
          message: "You already added this movie.",
        });
      }

      console.error("Failed to add movie:", error);

      return res.status(500).json({
        message: "Something went wrong.",
      });
    }
  },
);

app.get(
  "/api/movies/search",
  [query("title").trim().notEmpty().withMessage("Title is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: errors.array()[0].msg,
      });
    }

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
  },
);

app.patch("/api/movies/edit", async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      message: "Not authenticated.",
    });
  }
  let poster = fallbackPoster;
  const { id } = req.query;
  const updates = req.body;

  const keys = Object.keys(updates);

  if (keys.length === 0) {
    return res.status(400).json({ message: "No fields provided for update" });
  }

  if (
    "title" in updates &&
    (!updates.title || String(updates.title).trim() === "")
  ) {
    return res.status(400).json({ message: "Title cannot be empty." });
  }

  if (
    "description" in updates &&
    (!updates.description || String(updates.description).trim() === "")
  ) {
    return res.status(400).json({ message: "Description cannot be empty." });
  }

  if ("rating" in updates) {
    const ratingNum = Number(updates.rating);
    if (updates.rating === "" || updates.rating === null || isNaN(ratingNum)) {
      return res
        .status(400)
        .json({ message: "Rating must be a valid number." });
    }

    if (ratingNum < 0 || ratingNum > 10) {
      return res
        .status(400)
        .json({ message: "Rating must be between 0 and 10." });
    }
  }

  try {
    if ("title" in updates) {
      try {
        const omdbResponse = await fetch(
          `https://www.omdbapi.com/?apikey=${apiKey}&t=${encodeURIComponent(updates.title)}`,
        );

        if (omdbResponse.ok) {
          const data = await omdbResponse.json();
          if (
            data.Response === "True" &&
            data.Poster &&
            data.Poster !== "N/A"
          ) {
            poster = data.Poster;
          }
        }
        updates.imgsrc = poster;
        keys.push("imgsrc");
      } catch (omdbError) {
        console.error(
          "Failed to fetch from OMDB, continuing with regular update:",
          omdbError,
        );
      }
    }

    const setClause = keys
      .map((key, index) => `${key} = $${index + 1}`)
      .join(", ");

    const values = Object.values(updates);
    values.push(id);
    values.push(req.session.userId);

    const query = `UPDATE movies SET ${setClause} WHERE id = $${values.length - 1} AND userid = $${values.length}`;

    const result = await db.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Movie not found." });
    }

    return res.status(200).json({
      message: "Movie updated successfully.",
    });
  } catch (error) {
    console.error("Failed to update movie:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        message: "A conflict occurred.",
      });
    }

    return res.status(500).json({
      message: "Something went wrong.",
    });
  }
});

app.delete(
  "/api/delete",
  [
    query("id")
      .notEmpty()
      .withMessage("There's some problem deleting this movie."),
  ],
  async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated." });
    }

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { id } = req.query;

      const result = await db.query(
        "DELETE FROM movies WHERE id = $1 AND userid = $2",
        [id, req.session.userId],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Movie not found." });
      }

      return res.status(200).json({ message: "Movie deleted successfully" });
    } catch (error) {
      console.error("Delete failed:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  },
);

app.post(
  "/api/registration",
  loginLimiter,
  [
    body("name").trim().notEmpty().withMessage("Name is required."),
    body("email")
      .isEmail()
      .withMessage("Please provide a valid email address.")
      .normalizeEmail(),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: errors.array()[0].msg,
      });
    }
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
  },
);

app.post(
  "/api/login",
  loginLimiter,
  [
    body("email")
      .notEmpty()
      .isEmail()
      .withMessage("Please provide a valid email address.")
      .normalizeEmail(),
    body("password")
      .notEmpty()
      .isLength({ min: 6 })
      .withMessage("Envalid Password."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: errors.array()[0].msg,
      });
    }
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
  },
);

if (process.env.NODE_ENV !== "test") {
  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
}

export default app;
